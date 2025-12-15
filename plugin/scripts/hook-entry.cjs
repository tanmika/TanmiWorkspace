#!/usr/bin/env node
/**
 * Tanmi-Workspace Hook 入口脚本 (Claude Code 版)
 *
 * 此脚本作为 Claude Code Hook 的入口点，负责：
 * 1. SessionStart 时始终注入 sessionId（让 AI 知道自己的会话 ID）
 * 2. 如果已绑定工作区，同时注入工作区上下文
 * 3. UserPromptSubmit 时检测工作区关键词，未绑定则提醒 AI 绑定
 *
 * 使用方式：由 Claude Code 的 Hook 机制自动调用
 */

const {
  readStdin,
  getSessionBinding,
  containsWorkspaceKeywords,
  getFullWorkspaceContext,
  generateSessionIdContext,
  generateBindingReminder,
  analyzeNodeStatus,
  shouldThrottle,
  updateLastReminder,
  logHook,
  getNodeGraph
} = require('./shared/index.cjs');

// ============================================================================
// Claude Code 专用响应格式
// ============================================================================

/**
 * 输出 Claude Code Hook 响应
 * @param {string} eventType - 事件类型
 * @param {string} context - 上下文内容
 */
function outputHookResponse(eventType, context) {
  const response = {
    hookSpecificOutput: {
      hookEventName: eventType,
    }
  };

  if (context) {
    response.hookSpecificOutput.additionalContext = context;
  }

  console.log(JSON.stringify(response));
}

// ============================================================================
// 事件处理
// ============================================================================

/**
 * 处理 SessionStart 事件
 * 始终注入 sessionId，如果已绑定则同时注入工作区上下文
 */
function handleSessionStart(sessionId, binding) {
  let context = '';

  if (binding) {
    // 已绑定：注入工作区上下文
    context = getFullWorkspaceContext(binding);
    logHook(sessionId, 'SessionStart', { bound: true, workspaceId: binding.workspaceId });
  } else {
    logHook(sessionId, 'SessionStart', { bound: false });
  }

  if (!context) {
    // 未绑定或获取上下文失败：仅注入 sessionId 信息
    context = generateSessionIdContext(sessionId, 'claude-code');
  }

  if (context) {
    outputHookResponse('SessionStart', context);
  } else {
    process.exit(0);
  }
}

/**
 * 处理 UserPromptSubmit 事件
 * 已绑定时进行智能提醒，未绑定时检测关键词提醒绑定
 */
function handleUserPromptSubmit(sessionId, binding, input) {
  const userPrompt = input.prompt || '';
  const promptPreview = userPrompt.slice(0, 100) + (userPrompt.length > 100 ? '...' : '');

  // 已绑定：进行智能提醒分析
  if (binding && binding.workspaceId) {
    // 优先从 graph.currentFocus 获取焦点节点（权威来源）
    const graph = getNodeGraph(binding.workspaceId);
    const focusNodeId = graph?.currentFocus || binding.focusedNodeId;
    if (focusNodeId) {
      // 分析节点状态
      const reminderInfo = analyzeNodeStatus(binding.workspaceId, focusNodeId);

      if (reminderInfo) {
        // 检查是否应该节流
        if (!shouldThrottle(binding, reminderInfo.type)) {
          // 更新上次提醒记录
          updateLastReminder(sessionId, reminderInfo.type);

          logHook(sessionId, 'UserPromptSubmit', {
            bound: true,
            reminder: reminderInfo.type,
            prompt: promptPreview
          });

          // 输出智能提醒
          const reminderContent = `<tanmi-smart-reminder>\n${reminderInfo.message}\n</tanmi-smart-reminder>`;
          outputHookResponse('UserPromptSubmit', reminderContent);
          return;
        }
      }
    }

    logHook(sessionId, 'UserPromptSubmit', { bound: true, reminder: null, prompt: promptPreview });
    // 无需提醒，静默退出
    process.exit(0);
  }

  // 未绑定：检测用户消息是否涉及工作区
  const hasKeywords = containsWorkspaceKeywords(userPrompt);

  if (hasKeywords) {
    logHook(sessionId, 'UserPromptSubmit', { bound: false, keywordDetected: true, prompt: promptPreview });
    // 检测到工作区关键词，提醒绑定
    const reminder = generateBindingReminder(sessionId, 'claude-code');
    outputHookResponse('UserPromptSubmit', reminder);
  } else {
    logHook(sessionId, 'UserPromptSubmit', { bound: false, keywordDetected: false, prompt: promptPreview });
    // 普通对话，静默退出
    process.exit(0);
  }
}

// ============================================================================
// 主逻辑
// ============================================================================

async function main() {
  const eventType = process.argv[2];

  if (!eventType) {
    // 无事件类型，静默退出
    process.exit(0);
  }

  // 读取 Hook 输入
  const input = await readStdin();
  const sessionId = input.session_id;

  if (!sessionId) {
    // 无会话 ID，静默退出
    process.exit(0);
  }

  // 检查会话绑定
  const binding = getSessionBinding(sessionId);

  // 根据事件类型处理
  switch (eventType) {
    case 'SessionStart':
      handleSessionStart(sessionId, binding);
      break;

    case 'UserPromptSubmit':
      handleUserPromptSubmit(sessionId, binding, input);
      break;

    default:
      // 未知事件，静默退出
      process.exit(0);
  }
}

main().catch(() => {
  // 任何错误都静默退出，不干扰用户
  process.exit(0);
});
