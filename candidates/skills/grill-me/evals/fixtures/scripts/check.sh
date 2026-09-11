#!/usr/bin/env bash
# 脚本裁判：退出码 0 = 通过，非 0 = 失败；cwd 是本用例的工作区根。
# 可用环境变量：$EVAL_FINAL_MESSAGE、$EVAL_EXIT_CODE、$EVAL_TRANSCRIPT_PATH（没有 transcript 时为空）
set -u

echo "TODO：这是模板脚本，还没写真正的检查 —— 先改成你的判定逻辑再跑。"
echo "工作区内容："
ls -1
echo "agent 最后一条消息：${EVAL_FINAL_MESSAGE:0:200}"
exit 1
