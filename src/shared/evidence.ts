import { evidenceUrl } from './findings';
import type { Trial } from './types';

/* ───────────────── 证据的"读法"：把机器文件变成能看懂的东西 ─────────────────
 * 证据区只回答一个问题：**这次凭什么判成这样**。
 * A/B 各自的产物在详情顶部的对照板里已经给了（能直接打开），所以这里不再重复摆一遍代码；
 * 这里只把判定记录（skill-up 的 `result.json`）读成"逐条判据 × A / B 过没过"，
 * 原始文件退成一个折叠入口，被追问时才展开。
 */

/** 判定记录文件：skill-up 每次跑都会写 result.json（含逐条判据） */
export function recordPath(trial?: Trial | null): string | null {
  const hit = (trial?.evidence ?? []).find((p) => /(^|\/)result\.json$/i.test(p));
  return hit ?? null;
}

export interface Assertion {
  /** 判据原文（例：expect.exit_code、"产出要能直接用…"） */
  text: string;
  passed: boolean;
  /** 判定依据（模型写的长文本，折叠起来看） */
  evidence: string;
}

export interface SideRun {
  status: string;
  passed: boolean;
  turns: number | null;
  durationMs: number | null;
  assertions: Assertion[];
  /** 这一侧过了几条判据 */
  passedCount: number;
}

export interface CaseRun {
  caseId: string;
  /** 条件名 → 那一侧的运行结果（'with_skill' 归到 B、'without_skill' 归到 A） */
  sides: Record<string, SideRun>;
}

/** skill-up 记录里的 configuration → 台账里的条件名 */
function sideOfConfiguration(configuration: unknown, trial: Trial): string | null {
  const key = String(configuration ?? '').toLowerCase();
  const wantCapability = key.includes('with_skill') ? true : key.includes('without_skill') ? false : null;
  const conditions = trial.conditions ?? [];
  if (wantCapability !== null) {
    const hit = conditions.find((c) => Boolean(c.withCapability) === wantCapability);
    if (hit) return hit.name;
  }
  // 认不出来就对不上：宁可少显示，也不要把它塞给错的那一边
  const first = conditions[0];
  return conditions.length === 1 && first ? first.name : null;
}

function readAssertions(grading: unknown): Assertion[] {
  const list = (grading as { assertion_results?: unknown })?.assertion_results;
  if (!Array.isArray(list)) return [];
  return list
    .filter((a): a is Record<string, unknown> => Boolean(a) && typeof a === 'object')
    .map((a) => ({
      text: String(a.text ?? '（没写判据名）'),
      passed: a.passed === true,
      evidence: String(a.evidence ?? a.reason ?? '').trim(),
    }));
}

/** 判定记录（已 JSON.parse 的对象）→ 每条用例 × 每侧的结果；认不出来返回 [] */
export function parseRecord(record: unknown, trial: Trial): CaseRun[] {
  const cases = (record as { case_results?: unknown })?.case_results;
  if (!Array.isArray(cases)) return [];
  const byCase = new Map<string, CaseRun>();
  for (const raw of cases) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const side = sideOfConfiguration(c.configuration, trial);
    if (!side) continue;
    const grading = c.grading as { status?: unknown } | undefined;
    const assertions = readAssertions(grading);
    const status = String(grading?.status ?? c.status ?? '未知');
    const run: SideRun = {
      status,
      passed: status.toUpperCase() === 'PASS',
      turns: typeof c.turns === 'number' ? c.turns : null,
      durationMs: typeof c.duration_ms === 'number' ? c.duration_ms : null,
      assertions,
      passedCount: assertions.filter((a) => a.passed).length,
    };
    const caseId = String(c.case_id ?? '（没写用例 id）');
    const entry = byCase.get(caseId) ?? { caseId, sides: {} };
    entry.sides[side] = run;
    byCase.set(caseId, entry);
  }
  return [...byCase.values()];
}

/** 逐条判据对齐成表格行：判据原文 + 每侧过没过 */
export interface VerdictRow {
  text: string;
  sides: Record<string, { passed: boolean; evidence: string } | undefined>;
}

export function verdictRows(runs: CaseRun[], sides: string[]): VerdictRow[] {
  const rows: VerdictRow[] = [];
  const seen = new Map<string, VerdictRow>();
  for (const run of runs) {
    for (const side of sides) {
      for (const assertion of run.sides[side]?.assertions ?? []) {
        let row = seen.get(assertion.text);
        if (!row) {
          row = { text: assertion.text, sides: {} };
          seen.set(assertion.text, row);
          rows.push(row);
        }
        row.sides[side] = { passed: assertion.passed, evidence: assertion.evidence };
      }
    }
  }
  return rows;
}

/** 这次判定里"没过的判据及其依据"——要解释的只有这些，别的不用摆 */
export function failingNotes(runs: CaseRun[], sides: string[]): { side: string; text: string; evidence: string }[] {
  const out: { side: string; text: string; evidence: string }[] = [];
  for (const run of runs) {
    for (const side of sides) {
      for (const a of run.sides[side]?.assertions ?? []) {
        if (!a.passed) out.push({ side, text: a.text, evidence: a.evidence || '（没写依据）' });
      }
    }
  }
  return out;
}

/** 判定记录在页面上的地址（给"原始记录"用） */
export function recordUrl(trial?: Trial | null): string | null {
  const path = recordPath(trial);
  return path ? evidenceUrl(path) : null;
}
