/**
 * 产物核验：**这一侧的交付物到底改了没有、改了多少**。
 *
 * 起因（2026-09-15，react-best-practices 那次）：判官的材料是 `final_message` + `transcript`
 * （skill-up 的 `generated_files` 是 `omit`，而且**不可配**——文档里只有 criteria / skills /
 * pass_threshold），它只能从 transcript 里的 Write/Read 内容去推断产物长什么样。
 * 那次真正说明问题的事实不是判官写的，而是我手工核出来的：**A 侧产物与输入逐字节相同**
 * （一个字没改，只做了只读探查）。这种"有没有真的动手"应该由机器算，不该靠人肉比对。
 *
 * 所以这里做两件事（都用工作区输入 `repo_fixture` 当基准）：
 *   1. 从任务提示词里认出**它要求的文件路径**（`src/Dashboard.tsx` 这种）——用来做"交付物必须还在"的门槛；
 *   2. 把每侧的产物与输入比一比：一致 / 差多少字节；有行级差异时给出改动处数。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/** 提示词里出现的、像"仓库内相对路径"的东西（认后缀，避免把普通词当路径） */
const PATH_RE = /(?:^|[\s`"'（(])([A-Za-z0-9_][A-Za-z0-9_./-]*\.(?:tsx|jsx|ts|js|mjs|cjs|vue|svelte|html|css|scss|md|json|py|go|sh|yaml|yml))(?=[\s`"')），。、:：]|$)/gm;

export function mentionedPaths(prompt) {
  const out = [];
  for (const m of String(prompt ?? '').matchAll(PATH_RE)) {
    const p = m[1].replace(/^\.\//, '');
    if (!p.includes('/') && !/^[A-Za-z0-9_-]+\.(md|json|ya?ml)$/.test(p)) continue;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** 提示词点名的路径里，哪些在工作区输入里真的存在（这些就是"改完必须还在"的文件） */
export function expectFilesFromPrompt(prompt, fixtureDir) {
  if (!fixtureDir) return [];
  return mentionedPaths(prompt).filter((rel) => existsSync(path.join(fixtureDir, rel)));
}

/** 纯文本按行切（CRLF 归一，末尾空行不算内容） */
const linesOf = (text) => String(text).replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n');

/**
 * 行级差异处数：只数"最长公共子序列之外"的行数（两边加起来），够用来回答"改了 12 处还是没动"。
 * 不做真正的 diff 渲染——那是页面的事（`src/shared/diff.ts`）；这里只要一个能写进台账的数字。
 */
export function changedLineCount(before, after) {
  const a = linesOf(before);
  const b = linesOf(after);
  // 经典 LCS 动态规划；产物都是几十到几百行，内存够
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const common = dp[0][0];
  return a.length + b.length - 2 * common;
}

/**
 * 把产物和工作区输入里的同名文件比一比。
 * `inputAbs` / `artifactAbs` 任一不存在就返回 `null`（没得比就别硬写结论）。
 */
export function compareWithInput(inputAbs, artifactAbs) {
  if (!inputAbs || !artifactAbs || !existsSync(inputAbs) || !existsSync(artifactAbs)) return null;
  const before = readFileSync(inputAbs, 'utf8');
  const after = readFileSync(artifactAbs, 'utf8');
  const same = before === after;
  return {
    same,
    inputBytes: statSync(inputAbs).size,
    artifactBytes: statSync(artifactAbs).size,
    deltaBytes: statSync(artifactAbs).size - statSync(inputAbs).size,
    changedLines: same ? 0 : changedLineCount(before, after),
  };
}

/** 给台账看的一句话（"与输入一致（未改动）" / "比输入 +2037 B，改了 12 处"） */
export function describeComparison(file, cmp) {
  if (!cmp) return '';
  if (cmp.same) return `${file} 与输入一致（未改动）`;
  const delta = cmp.deltaBytes === 0 ? '字节数相同' : `${cmp.deltaBytes > 0 ? '+' : ''}${cmp.deltaBytes} B`;
  return `${file} 比输入 ${delta}，改了 ${cmp.changedLines} 处`;
}
