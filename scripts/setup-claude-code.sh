#!/bin/bash

# TanmiWorkspace - Claude Code 配置脚本
# 自动配置 MCP 权限到 .claude/settings.local.json

set -e

# 获取脚本所在目录的父目录（项目根目录）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 配置文件路径
CLAUDE_DIR="$PROJECT_ROOT/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.local.json"

echo "TanmiWorkspace - Claude Code 配置脚本"
echo "======================================"
echo ""
echo "项目路径: $PROJECT_ROOT"
echo ""

# 创建 .claude 目录
if [ ! -d "$CLAUDE_DIR" ]; then
    echo "创建 .claude 目录..."
    mkdir -p "$CLAUDE_DIR"
fi

# MCP 工具权限列表
MCP_PERMISSIONS=(
    # Workspace 工具
    "mcp__tanmi-workspace__workspace_init"
    "mcp__tanmi-workspace__workspace_list"
    "mcp__tanmi-workspace__workspace_get"
    "mcp__tanmi-workspace__workspace_delete"
    "mcp__tanmi-workspace__workspace_status"
    # Node 工具
    "mcp__tanmi-workspace__node_create"
    "mcp__tanmi-workspace__node_get"
    "mcp__tanmi-workspace__node_list"
    "mcp__tanmi-workspace__node_delete"
    "mcp__tanmi-workspace__node_update"
    "mcp__tanmi-workspace__node_move"
    # State 工具
    "mcp__tanmi-workspace__node_transition"
    # Context 工具
    "mcp__tanmi-workspace__context_get"
    "mcp__tanmi-workspace__context_focus"
    "mcp__tanmi-workspace__node_isolate"
    "mcp__tanmi-workspace__node_reference"
    # Log 工具
    "mcp__tanmi-workspace__log_append"
    "mcp__tanmi-workspace__problem_update"
    "mcp__tanmi-workspace__problem_clear"
    # Help 工具
    "mcp__tanmi-workspace__tanmi_help"
    "mcp__tanmi-workspace__tanmi_prompt"
)

# 检查 jq 是否可用
check_jq() {
    if command -v jq &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# 生成空模板配置
generate_empty_config() {
    cat << 'EOF'
{
  "permissions": {
    "allow": [],
    "deny": []
  }
}
EOF
}

# 使用 jq 合并权限（如果 jq 可用）
merge_with_jq() {
    local config_file="$1"
    shift
    local perms=("$@")

    # 构建 jq 的权限数组
    local jq_array="["
    local first=true
    for perm in "${perms[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            jq_array+=","
        fi
        jq_array+="\"$perm\""
    done
    jq_array+="]"

    # 使用 jq 合并：添加新权限，去重
    jq --argjson new_perms "$jq_array" '
        .permissions.allow = (.permissions.allow + $new_perms | unique)
    ' "$config_file" > "${config_file}.tmp" && mv "${config_file}.tmp" "$config_file"
}

# 不使用 jq 的简单合并（纯 bash，仅用于简单情况）
merge_without_jq() {
    local config_file="$1"
    shift
    local perms=("$@")

    echo "警告: 未安装 jq，将使用简单模式处理"
    echo ""

    # 读取现有权限
    local existing_perms=""
    if [ -f "$config_file" ]; then
        # 提取 allow 数组中的内容（简单的 grep 方式）
        existing_perms=$(grep -oE '"[^"]+__[^"]+"' "$config_file" 2>/dev/null || true)
    fi

    # 生成新的配置
    local all_perms=""

    # 添加现有权限
    while IFS= read -r line; do
        if [ -n "$line" ]; then
            perm=$(echo "$line" | tr -d '"')
            if [ -n "$all_perms" ]; then
                all_perms="$all_perms,$line"
            else
                all_perms="$line"
            fi
        fi
    done <<< "$existing_perms"

    # 添加新权限（检查重复）
    for perm in "${perms[@]}"; do
        if [[ ! "$all_perms" =~ "\"$perm\"" ]]; then
            if [ -n "$all_perms" ]; then
                all_perms="$all_perms,
      \"$perm\""
            else
                all_perms="\"$perm\""
            fi
        fi
    done

    # 写入新配置
    cat > "$config_file" << EOF
{
  "permissions": {
    "allow": [
      $all_perms
    ],
    "deny": []
  }
}
EOF
}

# 主逻辑
main() {
    local added_count=0
    local skipped_count=0

    # 检查配置文件是否存在
    if [ ! -f "$SETTINGS_FILE" ]; then
        echo "配置文件不存在，创建新配置..."
        generate_empty_config > "$SETTINGS_FILE"
    else
        echo "检测到已存在的配置文件: $SETTINGS_FILE"
    fi

    echo ""
    echo "正在添加 TanmiWorkspace MCP 权限..."
    echo ""

    if check_jq; then
        # 使用 jq 处理（推荐）
        merge_with_jq "$SETTINGS_FILE" "${MCP_PERMISSIONS[@]}"
        added_count=${#MCP_PERMISSIONS[@]}
        echo "使用 jq 合并权限完成"
    else
        # 回退到简单模式
        merge_without_jq "$SETTINGS_FILE" "${MCP_PERMISSIONS[@]}"
        added_count=${#MCP_PERMISSIONS[@]}
    fi

    echo ""
    echo "配置完成！"
    echo ""
    echo "配置文件: $SETTINGS_FILE"
    echo ""
    echo "已添加 ${#MCP_PERMISSIONS[@]} 个 MCP 权限:"
    for perm in "${MCP_PERMISSIONS[@]}"; do
        echo "  - $perm"
    done
    echo ""
    echo "注意: 还需要在 Claude Code 全局配置中添加 MCP 服务器配置。"
    echo "编辑 ~/.claude/settings.json，在 mcpServers 中添加:"
    echo ""
    echo "  \"tanmi-workspace\": {"
    echo "    \"command\": \"node\","
    echo "    \"args\": [\"$PROJECT_ROOT/dist/index.js\"],"
    echo "    \"env\": {"
    echo "      \"TANMI_PROJECT_ROOT\": \"$PROJECT_ROOT\""
    echo "    }"
    echo "  }"
    echo ""
    echo "下一步:"
    echo "  1. 确保已运行 'npm run build' 构建项目"
    echo "  2. 配置全局 mcpServers（如上所示）"
    echo "  3. 在此项目目录下启动 Claude Code"
    echo "  4. 输入 tanmi_help(topic=\"overview\") 验证安装"
    echo ""
}

main
