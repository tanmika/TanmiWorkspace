<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="not-found">
    <div class="not-found-container">
      <!-- 装饰性艺术元素区域 -->
      <div class="error-art">
        <div class="decor-block-1"></div>
        <div class="error-number">404</div>
        <div class="decor-line"></div>
        <div class="decor-block-2"></div>
      </div>

      <!-- 文案区域 -->
      <div class="error-content">
        <h1 class="error-title">页面未找到</h1>
        <p class="error-desc">您访问的页面不存在或已被移除</p>
      </div>

      <!-- 返回按钮 -->
      <button class="btn-secondary" @click="goHome">
        ← 返回首页
      </button>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color);
}

.not-found-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

/* 装饰性艺术元素区域 */
.error-art {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 400px;
  height: 200px;
}

/* 404 数字 */
.error-number {
  font-size: 160px;
  font-weight: 700;
  font-family: var(--mono-font);
  color: var(--text-main);
  line-height: 1;
  letter-spacing: -0.02em;
  position: relative;
  z-index: 2;
}

/* 红色实心块 - 位于左上角 */
.decor-block-1 {
  position: absolute;
  width: 60px;
  height: 60px;
  background: var(--accent-red);
  top: 20px;
  left: 80px;
  z-index: 1;
}

/* 空心方框 - 位于右侧 */
.decor-block-2 {
  position: absolute;
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-heavy);
  background: transparent;
  top: 80px;
  right: 60px;
  z-index: 1;
}

/* 红色横线穿过数字 */
.decor-line {
  position: absolute;
  width: 300px;
  height: 4px;
  background: var(--accent-red);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
}

/* 文案区域 */
.error-content {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.error-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.error-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* 返回按钮 */
.btn-secondary {
  height: 40px;
  padding: 0 24px;
  font-size: 14px;
  font-weight: 600;
  background: var(--card-bg);
  border: 2px solid var(--border-heavy);
  border-radius: 4px;
  color: var(--text-main);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  background: var(--border-heavy);
  color: #fff;
}
</style>
