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
  generateBindingReminder,
  analyzeNodeStatus,
  shouldThrottle,
  updateLastReminder,
  getNodeGraph
} = require('./shared/index.cjs');

// 导入生成的写操作工具列表
const { WRITE_TOOLS, SPECIAL_ALLOW } = require('../hooks/generated/write-tools.cjs');

// ============================================================================
// 节流时间常量（毫秒）
// ============================================================================

const THROTTLE_MS = {
  FILE_CHANGED: 10000,  // 文件变更提醒：10秒
  BASH_ERROR: 5000,     // Bash 错误提醒：5秒
  STOP_ERROR: 30000,    // Stop 错误提醒：30秒
};

// ============================================================================
// 工作流阶段验证
// ============================================================================

/**
 * 有效的工作流阶段值
 */
const VALID_WORKFLOW_PHASES = new Set(['info', 'design', 'impl']);

// ============================================================================
// 流程强制机制：phaseSkillInvoked=false 时的白名单
// ============================================================================

/**
 * phaseSkillInvoked=false 时允许的工具白名单
 * 绑定工作区后必须先调用 Skill 进入流程，此前只允许这些工具
 */
const SKILL_INIT_WHITELIST = new Set([
  // Claude 内置工具
  'Skill', 'Bash', 'Read',
  // MCP 工具（简短名）
  'session_unbind', 'session_status', 'tanmi_help', 'plugin_path'
]);

/**
 * 检查工具是否在流程初始化白名单中
 * 处理两种工具名格式：内置工具名 和 MCP 完整路径
 * @param {string} toolName - 工具名
 * @returns {boolean} 是否在白名单中
 */
function isWhitelistedForSkillInit(toolName) {
  // 直接匹配内置工具
  if (SKILL_INIT_WHITELIST.has(toolName)) return true;
  // MCP 工具格式：mcp__tanmi-workspace__xxx 或 mcp__tanmi-workspace-dev1__xxx
  if (toolName?.startsWith('mcp__tanmi-workspace')) {
    const parts = toolName.split('__');
    const shortName = parts[parts.length - 1];
    return SKILL_INIT_WHITELIST.has(shortName);
  }
  return false;
}

/**
 * 规范化工作流阶段值
 * 如果传入无效值，返回 'info' 作为默认值
 * @param {string|undefined|null} phase - 原始阶段值
 * @returns {'info'|'design'|'impl'} 规范化后的阶段值
 */
function normalizeWorkflowPhase(phase) {
  if (phase && VALID_WORKFLOW_PHASES.has(phase)) {
    return phase;
  }
  // 无效值不记录日志（Hook 层应静默处理，主日志在 MCP 层）
  return 'info';
}

/**
 * 获取阶段对应的 Skill 名称
 * @param {string} phase - 工作流阶段
 * @returns {string} Skill 名称
 */
function getSkillForPhase(phase) {
  const mapping = {
    'info': 'flow-info',
    'design': 'flow-design',
    'impl': 'flow-impl'
  };
  return mapping[phase] || 'flow-info';
}

// ============================================================================
// Pending Reminders 缓存模块
// ============================================================================

/**
 * 待注入的提醒缓存
 * 结构: { [sessionId]: { messages: [], lastUpdated: timestamp } }
 */
const pendingReminders = {};

/**
 * 本地节流记录（用于测试和独立于 binding 的节流）
 * 结构: { [sessionId]: { [type]: timestamp } }
 */
const localThrottleCache = {};

/**
 * 检查是否应该节流（本地版本，独立于 binding）
 * @param {string} sessionId - 会话 ID
 * @param {string} type - 提醒类型
 * @param {number} throttleMs - 节流时间（毫秒）
 * @returns {boolean} 是否应该节流
 */
function shouldThrottleLocal(sessionId, type, throttleMs) {
  if (!sessionId || !localThrottleCache[sessionId]) {
    return false;
  }
  const lastTime = localThrottleCache[sessionId][type];
  if (!lastTime) {
    return false;
  }
  return Date.now() - lastTime < throttleMs;
}

/**
 * 更新本地节流记录
 * @param {string} sessionId - 会话 ID
 * @param {string} type - 提醒类型
 */
function updateThrottleLocal(sessionId, type) {
  if (!sessionId) return;
  if (!localThrottleCache[sessionId]) {
    localThrottleCache[sessionId] = {};
  }
  localThrottleCache[sessionId][type] = Date.now();
}

