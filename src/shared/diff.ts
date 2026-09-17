/**
 * 两版产物的行级 diff（页面用，不引第三方库）。
 *
 * 为什么要有：试用详情里 A/B 的产物现在只能各自「打开」——**看不出改了哪几行**。
 * 对代码 / 组件类技能（比如 React）来说这恰恰是最该看的东西：你自己也能一眼扫出
 * "B 用了 useMemo、A 没有"，而不用并排开两个标签页人肉比对。
 *
 * 算法：LCS 动态规划 + 回溯。行数上限之内用 O(n·m) 的 DP（几百行很快），
 * 超了就**不硬算**，返回 `tooLarge` 让页面直说"太长，只给结论 + 两个打开入口"。
 */
export interface DiffRow {
  type: 'same' | 'add' | 'del';
  text: string;
  /** 左侧（A）的行号，1 起；该侧没有这一行时是 null */
  leftNo: number | null;
  /** 右侧（B）的行号，1 起；该侧没有这一行时是 null */
  rightNo: number | null;
}

export interface DiffResult {
  rows: DiffRow[];
  added: number;
  removed: number;
  leftLines: number;
  rightLines: number;
  /** 行数超过上限：没算 diff（rows 为空） */
  tooLarge: boolean;
  /** 两侧内容完全一致 */
  identical: boolean;
}

const DEFAULT_MAX_LINES = 1200;

const linesOf = (text: string): string[] => {
  const normalized = String(text ?? '').replace(/\r\n/g, '\n');
  const trimmed = normalized.replace(/\n+$/, '');
  return trimmed === '' ? [] : trimmed.split('\n');
};

export function diffLines(beforeText: string, afterText: string, maxLines = DEFAULT_MAX_LINES): DiffResult {
  const a = linesOf(beforeText);
  const b = linesOf(afterText);
  // "一致"按**行内容**判：末尾换行、CRLF 这类差异不该报成"改过"（否则每次对照都是噪声）
  const identical = a.join('\n') === b.join('\n');
  const base = { leftLines: a.length, rightLines: b.length, added: 0, removed: 0, identical };
  if (identical) {
    return { ...base, rows: a.map((text, i) => ({ type: 'same' as const, text, leftNo: i + 1, rightNo: i + 1 })), tooLarge: false };
  }
  if (a.length > maxLines || b.length > maxLines) return { ...base, rows: [], tooLarge: true };

  // LCS 长度表（从右下往左上填）
  const dp: Uint32Array[] = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i], leftNo: i + 1, rightNo: j + 1 });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: 'del', text: a[i], leftNo: i + 1, rightNo: null });
      removed += 1;
      i += 1;
    } else {
      rows.push({ type: 'add', text: b[j], leftNo: null, rightNo: j + 1 });
      added += 1;
      j += 1;
    }
  }
  while (i < a.length) {
    rows.push({ type: 'del', text: a[i], leftNo: i + 1, rightNo: null });
    removed += 1;
    i += 1;
  }
  while (j < b.length) {
    rows.push({ type: 'add', text: b[j], leftNo: null, rightNo: j + 1 });
    added += 1;
    j += 1;
  }
  return { rows, added, removed, leftLines: a.length, rightLines: b.length, tooLarge: false, identical: false };
}

/** 给页面的一句话（"B 比 A 多 5 行：新增 12 / 删除 7"） */
export function describeDiff(d: DiffResult): string {
  if (d.identical) return '两版内容完全一致';
  if (d.tooLarge) return `文件太长（A ${d.leftLines} 行 / B ${d.rightLines} 行），没算逐行差异`;
  const delta = d.rightLines - d.leftLines;
  const tail = delta === 0 ? '行数相同' : `B 比 A ${delta > 0 ? '多' : '少'} ${Math.abs(delta)} 行`;
  return `${tail}：新增 ${d.added} 行 / 删除 ${d.removed} 行`;
}
