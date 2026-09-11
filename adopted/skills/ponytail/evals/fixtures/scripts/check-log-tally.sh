#!/usr/bin/env bash
# 脚本裁判（log-tally）：退出码 0 = 通过，非 0 = 失败；stdout 会被当作评分依据收进报告。
# skill-up 约定：cwd 是本用例的工作区根，环境里有 EVAL_FINAL_MESSAGE / EVAL_EXIT_CODE / EVAL_TRANSCRIPT_PATH。
#
# 两个坑都踩过，所以判分脚本这么写：
#   1) 输入自己带、自己造——agent 会自己造/清理测试文件，读工作区的 events.jsonl 会把判分变成假的；
#   2) 临时文件放在**当前目录**并用相对路径传给 node——`mktemp -d` 给的是 Git Bash 的 /tmp/…，
#      Windows 上的 node 会把它解析成 C:\tmp\… 直接 ENOENT。
set -u

ENTRY=""
for f in tally.mjs impl.mjs; do
  if [ -f "$f" ]; then ENTRY="$f"; break; fi
done
if [ -z "$ENTRY" ]; then
  echo "FAIL: 没找到入口文件（tally.mjs / impl.mjs）"
  ls -1
  exit 1
fi

EVENTS=".judge-events.jsonl"
EMPTY=".judge-empty.jsonl"
BAD=".judge-bad.jsonl"
NOLEVEL=".judge-nolevel.jsonl"
MISSING=".judge-no-such-file.jsonl"
trap 'rm -f "$EVENTS" "$EMPTY" "$BAD" "$NOLEVEL"' EXIT

cat > "$EVENTS" <<'JSONL'
{"ts":"2026-09-10T09:00:01Z","level":"info","msg":"server started"}
{"ts":"2026-09-10T09:00:02Z","level":"warn","msg":"slow query 1.2s"}
{"ts":"2026-09-10T09:00:03Z","level":"info","msg":"request ok"}
{"ts":"2026-09-10T09:00:04Z","level":"error","msg":"upstream 502"}
{"ts":"2026-09-10T09:00:05Z","level":"info","msg":"request ok"}
{"ts":"2026-09-10T09:00:06Z","level":"debug","msg":"cache hit"}
{"ts":"2026-09-10T09:00:07Z","level":"info","msg":"request ok"}
JSONL

# 1) 正常文件：键按字典序升序、计数正确
OUT="$(node "$ENTRY" "$EVENTS" 2>&1)" || { echo "FAIL: 运行 $ENTRY 出错：$OUT"; exit 1; }
if [ "$OUT" != '{"debug":1,"error":1,"info":4,"warn":1}' ]; then
  echo "FAIL: 统计输出不对 → $OUT"
  exit 1
fi

# 2) 空文件：输出 {}
: > "$EMPTY"
OUT_EMPTY="$(node "$ENTRY" "$EMPTY" 2>&1)" || { echo "FAIL: 空文件时不应报错：$OUT_EMPTY"; exit 1; }
if [ "$OUT_EMPTY" != '{}' ]; then
  echo "FAIL: 空文件应输出 {} → $OUT_EMPTY"
  exit 1
fi

# 3) 坏行：非 0 退出
printf '{"level":"info"}\nnot-json\n' > "$BAD"
if node "$ENTRY" "$BAD" >/dev/null 2>&1; then
  echo "FAIL: 有非 JSON 行时应当以非 0 退出"
  exit 1
fi

printf '{"msg":"no level"}\n' > "$NOLEVEL"
if node "$ENTRY" "$NOLEVEL" >/dev/null 2>&1; then
  echo "FAIL: 缺少 level 字段时应当以非 0 退出"
  exit 1
fi

# 4) 文件不存在：非 0 退出
if node "$ENTRY" "$MISSING" >/dev/null 2>&1; then
  echo "FAIL: 文件不存在时应当以非 0 退出"
  exit 1
fi

echo "PASS: $ENTRY 输出正确（debug1/error1/info4/warn1），空文件、坏行、缺文件都按约定处理"
