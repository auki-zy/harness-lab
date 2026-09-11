#!/usr/bin/env bash
# 脚本裁判（ui-audit-priority-lint，由 tools/gen-eval.mjs 按 SKILL.md 自动生成）：退出码 0 = 通过。
# 两条规矩：判分脚本自带输入（agent 可能覆盖工作区文件）；临时文件放当前目录并用相对路径传给 node
#（Git Bash 的 /tmp/... 在 Windows 上会被 node 解析成 C:\tmp\...）。
set -u

ENTRY=""
for f in ui-audit.mjs impl.mjs; do
  if [ -f "$f" ]; then ENTRY="$f"; break; fi
done
if [ -z "$ENTRY" ]; then
  echo "FAIL: 没找到交付物（ui-audit.mjs）"
  ls -1
  exit 1
fi

cat > ".judge-in-0-clean.json" <<'JUDGE_INPUT_EOF'
{
  "fontPx": 17,
  "touchPx": 48,
  "icons": ["gear", "home", "chart"],
  "colors": [
    { "name": "body", "fg": "#111827", "bg": "#ffffff" },
    { "name": "muted", "fg": "#4b5563", "bg": "#ffffff" },
    { "name": "cta", "fg": "#ffffff", "bg": "#005fcc" }
  ]
}
JUDGE_INPUT_EOF

cat > ".judge-in-1-issues.json" <<'JUDGE_INPUT_EOF'
{
  "fontPx": 14,
  "touchPx": 32,
  "icons": ["gear", "🚀", "📊"],
  "colors": [
    { "name": "body", "fg": "#999999", "bg": "#ffffff" },
    { "name": "heading", "fg": "#000000", "bg": "#ffffff" },
    { "name": "badge", "fg": "#ffdd00", "bg": "#ffffff" },
    { "name": "cta", "fg": "#ffffff", "bg": "#005fcc" }
  ]
}
JUDGE_INPUT_EOF

cat > ".judge-in-2-edge.json" <<'JUDGE_INPUT_EOF'
{
  "fontPx": 16,
  "touchPx": 44,
  "icons": ["gear"],
  "colors": [
    { "name": "body", "fg": "#000000", "bg": "#ffffff" }
  ]
}
JUDGE_INPUT_EOF

cat > ".judge-in-3-broken.json" <<'JUDGE_INPUT_EOF'
{ "fontPx": 14, "colors": [ }
JUDGE_INPUT_EOF

trap 'rm -f .judge-err ".judge-in-0-clean.json" ".judge-in-1-issues.json" ".judge-in-2-edge.json" ".judge-in-3-broken.json"' EXIT

# 用例：clean-pass
OUT="$(node "$ENTRY" ".judge-in-0-clean.json" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: clean-pass 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'PASS' ]; then echo "FAIL: clean-pass stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：violations-ordered
OUT="$(node "$ENTRY" ".judge-in-1-issues.json" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: violations-ordered 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'contrast body
contrast badge
font 14
touch 32
emoji 🚀
emoji 📊' ]; then echo "FAIL: violations-ordered stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
case "$OUT" in *'PASS'*) echo "FAIL: violations-ordered 不该出现「PASS」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac

# 用例：threshold-boundary
OUT="$(node "$ENTRY" ".judge-in-2-edge.json" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: threshold-boundary 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'PASS' ]; then echo "FAIL: threshold-boundary stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：missing-file
OUT="$(node "$ENTRY" "nope.json" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -eq 0 ]; then echo "FAIL: missing-file 应当以非 0 退出 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ -n "$OUT" ]; then echo "FAIL: missing-file 不该有 stdout → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：bad-json
OUT="$(node "$ENTRY" ".judge-in-3-broken.json" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -eq 0 ]; then echo "FAIL: bad-json 应当以非 0 退出 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ -n "$OUT" ]; then echo "FAIL: bad-json 不该有 stdout → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

echo "PASS: ui-audit.mjs 通过 5 条用例（clean-pass、violations-ordered、threshold-boundary、missing-file、bad-json）"
