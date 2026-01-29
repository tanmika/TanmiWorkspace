#!/bin/bash
# TanmiWorkspace 发布准备脚本
# 用法: ./scripts/release.sh [patch|minor|major] [--skills] [--agents] [--hooks] [--no_component_update]
# 功能: 先编译检查，编译成功后才更新版本号和组件配置
#
# 组件更新标志（必须指定其中之一）:
#   --skills              更新 Skills 组件
#   --agents              更新 Agents 组件
#   --hooks               更新 Hooks/Plugins 组件
#   --no_component_update 本次发布无组件更新

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# 检查参数
BUMP_TYPE=${1:-patch}
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    log_error "无效的版本类型: $BUMP_TYPE"
    echo "用法: ./scripts/release.sh [patch|minor|major] [--skills] [--agents] [--hooks] [--no_component_update]"
    exit 1
fi

# 解析组件更新标志
UPDATE_SKILLS=false
UPDATE_AGENTS=false
UPDATE_HOOKS=false
NO_COMPONENT_UPDATE=false
HAS_COMPONENT_FLAG=false

for arg in "$@"; do
    case $arg in
        --skills) UPDATE_SKILLS=true; HAS_COMPONENT_FLAG=true ;;
        --agents) UPDATE_AGENTS=true; HAS_COMPONENT_FLAG=true ;;
        --hooks|--plugins) UPDATE_HOOKS=true; HAS_COMPONENT_FLAG=true ;;
        --no_component_update) NO_COMPONENT_UPDATE=true; HAS_COMPONENT_FLAG=true ;;
    esac
done

# 检查是否声明了组件更新情况
if [ "$HAS_COMPONENT_FLAG" = false ]; then
    log_error "未指定组件更新情况！"
    echo ""
    echo "请检查本次发布是否更新了以下组件："
    echo "  - plugin/skills/    (使用 --skills 标志)"
    echo "  - plugin/agents/    (使用 --agents 标志)"
    echo "  - plugin/hooks/     (使用 --hooks 标志)"
    echo "  - plugin/opencode/  (使用 --hooks 标志，因为 plugins 等同于 hooks)"
    echo ""
    echo "如果没有更新任何组件，请使用 --no_component_update 标志"
    echo ""
    echo "用法示例："
    echo "  ./scripts/release.sh patch --skills              # 只更新了 Skills"
    echo "  ./scripts/release.sh minor --agents --skills     # 更新了 Agents 和 Skills"
    echo "  ./scripts/release.sh patch --no_component_update # 没有更新组件"
    echo ""
    exit 1
fi

# 检查冲突：不能同时使用 --no_component_update 和其他组件标志
if [ "$NO_COMPONENT_UPDATE" = true ] && ([ "$UPDATE_SKILLS" = true ] || [ "$UPDATE_AGENTS" = true ] || [ "$UPDATE_HOOKS" = true ]); then
    log_error "不能同时使用 --no_component_update 和其他组件更新标志"
    exit 1
fi

# 检查工作目录
if [ ! -f "package.json" ]; then
    log_error "请在项目根目录运行此脚本"
    exit 1
fi

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
log_info "当前版本: $CURRENT_VERSION"

# 分离基础版本和 prerelease 后缀
BASE_VERSION=$(echo "$CURRENT_VERSION" | sed 's/-.*//')
PRERELEASE=$(echo "$CURRENT_VERSION" | grep -o '\-.*' || echo "")

# 计算新版本
if [ -n "$PRERELEASE" ]; then
    # 当前是 prerelease 版本，去掉后缀变成正式版
    NEW_VERSION="$BASE_VERSION"
    log_info "prerelease → 正式版"
else
    # 当前是正式版，按原逻辑升级
    IFS='.' read -r major minor patch <<< "$BASE_VERSION"
    case $BUMP_TYPE in
        major) NEW_VERSION="$((major + 1)).0.0" ;;
        minor) NEW_VERSION="$major.$((minor + 1)).0" ;;
        patch) NEW_VERSION="$major.$minor.$((patch + 1))" ;;
    esac
fi
log_info "目标版本: $NEW_VERSION"

