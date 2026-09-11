/**
 * **入口开关**：目前开放评测入口的能力类型。
 *
 * MCP 与子代理先注释掉（2026-09-11，用户要求"入口等想好了再放开，有关的入口/筛选先注释"）：
 *   - 子代理：A/B 口径还没定（是"提示级对照"还是"真跑 agent"），现行做法只是把规格拼进提示词；
 *   - MCP：按路线只做"收录 + 可用性检查"，结论是可用 / 不可用、不判采纳，入口先不开。
 * 能力本身、评测工具与桥接都还在（`tools/promptfoo-bridge.mjs`、`tools/mcp-probe.mjs`），
 * 想好了放开时把下面两行注释放开即可——页面入口、类型筛选、服务端白名单会一起放开
 * （服务端那份在 `vite.config.ts` 的 `OPEN_TOOLS`，两边保持一致）。
 */
export const OPEN_CAPABILITY_TYPES: readonly string[] = [
  'skill',
  // 'agent', // 子代理入口：等 A/B 口径定下来再放开
  // 'mcp',   // MCP 入口：只做收录 + 可用性检查（可用 / 不可用），先不开放
];

/** 这个类型现在能不能发起评测 */
export const isEntryOpen = (type?: string | null): boolean => OPEN_CAPABILITY_TYPES.includes(type ?? '');