/**
 * 添加待注入的提醒到缓存
 * @param {string} sessionId - 会话 ID
 * @param {string} type - 提醒类型（如 'file_changed', 'bash_error' 等）
 * @param {string} content - 提醒内容
 */
function addPendingReminder(sessionId, type, content) {
  if (!sessionId) return;

  if (!pendingReminders[sessionId]) {
    pendingReminders[sessionId] = {
      messages: [],
      lastUpdated: Date.now()
    };
  }

  pendingReminders[sessionId].messages.push({
    type,
    content,
    timestamp: Date.now()
  });
  pendingReminders[sessionId].lastUpdated = Date.now();
}

/**
 * 获取待注入的提醒（不清空缓存）
 * @param {string} sessionId - 会话 ID
 * @returns {{ messages: Array<{type: string, content: string, timestamp: number}>, lastUpdated: number }}
 */
function getPendingReminders(sessionId) {
  if (!sessionId || !pendingReminders[sessionId]) {
    return { messages: [], lastUpdated: 0 };
  }
  return pendingReminders[sessionId];
}

/**
 * 清空会话的待注入提醒缓存
 * @param {string} sessionId - 会话 ID
 */
function clearPendingReminders(sessionId) {
  if (sessionId && pendingReminders[sessionId]) {
    delete pendingReminders[sessionId];
  }
}

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
 * 生成工作区绑定建议提示（Cursor 版）
 * @param {string} sessionId - 会话 ID
 * @param {Array} matchedWorkspaces - 匹配的工作区列表
 * @returns {string} 建议提示内容
 */
function generateBindingSuggestionForCursor(sessionId, matchedWorkspaces) {
  const sessionContext = generateSessionIdContext(sessionId, 'cursor');

  // 生成工作区列表
  const workspaceList = matchedWorkspaces.map(ws => {
    const goalInfo = ws.goal ? `\n   目标: ${ws.goal.slice(0, 80)}${ws.goal.length > 80 ? '...' : ''}` : '';
    return `- **${ws.name}** (${ws.id})${goalInfo}`;
  }).join('\n');

  const suggestion = `${sessionContext}

<tanmi-workspace-suggestion>
## 检测到匹配的工作区

当前目录下存在以下活跃工作区：

${workspaceList}

**建议**: 如果本次会话涉及以上工作区的任务，请考虑使用 \`session_bind\` 绑定工作区以获取完整上下文。

绑定示例：
\`\`\`
session_bind(workspaceId: "${matchedWorkspaces[0].id}")
\`\`\`

如果本次会话与工作区无关，可以忽略此建议。
</tanmi-workspace-suggestion>`;

  return suggestion;
}

/**
 * 处理 sessionStart 事件
 * 会话启动时注入工作区上下文或绑定建议
 * @param {string} sessionId - 会话 ID (Cursor 的 conversation_id)
 * @param {object|null} binding - 绑定信息或 null
 * @param {object} input - 事件输入
 * @param {Array} [workspaces] - 可选，工作区列表（用于测试注入）
 * @returns {{ continue: boolean, additional_context?: string, env?: object, user_message?: string }}
 */
function handleSessionStart(sessionId, binding, input, workspaces) {
  // 已绑定工作区：返回工作区上下文
  if (binding && binding.workspaceId) {
    const context = getFullWorkspaceContext(binding);

    if (context) {
      return {
        continue: true,
        additional_context: context
      };
    }

    // 无法获取完整上下文但已绑定，使用 binding 信息生成基本上下文
    const basicContext = `<tanmi-workspace-context>
## 工作区信息

- **工作区**: ${binding.workspaceName || binding.workspaceId}
- **ID**: ${binding.workspaceId}
${binding.phase ? `- **当前阶段**: ${binding.phase}` : ''}

会话已绑定到工作区。
</tanmi-workspace-context>`;

    return {
      continue: true,
      additional_context: basicContext
    };
  }

  // 未绑定：检查是否有匹配的工作区
  // 优先使用传入的 workspaces（用于测试），否则从 cwd 检测
  let matchedWorkspaces = workspaces;
  if (!matchedWorkspaces) {
    const { getWorkspacesByCwd } = require('./shared/workspace.cjs');
    const cwd = input?.cwd || process.cwd();
    matchedWorkspaces = getWorkspacesByCwd(cwd);
  }

  if (matchedWorkspaces && matchedWorkspaces.length > 0) {
    // 有匹配的工作区：生成绑定建议
    const suggestion = generateBindingSuggestionForCursor(sessionId, matchedWorkspaces);
    return {
      continue: true,
      additional_context: suggestion
    };
  }

  // 无匹配工作区：仅注入 sessionId
  const sessionContext = generateSessionIdContext(sessionId, 'cursor');
  return {
    continue: true,
    additional_context: sessionContext
  };
}

