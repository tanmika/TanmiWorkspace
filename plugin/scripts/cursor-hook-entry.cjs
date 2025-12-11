#!/usr/bin/env node
/**
 * Tanmi-Workspace Hook 入口脚本 (Cursor 版)
 *
 * 此脚本作为 Cursor Hook 的入口点，负责：
 * 1. beforeSubmitPrompt 时注入 conversation_id 和工作区上下文
 * 2. 检测工作区关键词，未绑定则提醒绑定
 *
 * 与 Claude Code 版的差异：
 * - Cursor 没有 SessionStart 事件，所有逻辑在 beforeSubmitPrompt 处理
 * - 使用 conversation_id 而非 session_id
 * - 输出格式不同：{ continue: true, user_message: "..." }
 *
 * 使用方式：由 Cursor 的 Hook 机制自动调用
 */

const {
  readStdin,
  getSessionBinding,
  containsWorkspaceKeywords,
  getFullWorkspaceContext,
  generateSessionIdContext,
  generateBindingReminder
} = require('./shared/index.cjs');

// ============================================================================
// Cursor 专用响应格式
// ============================================================================

/**
 * 输出 Cursor Hook 响应
 * @param {boolean} shouldContinue - 是否继续执行
 * @param {string} userMessage - 注入给用户的消息（会显示在对话中）
 * @param {string} agentMessage - 注入给 AI 的消息（可选）
 */
function outputCursorResponse(shouldContinue, userMessage, agentMessage) {
  const response = {
    continue: shouldContinue
  };

  if (userMessage) {
    response.user_message = userMessage;
  }

  if (agentMessage) {
    response.agent_message = agentMessage;
  }

  console.log(JSON.stringify(response));
}

/**
 * 静默通过（不注入任何内容）
 */
function passThrough() {
  outputCursorResponse(true, null, null);
}

// ============================================================================
// 事件处理
// ============================================================================

/**
 * 处理 beforeSubmitPrompt 事件
 * Cursor 没有 SessionStart，所以在每次提交时都可能需要注入上下文
 */
function handleBeforeSubmitPrompt(conversationId, binding, input) {
  const userPrompt = input.prompt || '';

  if (binding) {
    // 已绑定：注入工作区上下文
    const context = getFullWorkspaceContext(binding);
    if (context) {
      // 通过 agent_message 注入上下文给 AI
      outputCursorResponse(true, null, context);
    } else {
      passThrough();
    }
  } else {
    // 未绑定：检测是否涉及工作区
    if (containsWorkspaceKeywords(userPrompt)) {
      // 检测到工作区关键词，注入 conversation_id 和绑定提醒
      const sessionInfo = generateSessionIdContext(conversationId, 'cursor');
      const reminder = generateBindingReminder(conversationId, 'cursor');
      outputCursorResponse(true, null, sessionInfo + '\n\n' + reminder);
    } else {
      // 普通对话，静默通过
      passThrough();
    }
  }
}

/**
 * 处理 stop 事件
 * 任务结束时可以自动提交后续消息（可选功能）
 */
function handleStop(conversationId, binding, input) {
  // 目前静默处理，未来可以添加自动记录日志等功能
  // 如需自动提交后续消息：
  // console.log(JSON.stringify({ followup_message: "..." }));
  process.exit(0);
}

// ============================================================================
// 主逻辑
// ============================================================================

async function main() {
  // 读取 Hook 输入
  const input = await readStdin();

  // Cursor 使用 conversation_id 作为会话标识
  const conversationId = input.conversation_id;
  const eventType = input.hook_event_name;

  if (!conversationId) {
    // 无会话 ID，静默通过
    passThrough();
    return;
  }

  // 检查会话绑定（复用 session_id 的绑定机制，用 conversation_id 作为 key）
  const binding = getSessionBinding(conversationId);

  // 根据事件类型处理
  switch (eventType) {
    case 'beforeSubmitPrompt':
      handleBeforeSubmitPrompt(conversationId, binding, input);
      break;

    case 'stop':
      handleStop(conversationId, binding, input);
      break;

    default:
      // 其他事件静默通过
      passThrough();
  }
}

main().catch(() => {
  // 任何错误都静默通过，不干扰用户
  passThrough();
});
