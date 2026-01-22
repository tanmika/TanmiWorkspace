#!/bin/bash
# TanmiWorkspace 发布准备脚本
# 用法: ./scripts/release.sh [patch|minor|major]
# 功能: 更新版本号 + 编译前后端（不提交不发布）

set -e

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查参数
BUMP_TYPE=${1:-patch}
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    log_error "无效的版本类型: $BUMP_TYPE"
    echo "用法: ./scripts/release.sh [patch|minor|major]"
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
log_info "新版本: $NEW_VERSION"

# Step 1: 更新版本号（所有 package.json）
log_info "Step 1: 更新版本号..."
npm version $NEW_VERSION --no-git-tag-version
cd web && npm version $NEW_VERSION --no-git-tag-version && cd ..
log_info "版本号已更新（主包 + 前端包）"

# Step 2: 编译后端
log_info "Step 2: 编译后端..."
npx tsc
log_info "后端编译完成"

# Step 3: 编译前端
log_info "Step 3: 编译前端..."
cd web && npm run build && cd ..
log_info "前端编译完成"

# 完成
echo ""
log_info "========================================="
log_info "准备完成！版本: v$NEW_VERSION"
log_info "========================================="
echo ""
echo "后续步骤:"
echo "  1. 更新 CHANGELOG.md"
echo "  2. npx tsx scripts/sync-versions.ts"
echo "  3. 检查 config/version-notes.yaml 的 requirement"
echo "  4. git add -A && git commit -m '[Chore] Release v$NEW_VERSION'"
echo "  5. git tag v$NEW_VERSION"
echo "  6. npm publish --registry https://registry.npmjs.org"
echo ""
