/**
 * 交付物形态：这条评测要 agent 交出**什么形状的东西**。
 *
 * 起因（2026-09-15，用户指出）：`react-best-practices` 是管 React 写法的技能，产物本该是
 * **React 文件对比**，可自动设计那条路交付的是 `perfkit.mjs`（一个 Node 脚本）——因为
 * 形态规则里只有"页面 / 小程序 / 文档"三档，React 技能掉进"代码类 → 小程序"；
 * 更糟的是白名单**静默改写**：模型就算选了 `src/Dashboard.tsx`，也会被无声改成 `impl.mjs`。
 *
 * 现在四档，且不认识的后缀不再静默处理（调用方要把改写说出来）：
 *   page      页面：自包含 `index.html`（视觉 / UI / 排版 / 交互 / 设计系统）
 *   component 组件源码：`src/Xxx.tsx` 这类**框架组件文件本身**（React/Vue/Svelte/组件库）
 *   program   小程序：`xxx.mjs`（命令行 / 算法 / 只靠退出码与 stdout 就能判的）
 *   doc       文档：`report.md` / `x.json`（流程 / 计划 / 拆解）
 */

const PAGE = /\.html?$/i;
const COMPONENT = /\.(tsx|jsx|vue|svelte)$/i;
const PROGRAM = /\.(mjs|cjs|js)$/i;
const DOC = /\.(md|json)$/i;

export const KIND_LABEL = {
  page: '页面',
  component: '组件源码',
  program: '小程序',
  doc: '文档',
};

/** 认得出就返回形态，认不出返回 null（调用方决定兜底成什么） */
export function deliverableKind(name) {
  const file = String(name ?? '').trim();
  if (PAGE.test(file)) return 'page';
  if (COMPONENT.test(file)) return 'component';
  if (PROGRAM.test(file)) return 'program';
  if (DOC.test(file)) return 'doc';
  return null;
}

/**
 * 规范化交付物路径：允许 `src/Dashboard.tsx` 这样的**子路径**（组件类产物天然带目录），
 * 但不允许绝对路径与 `..`（它会进判分脚本的 `for f in <路径>`）。
 */
export function cleanDeliverablePath(name) {
  const raw = String(name ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^[A-Za-z]:/, '') // Windows 盘符（C:\tmp\a.tsx → /tmp/a.tsx）
    .replace(/[^A-Za-z0-9._/-]/g, '');
  const parts = raw
    .split('/')
    .filter((p) => p && p !== '.' && p !== '..');
  return parts.join('/');
}

/**
 * 模型给的交付物 → 我们真正要用的那个。
 * `rewritten: true` 表示"它写了个我们不认识的形状，兜底成了小程序"——**调用方必须把这件事说出来**，
 * 别再像以前那样静默改写（用户就是这么发现 React 技能被降级成 Node 脚本的）。
 */
export function normalizeDeliverable(raw) {
  const cleaned = cleanDeliverablePath(raw);
  if (!cleaned) return { name: 'impl.mjs', kind: 'program', rewritten: true, from: String(raw ?? '') };
  const kind = deliverableKind(cleaned);
  if (kind) return { name: cleaned, kind, rewritten: false, from: '' };
  return { name: 'impl.mjs', kind: 'program', rewritten: true, from: cleaned };
}
