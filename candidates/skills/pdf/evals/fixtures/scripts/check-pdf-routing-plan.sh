#!/usr/bin/env bash
# 脚本裁判（pdf-routing-plan，由 tools/gen-eval.mjs 按 SKILL.md 自动生成）：退出码 0 = 通过。
# 两条规矩：判分脚本自带输入（agent 可能覆盖工作区文件）；临时文件放当前目录并用相对路径传给 node
#（Git Bash 的 /tmp/... 在 Windows 上会被 node 解析成 C:\tmp\...）。
set -u

ENTRY=""
for f in plan.json impl.mjs; do
  if [ -f "$f" ]; then ENTRY="$f"; break; fi
done
if [ -z "$ENTRY" ]; then
  echo "FAIL: 没找到交付物（plan.json）"
  ls -1
  exit 1
fi

cat > ".judge-in-0-request.txt" <<'JUDGE_INPUT_EOF'
手头两个文件帮我处理一下：
1) contract.pdf 是客户发来的合同，我想知道里面的甲方名称和签署日期。
2) archive.pdf 是带密码的老归档（密码我有：hunter2），我要把它和 contract.pdf 合并成一个 merged.pdf 存档。
先给我一份执行计划。
JUDGE_INPUT_EOF

cat > ".judge-in-1-contract-meta.json" <<'JUDGE_INPUT_EOF'
{
  "file": "contract.pdf",
  "encrypted": false,
  "page_count": 3,
  "metadata": {"Title": "", "Author": ""},
  "pages": [
    {"page": 1, "width": 595.0, "height": 842.0, "rotation": 0, "text_chars": 0},
    {"page": 2, "width": 595.0, "height": 842.0, "rotation": 0, "text_chars": 0},
    {"page": 3, "width": 595.0, "height": 842.0, "rotation": 0, "text_chars": 0}
  ],
  "likely_scanned_pages": [1, 2, 3]
}
JUDGE_INPUT_EOF

cat > ".judge-in-2-archive-meta.json" <<'JUDGE_INPUT_EOF'
{
  "file": "archive.pdf",
  "encrypted": true,
  "page_count": 2,
  "metadata": null,
  "pages": [],
  "likely_scanned_pages": []
}
JUDGE_INPUT_EOF

trap 'rm -f .judge-err ".judge-in-0-request.txt" ".judge-in-1-contract-meta.json" ".judge-in-2-archive-meta.json"' EXIT

# 用例：structure
OUT="$(node "$ENTRY"  2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: structure 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：normal-decrypt-and-merge
OUT="$(node "$ENTRY"  2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: normal-decrypt-and-merge 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

# 用例：edge-scanned-no-text-layer
OUT="$(node "$ENTRY"  2>.judge-err)"
CODE=$?
ERR="$(head -c 200 .judge-err 2>/dev/null | tr '\n' ' ')"
if [ "$CODE" -ne 0 ]; then echo "FAIL: edge-scanned-no-text-layer 退出码 $CODE（期望 0） → $OUT${ERR:+ ｜stderr: $ERR}"; exit 1; fi

echo "PASS: plan.json 通过 3 条用例（structure、normal-decrypt-and-merge、edge-scanned-no-text-layer）"
