# Skill Benchmark: react-best-practices

**Date**: 2026-09-15T10:03:57Z
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
| 只按用户给出的这条任务要求评判：任务里明确要的东西都在，就算做到了；任务没要求的，不许拿来扣分（也别用别的标准） | ✅ | 任务原文（transcript 第 0 条 user 消息）只提出三项要求：'src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/notes.md，写清每处改动是想解决哪个问题。'; 要求(1) 优化——src/Dashboard.tsx 已被改写为优化版本（workspace 中该文件 6146 字节，含 Promise.all、useMemo、memo、Map 索引等改动）; 要求(2) 直接写回原文件——transcript 第 14/15 条显示工具调用为 Write，目标路径为 C:\Users\yu.zhao\AppData\Local\Temp\skill-up-3531760712\src\Dashboard.tsx，结果为 'The file ... has been updated successfully'；未新建副本; 要求(3) 改动说明放 docs/notes.md——该文件存在（8050 字节），且非空；transcript 第 19/20 条显示其内容由 Write 创建于 ...\docs\notes.md; notes.md 逐条标注了「解决哪个问题」：正文以 '一、「打开要好几秒」' 与 '二、「切筛选也卡」' 两大节组织，9 条改动每条都写明『问题』与『改法』两段（如第 1 条对应打开慢、第 3/4/5/6/7 条对应切筛选卡）; 任务未要求类型检查、实机运行或 Profiler 实测，因此 final_message 中自述『没有做类型检查、没有实机运行、没有 Profiler 实测』不构成本条扣分项；同理任务未要求保留原文件头部注释或使用 toSorted()，agent 对这两处的保留/说明也不扣分 |
| 产出要能用：交付物在、能跑起来 / 能打开、格式没错；跑不起来、交付物缺失、输出对不上任务要求的格式，才算没做到 | ✅ | 交付物齐全：src/Dashboard.tsx（6146 字节）与 docs/notes.md（8050 字节）均实际存在于工作区 C:\Users\yu.zhao\AppData\Local\Temp\skill-up-3531760712; 格式正确：交付物是任务指定的两个路径/两种格式——一个 .tsx 源码文件写回原路径，一份 Markdown 说明写在新路径 docs/notes.md，与任务 '改动说明放 docs/notes.md' 的要求一致; 语法可解析：独立复跑 npx esbuild@0.24.0 src/Dashboard.tsx --target=es2020 --format=esm，exit=0、stderr 为空、产出 87 行 JS，说明该 TSX 能被正常解析/编译；transcript 第 33/34 条中 agent 的同一检查亦为 exit=0; 代码自洽可运行：src/Dashboard.tsx 中 Promise.all 并行加载、userById Map、useMemo 派生 rows、memo(Row)、key={o.id} 相互一致，未残留被删状态（Grep 结果见 transcript 第 22/23 条，仅命中注释中的 'setRows'/'userOf' 文字，无实际 setRows/userOf/key={i} 调用残留）; 对外行为与改造前一致：Row 的点击仍为 setQuery(order.user)（第 159/177 行 onPick={setQuery} 与 onClick={() => onPick(order.user)}），行内渲染字段与排序逻辑（filter → sort by amount 降序）和原实现相同；ROW_STYLE={padding:8} 等价于原先每行传入的 style={{padding:8}}; 说明：工作区内不存在 package.json / tsconfig.json / CSS 文件（transcript 第 37 条 find 结果仅列出 .claude、docs/notes.md、src/Dashboard.tsx），无可运行入口是工作区本身限制，非交付物缺陷；agent 已在 final_message 与 notes.md 开头显式披露这一点与残留风险（useDeferredValue 需 React 18+、未做 tsc 类型检查） |
| 针对用户说的两个症状（首次打开慢、切筛选卡）在代码里有对应改动，而不是只做了无关的清理 | ✅ | 症状一『打开要好几秒』有对应改动：原文件（transcript 第 3 条读到的原始内容，第 66-77 行）中 load() 内为 const o = await fetchOrders(); setOrders(o); const m = await fetchMetrics(); ... 串行执行，三接口分别为 sleep(600)/sleep(650)/sleep(550)；改后 src/Dashboard.tsx:71-83 在同一 useEffect 内改为 await Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()])，把首屏耗时从 1800ms 量级降到约 650ms; 症状二『切筛选卡』改动 1：原文件第 88-89 行把 window.addEventListener('resize', ...) 直接写在组件函数体内且无清理；改后 src/Dashboard.tsx:107-111 移入 useEffect 并在返回函数中 removeEventListener，消除了每次渲染叠加监听导致的泄漏与卡顿; 症状二改动 2：原文件第 91 行 userOf = (id) => users.find(...) 并在每行调用（第 138 行）；改后 src/Dashboard.tsx:86 建立 useMemo(() => new Map(...))，第 158 行改为 userById.get(o.user)?.name，把每渲染约 28,800 次比较降为 O(1); 症状二改动 3：原文件第 79-86 行把 filter/sort 放在 useEffect 中 setRows 写回 state（派生数据冗余一轮渲染）；改后 src/Dashboard.tsx:93-102 删除 rows state 与对应 effect，改为渲染期 useMemo 直接派生; 症状二改动 4：原文件第 134-142 行用 key={i}、每行新建 style={{padding:8}} 与 onPick={() => setQuery(o.user)} 闭包，且 Row（第 156 行）未 memo；改后 src/Dashboard.tsx:59 提出模块级 ROW_STYLE、第 156 行 key={o.id}、第 159 行传稳定的 setQuery、第 175 行 const Row = memo(function Row(...))，四处共同消除全量 480 行重渲染; 症状二改动 5（加固）：src/Dashboard.tsx:89 引入 useDeferredValue(query)，第 102 行依赖数组相应改为 [orders, deferredQuery, status]，并把 q = deferredQuery.trim().toLowerCase() 提到循环外; 每条改动均在 docs/notes.md 中与症状显式对应：第 12-31 行小节标题为「一、『打开要好几秒』」，第 34-36 行小节标题为「二、『切筛选也卡』」并在开头写明『卡顿不是一个原因造成的，是下面几处叠加』，逐条编号 1-9 说明各自解决哪个问题 |

