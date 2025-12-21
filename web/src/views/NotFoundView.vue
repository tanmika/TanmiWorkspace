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
      <div class="error-code">
        <div class="decor-line"></div>
        <div class="decor-block-1"></div>
        <div class="decor-block-2"></div>
        <div class="error-number">404</div>
      </div>

      <!-- 文案区域 -->
      <h1 class="error-title">页面未找到</h1>
      <p class="error-desc">您访问的页面不存在或已被移除</p>

      <!-- 返回按钮 -->
      <button class="btn-secondary" @click="goHome">
        <span class="arrow">←</span>
        <span>返回首页</span>
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
  text-align: center;
  padding: 40px;
}

/* 404 数字容器 */
.error-code {
  position: relative;
  display: inline-block;
  margin-bottom: 32px;
}

/* 404 数字 */
.error-number {
  font-family: var(--mono-font);
  font-size: 160px;
  font-weight: 900;
  line-height: 1;
  color: var(--border-heavy);
  letter-spacing: -8px;
  position: relative;
  z-index: 1;
}

/* 红色实心块 - 左上角 */
.decor-block-1 {
  position: absolute;
  top: -20px;
  left: -30px;
  width: 60px;
  height: 60px;
  background: var(--accent-red);
  z-index: 0;
}

/* 空心方框 - 右下角 */
.decor-block-2 {
  position: absolute;
  bottom: 20px;
  right: -20px;
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-heavy);
  z-index: 2;
}

/* 红色横线穿过数字 */
.decor-line {
  position: absolute;
  top: 50%;
  left: -60px;
  right: -60px;
  height: 4px;
  background: var(--accent-red);
  transform: translateY(-50%);
  z-index: 0;
}

/* 文案 */
.error-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 12px 0;
}

.error-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 32px 0;
}

/* 返回按钮 */
.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 24px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  background: var(--card-bg);
  border: 2px solid var(--border-heavy);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-secondary:hover {
  background: var(--border-heavy);
  color: #fff;
}

.btn-secondary .arrow {
  font-size: 16px;
}

/* 深色模式 */
[data-theme="dark"] .btn-secondary:hover {
  background: var(--border-heavy);
  color: #000;
}
</style>
