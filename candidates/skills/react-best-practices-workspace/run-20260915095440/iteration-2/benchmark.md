# Skill Benchmark: react-best-practices

**Date**: 2026-09-15T10:00:33Z
**Evals**: src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/… (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|-----------|--------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |

## Per-Case Results

### src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/… (with_skill)

- **Pass Rate**: 100% (4/4)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| 只按用户给出的这条任务要求评判：任务里明确要的东西都在，就算做到了；任务没要求的，不许拿来扣分（也别用别的标准） | ✅ | 用户任务原文（transcript 第 0 条）："src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/notes.md，写清每处改动是想解决哪个问题。"; 要求『改完直接写回这个文件』：transcript 第 19 条为对 src/Dashboard.tsx 的 Write 调用，第 20 条返回 "The file ... has been updated successfully"；磁盘上该文件（192 行）确实已是优化后版本。; 要求『改动说明放 docs/notes.md』：transcript 第 22 条 Write 调用创建 docs/notes.md，第 23 条返回 "File created successfully"；磁盘上该文件存在（148 行）。; 要求『写清每处改动是想解决哪个问题』：docs/notes.md 第 107-121 行有 13 行改动清单表，列为『位置 | 改动 | 解决的问题』，例如第 109 行『数据加载 effect | 串行 await → Promise.all | 首屏 ~1.8s → ~650ms』。; 额外做的 resize 监听器修复、Map 索引、useDeferredValue 等属于任务未要求的附加项，未据此加减分。 |
| 产出要能用：交付物在、能跑起来 / 能打开、格式没错；跑不起来、交付物缺失、输出对不上任务要求的格式，才算没做到 | ✅ | 两个交付物都存在于磁盘：src/Dashboard.tsx（191 行内容）与 docs/notes.md（147 行内容）。; 语法/编译可用：`bun build src/Dashboard.tsx --external react` 输出 "Bundled 1 module in 67ms  Dashboard.js 6.73 KB (entry point)"，TS + JSX 解析零报错。; 可打开/可渲染：用 react 19.3.0 + react-dom/server 的 renderToString 渲染成功，输出完整 HTML（<div class="dashboard" style="width:1168px">、<input>、<select>、<table><thead>…<tbody>），未抛异常。; 可真实运行与交互：happy-dom + createRoot 客户端渲染测试中，装载后 tbody 行数为 480，总耗时约 1056ms（数据加载本身约 650ms，与并行化后的预期一致）。; 交互与格式正确：切换 select 为 paid 后行数变为 160（480/3，行为与原 .filter 一致）；点击第 4 行后 input 值变为 "u-27"、行数变为 8（480/60）、文案为『共 8 条 / 成员 60 人』，说明点击行 setQuery(order.user) 的原有行为被保留。; notes.md 为正常 Markdown 文档，含标题、分节、表格与代码块，格式符合『改动说明』的要求。 |
| 针对用户说的两个症状（首次打开慢、切筛选卡）在代码里有对应改动，而不是只做了无关的清理 | ✅ | 症状一『打开要好几秒』有对应改动：原文件（transcript 第 7 条 tool_result，原 67-77 行）为 `const o = await fetchOrders(); ... const m = await fetchMetrics(); ... const u = await fetchUsers();` 三段串行 await；新文件 src/Dashboard.tsx:85-98 改为 `const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()]);`，并加了 cancelled 清理。; 症状二『切筛选卡』有对应改动之一：原文件 79-86 行把派生数据塞进 state（`rows` + `useEffect(() => {... setRows(next) }, [orders, query, status])`）；新文件已删除该 state 与 effect，改为 src/Dashboard.tsx:112-118 渲染期 `useMemo` 计算 rows。; 症状二对应改动之二：原文件 134-142 行 `Row` 无 memo 且 `style={{ padding: 8 }}`、`onPick={() => setQuery(o.user)}`、`key={i}` 每次渲染都新建；新文件 src/Dashboard.tsx:59-60 提为模块常量 ROW_STYLE/METRIC_STYLE，160-166 行改 `key={o.id}` 与共享 `onPick={setQuery}`，181 行 `const Row = memo(function Row(...))`。; 实测印证症状二确实被处理：客户端渲染测试中输入 select 切到 paid 后 DOM 行数正确变为 160，打字/点击后行数正确收敛为 8，功能未破坏。; docs/notes.md 中两处症状均有独立章节并标注对应的问题与代码位置：第 7-21 行『一、"打开要好几秒" —— 首屏请求瀑布（原 67-77 行）』，第 25-59 行『二、"切筛选也卡"（原 79-86 行 / 原 134-142 行）』。; 非『只做无关清理』：改动集中在数据加载路径与筛选重渲染路径，未出现与两个症状无关的重构取代优化的情形。 |

### src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/… (without_skill)

- **Pass Rate**: 100% (4/4)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| 只按用户给出的这条任务要求评判：任务里明确要的东西都在，就算做到了；任务没要求的，不许拿来扣分（也别用别的标准） | ✅ | 任务要求三项：优化 src/Dashboard.tsx、改完写回该文件、改动说明放 docs/notes.md 并写清每处改动解决哪个问题。; 写回原文件已执行：transcript 中 Write 调用 file_path 为 src/Dashboard.tsx，磁盘上该文件大小为 6315 字节、修改时间 10:00，内容为优化后的版本。; docs/notes.md 已创建（磁盘 5200 字节），开头写明「优化对象：`src/Dashboard.tsx`。症状是「打开要好几秒」「切筛选卡」。下面每处改动都标明它针对的是哪个问题。」; notes 按症状分节：一、首屏慢；二、切筛选卡；三、顺带修掉的 bug；每条改动用「**问题**」「**改法**」两段明确对应到具体问题（如第 1 条写明串行 await 耗时相加 600+650+550≈1800ms）。; 任务未要求交付物之外的东西，产物未出现遗漏或偏离；额外的 bug 修复（key、resize 监听、CSSProperties 导入）未被当作扣分点。 |
| 产出要能用：交付物在、能跑起来 / 能打开、格式没错；跑不起来、交付物缺失、输出对不上任务要求的格式，才算没做到 | ✅ | 交付物齐全且在正确路径：src/Dashboard.tsx（6315 B）与 docs/notes.md（5200 B）均在磁盘上存在，目录列表可见。; 格式正确：Dashboard.tsx 为完整可解析的 TSX 模块，保留原有 Order/Metric/User 接口与 fetchOrders/fetchMetrics/fetchUsers 导出，import 语句齐全（memo, useCallback, useEffect, useMemo, useState, type CSSProperties 均在文件中被使用）。; 语法/类型层面未见错误：useState(() => window.innerWidth) 惰性初始化合法；new Map<string, User>(users.map((u): [string, User] => [u.id, u])) 类型标注合法；memo(function Row(...)) 与 CSSProperties 类型的 ROW_STYLE 常量匹配；handlePick 的 (userId: string) => void 与 RowProps.onPick 一致。; 行为等价性保持：Row 内 onClick={() => onPick(order.user)} 与原来 onPick={() => setQuery(o.user)} 语义一致；筛选/排序逻辑（status 过滤、query 匹配、b.amount - a.amount 降序）与原始实现一致。; 工作区确实不存在 package.json/tsconfig/测试（find 结果显示仅 ./src/Dashboard.tsx），无法运行构建；agent 在最终消息与 notes 顶部均明确披露「只做了静态审查，没能跑类型检查或测试」，未虚报验证结果。这是环境缺工具链所致，非交付物本身不可用。 |
| 针对用户说的两个症状（首次打开慢、切筛选卡）在代码里有对应改动，而不是只做了无关的清理 | ✅ | 症状一「首次打开慢」有对应代码改动：useEffect 中原三行串行 await（fetchOrders→fetchMetrics→fetchUsers）改为 const [o, m, u] = await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()])（Dashboard.tsx:74），并发后总耗时由 600+650+550≈1800ms 降为最慢的 ≈650ms。; 首屏另有一处改动：const [width, setWidth] = useState(() => window.innerWidth)（Dashboard.tsx:67）由每次渲染求值改为惰性初始化。; 症状二「切筛选卡」有对应代码改动：rows 由 useState + useEffect(setRows) 改为渲染期派生的 useMemo（Dashboard.tsx:89-95），消除每轮筛选多出的一整轮渲染。; 针对筛选重渲染主因的改动：Row 用 memo 包裹（Dashboard.tsx:179），并把每渲染新建的 style={{padding:8}} 提为模块常量 ROW_STYLE（Dashboard.tsx:58, 160）、onPick 由内联闭包改为 useCallback 的 handlePick（Dashboard.tsx:112, 161）。; 针对筛选计算量的改动：query.toLowerCase() 提到 filter 外算一次存为 q（Dashboard.tsx:90），成员查找由 users.find 改为 useMemo 构建的 Map 查表 userMap.get(o.user)（Dashboard.tsx:98-101, 159）。; 改动与两个症状直接相关，非无关清理：列表 key 由下标 i 改为 o.id（Dashboard.tsx:157）与 resize 监听改入 useEffect 带 cleanup（Dashboard.tsx:105-109）属附带修复，且 notes 中标注为「顺带修掉的 bug」，未挤占或替代上述两处核心性能改动。 |

