#!/bin/bash
# 开发环境 setup 命令
# 用法: ./scripts/dev-setup.sh [--claude-code|--cursor|--opencode|--codex|--status|--help]
# 自动设置 TANMI_DEV=true，更新开发环境的 installation-meta.json

set -e

cd "$(dirname "$0")/.."

# 参数验证
VALID_ARGS=("--claude-code" "--cursor" "--opencode" "-o" "--codex" "-c" "--status" "--help" "-h")

# 如果没有参数，显示用法说明
if [ $# -eq 0 ]; then
  echo "用法: $(basename "$0") [参数]"
  echo ""
  echo "参数:"
  echo "  --claude-code    快速配置 Claude Code"
  echo "  --cursor         快速配置 Cursor"
  echo "  --opencode, -o   快速配置 OpenCode"
  echo "  --codex, -c      快速配置 Codex CLI"
  echo "  --status         查看当前配置状态"
  echo "  --help, -h       显示帮助信息"
  echo ""
  exit 0
fi

# 检查参数是否有效
for arg in "$@"; do
  if [[ ! " ${VALID_ARGS[@]} " =~ " ${arg} " ]]; then
    echo "错误: 无效的参数 '$arg'"
    echo ""
    echo "有效的参数:"
    echo "  --claude-code    快速配置 Claude Code"
    echo "  --cursor         快速配置 Cursor"
    echo "  --opencode, -o   快速配置 OpenCode"
    echo "  --codex, -c      快速配置 Codex CLI"
    echo "  --status         查看当前配置状态"
    echo "  --help, -h       显示帮助信息"
    echo ""
    exit 1
  fi
done

# 传递所有参数给 setup 命令
TANMI_DEV=true node dist/cli/check-node-version.js setup "$@"
