#!/usr/bin/env bash
# 脚本裁判（brainstorm-path-triage，由 tools/gen-eval.mjs 按 SKILL.md 自动生成）：退出码 0 = 通过。
# 两条规矩：判分脚本自带输入（agent 可能覆盖工作区文件）；临时文件放当前目录并用相对路径传给 node
#（Git Bash 的 /tmp/... 在 Windows 上会被 node 解析成 C:\tmp\...）。
set -u

ENTRY=""
for f in triage.mjs impl.mjs; do
  if [ -f "$f" ]; then ENTRY="$f"; break; fi
done
if [ -z "$ENTRY" ]; then
  echo "FAIL: 没找到交付物（triage.mjs）"
  ls -1
  exit 1
fi

cat > ".judge-in-0-request-spike.txt" <<'JUDGE_INPUT_EOF'
question: yes
existing-flow: yes
shared-interface: no
JUDGE_INPUT_EOF

cat > ".judge-in-1-request-bounded.txt" <<'JUDGE_INPUT_EOF'
question: no
existing-flow: yes
shared-interface: no
JUDGE_INPUT_EOF

cat > ".judge-in-2-request-arch.txt" <<'JUDGE_INPUT_EOF'
question: no
existing-flow: no
shared-interface: no
JUDGE_INPUT_EOF

cat > ".judge-in-3-request-upgrade.txt" <<'JUDGE_INPUT_EOF'
question: yes
existing-flow: yes
shared-interface: yes
JUDGE_INPUT_EOF

cat > ".judge-in-4-request-empty.txt" <<'JUDGE_INPUT_EOF'

JUDGE_INPUT_EOF

trap 'rm -f .judge-err ".judge-in-0-request-spike.txt" ".judge-in-1-request-bounded.txt" ".judge-in-2-request-arch.txt" ".judge-in-3-request-upgrade.txt" ".judge-in-4-request-empty.txt"' EXIT

# 用例：feasibility-question-is-spike
OUT="$(node "$ENTRY" ".judge-in-0-request-spike.txt" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: feasibility-question-is-spike 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'spike
probe' ]; then echo "FAIL: feasibility-question-is-spike stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
case "$OUT" in *'bounded'*) echo "FAIL: feasibility-question-is-spike 不该出现「bounded」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'architectural'*) echo "FAIL: feasibility-question-is-spike 不该出现「architectural」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'chat-design'*) echo "FAIL: feasibility-question-is-spike 不该出现「chat-design」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'spec'*) echo "FAIL: feasibility-question-is-spike 不该出现「spec」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac

# 用例：existing-flow-is-bounded
OUT="$(node "$ENTRY" ".judge-in-1-request-bounded.txt" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: existing-flow-is-bounded 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'bounded
chat-design' ]; then echo "FAIL: existing-flow-is-bounded stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
case "$OUT" in *'spike'*) echo "FAIL: existing-flow-is-bounded 不该出现「spike」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'architectural'*) echo "FAIL: existing-flow-is-bounded 不该出现「architectural」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'probe'*) echo "FAIL: existing-flow-is-bounded 不该出现「probe」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'spec'*) echo "FAIL: existing-flow-is-bounded 不该出现「spec」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac

# 用例：new-project-is-architectural
OUT="$(node "$ENTRY" ".judge-in-2-request-arch.txt" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: new-project-is-architectural 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'architectural
spec' ]; then echo "FAIL: new-project-is-architectural stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
case "$OUT" in *'spike'*) echo "FAIL: new-project-is-architectural 不该出现「spike」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'bounded'*) echo "FAIL: new-project-is-architectural 不该出现「bounded」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'probe'*) echo "FAIL: new-project-is-architectural 不该出现「probe」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'chat-design'*) echo "FAIL: new-project-is-architectural 不该出现「chat-design」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac

# 用例：shared-interface-upgrades-to-architectural
OUT="$(node "$ENTRY" ".judge-in-3-request-upgrade.txt" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: shared-interface-upgrades-to-architectural 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'architectural
spec' ]; then echo "FAIL: shared-interface-upgrades-to-architectural stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
case "$OUT" in *'spike'*) echo "FAIL: shared-interface-upgrades-to-architectural 不该出现「spike」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'bounded'*) echo "FAIL: shared-interface-upgrades-to-architectural 不该出现「bounded」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'probe'*) echo "FAIL: shared-interface-upgrades-to-architectural 不该出现「probe」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'chat-design'*) echo "FAIL: shared-interface-upgrades-to-architectural 不该出现「chat-design」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac

# 用例：empty-input-takes-heavier-path
OUT="$(node "$ENTRY" ".judge-in-4-request-empty.txt" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: empty-input-takes-heavier-path 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ "$OUT" != 'architectural
spec' ]; then echo "FAIL: empty-input-takes-heavier-path stdout 不对 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
case "$OUT" in *'spike'*) echo "FAIL: empty-input-takes-heavier-path 不该出现「spike」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'bounded'*) echo "FAIL: empty-input-takes-heavier-path 不该出现「bounded」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'probe'*) echo "FAIL: empty-input-takes-heavier-path 不该出现「probe」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac
case "$OUT" in *'chat-design'*) echo "FAIL: empty-input-takes-heavier-path 不该出现「chat-design」 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1;; esac

# 用例：missing-file-produces-nothing
OUT="$(node "$ENTRY" "nope.txt" 2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -eq 0 ]; then echo "FAIL: missing-file-produces-nothing 应当以非 0 退出 → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi
if [ -n "$OUT" ]; then echo "FAIL: missing-file-produces-nothing 不该有 stdout → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

echo "PASS: triage.mjs 通过 6 条用例（feasibility-question-is-spike、existing-flow-is-bounded、new-project-is-architectural、shared-interface-upgrades-to-architectural、empty-input-takes-heavier-path、missing-file-produces-nothing）"
