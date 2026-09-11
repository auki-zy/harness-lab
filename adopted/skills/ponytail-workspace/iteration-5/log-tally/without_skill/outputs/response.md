`tally.mjs` 已写好并测试通过：空文件输出 `{}`；正常统计按 level 字典序输出（如 `{"error":1,"info":2}`）；非 JSON 行、缺 `level` 字段、文件不存在三种情况均写 stderr 并退出码 1。
