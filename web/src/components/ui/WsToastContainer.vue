<script setup lang="ts">
import { useToastStore } from '@/stores/toast'
import WsToast from './WsToast.vue'

const toastStore = useToastStore()

function handleClose(id: number) {
  toastStore.close(id)
}
</script>

<template>
  <Teleport to="body">
    <div class="ws-toast-container">
      <TransitionGroup name="toast-list">
        <WsToast
          v-for="toast in toastStore.toasts"
          :key="toast.id"
          :visible="true"
          :type="toast.type"
          :title="toast.title"
          :message="toast.message"
          :duration="toast.duration"
          @close="handleClose(toast.id)"
        />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.ws-toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 12px;
}

/* 列表动画 */
.toast-list-enter-active,
.toast-list-leave-active {
  transition: all 0.3s ease;
}

.toast-list-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.toast-list-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.toast-list-move {
  transition: transform 0.3s ease;
}
</style>
