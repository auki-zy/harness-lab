#!/usr/bin/env bash
# 脚本裁判（react-perf-observable-patterns，由 tools/gen-eval.mjs 按 SKILL.md 自动生成）：退出码 0 = 通过。
# 两条规矩：判分脚本自带输入（agent 可能覆盖工作区文件）；临时文件放当前目录并用相对路径传给 node
#（Git Bash 的 /tmp/... 在 Windows 上会被 node 解析成 C:\tmp\...）。
set -u

ENTRY=""
for f in perfkit.mjs impl.mjs; do
  if [ -f "$f" ]; then ENTRY="$f"; break; fi
done
if [ -z "$ENTRY" ]; then
  echo "FAIL: 没找到交付物（perfkit.mjs）"
  ls -1
  exit 1
fi

cat > ".judge-in-0-scores.json" <<'JUDGE_INPUT_EOF'
[12, 3, 9, 1, 7, 5]
JUDGE_INPUT_EOF

trap 'rm -f .judge-err ".judge-in-0-scores.json"' EXIT

# 用例：parallel-normal
OUT="$(node "$ENTRY" "parallel" "3" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: parallel-normal 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'maxConcurrent=3' ]; then echo "FAIL: parallel-normal stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：parallel-boundary-zero
OUT="$(node "$ENTRY" "parallel" "0" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: parallel-boundary-zero 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'maxConcurrent=0' ]; then echo "FAIL: parallel-boundary-zero stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：dedupe-same-key-once
OUT="$(node "$ENTRY" "dedupe" "alice" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: dedupe-same-key-once 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'loads=1 value=alice' ]; then echo "FAIL: dedupe-same-key-once stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：topn-normal-no-mutation
OUT="$(node "$ENTRY" "topn" ".judge-in-0-scores.json" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: topn-normal-no-mutation 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'top=12,9,7 mutated=false' ]; then echo "FAIL: topn-normal-no-mutation stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：topn-boundary-missing-file
OUT="$(node "$ENTRY" "topn" "missing.json" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 1 ]; then echo "FAIL: topn-boundary-missing-file 退出码 $CODE（期望 1） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'error=missing-input' ]; then echo "FAIL: topn-boundary-missing-file stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：unknown-command-boundary
OUT="$(node "$ENTRY" "frobnicate" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 1 ]; then echo "FAIL: unknown-command-boundary 退出码 $CODE（期望 1） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'error=unknown-command' ]; then echo "FAIL: unknown-command-boundary stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

echo "PASS: perfkit.mjs 通过 6 条用例（parallel-normal、parallel-boundary-zero、dedupe-same-key-once、topn-normal-no-mutation、topn-boundary-missing-file、unknown-command-boundary）"
