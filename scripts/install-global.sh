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

# 如果是 npm 全局安装，尝试从 npm 包位置获取
if [ ! -d "$PROJECT_ROOT/plugin/scripts" ]; then
    # 尝试通过 npm 查找包位置
    NPM_PACKAGE_PATH=$(npm root -g 2>/dev/null)/tanmi-workspace
    if [ -d "$NPM_PACKAGE_PATH/plugin/scripts" ]; then
        PROJECT_ROOT="$NPM_PACKAGE_PATH"
    fi
fi

# 全局安装目录（支持开发环境）
if [ "$TANMI_DEV" = "true" ]; then
    TANMI_HOME="$HOME/.tanmi-workspace-dev"
else
    TANMI_HOME="$HOME/.tanmi-workspace"
fi
TANMI_SCRIPTS="$TANMI_HOME/scripts"
TANMI_SHARED="$TANMI_SCRIPTS/shared"

# 版本跟踪脚本
UPDATE_META_SCRIPT="$SCRIPT_DIR/update-installation-meta.cjs"

# 获取包版本（从 package.json）
get_package_version() {
    if [ -f "$PROJECT_ROOT/package.json" ] && check_jq; then
        jq -r '.version' "$PROJECT_ROOT/package.json"
    else
        echo "0.0.0"
    fi
}

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
        ],
        "PostToolUse": [
            {
                "matcher": "mcp__tanmi-workspace__.*",
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"'"$hook_script"'\" PostToolUse",
                        "timeout": 3000
                    }
                ]
            }
        ]
    }'

    # 合并到现有配置
    jq --argjson hooks "$hooks_config" '.hooks = $hooks' "$CLAUDE_SETTINGS" > "${CLAUDE_SETTINGS}.tmp"
    mv "${CLAUDE_SETTINGS}.tmp" "$CLAUDE_SETTINGS"

    success "Hooks 已配置到 $CLAUDE_SETTINGS"

    # 更新安装元信息
    if [ -f "$UPDATE_META_SCRIPT" ]; then
        local version=$(get_package_version)
        node "$UPDATE_META_SCRIPT" update claudeCode hooks "$version"
    fi
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

    # 更新安装元信息
    if [ -f "$UPDATE_META_SCRIPT" ]; then
        node "$UPDATE_META_SCRIPT" remove claudeCode hooks
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
            ],
            "afterMCPExecution": [
                {
                    "command": "node \"'"$hook_script"'\""
                }
            ]
        }
    }'

    # 检查是否存在现有配置
    if [ -f "$CURSOR_HOOKS" ]; then
        # 合并配置：保留现有 hooks，添加 beforeSubmitPrompt 和 afterMCPExecution
        jq --argjson new_hook "[{\"command\": \"node \\\"$hook_script\\\"\"}]" \
           '.hooks.beforeSubmitPrompt = $new_hook | .hooks.afterMCPExecution = $new_hook' "$CURSOR_HOOKS" > "${CURSOR_HOOKS}.tmp"
        mv "${CURSOR_HOOKS}.tmp" "$CURSOR_HOOKS"
    else
        # 创建新配置
        echo "$cursor_config" | jq '.' > "$CURSOR_HOOKS"
    fi

    success "Hooks 已配置到 $CURSOR_HOOKS"

    # 更新安装元信息
    if [ -f "$UPDATE_META_SCRIPT" ]; then
        local version=$(get_package_version)
        node "$UPDATE_META_SCRIPT" update cursor hooks "$version"
    fi
}

