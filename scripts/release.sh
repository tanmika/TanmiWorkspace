#!/bin/bash
# TanmiWorkspace 发布脚本
# 用法: ./scripts/release.sh [patch|minor|major]

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
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

# 检查 git 状态
if [ -n "$(git status --porcelain)" ]; then
    log_warn "存在未提交的更改:"
    git status --short
    read -p "是否继续? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 获取当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
log_info "当前版本: $CURRENT_VERSION"

# 计算新版本
IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"
case $BUMP_TYPE in
    major) NEW_VERSION="$((major + 1)).0.0" ;;
    minor) NEW_VERSION="$major.$((minor + 1)).0" ;;
    patch) NEW_VERSION="$major.$minor.$((patch + 1))" ;;
esac
log_info "新版本: $NEW_VERSION"

# 确认
read -p "确认发布 v$NEW_VERSION? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "已取消"
    exit 0
fi

# Step 1: 编译后端
log_info "Step 1/7: 编译后端..."
npx tsc
log_info "后端编译完成"

# Step 2: 编译前端
log_info "Step 2/7: 编译前端..."
cd web && npm run build && cd ..
log_info "前端编译完成"

# Step 3: 更新版本号
log_info "Step 3/7: 更新版本号..."
npm version $NEW_VERSION --no-git-tag-version
log_info "版本号已更新"

# Step 4: 同步版本说明
log_info "Step 4/7: 同步版本说明..."
if [ -f "scripts/sync-versions.ts" ]; then
    npx tsx scripts/sync-versions.ts || log_warn "版本同步脚本执行失败，请手动检查"
fi

# Step 5: 提示更新 CHANGELOG
log_info "Step 5/7: 请更新 CHANGELOG.md..."
echo ""
echo "================================================"
echo "请确保 CHANGELOG.md 已包含 v$NEW_VERSION 的更新内容"
echo "以及 config/version-notes.yaml 的 requirement 字段"
echo "================================================"
echo ""
read -p "CHANGELOG 已更新? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warn "请先更新 CHANGELOG.md 后重新运行脚本"
    exit 1
fi

# Step 6: 提交
log_info "Step 6/7: 提交更改..."
git add -A
git commit -m "[Chore] Release v$NEW_VERSION"
git tag "v$NEW_VERSION"
log_info "已创建 commit 和 tag"

# Step 7: 发布到 npm
log_info "Step 7/7: 发布到 npm..."
npm publish --registry https://registry.npmjs.org
log_info "已发布到 npm"

# 完成
echo ""
log_info "========================================="
log_info "v$NEW_VERSION 发布完成!"
log_info "========================================="
echo ""
echo "后续步骤:"
echo "  git push origin <branch>"
echo "  git push origin v$NEW_VERSION"
echo ""