/**
 * 处理 beforeSubmitPrompt 事件
 * Cursor 没有 SessionStart，所以在每次提交时都可能需要注入上下文
 * @param {string} conversationId - 会话 ID
 * @param {object|null} binding - 绑定信息
 * @param {object} input - 输入
 * @returns {{ continue: boolean, agent_message?: string, user_message?: string } | void}
 */
function handleBeforeSubmitPrompt(conversationId, binding, input) {
  const userPrompt = input.prompt || input.user_message || '';

  // 检查是否有待注入的缓存提醒
  let cachedReminders = '';
  const pending = getPendingReminders(conversationId);
  if (pending && pending.messages && pending.messages.length > 0) {
    cachedReminders = pending.messages.map(m => m.content).join('\n\n');
    clearPendingReminders(conversationId);
  }

  if (binding && binding.workspaceId) {
    // 已绑定：注入工作区上下文 + 智能提醒 + 缓存提醒
    let context = getFullWorkspaceContext(binding);

    // 检查是否需要智能提醒（优先从 graph.currentFocus 获取焦点节点）
    const graph = getNodeGraph(binding.workspaceId);
    const focusNodeId = graph?.currentFocus || binding.focusedNodeId;
    if (focusNodeId) {
      const reminderInfo = analyzeNodeStatus(binding.workspaceId, focusNodeId);
      if (reminderInfo && !shouldThrottle(binding, reminderInfo.type)) {
        // 更新上次提醒记录
        updateLastReminder(conversationId, reminderInfo.type);

        // 追加智能提醒到上下文
        const reminderContent = `\n\n<tanmi-smart-reminder>\n${reminderInfo.message}\n</tanmi-smart-reminder>`;
        context = (context || '') + reminderContent;
      }
    }

    // 追加缓存的提醒
    if (cachedReminders) {
      const cachedContent = `\n\n<tanmi-post-tool-reminder>\n${cachedReminders}\n</tanmi-post-tool-reminder>`;
      context = (context || '') + cachedContent;
    }

    if (context) {
      // 通过 agent_message 注入上下文给 AI
      return { continue: true, agent_message: context };
    } else {
      return { continue: true };
    }
  } else {
    // 未绑定：检测是否涉及工作区
    if (containsWorkspaceKeywords(userPrompt)) {
      // 检测到工作区关键词，注入 conversation_id 和绑定提醒
      const sessionInfo = generateSessionIdContext(conversationId, 'cursor');
      const reminder = generateBindingReminder(conversationId, 'cursor');
      let agentMsg = sessionInfo + '\n\n' + reminder;
      if (cachedReminders) {
        agentMsg += `\n\n<tanmi-post-tool-reminder>\n${cachedReminders}\n</tanmi-post-tool-reminder>`;
      }
      return { continue: true, agent_message: agentMsg };
    } else if (cachedReminders) {
      // 有缓存提醒但未绑定
      return { continue: true, agent_message: `<tanmi-post-tool-reminder>\n${cachedReminders}\n</tanmi-post-tool-reminder>` };
    } else {
      // 普通对话，静默通过
      return { continue: true };
    }
  }
}

/**
 * 处理 beforeMCPExecution 事件
 * MCP 工具执行前拦截：写操作阻止、流程强制
 * @param {string} sessionId - 会话 ID
 * @param {object|null} binding - 绑定信息或 null
 * @param {object} input - 事件输入 { tool_name, tool_input }
 * @returns {{ permission: 'allow'|'deny'|'ask', user_message?: string, agent_message?: string }}
 */
