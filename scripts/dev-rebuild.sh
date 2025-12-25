#!/bin/bash
# 开发环境重新编译并重启服务
# 用法: ./scripts/dev-rebuild.sh

set -e

cd "$(dirname "$0")/.."

echo "=== 1. 编译后端 ==="
npx tsc

echo ""
echo "=== 2. 编译前端 ==="
source ~/.nvm/nvm.sh 2>/dev/null || true
nvm use 20 2>/dev/null || true
cd web && npm run build && cd ..

echo ""
echo "=== 3. 重启开发服务 ==="
# 杀掉旧的开发服务
OLD_PID=$(lsof -ti :19541 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "杀掉旧进程: $OLD_PID"
  kill -9 $OLD_PID 2>/dev/null || true
  sleep 1
fi

# 启动新服务
TANMI_DEV=true node dist/http/index.js &
sleep 2

# 验证启动成功
if curl -s "http://localhost:19541/api/dev-info" | grep -q "serverStartTime"; then
  echo ""
  echo "=== 完成 ==="
  echo "开发服务已启动: http://localhost:19541"
  curl -s "http://localhost:19541/api/dev-info" | grep -oE '"serverStartTime":"[^"]*"'
else
  echo "启动失败，请检查日志"
  exit 1
fi
