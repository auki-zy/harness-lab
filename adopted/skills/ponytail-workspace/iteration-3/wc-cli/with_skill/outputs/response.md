`wc.mjs` 已创建并测试通过：

- `node wc.mjs input.txt` → `{"lines":2,"words":5,"chars":25}`
- 空文件 → `{"lines":1,"words":0,"chars":0}`（按规则字面执行：空字符串不以 `\n` 结尾，故不做末尾扣减）
- 不存在的文件 → stderr 报错，退出码 1

只使用了 `node:fs` 内置模块，无额外依赖。