# 卸载 Cursor Hook 系统
uninstall_cursor_hooks() {
    info "卸载 Cursor Hook 系统..."

    # 删除脚本文件
    if [ -f "$TANMI_SCRIPTS/cursor-hook-entry.cjs" ]; then
        rm "$TANMI_SCRIPTS/cursor-hook-entry.cjs"
        success "已删除 $TANMI_SCRIPTS/cursor-hook-entry.cjs"
    fi

    # 从 hooks.json 移除 beforeSubmitPrompt 和 afterMCPExecution 配置
    if [ -f "$CURSOR_HOOKS" ] && check_jq; then
        jq 'del(.hooks.beforeSubmitPrompt) | del(.hooks.afterMCPExecution)' "$CURSOR_HOOKS" > "${CURSOR_HOOKS}.tmp"
        mv "${CURSOR_HOOKS}.tmp" "$CURSOR_HOOKS"
        success "已从 $CURSOR_HOOKS 移除 hooks 配置"
    fi

    # 更新安装元信息
    if [ -f "$UPDATE_META_SCRIPT" ]; then
        node "$UPDATE_META_SCRIPT" remove cursor hooks
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
# Dispatch Agent 安装（全局）
# ============================================================================

# 安装派发 Agent 到用户全局目录
install_dispatch_agents() {
    info "安装派发 Agent 模板..."

    # 检查是否有模板文件
    if [ ! -f "$PROJECT_ROOT/templates/tanmi-executor.md" ]; then
        error "模板文件不存在: $PROJECT_ROOT/templates/tanmi-executor.md"
        return 1
    fi

    if [ ! -f "$PROJECT_ROOT/templates/tanmi-tester.md" ]; then
        error "模板文件不存在: $PROJECT_ROOT/templates/tanmi-tester.md"
        return 1
    fi

    # 安装到用户全局目录
    local agents_dir="$CLAUDE_HOME/agents"

    # 创建 agents 目录
    mkdir -p "$agents_dir"

    # 复制模板文件
    cp "$PROJECT_ROOT/templates/tanmi-executor.md" "$agents_dir/"
    cp "$PROJECT_ROOT/templates/tanmi-tester.md" "$agents_dir/"

    success "派发 Agent 已安装到 $agents_dir/"
    info "  - tanmi-executor.md (任务执行者)"
    info "  - tanmi-tester.md (任务测试者)"

    # 更新安装元信息
    if [ -f "$UPDATE_META_SCRIPT" ]; then
        local version=$(get_package_version)
        node "$UPDATE_META_SCRIPT" update claudeCode agents "$version"
    fi
}

# 卸载派发 Agent
uninstall_dispatch_agents() {
    info "卸载派发 Agent 模板..."

    # 从用户全局目录卸载
    local agents_dir="$CLAUDE_HOME/agents"

    # 删除模板文件
    if [ -f "$agents_dir/tanmi-executor.md" ]; then
        rm "$agents_dir/tanmi-executor.md"
        success "已删除 $agents_dir/tanmi-executor.md"
    fi

    if [ -f "$agents_dir/tanmi-tester.md" ]; then
        rm "$agents_dir/tanmi-tester.md"
        success "已删除 $agents_dir/tanmi-tester.md"
    fi

    # 如果 agents 目录为空，删除目录
    if [ -d "$agents_dir" ] && [ -z "$(ls -A "$agents_dir")" ]; then
        rmdir "$agents_dir"
        success "已删除空目录 $agents_dir"
    fi

    # 更新安装元信息
    if [ -f "$UPDATE_META_SCRIPT" ]; then
        node "$UPDATE_META_SCRIPT" remove claudeCode agents
    fi

    success "派发 Agent 模板已卸载"
}

# ============================================================================
# Skills 安装（全局）
# ============================================================================

# 安装 Skills 到用户全局目录
install_skills() {
    info "安装 Skills 模板..."

    local skills_src="$PROJECT_ROOT/templates/skills"
    local skills_dir="$CLAUDE_HOME/skills"

    # 检查是否有模板文件
    if [ ! -d "$skills_src" ]; then
        warn "Skills 模板目录不存在: $skills_src"
        info "跳过 Skills 安装"
        return 0
    fi

    # 检查是否有 .md 文件
    local skill_files=$(find "$skills_src" -name "*.md" -type f 2>/dev/null)
    if [ -z "$skill_files" ]; then
        warn "Skills 模板目录为空"
        info "跳过 Skills 安装"
        return 0
    fi

    # 创建 skills 目录
    mkdir -p "$skills_dir"

    # 复制所有 skill 模板文件
    local count=0
    for skill_file in $skill_files; do
        local filename=$(basename "$skill_file")
        cp "$skill_file" "$skills_dir/"
        info "  - $filename"
        count=$((count + 1))
    done

    success "已安装 $count 个 Skill 模板到 $skills_dir/"

    # 更新安装元信息
    if [ -f "$UPDATE_META_SCRIPT" ]; then
        local version=$(get_package_version)
        node "$UPDATE_META_SCRIPT" update claudeCode skills "$version"
    fi
}

# 卸载 Skills
uninstall_skills() {
    info "卸载 Skills 模板..."

    local skills_dir="$CLAUDE_HOME/skills"
    local skills_src="$PROJECT_ROOT/templates/skills"

    # 删除由 TanmiWorkspace 安装的 skill 文件
    if [ -d "$skills_src" ] && [ -d "$skills_dir" ]; then
        for skill_file in "$skills_src"/*.md; do
            if [ -f "$skill_file" ]; then
                local filename=$(basename "$skill_file")
                if [ -f "$skills_dir/$filename" ]; then
                    rm "$skills_dir/$filename"
                    success "已删除 $skills_dir/$filename"
                fi
            fi
        done
    fi

    # 如果 skills 目录为空，删除目录
    if [ -d "$skills_dir" ] && [ -z "$(ls -A "$skills_dir")" ]; then
        rmdir "$skills_dir"
        success "已删除空目录 $skills_dir"
    fi

    # 更新安装元信息
    if [ -f "$UPDATE_META_SCRIPT" ]; then
        node "$UPDATE_META_SCRIPT" remove claudeCode skills
    fi

    success "Skills 模板已卸载"
}

# ============================================================================
# 平台完整安装/卸载
# ============================================================================

# Claude Code 完整安装
install_claude_all() {
    info "安装 Claude Code 全部特性..."
    echo ""
    install_claude_hooks
    configure_claude_hooks
    install_dispatch_agents
    install_skills
    echo ""
    success "Claude Code 全部特性安装完成！"
    info "请重启 Claude Code 使配置生效。"
}

# Claude Code 完整卸载
uninstall_claude_all() {
    info "卸载 Claude Code 全部特性..."
    echo ""
    uninstall_claude_hooks
    uninstall_dispatch_agents
    uninstall_skills
    cleanup_shared_if_unused
    echo ""
    success "Claude Code 全部特性已卸载"
}

# Cursor 完整安装
install_cursor_all() {
    info "安装 Cursor 全部特性..."
    echo ""
    install_cursor_hooks
    configure_cursor_hooks
    echo ""
    success "Cursor 全部特性安装完成！"
    info "请重启 Cursor 使配置生效。"
}

# Cursor 完整卸载
uninstall_cursor_all() {
    info "卸载 Cursor 全部特性..."
    echo ""
    uninstall_cursor_hooks
    cleanup_shared_if_unused
    echo ""
    success "Cursor 全部特性已卸载"
}

# ============================================================================
# 剪切板功能（其他平台）
# ============================================================================

# 复制 MCP 配置到剪切板
copy_mcp_config() {
    local mcp_config='{
  "tanmi-workspace": {
    "command": "npx",
    "args": ["tanmi-workspace"]
  }
}'
    if command -v pbcopy &> /dev/null; then
        echo "$mcp_config" | pbcopy
        success "MCP 配置已复制到剪切板"
    elif command -v xclip &> /dev/null; then
        echo "$mcp_config" | xclip -selection clipboard
        success "MCP 配置已复制到剪切板"
    else
        warn "无法复制到剪切板，请手动复制以下配置："
        echo ""
        echo "$mcp_config"
    fi
}

# 复制完整配置到剪切板
copy_full_config() {
    local hook_script="$TANMI_SCRIPTS/hook-entry.cjs"

    local full_config='{
  "mcpServers": {
    "tanmi-workspace": {
      "command": "npx",
      "args": ["tanmi-workspace"]
    }
  },
  "hooks": {
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
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__tanmi-workspace__.*",
        "hooks": [
          {
            "type": "command",
            "command": "node \"'"$hook_script"'\" PostToolUse",
            "timeout": 3000
          }
        ]
      }
    ]
  }
}'

    if command -v pbcopy &> /dev/null; then
        echo "$full_config" | pbcopy
        success "完整配置已复制到剪切板"
    elif command -v xclip &> /dev/null; then
        echo "$full_config" | xclip -selection clipboard
        success "完整配置已复制到剪切板"
    else
        warn "无法复制到剪切板，请手动复制以下配置："
        echo ""
        echo "$full_config"
    fi

    echo ""
    info "使用说明："
    echo "  1. 将 mcpServers 部分合并到平台的 MCP 配置文件"
    echo "  2. 将 hooks 部分合并到平台的 Hooks 配置（如支持）"
    echo "  3. Agents/Skills 模板位置："
    echo "     $(npm root -g 2>/dev/null)/tanmi-workspace/templates/"
    echo "     或: $PROJECT_ROOT/templates/"
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
    echo "Claude Code:"
    echo "  1) 安装全部特性（推荐）[Hooks, Agents, Skills]"
    echo "  2) 仅安装基础 MCP 服务"
    echo "  3) 卸载全部"
    echo ""
    echo "Cursor:"
    echo "  4) 安装全部特性（推荐）[Hooks]"
    echo "  5) 仅安装基础 MCP 服务"
    echo "  6) 卸载全部"
    echo ""
    echo "其他平台:"
    echo "  7) 复制 MCP 配置到剪切板"
    echo "  8) 复制完整配置到剪切板 (MCP + Hooks)"
    echo ""
    echo "  0) 退出"
    echo ""
}

# ============================================================================
# 主逻辑
# ============================================================================

main() {
    # 检查是否有命令行参数
    if [ $# -gt 0 ]; then
        case "$1" in
            --claude-all)
                install_claude_all
                ;;
            --uninstall-claude-all)
                uninstall_claude_all
                ;;
            --cursor-all)
                install_cursor_all
                ;;
            --uninstall-cursor-all)
                uninstall_cursor_all
                ;;
            --claude-hooks)
                install_claude_hooks
                configure_claude_hooks
                ;;
            --cursor-hooks)
                install_cursor_hooks
                configure_cursor_hooks
                ;;
            --dispatch-agents)
                install_dispatch_agents
                ;;
            --skills)
                install_skills
                ;;
            --help)
                echo "用法: $0 [选项]"
                echo ""
                echo "Claude Code:"
                echo "  --claude-all             安装全部特性 [Hooks, Agents, Skills]"
                echo "  --uninstall-claude-all   卸载全部特性"
                echo ""
                echo "Cursor:"
                echo "  --cursor-all             安装全部特性 [Hooks]"
                echo "  --uninstall-cursor-all   卸载全部特性"
                echo ""
                echo "单独组件（高级）:"
                echo "  --claude-hooks           仅安装 Claude Code Hooks"
                echo "  --cursor-hooks           仅安装 Cursor Hooks"
                echo "  --dispatch-agents        仅安装派发 Agents"
                echo "  --skills                 仅安装 Skills"
                echo ""
                echo "其他:"
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
        read -p "请选择 [0-8]: " choice
        echo ""

        case $choice in
            1)
                install_claude_all
                ;;
            2)
                info "基础 MCP 服务通过 'tanmi-workspace setup --claude-code' 安装"
                info "或手动配置 ~/.claude.json 中的 mcpServers"
                ;;
            3)
                uninstall_claude_all
                ;;
            4)
                install_cursor_all
                ;;
            5)
                info "基础 MCP 服务通过 'tanmi-workspace setup --cursor' 安装"
                info "或手动配置 ~/.cursor/mcp.json"
                ;;
            6)
                uninstall_cursor_all
                ;;
            7)
                copy_mcp_config
                ;;
            8)
                copy_full_config
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
