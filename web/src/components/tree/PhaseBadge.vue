<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { WorkflowPhase } from '@/types'

const props = defineProps<{
  phase: WorkflowPhase
}>()

const emit = defineEmits<{
  change: [phase: WorkflowPhase]
}>()

const showDropdown = ref(false)

const PHASE_OPTIONS: Array<{ value: WorkflowPhase; label: string; desc: string }> = [
  { value: 'info', label: 'INFO', desc: '信息收集' },
  { value: 'design', label: 'PLAN', desc: '方案规划' },
  { value: 'impl', label: 'EXEC', desc: '执行实施' },
]

function getLabel(phase: WorkflowPhase): string {
  return PHASE_OPTIONS.find(o => o.value === phase)?.label ?? 'INFO'
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function selectPhase(phase: WorkflowPhase) {
  showDropdown.value = false
  if (phase !== props.phase) {
    emit('change', phase)
  }
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.phase-badge-wrapper')) {
    showDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="phase-badge-wrapper">
    <span :class="['phase-badge', phase]" @click="toggleDropdown">
      {{ getLabel(phase) }}
      <span class="caret">▾</span>
    </span>
    <div v-if="showDropdown" class="phase-dropdown">
      <div class="phase-dropdown-header">切换阶段</div>
      <div
        v-for="option in PHASE_OPTIONS"
        :key="option.value"
        :class="['phase-dropdown-item', { active: option.value === phase }]"
        @click="selectPhase(option.value)"
      >
        <span :class="['phase-dot', option.value]"></span>
        <span class="phase-dropdown-label">{{ option.label }}</span>
        <span v-if="option.value === phase" class="phase-dropdown-check">✓</span>
        <span v-else class="phase-dropdown-desc">{{ option.desc }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.phase-badge-wrapper {
  position: relative;
  display: inline-block;
}

.phase-badge {
  font-family: var(--mono-font);
  font-size: 10px;
  font-weight: 700;
  padding: 0 8px;
  height: 20px;
  line-height: 20px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
  transition: all 0.1s;
}

.phase-badge:hover {
  transform: translate(-1px, -1px);
  box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.3);
}

/* INFO - 黄色 */
.phase-badge.info {
  background: var(--accent-orange);
  color: #000;
}

/* PLAN - 绿色 */
.phase-badge.design {
  background: var(--accent-green);
  color: #fff;
}

/* EXEC - 蓝色 */
.phase-badge.impl {
  background: var(--accent-blue);
  color: #fff;
}

.phase-badge .caret {
  font-size: 8px;
  opacity: 0.7;
}

/* Dropdown */
.phase-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: var(--card-bg, #fff);
  border: 2px solid var(--border-heavy, #111);
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
  min-width: 160px;
  z-index: 100;
}

.phase-dropdown-header {
  padding: 6px 10px;
  font-family: var(--mono-font);
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted, #999);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  background: var(--bg-secondary, #fafafa);
}

.phase-dropdown-item {
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid var(--border-light, #f0f0f0);
}

.phase-dropdown-item:last-child {
  border-bottom: none;
}

.phase-dropdown-item:hover {
  background: var(--bg-hover, #f5f7fa);
}

.phase-dropdown-item.active {
  background: var(--bg-active, #f0f2f5);
}

.phase-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}

.phase-dot.info {
  background: var(--accent-orange);
}

.phase-dot.design {
  background: var(--accent-green);
}

.phase-dot.impl {
  background: var(--accent-blue);
}

.phase-dropdown-label {
  font-family: var(--mono-font);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.phase-dropdown-desc {
  font-size: 11px;
  color: var(--text-muted, #999);
  margin-left: auto;
}

.phase-dropdown-check {
  font-size: 12px;
  color: var(--text-main, #111);
  margin-left: auto;
  font-weight: 700;
}

/* 暗色模式 */
[data-theme="dark"] .phase-badge:hover {
  box-shadow: 1px 1px 0 rgba(255, 255, 255, 0.2);
}

[data-theme="dark"] .phase-dropdown {
  background: #222;
  border-color: #fff;
  box-shadow: 4px 4px 0 rgba(255, 255, 255, 0.05);
}

[data-theme="dark"] .phase-dropdown-header {
  background: #1a1a1a;
  border-color: #333;
}

[data-theme="dark"] .phase-dropdown-item {
  border-color: #2a2a2a;
}

[data-theme="dark"] .phase-dropdown-item:hover {
  background: #2a2a2a;
}

[data-theme="dark"] .phase-dropdown-item.active {
  background: #252525;
}
</style>
