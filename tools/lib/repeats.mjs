/**
 * 多次重复跑的合并口径（`--repeat N`）。
 *
 * 为什么要它（2026-09-15 的真实教训）：`react-best-practices` 同一条用例、同一段提示词，
 * 第一次跑 A 侧 1/1（没装技能也把瀑布改对了）、第二次跑 A 侧 0/1（一个字没改）——
 * **A 侧在两次之间翻转了**，所以"这次有没有区分度"用 n=1 根本分不清。
 * 规则：一条试用可以覆盖 N 次重复，结论必须带上"B 在几次里过了几次"，不许把一次运行当结论。
 *
 * 这里只管"怎么合"，不管"怎么判"（判定在 tools/lib/trial-record.mjs 的 `decide()`）。
 */

const SIDES = { A: 'without_skill', B: 'with_skill' };

/** 一次运行里某一侧的用例结果（没有 A 侧时 B 用全部结果兜底，与单次口径一致） */
function casesOf(cases, side) {
  const mine = cases.filter((c) => c.configuration === SIDES[side]);
  if (side === 'A') return mine;
  return mine.length ? mine : cases.filter((c) => c.configuration !== SIDES.A);
}

/**
 * @param runs 每次运行一份 `{ cases }`（cases 就是 result.json 的 case_results）
 * @returns `{ n, A, B, perRun }`；每侧 `{ passed, total, passRate, perfectRuns, tokens... }` 见下
 *   - `passRate`：所有重复合并后的通过率（N 次各 1 条用例时就是"过了几次 / N"）
 *   - `perfectRuns`：**这一侧的用例在多少次运行里全过**——判定用的就是它
 */
export function summarizeRuns(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const out = { n: list.length, A: blank(), B: blank(), perRun: [] };

  list.forEach((run, index) => {
    const cases = run?.cases ?? [];
    const per = { index: index + 1, A: '', B: '' };
    for (const side of ['A', 'B']) {
      const mine = casesOf(cases, side);
      const passed = mine.filter((c) => c.status === 'PASS').length;
      const acc = out[side];
      acc.total += mine.length;
      acc.passed += passed;
      if (mine.length && passed === mine.length) acc.perfectRuns += 1;
      acc.tokensIn += mine.reduce((n, c) => n + (c.input_tokens ?? 0), 0);
      acc.tokensOut += mine.reduce((n, c) => n + (c.output_tokens ?? 0), 0);
      acc.durationMs += mine.reduce((n, c) => n + (c.duration_ms ?? 0), 0);
      acc.turns += mine.reduce((n, c) => n + (c.turns ?? 0), 0);
      if (mine.length) per[side] = `${passed}/${mine.length}`;
    }
    out.perRun.push(per);
  });

  for (const side of ['A', 'B']) {
    const acc = out[side];
    acc.passRate = acc.total ? acc.passed / acc.total : 0;
  }
  return out;
}

function blank() {
  return { passed: 0, total: 0, perfectRuns: 0, passRate: 0, tokensIn: 0, tokensOut: 0, durationMs: 0, turns: 0 };
}

/** `{ A: '2/3', B: '3/3' }` 这种给人看的写法（只在有该侧时给） */
export function repeatsLabel(summary) {
  const out = {};
  if (summary.A.total) out.A = `${summary.A.perfectRuns}/${summary.n}`;
  if (summary.B.total) out.B = `${summary.B.perfectRuns}/${summary.n}`;
  return out;
}

/** 一次运行都没落下才算"重复跑真的跑够了" */
export function repeatNote(summary) {
  if (summary.n <= 1) return '';
  return `重复 ${summary.n} 次（同一条用例）：A 全过 ${summary.A.perfectRuns}/${summary.n}、B 全过 ${summary.B.perfectRuns}/${summary.n}`;
}