### src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/… (without_skill)

- **Pass Rate**: 100% (4/4)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| 只按用户给出的这条任务要求评判：任务里明确要的东西都在，就算做到了；任务没要求的，不许拿来扣分（也别用别的标准） | ✅ | 任务要求共三项：优化 src/Dashboard.tsx、改完写回该文件、改动说明放 docs/notes.md 并写清每处改动解决哪个问题（transcript turn 1 用户原话："src/Dashboard.tsx 打开要好几秒，切筛选也卡，帮我优化一下。改完直接写回这个文件，改动说明放 docs/notes.md，写清每处改动是想解决哪个问题。"）。; 要求1已满足：src/Dashboard.tsx 被原地重写（transcript 中 Write 工具调用 file_path 为 .../src/Dashboard.tsx，落盘后 203 行，grep 确认包含 Promise.all、useMemo、memo(、useDebounced、ROW_STYLE、key={o.id}、addEventListener）。; 要求2已满足：docs/notes.md 已创建并落盘（123 行），由用户指定的同一路径 Write 生成，且 agent 还额外做了一次 Edit 修正其中一条乱码条目（transcript turn 5）。; 要求3已满足：notes.md 用小节把每处改动挂在症状下（"一、首屏慢"/"二、切筛选卡"），并对每条给出改前代码片段、改后写法、代价对比（如串行 ≈1800ms → 并行 ≈650ms、480×60=28800 次比较 → O(1)）。; agent 额外写入的卸载保护 alive 标志、头部注释更新、useDebounced 说明等超出任务要求的内容，按 criterion-1 的口径不作为扣分项。 |
| 产出要能用：交付物在、能跑起来 / 能打开、格式没错；跑不起来、交付物缺失、输出对不上任务要求的格式，才算没做到 | ✅ | 交付物均存在且可打开：磁盘上 src/Dashboard.tsx（203 行）与 docs/notes.md（123 行）均在，notes.md 为标准 Markdown，含标题、分节、代码块，可用任意 Markdown 阅读器打开。; Dashboard.tsx 为语法自洽的 TSX：引入改为 import { memo, useCallback, useEffect, useMemo, useState } from 'react' 与 import type { CSSProperties } from 'react'，组件、导出接口（Order/Metric/User 与 fetchOrders/fetchMetrics/fetchUsers）签名与返回值保持原样，未破坏原有导出。; 输出格式与任务要求一致：任务只要求"写回这个文件"+"说明放 docs/notes.md"，agent 交付的正是这两个路径的这两份文件，未改换格式或路径。; 工作区内没有任何 package.json / 构建配置 / 测试（find 结果只有 src/Dashboard.tsx 与 docs/notes.md），客观不存在可执行构建或测试的环境；agent 在最终消息与 notes "五、验证情况" 中如实声明"本次改动没有实际跑过构建或测试"，耗时数字系按 sleep 时长推算，未冒充实测。; 代码内容与声明一致：grep 命中的 Promise.all（第 85 行）、useMemo（101/110 行）、useDebounced（65 行）、memo（193 行）、key={o.id}（173 行）、ROW_STYLE（61/176 行）、addEventListener（119 行）均真实存在于交付文件中，不存在"说了没做"的对不上情况。 |
| 针对用户说的两个症状（首次打开慢、切筛选卡）在代码里有对应改动，而不是只做了无关的清理 | ✅ | 针对"首次打开慢"：第 85 行由原来的三个 await 串行改为 void Promise.all([fetchOrders(), fetchMetrics(), fetchUsers()])，首屏耗时由三者相加降为最慢一项。; 针对"首次打开慢"：第 110 行 const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])，替换原第 91 行每行调用一次的 users.find，渲染期由 O(行数×成员数) 降为 O(1)，第 175 行改由 userMap.get(o.user) 取名字。; 针对"切筛选卡"：第 101 行 rows 由 useState+useEffect 的派生 state 改为 useMemo（依赖 [orders, debouncedQuery, status]），并补 matched.slice() 防止 sort 原地修改 orders state。; 针对"切筛选卡"：新增 useDebounced（第 65 行）并在第 97 行以 200ms 应用，输入框 value 仍即时更新，只有过滤用防抖值；status 下拉未防抖，立即生效。; 针对"切筛选卡"：Row 由普通函数组件改为 memo 包裹（第 193 行），并把 style 提为模块级常量 ROW_STYLE/METRIC_STYLE（第 61 行）、onPick 改为 useCallback 稳定函数（第 133 行附近 handlePick），消除每渲染新引用导致 memo 失效的问题。; 针对"切筛选卡"：列表 key 由 key={i} 改为 key={o.id}（第 173 行），筛选排序后节点身份随数据走。; 针对"切筛选卡"：原来写在渲染体内的 window.addEventListener('resize', ...)（原第 89 行，每次渲染挂一个且从不移除）改为放进 useEffect 并带 removeEventListener/cancelAnimationFrame cleanup，且用 requestAnimationFrame 合并同帧 resize（第 119 行附近）。; 改动集中于用户指出的两个症状，非无关清理：题述 7 项主改动全部对应"首屏慢"或"切筛选卡"，notes.md 亦按这两个症状分节组织；仅有的附带清理（CSSProperties 显式 import、过时头部注释）在 notes "三、顺带的小清理" 中单独标注，未混入主改动。 |

