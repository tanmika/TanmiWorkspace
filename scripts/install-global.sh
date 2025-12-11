#!/bin/bash

# TanmiWorkspace - 全局安装脚本
# 将 TanmiWorkspace 组件安装到用户全局目录

set -e

# ============================================================================
# 配置
# ============================================================================

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 全局安装目录
TANMI_HOME="$HOME/.tanmi-workspace"
TANMI_SCRIPTS="$TANMI_HOME/scripts"

# Claude Code 配置
CLAUDE_HOME="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_HOME/settings.json"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================================
# 工具函数
# ============================================================================

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 jq 是否可用
check_jq() {
    if command -v jq &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# ============================================================================
# 功能安装函数
# ============================================================================

# 安装 Hook 脚本
install_hooks() {
    info "安装 Hook 脚本..."

    # 创建脚本目录
    mkdir -p "$TANMI_SCRIPTS"

    # 复制 hook 脚本
    cp "$PROJECT_ROOT/plugin/scripts/hook-entry.cjs" "$TANMI_SCRIPTS/"
    chmod +x "$TANMI_SCRIPTS/hook-entry.cjs"

    success "Hook 脚本已安装到 $TANMI_SCRIPTS/hook-entry.cjs"
}

# 配置 Claude Code Hooks
configure_hooks() {
    info "配置 Claude Code Hooks..."

    # 创建 .claude 目录
    mkdir -p "$CLAUDE_HOME"

    # 检查配置文件是否存在
    if [ ! -f "$CLAUDE_SETTINGS" ]; then
        info "创建新的 settings.json..."
        echo '{}' > "$CLAUDE_SETTINGS"
    fi

    if ! check_jq; then
        error "需要 jq 来修改 JSON 配置。请先安装 jq："
        echo "  macOS: brew install jq"
        echo "  Ubuntu: sudo apt install jq"
        echo "  或手动编辑 $CLAUDE_SETTINGS"
        return 1
    fi

    # 使用 jq 添加 hooks 配置
    local hook_script="$TANMI_SCRIPTS/hook-entry.cjs"

    # 构建 hooks 配置
    local hooks_config='{
        "SessionStart": [
            {
                "matcher": "startup|clear|compact",
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"'"$hook_script"'\" SessionStart",
                        "timeout": 10000
                    }
                ]
            }
        ],
        "UserPromptSubmit": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"'"$hook_script"'\" UserPromptSubmit",
                        "timeout": 5000
                    }
                ]
            }
        ]
    }'

    # 合并到现有配置
    jq --argjson hooks "$hooks_config" '.hooks = $hooks' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp"
    mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"

    success "Hooks 已配置到 $CLAUDE_SETTINGS"
}

# 显示 MCP 服务器配置说明
show_mcp_config() {
    info "MCP 服务器配置说明"
    echo ""
    echo "请在 $CLAUDE_SETTINGS 的 mcpServers 中添加："
    echo ""
    echo "  \"tanmi-workspace\": {"
    echo "    \"command\": \"node\","
    echo "    \"args\": [\"$PROJECT_ROOT/dist/index.js\"]"
    echo "  }"
    echo ""
}

# ============================================================================
# 交互式菜单
# ============================================================================

show_menu() {
    echo ""
    echo "========================================"
    echo "  TanmiWorkspace 全局安装脚本"
    echo "========================================"
    echo ""
    echo "项目路径: $PROJECT_ROOT"
    echo "安装目录: $TANMI_HOME"
    echo ""
    echo "可安装的功能："
    echo ""
    echo "  1) Hook 系统 - 自动注入工作区上下文到 AI 对话"
    echo "  2) 全部安装"
    echo "  3) 卸载 Hook 系统"
    echo "  0) 退出"
    echo ""
}

# 卸载 Hook 系统
uninstall_hooks() {
    info "卸载 Hook 系统..."

    # 删除脚本文件
    if [ -f "$TANMI_SCRIPTS/hook-entry.cjs" ]; then
        rm "$TANMI_SCRIPTS/hook-entry.cjs"
        success "已删除 $TANMI_SCRIPTS/hook-entry.cjs"
    fi

    # 从 settings.json 移除 hooks 配置
    if [ -f "$CLAUDE_SETTINGS" ] && check_jq; then
        jq 'del(.hooks)' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp"
        mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"
        success "已从 $CLAUDE_SETTINGS 移除 hooks 配置"
    fi

    success "Hook 系统已卸载"
}

# ============================================================================
# 主逻辑
# ============================================================================

main() {
    # 检查是否有命令行参数
    if [ $# -gt 0 ]; then
        case "$1" in
            --hooks)
                install_hooks
                configure_hooks
                ;;
            --uninstall-hooks)
                uninstall_hooks
                ;;
            --all)
                install_hooks
                configure_hooks
                ;;
            --help)
                echo "用法: $0 [选项]"
                echo ""
                echo "选项:"
                echo "  --hooks            安装 Hook 系统"
                echo "  --uninstall-hooks  卸载 Hook 系统"
                echo "  --all              安装所有功能"
                echo "  --help             显示帮助"
                echo ""
                echo "不带参数运行将显示交互式菜单"
                ;;
            *)
                error "未知选项: $1"
                echo "使用 --help 查看帮助"
                exit 1
                ;;
        esac
        exit 0
    fi

    # 交互式菜单
    while true; do
        show_menu
        read -p "请选择 [0-3]: " choice
        echo ""

        case $choice in
            1)
                install_hooks
                configure_hooks
                echo ""
                info "Hook 系统安装完成！"
                info "请重启 Claude Code 使配置生效。"
                echo ""
                info "使用方法："
                echo "  1. 调用 session_bind(workspaceId) 绑定工作区"
                echo "  2. 后续对话将自动注入工作区上下文"
                echo "  3. 调用 session_unbind() 解除绑定"
                ;;
            2)
                install_hooks
                configure_hooks
                echo ""
                success "所有功能安装完成！"
                ;;
            3)
                uninstall_hooks
                ;;
            0)
                info "退出安装脚本"
                exit 0
                ;;
            *)
                warn "无效选择，请重新输入"
                ;;
        esac

        echo ""
        read -p "按 Enter 继续..."
    done
}

main "$@"
