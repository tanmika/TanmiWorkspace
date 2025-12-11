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
TANMI_SHARED="$TANMI_SCRIPTS/shared"

# Claude Code 配置
CLAUDE_HOME="$HOME/.claude"
CLAUDE_SETTINGS="$CLAUDE_HOME/settings.json"

# Cursor 配置
CURSOR_HOME="$HOME/.cursor"
CURSOR_HOOKS="$CURSOR_HOME/hooks.json"

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
# 共享脚本安装
# ============================================================================

# 安装共享模块
install_shared_scripts() {
    info "安装共享模块..."

    # 创建目录
    mkdir -p "$TANMI_SHARED"

    # 复制共享模块
    cp "$PROJECT_ROOT/plugin/scripts/shared/"*.cjs "$TANMI_SHARED/"

    success "共享模块已安装到 $TANMI_SHARED/"
}

# ============================================================================
# Claude Code Hook 安装
# ============================================================================

# 安装 Claude Code Hook 脚本
install_claude_hooks() {
    info "安装 Claude Code Hook 脚本..."

    # 创建脚本目录
    mkdir -p "$TANMI_SCRIPTS"

    # 安装共享模块
    install_shared_scripts

    # 复制 hook 脚本
    cp "$PROJECT_ROOT/plugin/scripts/hook-entry.cjs" "$TANMI_SCRIPTS/"
    chmod +x "$TANMI_SCRIPTS/hook-entry.cjs"

    success "Hook 脚本已安装到 $TANMI_SCRIPTS/hook-entry.cjs"
}

# 配置 Claude Code Hooks
configure_claude_hooks() {
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

# 卸载 Claude Code Hook 系统
uninstall_claude_hooks() {
    info "卸载 Claude Code Hook 系统..."

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

    success "Claude Code Hook 系统已卸载"
}

# ============================================================================
# Cursor Hook 安装
# ============================================================================

# 安装 Cursor Hook 脚本
install_cursor_hooks() {
    info "安装 Cursor Hook 脚本..."

    # 创建脚本目录
    mkdir -p "$TANMI_SCRIPTS"

    # 安装共享模块
    install_shared_scripts

    # 复制 hook 脚本
    cp "$PROJECT_ROOT/plugin/scripts/cursor-hook-entry.cjs" "$TANMI_SCRIPTS/"
    chmod +x "$TANMI_SCRIPTS/cursor-hook-entry.cjs"

    success "Hook 脚本已安装到 $TANMI_SCRIPTS/cursor-hook-entry.cjs"
}

# 配置 Cursor Hooks
configure_cursor_hooks() {
    info "配置 Cursor Hooks..."

    # 创建 .cursor 目录
    mkdir -p "$CURSOR_HOME"

    if ! check_jq; then
        error "需要 jq 来修改 JSON 配置。请先安装 jq："
        echo "  macOS: brew install jq"
        echo "  Ubuntu: sudo apt install jq"
        echo "  或手动编辑 $CURSOR_HOOKS"
        return 1
    fi

    local hook_script="$TANMI_SCRIPTS/cursor-hook-entry.cjs"

    # 构建 Cursor hooks 配置
    local cursor_config='{
        "version": 1,
        "hooks": {
            "beforeSubmitPrompt": [
                {
                    "command": "node \"'"$hook_script"'\""
                }
            ]
        }
    }'

    # 检查是否存在现有配置
    if [ -f "$CURSOR_HOOKS" ]; then
        # 合并配置：保留现有 hooks，添加 beforeSubmitPrompt
        jq --argjson new_hook "[{\"command\": \"node \\\"$hook_script\\\"\"}]" \
           '.hooks.beforeSubmitPrompt = $new_hook' "$CURSOR_HOOKS" > "${CURSOR_HOOKS}.tmp"
        mv "${CURSOR_HOOKS}.tmp" "$CURSOR_HOOKS"
    else
        # 创建新配置
        echo "$cursor_config" | jq '.' > "$CURSOR_HOOKS"
    fi

    success "Hooks 已配置到 $CURSOR_HOOKS"
}

# 卸载 Cursor Hook 系统
uninstall_cursor_hooks() {
    info "卸载 Cursor Hook 系统..."

    # 删除脚本文件
    if [ -f "$TANMI_SCRIPTS/cursor-hook-entry.cjs" ]; then
        rm "$TANMI_SCRIPTS/cursor-hook-entry.cjs"
        success "已删除 $TANMI_SCRIPTS/cursor-hook-entry.cjs"
    fi

    # 从 hooks.json 移除 beforeSubmitPrompt 配置
    if [ -f "$CURSOR_HOOKS" ] && check_jq; then
        jq 'del(.hooks.beforeSubmitPrompt)' "$CURSOR_HOOKS" > "${CURSOR_HOOKS}.tmp"
        mv "${CURSOR_HOOKS}.tmp" "$CURSOR_HOOKS"
        success "已从 $CURSOR_HOOKS 移除 beforeSubmitPrompt 配置"
    fi

    success "Cursor Hook 系统已卸载"
}

