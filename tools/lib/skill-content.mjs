// 一份技能"到底有什么内容"的解析 —— 起草提示词和跑 A/B 都靠它。
//
// 起因（两个真实踩过的坑）：
//   1. 以前只量 frontmatter **之后**的正文，把 `description:` 整个扔了。可有些技能就是靠
//      description 说话的（它同时是模型的触发说明），只量正文会把它当成"空技能"。
//   2. `grill-me`（mattpocock/skills）：正文只有一句 `Call the Skill tool with "grilling".` ——
//      它是个**转发壳**，真内容在同仓库的 `skills/productivity/grilling/SKILL.md`。
//      光看正文只能判"评不了"，但 B 侧其实可以装上被引用的那个技能——上游本来就是这么设计的
//      （这几个技能在一个仓库里一起发布，`grill-me` 只是入口别名）。
//
// 所以这里做三件事：解析 frontmatter、认出"它把内容转发给了谁"、把转发目标的内容一并拿来当素材。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** 素材少于这个字符数就算"没内容"（实测真技能正文都在 5000+） */
export const THIN_CONTENT = 600;

const FRONTMATTER = /^\uFEFF?\s*---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** 不可能当技能名的词（句式里夹带的冠词 / 代词） */
const STOPWORDS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'skill', 'skills', 'one', 'another']);

/** 解析 SKILL.md：frontmatter 的 name / description（一行式）+ 正文 */
export function parseSkill(text) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n');
  const match = raw.match(FRONTMATTER);
  const fields = {};
  if (match) {
    for (const line of match[1].split('\n')) {
      const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (kv) fields[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
    }
  }
  return {
    name: fields.name ?? '',
    description: fields.description ?? '',
    body: (match ? raw.slice(match[0].length) : raw).trim(),
    fields,
  };
}

/**
 * 这份技能把内容转发给了哪个技能（没有就空数组）。
 *
 * 只认明确的"去调用 / 见某个技能"句式——普通行文里出现 "skill" 不该被当成转发。
 * 例：`Call the Skill tool with "grilling".` → grilling
 *     `先按 design-review 技能过一遍` → design-review
 */
export function referencedSkills({ name = '', description = '', body = '' } = {}) {
  const text = `${description}\n${body}`;
  const patterns = [
    /Skill tool with\s*["'`“”「『]?([A-Za-z0-9][\w.-]{2,})["'`“”」』]?/gi,
    /\b(?:use|invoke|call|load|read|see|follow)\s+(?:the\s+)?["'`「『]?([A-Za-z0-9][\w.-]{2,})["'`」』]?\s+skill\b/gi,
    /skills\/([A-Za-z0-9][\w.-]*)\/SKILL\.md/gi,
    /(?:调用|使用|加载|参见|见|按)\s*[「『“"'`]?([A-Za-z0-9][\w.-]{2,})[」』”"'`]?\s*(?:这个)?技能/g,
  ];
  const found = [];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const ref = m[1];
      // `Call the Skill tool with "grilling"` 里 "the" 会被 "…the Skill…" 这种断法匹配上（实测踩过），
      // 冠词 / 代词这类词一律不当技能名
      if (!ref || STOPWORDS.has(ref.toLowerCase())) continue;
      if (ref.toLowerCase() === name.toLowerCase()) continue;
      if (!found.includes(ref)) found.push(ref);
    }
  }
  return found;
}

/** 目录名要能直接当路径片段用（refs/<名字>/SKILL.md） */
export function refDirName(name) {
  return String(name ?? '').replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '');
}

/**
 * 上游提交号取哪个。
 *
 * 踩过（2026-09-14）：GitHub 的 commits 接口会限流（实测 403），而 `prepare` 失败时写的是 `unknown` ——
 * 页面重新拉取一次，**已知的提交号就被覆盖掉了**（`refs/SOURCES.json` 里还钉着旧值，两处对不上，
 * 而 SOURCE.md 的"导入时的上游提交"是溯源的关键字段）。所以规则是：查到的优先，查不到就**沿用上次记录的**，
 * 绝不降级；两边都没有才写 unknown。
 */