function handleBeforeMCPExecution(sessionId, binding, input) {
  const { tool_name, tool_input } = input;

  // 无 sessionId 时静默通过
  if (!sessionId) {
    return { permission: 'allow' };
  }

  // 未绑定工作区时：阻止写操作
  if (!binding?.workspaceId) {
    // 检查是否为写操作工具
    const shortName = tool_name?.split('__').pop() || tool_name;
    if (WRITE_TOOLS.has(shortName) && !SPECIAL_ALLOW.has(shortName)) {
      return {
        permission: 'deny',
        agent_message: `<tanmi-write-blocked>
未绑定工作区，不允许执行写操作工具 ${shortName}。

请先绑定工作区：
\`\`\`
session_bind(workspaceId: "...")
\`\`\`

或使用 session_status 查看可用工作区。
</tanmi-write-blocked>`
      };
    }
    return { permission: 'allow' };
  }

  // 已绑定工作区：检查流程强制
  const graph = getNodeGraph(binding.workspaceId);
  const phase = normalizeWorkflowPhase(graph?.workflow?.phase);
  const phaseSkillInvoked = graph?.workflow?.phaseSkillInvoked || false;

  // 流程强制机制：phaseSkillInvoked=false 时阻止非白名单工具
  if (!phaseSkillInvoked && !isWhitelistedForSkillInit(tool_name)) {
    const skillName = getSkillForPhase(phase);
    return {
      permission: 'deny',
      agent_message: `<tanmi-skill-required>
已进入工作区模式，必须先调用流程 Skill。

请调用：
\`\`\`
Skill(skill: "${skillName}")
\`\`\`

调用后才能继续执行其他操作。
</tanmi-skill-required>`
    };
  }

  return { permission: 'allow' };
}

/**
 * 处理 afterShellExecution 事件
 * Shell 命令执行后检测错误，缓存提醒
 * @param {string} sessionId - 会话 ID
 * @param {object|null} binding - 绑定信息或 null
 * @param {object} input - 事件输入 { command, output, duration, exit_code }
 */
function handleAfterShellExecution(sessionId, binding, input) {
  // 未绑定工作区时不处理
  if (!binding?.workspaceId || !sessionId) {
    return;
  }

  const { command, output, exit_code } = input;
  const cmdPreview = (command || '').length > 50 ? command.slice(0, 50) + '...' : command;

  // 检查是否失败
  const hasExitError = exit_code !== undefined && exit_code !== 0;
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output || '');

  const errorKeywords = ['error', 'Error', 'ERROR', 'failed', 'Failed', 'FAILED',
                         'exception', 'Exception', 'ENOENT', 'EACCES', 'Permission denied',
                         'command not found', 'No such file'];
  const hasErrorKeyword = errorKeywords.some(kw => outputStr.includes(kw));

  const isError = hasExitError || hasErrorKeyword;

  if (!isError) {
    return;
  }

  // 节流检查（使用本地节流缓存）
  if (shouldThrottleLocal(sessionId, 'bash_error', THROTTLE_MS.BASH_ERROR)) {
    return;
  }

  // 缓存提醒
  const reminder = `⚠️ 命令执行出错${hasExitError ? ` (exit code: ${exit_code})` : ''}。

命令: \`${cmdPreview}\`

**请使用 \`problem_update\` 记录问题**，描述错误原因和解决思路。`;

  addPendingReminder(sessionId, 'bash_error', reminder);
  updateThrottleLocal(sessionId, 'bash_error');
}

/**
 * 处理 afterFileEdit 事件
 * 文件编辑后缓存日志提醒
 * @param {string} sessionId - 会话 ID
 * @param {object|null} binding - 绑定信息或 null
 * @param {object} input - 事件输入 { file_path, edits }
 */
function handleAfterFileEdit(sessionId, binding, input) {
  // 未绑定工作区时不处理
  if (!binding?.workspaceId || !sessionId) {
    return;
  }

  const filePath = input?.file_path || '';
  const fileName = filePath.split('/').pop() || filePath;

  // 节流检查（使用本地节流缓存）
  if (shouldThrottleLocal(sessionId, 'file_changed', THROTTLE_MS.FILE_CHANGED)) {
    return;
  }

  // 缓存提醒
  const reminder = `📝 文件 \`${fileName}\` 已编辑。

**请使用 \`log_append\` 记录本次变更**，说明改动内容和目的。`;

  addPendingReminder(sessionId, 'file_changed', reminder);
  updateThrottleLocal(sessionId, 'file_changed');
}

