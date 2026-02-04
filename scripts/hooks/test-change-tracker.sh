#!/bin/bash
# 测试 Hook 脚本：记录 PostToolUse 能拿到的所有数据
# 用于调研 Change Tracking Hook 方案的可行性
#
# Claude Code Hook 通过 stdin 接收 JSON：
# {
#   "session_id": "abc123",
#   "tool_name": "Edit|Write",
#   "tool_input": { "file_path": "...", ... }
# }

LOG_DIR="$HOME/.tanmi-workspace-dev/hook-test"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/${TIMESTAMP}.json"

# 读取 stdin（Claude Code 通过 stdin 传递 JSON）
STDIN_CONTENT=$(cat)

# 解析 tool_name 用于文件名
TOOL_NAME=$(echo "$STDIN_CONTENT" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("tool_name","unknown"))' 2>/dev/null || echo "unknown")

# 重命名日志文件包含工具名
LOG_FILE="$LOG_DIR/${TIMESTAMP}_${TOOL_NAME}.json"

# 构建完整的调试记录
python3 << 'PYEOF' - "$STDIN_CONTENT" "$LOG_FILE"
import sys
import json
import os
from datetime import datetime

stdin_content = sys.argv[1]
log_file = sys.argv[2]

# 解析 stdin JSON
try:
    stdin_data = json.loads(stdin_content) if stdin_content else None
except:
    stdin_data = {"_raw": stdin_content, "_error": "failed to parse JSON"}

# 收集环境变量（可能有些有用的）
env_vars = {k: v for k, v in os.environ.items()
            if any(x in k.upper() for x in ['CLAUDE', 'SESSION', 'TOOL', 'PATH', 'PWD', 'HOME'])}

# 构建日志对象
log_data = {
    "timestamp": datetime.now().isoformat(),
    "stdin": stdin_data,
    "env_sample": env_vars,
    "cwd": os.getcwd()
}

# 写入日志
with open(log_file, 'w', encoding='utf-8') as f:
    json.dump(log_data, f, indent=2, ensure_ascii=False)

print(f"Logged to: {log_file}", file=sys.stderr)
PYEOF

# 输出到汇总日志
echo "[$TIMESTAMP] Tool: $TOOL_NAME -> $LOG_FILE" >> "$LOG_DIR/summary.log"

# 返回空 JSON（不阻止操作）
echo '{}'
exit 0