export function pickCommit(fetched, previous) {
  const ok = (v) => (v && String(v) !== 'unknown' ? String(v) : '');
  if (ok(fetched)) return { commit: ok(fetched), kept: false };
  if (ok(previous)) return { commit: ok(previous), kept: true };
  return { commit: 'unknown', kept: false };
}

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

/**
 * 起草 / 判定用的素材：description + 正文 + **已被解析下来的**被引用技能。
 * `dir` 是技能目录（candidates/skills/<name>），被引用的技能放在它下面的 refs/<名字>/SKILL.md。
 */
export function skillMaterial(dir) {
  const own = parseSkill(read(path.join(dir, 'SKILL.md')));
  const refs = referencedSkills(own).map((ref) => {
    const rel = path.posix.join('refs', ref);
    const text = read(path.join(dir, 'refs', ref, 'SKILL.md')).trim();
    return { name: ref, dir: rel, text, resolved: Boolean(text) };
  });
  const parts = [];
  if (own.description) {
    // 分节标题就是警告：起草模型会把 description 里的 "Use when the user wants to X" **当成用户的任务**，
    // 于是"技能什么时候该用"被翻译成"你要我做 X"（实测踩过：grilling 的 "Grill the user relentlessly…
    // Use when the user wants to stress-test their thinking" 被写成"把含含糊糊带过去的地方全给我逼出来"）。
    parts.push(
      `=== 触发说明（frontmatter 的 description）===\n` +
        `（只用来判断"这个技能是干什么的"。「什么时候该用它」这类话属于技能自己的触发条件 = 做法，**不许**改写成用户的任务）\n` +
        own.description,
    );
  }
  if (own.body) {
    parts.push(`=== 正文（技能的做法 —— 起草提示词时只能参考，不许写进提示词）===\n${own.body}`);
  }
  for (const ref of refs) {
    if (!ref.text) continue;
    parts.push(
      `=== 被引用的技能 ${ref.name}（${ref.dir}/SKILL.md；评测时由 eval 配置一并装上）===\n` +
        `（同样：它的 description 与正文都是**做法**，只能用来理解这个能力，不许写进提示词）\n${ref.text}`,
    );
  }
  const text = parts.join('\n\n');
  return { ...own, refs, text, chars: text.length };
}

/** 素材够不够起一条评测；不够就说明白"差了哪一块"，够就返回 null */
export function thinReason(dir) {
  const mat = skillMaterial(dir);
  if (mat.chars >= THIN_CONTENT) return null;
  const unresolved = mat.refs.filter((r) => !r.resolved).map((r) => r.name);
  const head = mat.body.replace(/\s+/g, ' ').slice(0, 40);
  const lines = [
    `这份 SKILL.md 能当素材的只有 ${mat.chars} 个字符：正文 ${mat.body.length} 字符` +
      `${mat.body ? `（「${head}${mat.body.length > 40 ? '…' : ''}」）` : ''}、description ${mat.description.length} 字符。`,
  ];
  if (unresolved.length) {
    lines.push(
      `它把内容转发给了 ${unresolved.join('、')}，但那个技能还没拉下来 —— B 侧只会加载到这个壳，A/B 比不出差别。`,
      `先把被引用的技能拉下来（tools/skillup-bridge.mjs refs --name <能力名>），或直接评测它指向的那个技能。`,
    );
  } else if (mat.refs.length) {
    lines.push('被引用的技能虽然解析到了，但两边加起来仍然没有实质内容。');
  } else {
    lines.push(
      'B 侧加载的几乎是空的，A/B 比不出差别——这份技能自己就没有实质内容（也没指向别的技能）。',
      '要么先把它自己该有的正文补上，要么换一个真有内容的技能。',
    );
  }
  return lines.join('\n  ');
}

/**
 * 把 refs/<名字> 挂进 eval 配置的 `skills:` 列表（幂等）。
 *
 * skill-up 的 `skills:` 是个列表，多条 local_path 会**一起装进 B 侧工作区**（实测确认过：
 * with_skill 那一侧的可用技能里同时出现壳和被引用的技能，without_skill 侧两个都没有）。
 */
