# Skill Benchmark: ui-ux-pro-max

**Date**: 2026-09-11T09:15:19Z
**Evals**: 为夜间通勤者做一款「骑行路线规划」App 的单文件落地页：交付 index.html，内联 CSS/JS，零依赖零构建，… (1 runs each per configuration)

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|-----------|--------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |

## Per-Case Results

### 为夜间通勤者做一款「骑行路线规划」App 的单文件落地页：交付 index.html，内联 CSS/JS，零依赖零构建，… (with_skill)

- **Pass Rate**: 100% (3/3)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| 只按用户给出的这条任务要求评判产出是否达标（不要自己加要求，也不要用别的标准） | ✅ | 任务要求（transcript 第0条 user 消息）逐项对照交付物 index.html（transcript 第14条 Write 全量写入 + 后续 18 次 Edit，重建结果与工作目录磁盘文件逐字节相等，len=62632）：导航(header.site-header=1)、Hero(.hero=1)、三张功能卡(.cards .card=3)、定价对比(#pricing .plan=3)、订阅表单(#subscribe-form=1)、页脚(footer.site-footer=1) 全部存在；独立 headless Chrome 复测同样得到 1/1/3/3/1/1。; 单文件零依赖：index.html 内联 <style> 与 <script>（script 计数 2，其中 1 个为反闪烁内联脚本），全文件 http:// 、https:// 、<link 、@import 、fonts.googleapis 出现次数均为 0，双击 file:// 打开即可运行。; 375px 不横向滚动：transcript tool_result@57 显示 375px 下 docScrollW=bodyScrollW=375、overflowing=[]；tool_result@114 复检 375/768/860/1024/1440 各宽度（含深色）溢出=无；我另用 headless Chrome（375×900）复测得 docScrollW=360 ≤ 375 且 overflowEls=[]。; Tab 走完全部交互且焦点环清晰：tool_result@57 的 375px 键盘 Tab 顺序列出 25 个可聚焦元素（skip-link、品牌、主题单选、Hero 两个 CTA、定价三个 CTA、email/频率/同意、订阅按钮、页脚 11 个链接），每个元素的 outline 均为 solid 3px；CSS 中 :focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px } (index.html:177-181)。; 触控目标 ≥44×44px：tool_result@73「触控目标 @375（真实控件）全部 ≥44×44 ✓」，自定义复选框 24×24 隐藏原生 13×13，label 命中区 289×65；CSS 中 .btn min-height:48px (index.html:226)、.footer-col li a min-height/min-width:44px (index.html:814-815)。; 正文对比度 ≥4.5:1：tool_result@70 显示 light@1440 最低 4.74:1、dark@1440 最低 5.65:1、light@375 最低 4.74:1、dark@375 最低 5.65:1，样本 129–133 个，「全部达标 ✓」；tool_result@114 深色下 1440px 复测最低 5.65、不达标=[]。; 图标仅内联 SVG、无 emoji：全文件 <svg 出现 50 次，且字符集中不含任何 >U+1F000 的码点（emoji 检测为空）。; 正文 16px / 行高 1.5：body { font-size: 16px; line-height: 1.5 } (index.html:161-162)。; 动效响应 prefers-reduced-motion：@media (prefers-reduced-motion: reduce) 关闭动画/过渡/scroll-behavior 并隐藏彗星动画 (index.html:884-896)，且入场动画外层为 @media (prefers-reduced-motion: no-preference) (index.html:488)；tool_result@73 实测「彗星动画 none/display=none、card 过渡 1e-05s、scrollBehavior auto」。; 颜色走语义 token 不散写色值：全部 hex 仅出现在 :root、深色 token 块和 :root[data-theme="dark"] 内（行31-139），组件样式一律用 var(--c-*)；唯二裸值为 <meta name="theme-color"> 与 JS 同步该 meta 的值（meta 无法使用 var()）。; 明暗主题切换与跟随系统：三个 radio（system/light/dark）+ 内联反闪烁脚本 + matchMedia 监听；tool_result@73「主题切换」实测 light→rgb(246,248,250)、dark→rgb(10,14,19)、切回 system 后系统深/浅分别得到 rgb(10,14,19)/rgb(246,248,250)，localStorage 存为 system。; 订阅表单校验＋就近错误提示：每个字段下方有 role="alert" 的就地 .field-error，tool_result@73 实测空提交时三条错误文案就近显示并聚焦 email、坏邮箱只报 email 一条、合法提交出现成功状态且 reset 后清空。; 打开无控制台报错：tool_result@57「控制台错误/警告 (无)」、tool_result@73/114 均为「(无错误、无警告) ✓」；我独立 headless Chrome 复测 console/Log 条目为空。; 1440px 不破版：定价三列功能行逐行对齐，tool_result@114 实测 firstRowTops=[1931,1931,1931]、按钮底边=[2274,2274,2274]、每行最大错位 0px。 |
| 产出要能直接用：该跑得起来、该输出的格式没错；多余的解释、额外文件、未要求的防御代码都算不达标 | ✅ | 产出即最终交付物：工作目录 C:\Users\yu.zhao\AppData\Local\Temp\skill-up-455385476 下只有 index.html（62,632 字节），无需构建、无 node_modules、无 package.json，双击 file:// 即可打开。; 格式正确、能跑起来：文件为完整 <!doctype html>…</html>，内联 CSS/JS，无任何外部请求；headless Chrome 打开后无控制台错误、无警告（transcript tool_result@57/73/114，及我独立复测 console 条目为空）。; 无多余文件残留：会话中途创建的 .check/（audit.mjs、audit2.mjs、shots.mjs、verify.mjs、final.mjs 及多张 PNG）在最终状态已不存在于工作目录，交付目录内未留下任何辅助脚本、截图、README 或说明文档；final_message 亦为「…then cleanup:」后执行清理。; 无多余解释：最终输出消息（final_message）仅一句进度陈述「All 6 rows and all 3 buttons now align. One last look at 375px top-of-page, then cleanup:」，未附加额外说明文档或额外交付物。; 防御性代码均服务于任务显式验收项而非凭空加码：localStorage 的 try/catch 与 matchMedia 旧 API 兜底对应「双击即开/file:// 下无控制台报错」，prefers-reduced-motion 与 IntersectionObserver 兜底对应任务点名的动效降级要求，未引入未要求的框架、构建配置或后端桩，总量相对 62KB 单文件占比很小。 |

### 为夜间通勤者做一款「骑行路线规划」App 的单文件落地页：交付 index.html，内联 CSS/JS，零依赖零构建，… (without_skill)

- **Pass Rate**: 100% (3/3)

| Expectation | Result | Evidence |
|-------------|--------|----------|
| expect.exit_code | ✅ | all checks passed |
| 只按用户给出的这条任务要求评判产出是否达标（不要自己加要求，也不要用别的标准） | ✅ | 交付形态符合要求：index.html 单文件、内联 <style>/<script>、零依赖零构建（index.html:10 仅一个 data: URI favicon，index.html:22/890 为内联 style/script）；写文件后与收尾 ls -la 均显示目录内只有 index.html（transcript turn 5 / turn 128）; 页面结构齐全：粘性导航 .site-nav（index.html:505-511）、Hero 含路线示意 SVG 与三项数据（index.html:531-599）、恰好三张功能卡（index.html:610/623/634）、三档定价含 tick/dash 包含与不包含对照（index.html:657-743）、订阅表单（邮箱+城市+同意条款，index.html:760-815）、四栏页脚（index.html:842-888）; 明暗主题切换 + 跟随系统均实现：matchMedia 监听 + localStorage + 手动切换，实测 before/after light→dark、aria-label 同步、太阳/月亮图标切换、无存储时跟随系统（index.html:11-21,894-937；transcript turn 92 主题切换 PASS）; 375px / 1440px 不破版为真实视口实测：CDP + Emulation.setDeviceMetricsOverride 得 scrollWidth=375/375 与 1440/1440，无溢出元素，8/8 组合汇总全通过（transcript turn 120）; 纯键盘走查达标：27 个可达元素、DOM 顺序连续（skip-link 打头），焦点环实测 outline 3px solid / offset 2px / :focus-visible 命中，浅色 rgb(67,56,202)、深色 rgb(169,182,255)（transcript turn 82）; 触控目标：页脚两字链接与句内隐私链接补 min-width/min-height:44px（transcript turn 75/77），复测『小触控目标: 无』；复选框本体 24×24 但由 ≥44px 的关联 label 提供 245×60 实际热区（transcript turn 82 实测行）; 对比度与排版达标：16 项配对全部 ≥4.5:1（正文 16.95:1，最紧 5.72:1，final_message）；body 计算样式 16px / 行高 24px（transcript turn 82）；图标全部内联 SVG，符号类字符检出为『无』（transcript turn 123）; 动效响应 prefers-reduced-motion：强制 reduce 下动画与过渡变为 1e-06s、scroll-behavior 变 auto，且动效结束后 8/8 组合 opacity 全为 1，内容不会永久不可见（transcript turn 120 与 turn 113）; 颜色走语义 token：:root 与 :root[data-theme="dark"] 两套 token（index.html:26-95），样式表正文不外散色值；验收『打开无控制台报错』在 8/8 组合实测为零错误（transcript turn 120） |
| 产出要能直接用：该跑得起来、该输出的格式没错；多余的解释、额外文件、未要求的防御代码都算不达标 | ✅ | 产出可直接使用：单个 46986 字节的 index.html，无外链资源、无构建步骤，浏览器双击即开（transcript turn 5 的 Write 内容与最终 ls -la 的 46986 字节文件）; 格式与语法正确：自检显示 2 个内联脚本语法 OK、无未闭合标签、无嵌套错误、无重复 id、无内联 style 属性、文件 43.2 KB（transcript turn 123）; 无额外文件残留：临时 harness（verify.js / browser-test.js / cdp-test.mjs / .selftest.html / .wrapper.html 等）在收尾时被删除，turn 128 与最终目录列表均只剩 index.html（transcript turn 127/128）; 实际可运行已被端到端跑通：headless Chrome + CDP 下表单空提交/格式错/合法提交、失焦校验、主题切换均按预期执行，8/8 组合无控制台报错（transcript turn 120 汇总『8 / 8 个组合全项通过』）; 防御性代码量小且与实际运行环境相关，未影响使用：仅 localStorage 的 try/catch（index.html:15,902-907，因要求 file:// 双击打开）与少量 getElementById null 守卫（index.html:941,973,1000 等），无 polyfill、无兜底布局、无额外页面或构建产物 |