# 显示组件更新情况
echo ""
log_info "========================================="
log_info "组件更新检查"
log_info "========================================="
if [ "$NO_COMPONENT_UPDATE" = true ]; then
    log_info "本次发布无组件更新"
else
    if $UPDATE_SKILLS; then
        log_info "✓ Skills 将更新到: $NEW_VERSION"
    else
        log_warn "✗ Skills 不更新"
    fi
    if $UPDATE_AGENTS; then
        log_info "✓ Agents 将更新到: $NEW_VERSION"
    else
        log_warn "✗ Agents 不更新"
    fi
    if $UPDATE_HOOKS; then
        log_info "✓ Hooks/Plugins 将更新到: $NEW_VERSION"
    else
        log_warn "✗ Hooks/Plugins 不更新"
    fi
fi
echo ""

# 确认组件更新
read -p "确认组件更新情况正确？(y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_error "已取消发布"
    exit 1
fi

# Step 1: 运行测试（不改版本号）
log_info "Step 1: 运行测试..."
npm run test:run
log_info "测试通过"

# Step 2: 编译后端（不改版本号）
log_info "Step 2: 编译后端..."
npx tsc
log_info "后端编译完成"

# Step 3: 编译前端（不改版本号）
log_info "Step 3: 编译前端..."
cd web && npm run build && cd ..
log_info "前端编译完成"

# Step 4: 测试和编译都成功，现在才更新版本号
log_info "Step 4: 更新版本号..."
npm version $NEW_VERSION --no-git-tag-version
cd web && npm version $NEW_VERSION --no-git-tag-version && cd ..
log_info "版本号已更新（主包 + 前端包）"

# Step 5: 更新组件版本
if [ "$NO_COMPONENT_UPDATE" = true ]; then
    log_info "Step 5: 跳过组件版本更新（无组件更新）"
else
    log_info "Step 5: 更新组件版本配置..."
    COMPONENT_FILE="config/component-versions.json"
    if [ ! -f "$COMPONENT_FILE" ]; then
        log_error "找不到 $COMPONENT_FILE"
        exit 1
    fi

    # 使用 Node.js 更新 JSON 文件
    node -e "
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('$COMPONENT_FILE', 'utf8'));

const updateSkills = $UPDATE_SKILLS;
const updateAgents = $UPDATE_AGENTS;
const updateHooks = $UPDATE_HOOKS;
const newVersion = '$NEW_VERSION';

for (const platform of ['claudeCode', 'cursor', 'opencode']) {
  if (updateSkills && config[platform].skills) {
    config[platform].skills = newVersion;
  }
  if (updateAgents && config[platform].agents) {
    config[platform].agents = newVersion;
  }
  if (updateHooks) {
    if (config[platform].hooks) {
      config[platform].hooks = newVersion;
    }
    if (config[platform].plugins) {
      config[platform].plugins = newVersion;
    }
  }
}

fs.writeFileSync('$COMPONENT_FILE', JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log('已更新组件版本配置');
"

    log_info "组件版本配置已更新"
fi

# 完成
echo ""
log_info "========================================="
log_info "准备完成！版本: v$NEW_VERSION"
log_info "========================================="
echo ""
if [ "$NO_COMPONENT_UPDATE" = true ]; then
    echo "组件更新摘要: 无组件更新"
else
    echo "组件更新摘要:"
    $UPDATE_SKILLS && echo "  ✓ Skills → $NEW_VERSION" || echo "  - Skills（未更新）"
    $UPDATE_AGENTS && echo "  ✓ Agents → $NEW_VERSION" || echo "  - Agents（未更新）"
    $UPDATE_HOOKS && echo "  ✓ Hooks/Plugins → $NEW_VERSION" || echo "  - Hooks/Plugins（未更新）"
fi
echo ""
echo "后续步骤:"
echo "  1. 更新 CHANGELOG.md"
echo "  2. npx tsx scripts/sync-versions.ts"
echo "  3. 检查 config/version-notes.yaml 的 requirement"
echo "  4. git add -A && git commit -m '[Chore] Release v$NEW_VERSION'"
echo "  5. git tag v$NEW_VERSION"
echo "  6. git push && git push --tags"
echo "  7. npm publish --registry https://registry.npmjs.org"
echo ""
