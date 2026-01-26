#!/bin/bash
# 开发环境 setup 命令
# 用法: ./scripts/dev-setup.sh [--claude-code|--cursor|--opencode]
# 自动设置 TANMI_DEV=true，更新开发环境的 installation-meta.json

set -e

cd "$(dirname "$0")/.."

# 传递所有参数给 setup 命令
TANMI_DEV=true node dist/cli/check-node-version.js setup "$@"
