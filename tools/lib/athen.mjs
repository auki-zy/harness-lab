/**
 * 内部网关（Athen）的最小客户端：给"生成评测用例"这类**仓库侧的小任务**用。
 * 零依赖，key 只从环境变量 / DSH 凭据文件读（见 engines.mjs），不落仓库、不打印。
 */
import { athenHost, athenKey, athenModel } from './engines.mjs';

const TIMEOUT_MS = 120000;

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
 * 返回 `{ text, finishReason }`；空回复会带上 finish_reason 抛错
 * （推理型模型在长提示下可能把预算全花在 reasoning 上，调用方据此加大 max_tokens 重试）。
 */
export async function askAthen({ system, user, model = athenModel(), maxTokens = 8000, temperature = 0.2 }) {
  const key = athenKey();
  if (!key) throw new Error('没有可用的网关 key：设 ANTHROPIC_AUTH_TOKEN / DEEPSEEK_API_KEY，或写进 ~/.dsh/.credentials.yaml');
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
    signal: AbortSignal.timeout(TIMEOUT_MS),
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
}
