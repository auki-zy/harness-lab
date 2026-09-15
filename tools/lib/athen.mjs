/**
 * 内部网关（Athen）的最小客户端：给"生成评测用例"这类**仓库侧的小任务**用。
 * 零依赖，key 只从环境变量 / DSH 凭据文件读（见 engines.mjs），不落仓库、不打印。
 */
import { athenHost, athenKey, athenModel } from './engines.mjs';

/**
 * 等网关多久算超时。
 *
 * 踩过（2026-09-14）：原来写死 120 秒、超时又不重试 —— 自动设计那条路的第二次尝试是
 * `max_tokens: 32000`（更慢），2 分钟必炸；炸出来还是个裸的 `DOMException [TimeoutError]` 加一长串调用栈，
 * 用户只看到"自动设计失败（看上面的输出）"。现在的规矩：默认给足，可用 `ATHEN_TIMEOUT_MS` 覆盖；
 * 超时算**可重试**的失败（网关偶尔卡一下，别让十几分钟的流水线白跑）。
 */
const DEFAULT_TIMEOUT_MS = 300000;

export function resolveTimeout(env = process.env) {
  const raw = Number(env?.ATHEN_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

/**
 * 是不是"超时"。
 *
 * 注意 undici 有时把 abort 包成 `TypeError: fetch failed`，真因藏在 `cause` 里
 * （实测：同一个卡住的网关，第一次报 TimeoutError、重试那次报 fetch failed）——
 * 只看 `err.name` 会把超时说成"连不上网关"，把人指到错的方向去查。
 */
function isTimeout(err) {
  const name = err?.name ?? '';
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  if (err?.cause?.name === 'TimeoutError' || err?.cause?.name === 'AbortError') return true;
  return /aborted due to timeout|the operation was aborted/i.test(String(err?.message ?? ''));
}

/** 失败原因说成人话（别把 DOMException + 调用栈甩给用户） */
export function describeAthenFailure(err, { timeoutMs, maxTokens, model } = {}) {
  const message = String(err?.message ?? err ?? '');
  if (isTimeout(err)) {
    const seconds = timeoutMs ? `${Math.round(timeoutMs / 1000)} 秒` : '设定的时间';
    return (
      `网关 ${seconds}没返回（模型 ${model ?? '?'}，max_tokens ${maxTokens ?? '?'}）——` +
      '多半是这次要生成的东西太长、或网关当时忙。稍后重试即可；也可以用 ATHEN_TIMEOUT_MS 放宽（毫秒，如 ATHEN_TIMEOUT_MS=600000）。'
    );
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|socket hang up/i.test(message)) {
    return `连不上网关（${athenHost()}）：${message}。检查网络 / 代理，或确认 ATHEN_BASE_URL 写得对不对。`;
  }
  return message;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (m) => console.error(m);

/** 让模型只回 JSON：从回复里抠出第一个 JSON 对象（模型常会包一层 ```json 或加一句解释） */
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error(`模型没有返回 JSON：${text.slice(0, 200)}`);
  return JSON.parse(body.slice(start, end + 1));
}

/**
 * 问一次网关（OpenAI 兼容的 /v1/chat/completions）。
 *
 * 返回 `{ text, finishReason }`；空回复会带上 finish_reason 抛错
 * （推理型模型在长提示下可能把预算全花在 reasoning 上，调用方据此加大 max_tokens 重试）。
 * **超时 / 连不上会自动重试一次**（等 3 秒再来），最后还是不行就抛一句人话。
 */
export async function askAthen({
  system,
  user,
  model = athenModel(),
  maxTokens = 8000,
  temperature = 0.2,
  timeoutMs = resolveTimeout(),
  attempts = 2,
}) {
  const key = athenKey();
  if (!key) throw new Error('没有可用的网关 key：设 ANTHROPIC_AUTH_TOKEN / DEEPSEEK_API_KEY，或写进 ~/.dsh/.credentials.yaml');

  let lastErr;
  let timedOut = false;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(`${athenHost()}/v1/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`网关返回 ${res.status}：${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const choice = data?.choices?.[0];
      const text = String(choice?.message?.content ?? '');
      const finishReason = choice?.finish_reason ?? '';
      if (!text.trim()) {
        throw new Error(
          finishReason === 'length'
            ? `模型把 ${maxTokens} token 的预算用完了还没开始输出（推理占了 ${data?.usage?.completion_tokens_details?.reasoning_tokens ?? '?'} token）——加大 max_tokens 重试`
            : '网关返回了空内容',
        );
      }
      return { text, finishReason };
    } catch (err) {
      lastErr = err;
      if (isTimeout(err)) timedOut = true;
      // 只有"超时"值得原样再试一次；空回复 / 状态码错误由调用方决定（比如加大 max_tokens 重来）
      if (!isTimeout(err) || attempt === attempts) break;
      note(`⚠ 网关 ${Math.round(timeoutMs / 1000)} 秒没返回，等 3 秒重试一次（第 ${attempt + 1}/${attempts} 次，max_tokens ${maxTokens}）…`);
      await sleep(3000);
    }
  }
  const ctx = { timeoutMs, maxTokens, model };
  // 上次是超时、这次却是别的错（实测：重试时连接会被 undici 判成 fetch failed）——
  // 那也得按"网关慢"来讲，别把人指去查网络
  if (timedOut && !isTimeout(lastErr)) {
    throw new Error(`${describeAthenFailure({ name: 'TimeoutError' }, ctx)}（重试那次直接失败了：${String(lastErr?.message ?? lastErr).slice(0, 120)}）`);
  }
  throw new Error(describeAthenFailure(lastErr, ctx));
}