export function withRefSkills(yaml, refNames) {
  const lines = String(yaml).split('\n');
  const start = lines.findIndex((l) => /^skills:\s*$/.test(l));
  if (start === -1) return yaml;
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === '' || /^[ \t]/.test(lines[end]))) end++;
  const block = lines.slice(start + 1, end);
  while (block.length && block[block.length - 1].trim() === '') block.pop();
  const tail = lines.slice(start + 1, end).length - block.length;
  for (const name of refNames) {
    const rel = path.posix.join('refs', refDirName(name));
    if (block.some((l) => l.trim() === `path: ${rel}`)) continue;
    block.push('  - source: local_path', `    path: ${rel}`);
  }
  const blanks = Array.from({ length: tail }, () => '');
  return [...lines.slice(0, start + 1), ...block, ...blanks, ...lines.slice(end)].join('\n');
}

/** 上游仓库里被引用技能的可能位置（同一个仓库、同一个提交——不同提交的内容不能混着评） */
function upstreamCandidates(ref, source) {
  // source.path 指向 SKILL.md（如 skills/productivity/grill-me/SKILL.md）：
  // 技能目录是它的父目录，被引用的技能跟它**平级**，所以从祖父目录开始找
  const file = String(source.path ?? '').replace(/^\/+/, '');
  const parent = path.posix.dirname(path.posix.dirname(file));
  const dirs = [parent === '.' ? '' : parent, 'skills', ''];
  const out = [];
  for (const d of dirs) {
    const p = [d, ref, 'SKILL.md'].filter(Boolean).join('/');
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * 把被引用的技能拉进 `dir/refs/<名字>/SKILL.md`，并在 `refs/SOURCES.json` 记下出处。
 *
 * 顺序：先用本地已有的同名候选（省一次网络），再回上游仓库（同一提交）。
 * `fetchText` 由调用方注入（桥接有自己的抓取实现，测试里塞假实现）。
 */
export async function materializeRefs({ dir, source, fetchText, candidatesRoot, log = () => {} }) {
  const own = parseSkill(read(path.join(dir, 'SKILL.md')));
  const names = referencedSkills(own).map(refDirName).filter(Boolean);
  const resolved = [];
  const unresolved = [];
  const sources = existsSync(path.join(dir, 'refs', 'SOURCES.json'))
    ? JSON.parse(read(path.join(dir, 'refs', 'SOURCES.json')))
    : {};

  for (const ref of names) {
    const rel = path.posix.join('refs', ref);
    const target = path.join(dir, 'refs', ref, 'SKILL.md');
    if (existsSync(target)) {
      resolved.push({ name: ref, dir: rel, origin: sources[ref]?.origin ?? 'already' });
      continue;
    }
    let text = '';
    let origin = '';
    const local = candidatesRoot ? path.join(candidatesRoot, ref, 'SKILL.md') : '';
    if (local && existsSync(local)) {
      text = read(local);
      origin = `本地候选 ${path.posix.join('candidates/skills', ref, 'SKILL.md')}`;
    }
    if (!text && source?.repo && fetchText) {
      const ref0 = source.commit && source.commit !== 'unknown' ? source.commit : 'main';
      for (const candidate of upstreamCandidates(ref, source)) {
        const raw = await fetchText(`https://raw.githubusercontent.com/${source.repo}/${ref0}/${candidate}`);
        if (raw && parseSkill(raw).body) {
          text = raw;
          origin = `${source.repo}@${ref0}:${candidate}`;
          break;
        }
      }
    }
    if (!text) {
      unresolved.push(ref);
      log(`⚠ 被引用的技能 ${ref} 没能拉到（本地和上游都没有），跳过`);
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text, 'utf8');
    sources[ref] = { origin, ...(source?.repo ? { repo: source.repo, commit: source.commit } : {}) };
    resolved.push({ name: ref, dir: rel, origin });
    log(`✔ 被引用的技能 ${ref} → ${rel}/SKILL.md（${origin}）`);
  }

  if (resolved.length) {
    mkdirSync(path.join(dir, 'refs'), { recursive: true });
    writeFileSync(path.join(dir, 'refs', 'SOURCES.json'), `${JSON.stringify(sources, null, 2)}\n`, 'utf8');
  }
  return { names, resolved, unresolved };
}
