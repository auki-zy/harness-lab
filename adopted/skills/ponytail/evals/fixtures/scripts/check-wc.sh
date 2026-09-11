#!/usr/bin/env bash
# 脚本裁判（wc-cli）：退出码 0 = 通过，非 0 = 失败；stdout 会被当作评分依据收进报告。
# skill-up 约定：cwd 是本用例的工作区根，环境里有 EVAL_FINAL_MESSAGE / EVAL_EXIT_CODE / EVAL_TRANSCRIPT_PATH。
#
# 两个坑都踩过，所以判分脚本这么写：
#   1) 输入自己带、自己造——agent 在工作区里"造测试数据"很常见，读工作区的 input.txt 会把判分变成假的；
#   2) 临时文件放在**当前目录**并用相对路径传给 node——`mktemp -d` 给的是 Git Bash 的 /tmp/…，
#      Windows 上的 node 会把它解析成 C:\tmp\… 直接 ENOENT。
set -u

ENTRY=""
for f in wc.mjs impl.mjs; do
  if [ -f "$f" ]; then ENTRY="$f"; break; fi
done
if [ -z "$ENTRY" ]; then
  echo "FAIL: 没找到入口文件（wc.mjs / impl.mjs）"
  ls -1
  exit 1
fi

INPUT=".judge-input.txt"
EMPTY=".judge-empty.txt"
MISSING=".judge-no-such-file.txt"
trap 'rm -f "$INPUT" "$EMPTY"' EXIT

# 1) 正常文件：5 行 / 10 词 / 58 字符
printf 'alpha beta gamma\ndelta epsilon\n\nzeta eta theta iota\nkappa\n' > "$INPUT"
OUT="$(node "$ENTRY" "$INPUT" 2>&1)" || { echo "FAIL: 运行 $ENTRY 出错：$OUT"; exit 1; }
NORMALIZED="$(node -e '
const raw = process.argv[1];
try {
  const o = JSON.parse(raw);
  console.log(JSON.stringify({ lines: o.lines, words: o.words, chars: o.chars }));
} catch {
  console.log("__unparsable__");
}
' "$OUT")"

if [ "$NORMALIZED" != '{"lines":5,"words":10,"chars":58}' ]; then
  echo "FAIL: 输出不是期望的统计值 → $OUT"
  exit 1
fi

# 2) 空文件：0 行 / 0 词 / 0 字符
: > "$EMPTY"
OUT_EMPTY="$(node "$ENTRY" "$EMPTY" 2>&1)" || { echo "FAIL: 空文件时不应报错：$OUT_EMPTY"; exit 1; }
EMPTY_NORM="$(node -e '
const raw = process.argv[1];
try {
  const o = JSON.parse(raw);
  console.log(JSON.stringify({ lines: o.lines, words: o.words, chars: o.chars }));
} catch {
  console.log("__unparsable__");
}
' "$OUT_EMPTY")"
if [ "$EMPTY_NORM" != '{"lines":0,"words":0,"chars":0}' ]; then
  echo "FAIL: 空文件应输出 0/0/0 → $OUT_EMPTY"
  exit 1
fi

# 3) 文件不存在：非 0 退出
if node "$ENTRY" "$MISSING" >/dev/null 2>&1; then
  echo "FAIL: 文件不存在时应当以非 0 退出"
  exit 1
fi

echo "PASS: $ENTRY 输出正确（lines/words/chars = 5/10/58），空文件 0/0/0，缺文件时退出码非 0"