/**
 * 处理 stop 事件
 * 分析 AI 响应中是否遇到错误/阻碍，提醒记录问题
 * @param {string} sessionId - 会话 ID
 * @param {object|null} binding - 绑定信息或 null
 * @param {object} input - 事件输入 { status, loop_count, last_response }
 * @returns {{ followup_message?: string }}
 */
function handleStop(sessionId, binding, input) {
  // 未绑定工作区时不处理
  if (!binding?.workspaceId) {
    return {};
  }

  // 节流检查
  if (shouldThrottle(binding, 'stop_error', THROTTLE_MS.STOP_ERROR)) {
    return {};
  }

  // 检查是否有错误状态或错误关键词
  const { status, last_response } = input;
  const responseStr = last_response || '';

  const errorKeywords = [
    'error', 'Error', 'ERROR',
    'failed', 'Failed', 'FAILED',
    'Cannot find', 'not found',
    'Permission denied', 'ENOENT', 'EACCES',
    '失败', '错误', '无法'
  ];

  const hasError = status === 'error' ||
                   errorKeywords.some(kw => responseStr.includes(kw));

  if (hasError) {
    updateLastReminder(sessionId, 'stop_error');

    // 返回 followup_message 提醒记录问题
    return {
      followup_message: `检测到可能的错误或阻碍。如果确实遇到问题，请使用 \`problem_update\` 记录问题，描述错误原因和当前状态。`
    };
  }

  return {};
}

/**
 * 处理 afterMCPExecution 事件
 * MCP 调用完成后检测错误，提醒 AI 查看 schema
 */
function handleAfterMCPExecution(conversationId, input) {
  const { server_name, tool_name, result } = input;

  // 仅处理 tanmi-workspace MCP 工具
  if (server_name !== 'tanmi-workspace') {
    passThrough();
    return;
  }

  // 检测是否调用失败
  const resultStr = typeof result === 'string'
    ? result
    : JSON.stringify(result || '');

  const errorPatterns = [
    'undefined',
    '无效',
    'INVALID_PARAMS',
    '不存在',
    '缺少必填参数',
    'required'
  ];

  const isError = result?.isError ||
                  errorPatterns.some(pattern => resultStr.includes(pattern));

  if (isError) {
    const toolPath = `tanmi-workspace/${tool_name}`;
    const reminder = `<tanmi-mcp-error-hint>
⚠️ MCP 调用可能使用了错误的参数名。

请运行以下命令查看正确的参数 schema：
\`\`\`bash
mcp-cli info ${toolPath}
\`\`\`

然后使用正确的参数名重试。
</tanmi-mcp-error-hint>`;

    outputCursorResponse(true, null, reminder);
  } else {
    passThrough();
  }
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
    case 'sessionStart':
      const sessionResult = handleSessionStart(conversationId, binding, input);
      console.log(JSON.stringify(sessionResult));
      break;

    case 'beforeSubmitPrompt':
      handleBeforeSubmitPrompt(conversationId, binding, input);
      break;

    case 'beforeMCPExecution':
      const mcpResult = handleBeforeMCPExecution(conversationId, binding, input);
      console.log(JSON.stringify(mcpResult));
      break;

    case 'afterMCPExecution':
      handleAfterMCPExecution(conversationId, input);
      break;

    case 'afterShellExecution':
      handleAfterShellExecution(conversationId, binding, input);
      passThrough();
      break;

    case 'afterFileEdit':
      handleAfterFileEdit(conversationId, binding, input);
      passThrough();
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

// ============================================================================
// 导出供测试使用
// ============================================================================

module.exports = {
  // 缓存模块
  addPendingReminder,
  getPendingReminders,
  clearPendingReminders,
  // 辅助函数
  normalizeWorkflowPhase,
  isWhitelistedForSkillInit,
  getSkillForPhase,
  // 事件处理器
  handleSessionStart,
  handleBeforeMCPExecution,
  handleAfterShellExecution,
  handleAfterFileEdit,
  handleStop,
  handleBeforeSubmitPrompt,
  // 常量
  THROTTLE_MS,
  VALID_WORKFLOW_PHASES,
  SKILL_INIT_WHITELIST,
  // 响应函数
  outputCursorResponse,
  passThrough
};