# ============================================================================
# 清理共享模块
# ============================================================================

cleanup_shared_if_unused() {
    # 如果两个 hook 脚本都不存在，清理共享模块
    if [ ! -f "$TANMI_SCRIPTS/hook-entry.cjs" ] && [ ! -f "$TANMI_SCRIPTS/cursor-hook-entry.cjs" ]; then
        if [ -d "$TANMI_SHARED" ]; then
            rm -rf "$TANMI_SHARED"
            success "已清理共享模块 $TANMI_SHARED"
        fi
    fi
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
    echo "  1) Claude Code Hook - 自动注入工作区上下文"
    echo "  2) Cursor Hook      - 自动注入工作区上下文"
    echo "  3) 全部安装 (Claude Code + Cursor)"
    echo "  4) 卸载 Claude Code Hook"
    echo "  5) 卸载 Cursor Hook"
    echo "  6) 全部卸载"
    echo "  0) 退出"
    echo ""
}

show_claude_usage() {
    echo ""
    info "Claude Code Hook 安装完成！"
    info "请重启 Claude Code 使配置生效。"
    echo ""
    info "使用方法："
    echo "  1. 调用 session_bind(sessionId, workspaceId) 绑定工作区"
    echo "  2. 后续对话将自动注入工作区上下文"
    echo "  3. 调用 session_unbind(sessionId) 解除绑定"
}

show_cursor_usage() {
    echo ""
    info "Cursor Hook 安装完成！"
    info "请重启 Cursor 使配置生效。"
    echo ""
    info "使用方法："
    echo "  1. 调用 session_bind(sessionId, workspaceId) 绑定工作区"
    echo "     (sessionId 使用 Cursor 的 conversation_id)"
    echo "  2. 后续对话将自动注入工作区上下文"
    echo "  3. 调用 session_unbind(sessionId) 解除绑定"
}

# ============================================================================
# 主逻辑
# ============================================================================

main() {
    # 检查是否有命令行参数
    if [ $# -gt 0 ]; then
        case "$1" in
            --claude-hooks)
                install_claude_hooks
                configure_claude_hooks
                ;;
            --cursor-hooks)
                install_cursor_hooks
                configure_cursor_hooks
                ;;
            --hooks|--all)
                install_claude_hooks
                configure_claude_hooks
                install_cursor_hooks
                configure_cursor_hooks
                ;;
            --uninstall-claude-hooks)
                uninstall_claude_hooks
                cleanup_shared_if_unused
                ;;
            --uninstall-cursor-hooks)
                uninstall_cursor_hooks
                cleanup_shared_if_unused
                ;;
            --uninstall-hooks|--uninstall-all)
                uninstall_claude_hooks
                uninstall_cursor_hooks
                cleanup_shared_if_unused
                ;;
            --help)
                echo "用法: $0 [选项]"
                echo ""
                echo "选项:"
                echo "  --claude-hooks           安装 Claude Code Hook 系统"
                echo "  --cursor-hooks           安装 Cursor Hook 系统"
                echo "  --hooks, --all           安装所有 Hook 系统"
                echo "  --uninstall-claude-hooks 卸载 Claude Code Hook 系统"
                echo "  --uninstall-cursor-hooks 卸载 Cursor Hook 系统"
                echo "  --uninstall-hooks        卸载所有 Hook 系统"
                echo "  --help                   显示帮助"
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
        read -p "请选择 [0-6]: " choice
        echo ""

        case $choice in
            1)
                install_claude_hooks
                configure_claude_hooks
                show_claude_usage
                ;;
            2)
                install_cursor_hooks
                configure_cursor_hooks
                show_cursor_usage
                ;;
            3)
                install_claude_hooks
                configure_claude_hooks
                install_cursor_hooks
                configure_cursor_hooks
                echo ""
                success "所有 Hook 系统安装完成！"
                info "请重启 Claude Code 和 Cursor 使配置生效。"
                ;;
            4)
                uninstall_claude_hooks
                cleanup_shared_if_unused
                ;;
            5)
                uninstall_cursor_hooks
                cleanup_shared_if_unused
                ;;
            6)
                uninstall_claude_hooks
                uninstall_cursor_hooks
                cleanup_shared_if_unused
                success "所有 Hook 系统已卸载"
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
