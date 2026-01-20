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
  logHookOutput,
  getNodeGraph,
  getWorkspacesByCwd,
  getGlobalConfig
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
 * 生成工作区绑定建议提示
 * @param {string} sessionId - 会话 ID
 * @param {Array} matchedWorkspaces - 匹配的工作区列表
 * @returns {string} 建议提示内容
 */
function generateBindingSuggestion(sessionId, matchedWorkspaces) {
  const sessionContext = generateSessionIdContext(sessionId, 'claude-code');

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

/**
 * 处理 SessionStart 事件
 * 始终注入 sessionId，如果已绑定则同时注入工作区上下文
 * 如果未绑定但检测到匹配工作区，则提示绑定建议
 */
function handleSessionStart(sessionId, binding, input) {
  let context = '';
  let logDetails = {};

  if (binding) {
    // 已绑定：检测工作流状态
    const graph = getNodeGraph(binding.workspaceId);
    const rawWorkflow = graph?.workflow || { phase: 'info', phaseSkillInvoked: false };
    const workflow = {
      phase: normalizeWorkflowPhase(rawWorkflow.phase),
      phaseSkillInvoked: rawWorkflow.phaseSkillInvoked || false
    };

    if (!workflow.phaseSkillInvoked) {
      // 需要引导调用阶段 Skill
      const skillName = getSkillForPhase(workflow.phase);
      context = getFullWorkspaceContext(binding);

      const actionRequired = {
        type: 'invoke_skill',
        message: `请调用 ${skillName} 开始当前阶段工作`,
        data: { skill: skillName, phase: workflow.phase }
      };

      logDetails = {
        bound: true,
        workspaceId: binding.workspaceId,
        workflow: { phase: workflow.phase, phaseSkillInvoked: false },
        actionRequired: true
      };

      logHookOutput(sessionId, 'SessionStart', 'output', logDetails, context);

      const response = {
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: context,
          actionRequired: actionRequired
        }
      };
      console.log(JSON.stringify(response));
      return;
    }

    // phaseSkillInvoked=true：正常注入工作区上下文
    context = getFullWorkspaceContext(binding);
    logDetails = {
      bound: true,
      workspaceId: binding.workspaceId,
      workflow: { phase: workflow.phase, phaseSkillInvoked: true }
    };
  } else {
    // 未绑定：检查是否有匹配的工作区
    const cwd = input?.cwd || process.cwd();
    const matchedWorkspaces = getWorkspacesByCwd(cwd);

    if (matchedWorkspaces.length > 0) {
      // 有匹配的工作区：生成绑定建议
      context = generateBindingSuggestion(sessionId, matchedWorkspaces);
      logDetails = {
        bound: false,
        matchedCount: matchedWorkspaces.length,
        matchedWorkspaces: matchedWorkspaces.slice(0, 5).map(ws => ws.id)
      };
    } else {
      // 无匹配工作区：仅注入 sessionId
      context = generateSessionIdContext(sessionId, 'claude-code');
      logDetails = { bound: false, matchedCount: 0 };
    }
  }

  if (context) {
    logHookOutput(sessionId, 'SessionStart', 'output', logDetails, context);
    outputHookResponse('SessionStart', context);
  } else {
    logHookOutput(sessionId, 'SessionStart', 'silent', logDetails);
    process.exit(0);
  }
}

/**
 * 处理 PostToolUse 事件
 * 1. MCP 调用失败时提醒查看 schema
 * 2. Edit/Write 成功后提醒记录日志
 * 3. Bash 失败后提醒记录问题
 */
function handlePostToolUse(sessionId, binding, input) {
  const { tool_name, tool_response, tool_input } = input;

  // 根据工具类型分发处理
  if (tool_name?.startsWith('mcp__tanmi-workspace__')) {
    handleMcpToolUse(sessionId, tool_name, tool_response);
  } else if (tool_name === 'Edit' || tool_name === 'Write') {
    handleFileToolUse(sessionId, binding, tool_name, tool_input, tool_response);
  } else if (tool_name === 'Bash') {
    handleBashToolUse(sessionId, binding, tool_input, tool_response);
  } else if (tool_name === 'TodoWrite') {
    handleTodoWriteToolUse(sessionId, binding, tool_input, tool_response);
  } else {
    process.exit(0);
  }
}

/**
 * 处理 MCP 工具调用
 */
function handleMcpToolUse(sessionId, tool_name, tool_response) {
  const responseStr = typeof tool_response === 'string'
    ? tool_response
    : JSON.stringify(tool_response || '');

  const errorPatterns = [
    'undefined',
    '无效',
    'INVALID_PARAMS',
    '不存在',
    '缺少必填参数',
    'required'
  ];

  const isError = tool_response?.isError ||
                  errorPatterns.some(pattern => responseStr.includes(pattern));
  const toolPath = tool_name.replace('mcp__tanmi-workspace__', 'tanmi-workspace/');

  if (isError) {
    const reminder = `<tanmi-mcp-error-hint>
⚠️ MCP 调用可能使用了错误的参数名。

请运行以下命令查看正确的参数 schema：
\`\`\`bash
mcp-cli info ${toolPath}
\`\`\`

然后使用正确的参数名重试。
</tanmi-mcp-error-hint>`;

    logHookOutput(sessionId, 'PostToolUse', 'output', {
      tool: toolPath,
      error: true,
      response: responseStr.slice(0, 200)
    }, reminder);

    outputHookResponse('PostToolUse', reminder);
  } else {
    logHookOutput(sessionId, 'PostToolUse', 'silent', {
      tool: toolPath,
      error: false
    });
    process.exit(0);
  }
}

/**
 * 处理文件编辑工具 (Edit/Write)
 * 成功后提醒记录日志
 */
function handleFileToolUse(sessionId, binding, tool_name, tool_input, tool_response) {
  const filePath = tool_input?.file_path || '';
  const fileName = filePath.split('/').pop() || filePath;

  // 未绑定工作区时不提醒
  if (!binding?.workspaceId) {
    logHookOutput(sessionId, 'PostToolUse', 'silent', {
      tool: tool_name,
      file: fileName,
      reason: 'not_bound'
    });
    process.exit(0);
    return;
  }

  // 检查是否成功
  const isSuccess = tool_response?.success !== false;
  if (!isSuccess) {
    logHookOutput(sessionId, 'PostToolUse', 'silent', {
      tool: tool_name,
      file: fileName,
      reason: 'not_success'
    });
    process.exit(0);
    return;
  }

  // 节流检查：file_changed 类型，10秒内不重复提醒
  if (shouldThrottle(binding, 'file_changed', THROTTLE_MS.FILE_CHANGED)) {
    logHookOutput(sessionId, 'PostToolUse', 'throttled', {
      tool: tool_name,
      file: fileName,
      reminderType: 'file_changed'
    });
    process.exit(0);
    return;
  }

  const reminder = `<tanmi-post-tool-reminder>
📝 文件 \`${fileName}\` 已${tool_name === 'Edit' ? '编辑' : '写入'}。

**请使用 \`log_append\` 记录本次变更**，说明改动内容和目的。
</tanmi-post-tool-reminder>`;

  updateLastReminder(sessionId, 'file_changed');

  logHookOutput(sessionId, 'PostToolUse', 'output', {
    tool: tool_name,
    file: fileName,
    reminderType: 'file_changed'
  }, reminder);

  outputHookResponse('PostToolUse', reminder);
}

/**
 * 处理 Bash 命令
 * 失败后提醒记录问题
 */
function handleBashToolUse(sessionId, binding, tool_input, tool_response) {
  const command = tool_input?.command || '';
  const cmdPreview = command.length > 50 ? command.slice(0, 50) + '...' : command;

  // 未绑定工作区时不提醒
  if (!binding?.workspaceId) {
    logHookOutput(sessionId, 'PostToolUse', 'silent', {
      tool: 'Bash',
      command: cmdPreview,
      reason: 'not_bound'
    });
    process.exit(0);
    return;
  }

  // 检查是否失败
  const responseStr = typeof tool_response === 'string'
    ? tool_response
    : JSON.stringify(tool_response || '');

  // 检测错误：exit code 非 0，或包含错误关键词
  const exitCode = tool_response?.exit_code ?? tool_response?.exitCode;
  const hasExitError = exitCode !== undefined && exitCode !== 0;

  const errorKeywords = ['error', 'Error', 'ERROR', 'failed', 'Failed', 'FAILED',
                         'exception', 'Exception', 'ENOENT', 'EACCES', 'Permission denied',
                         'command not found', 'No such file'];
  const hasErrorKeyword = errorKeywords.some(kw => responseStr.includes(kw));

  const isError = hasExitError || hasErrorKeyword;

  if (!isError) {
    logHookOutput(sessionId, 'PostToolUse', 'silent', {
      tool: 'Bash',
      command: cmdPreview,
      reason: 'no_error'
    });
    process.exit(0);
    return;
  }

  // 节流检查：bash_error 类型，5秒内不重复提醒
  if (shouldThrottle(binding, 'bash_error', THROTTLE_MS.BASH_ERROR)) {
    logHookOutput(sessionId, 'PostToolUse', 'throttled', {
      tool: 'Bash',
      command: cmdPreview,
      exitCode,
      reminderType: 'bash_error'
    });
    process.exit(0);
    return;
  }

  const reminder = `<tanmi-post-tool-reminder>
⚠️ 命令执行出错${hasExitError ? ` (exit code: ${exitCode})` : ''}。

命令: \`${cmdPreview}\`

**请使用 \`problem_update\` 记录问题**，描述错误原因和解决思路。
</tanmi-post-tool-reminder>`;

  updateLastReminder(sessionId, 'bash_error');

  logHookOutput(sessionId, 'PostToolUse', 'output', {
    tool: 'Bash',
    command: cmdPreview,
    exitCode,
    reminderType: 'bash_error'
  }, reminder);

  outputHookResponse('PostToolUse', reminder);
}

/**
 * 处理 TodoWrite 工具
 * 提醒 AI 应该在工作区创建执行节点跟踪任务
 *
 * 注意：此提醒【不需要节流】，每次都提醒
 * 原因：AI 可能忘记同步到工作区，用户在 WebUI 看不到本地 Todo 进度
 */
function handleTodoWriteToolUse(sessionId, binding, tool_input, tool_response) {
  // 统计 todo 数量
  const todos = tool_input?.todos || [];
  const pendingCount = todos.filter(t => t.status === 'pending').length;
  const inProgressCount = todos.filter(t => t.status === 'in_progress').length;

  // 未绑定工作区时不提醒
  if (!binding?.workspaceId) {
    logHookOutput(sessionId, 'PostToolUse', 'silent', {
      tool: 'TodoWrite',
      todoCount: todos.length,
      reason: 'not_bound'
    });
    process.exit(0);
    return;
  }

  // 检查是否成功
  const isSuccess = tool_response?.success !== false;
  if (!isSuccess) {
    logHookOutput(sessionId, 'PostToolUse', 'silent', {
      tool: 'TodoWrite',
      todoCount: todos.length,
      reason: 'not_success'
    });
    process.exit(0);
    return;
  }

  const reminder = `<tanmi-post-tool-reminder>
📋 TodoWrite 已更新 (${todos.length} 项，${inProgressCount} 进行中，${pendingCount} 待办)。

**注意：TodoWrite 是本地工具，用户在 WebUI 看不到进度。**
**MUST** 评估是否需要同步到工作区（创建节点或使用 log_append 记录）。
</tanmi-post-tool-reminder>`;

  logHookOutput(sessionId, 'PostToolUse', 'output', {
    tool: 'TodoWrite',
    todoCount: todos.length,
    pending: pendingCount,
    inProgress: inProgressCount,
    reminderType: 'todo_write'
  }, reminder);

  outputHookResponse('PostToolUse', reminder);
}

/**
 * 输出 PreToolUse 响应（符合 Claude Code 官方格式）
 * @param {string} decision - 'allow' | 'deny' | 'ask'
 * @param {string} [reason] - 拒绝时的说明原因
 */
function outputPreToolUseResponse(decision, reason) {
  const response = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision
    }
  };
  if (reason) {
    response.hookSpecificOutput.permissionDecisionReason = reason;
  }
  console.log(JSON.stringify(response));
}

/**
 * 处理 PreToolUse 事件
 * 根据工作流阶段约束检查是否允许工具调用
 */
function handlePreToolUse(sessionId, binding, input) {
  const { tool_name, tool_input } = input;

  // 未绑定工作区时的写操作检查
  if (!binding?.workspaceId) {
    // 特殊工具放行（如 session_bind、workspace_init 等）
    if (SPECIAL_ALLOW.has(tool_name)) {
      logHookOutput(sessionId, 'PreToolUse', 'allow', {
        tool: tool_name,
        reason: 'special_allow'
      });
      outputPreToolUseResponse('allow');
      return;
    }

    // 检查是否为写操作工具
    if (WRITE_TOOLS.has(tool_name)) {
      const config = getGlobalConfig();
      // 默认拒绝未绑定的写操作，除非配置明确允许
      if (!config?.security?.allowUnboundWrite) {
        logHookOutput(sessionId, 'PreToolUse', 'deny', {
          tool: tool_name,
          reason: 'unbound_write_restricted'
        });
        outputPreToolUseResponse('deny', '❌ 写操作需要先绑定工作区\n💡 使用 tanmi_help 获取帮助');
        return;
      }
    }

    // 读操作或配置允许，放行
    logHookOutput(sessionId, 'PreToolUse', 'allow', {
      tool: tool_name,
      reason: 'not_bound'
    });
    outputPreToolUseResponse('allow');
    return;
  }

  // 读取 workflow 状态
  const graph = getNodeGraph(binding.workspaceId);
  const phase = normalizeWorkflowPhase(graph?.workflow?.phase);
  const phaseSkillInvoked = graph?.workflow?.phaseSkillInvoked || false;

  // === 流程强制机制：phaseSkillInvoked=false 时阻止非白名单工具 ===
  if (!phaseSkillInvoked && !isWhitelistedForSkillInit(tool_name)) {
    const skillName = getSkillForPhase(phase);
    logHookOutput(sessionId, 'PreToolUse', 'deny', {
      tool: tool_name,
      phase: phase,
      reason: 'skill_init_required'
    });
    outputPreToolUseResponse('deny', `已进入工作区模式，必须调用 Skill(${skillName}) 并遵循工作区流程`);
    return;
  }

  // Signal 工具阶段转换预检查（双重保障，主验证在 MCP 层）
  if (tool_name?.includes('signal')) {
    const validation = validateSignalPreCheck(graph, phase, tool_input);
    if (!validation.allowed) {
      logHookOutput(sessionId, 'PreToolUse', 'deny', {
        tool: tool_name,
        phase: phase,
        reason: 'phase_transition_blocked',
        detail: validation.reason
      });
      outputPreToolUseResponse('deny', validation.reason);
      return;
    }
  }

  // 阶段约束（硬编码，后续迁移到配置文件）
  const disallowedTools = {
    'info': ['Write', 'Edit', 'MultiEdit'],
    'design': ['Write', 'Edit', 'MultiEdit'],
    'impl': []
  };

  const blocked = disallowedTools[phase] || [];
  if (blocked.includes(tool_name)) {
    const phaseLabels = { 'info': '信息收集', 'design': '方案设计', 'impl': '实现' };

    logHookOutput(sessionId, 'PreToolUse', 'deny', {
      tool: tool_name,
      phase: phase,
      reason: 'phase_constraint'
    });
    outputPreToolUseResponse('deny', `当前处于「${phaseLabels[phase]}」阶段，不允许使用 ${tool_name}。请调用 flow-impl 切换到实现阶段。`);
    return;
  }

  logHookOutput(sessionId, 'PreToolUse', 'allow', {
    tool: tool_name,
    phase: phase
  });
  outputPreToolUseResponse('allow');
}

/**
 * Signal 阶段转换预检查（简化版，完整验证在 MCP 层）
 * @param {object} graph - 节点图
 * @param {string} currentPhase - 当前阶段
 * @param {object} toolInput - 工具输入参数
 * @returns {{ allowed: boolean, reason?: string }}
 */
function validateSignalPreCheck(graph, currentPhase, toolInput) {
  // 解析目标阶段
  const SIGNAL_CODES = {
    'aW5mbw': 'info',
    'VzaWdu': 'design',
    'aW1wbA': 'impl'
  };
  const targetPhase = SIGNAL_CODES[toolInput?.code];
  if (!targetPhase) {
    return { allowed: true }; // 无效 code 由 MCP 层处理
  }

  // 同阶段转换：允许
  if (currentPhase === targetPhase) {
    return { allowed: true };
  }

  const nodes = graph?.nodes ? Object.values(graph.nodes) : [];

  // impl 转出：检查 execution 节点是否静止态
  if (currentPhase === 'impl' && (targetPhase === 'info' || targetPhase === 'design')) {
    const nonStaticExec = nodes.filter(n =>
      n.type === 'execution' &&
      (n.status === 'implementing' || n.status === 'validating')
    );
    if (nonStaticExec.length > 0) {
      const nodeNames = nonStaticExec.slice(0, 3).map(n => n.dirName || n.id).join(', ');
      return {
        allowed: false,
        reason: `阶段转换被阻止：有 ${nonStaticExec.length} 个执行任务正在进行中（${nodeNames}${nonStaticExec.length > 3 ? '...' : ''}）。请先完成或暂停这些任务。`
      };
    }
  }

  // design → impl：检查 planning 节点状态
  if (currentPhase === 'design' && targetPhase === 'impl') {
    const invalidPlanning = nodes.filter(n =>
      n.type === 'planning' &&
      n.id !== 'root' &&
      (n.status === 'pending' || n.status === 'planning')
    );
    if (invalidPlanning.length > 0) {
      const nodeNames = invalidPlanning.slice(0, 3).map(n => n.dirName || n.id).join(', ');
      return {
        allowed: false,
        reason: `阶段转换被阻止：有 ${invalidPlanning.length} 个规划节点未完成（${nodeNames}${invalidPlanning.length > 3 ? '...' : ''}）。请先完成规划。`
      };
    }

    // 检查是否有执行节点
    const hasExecution = nodes.some(n => n.type === 'execution');
    if (!hasExecution) {
      return {
        allowed: false,
        reason: '阶段转换被阻止：请先创建至少一个执行节点。'
      };
    }
  }

  // info → design：检查信息节点完成状态（允许 completed 和 cancelled）
  if (currentPhase === 'info' && targetPhase === 'design') {
    const incompleteInfo = nodes.filter(n =>
      (n.role === 'info_collection' || n.role === 'info_summary') &&
      n.status !== 'completed' &&
      n.status !== 'cancelled'
    );
    if (incompleteInfo.length > 0) {
      const nodeNames = incompleteInfo.slice(0, 3).map(n => n.dirName || n.id).join(', ');
      return {
        allowed: false,
        reason: `阶段转换被阻止：有 ${incompleteInfo.length} 个信息收集节点未完成（${nodeNames}${incompleteInfo.length > 3 ? '...' : ''}）。请先完成信息收集。`
      };
    }
  }

  // info → impl：不允许直接跳转
  if (currentPhase === 'info' && targetPhase === 'impl') {
    return {
      allowed: false,
      reason: '不允许从信息收集阶段直接跳转到实现阶段。请先进入设计阶段。'
    };
  }

  return { allowed: true };
}

/**
 * 处理 Stop 事件
 * 分析 AI 响应中是否遇到错误/阻碍，提醒记录问题
 */
function handleStop(sessionId, binding, input) {
  const fs = require('node:fs');

  // 未绑定工作区时不处理
  if (!binding?.workspaceId) {
    logHookOutput(sessionId, 'Stop', 'silent', { reason: 'not_bound' });
    process.exit(0);
    return;
  }

  // 如果已经因为 Stop hook 继续过，避免无限循环
  if (input.stop_hook_active) {
    logHookOutput(sessionId, 'Stop', 'silent', { reason: 'stop_hook_active' });
    process.exit(0);
    return;
  }

  // 节流检查：stop_error 类型，30秒内不重复提醒
  if (shouldThrottle(binding, 'stop_error', THROTTLE_MS.STOP_ERROR)) {
    logHookOutput(sessionId, 'Stop', 'throttled', { reminderType: 'stop_error' });
    process.exit(0);
    return;
  }

  // 读取 transcript 分析错误
  const transcriptPath = input.transcript_path;
  if (!transcriptPath) {
    logHookOutput(sessionId, 'Stop', 'silent', { reason: 'no_transcript' });
    process.exit(0);
    return;
  }

  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');

    // 分析最后 10 条消息
    const recentLines = lines.slice(-10);
    let errorContext = null;

    // 错误/阻碍的检测模式
    const errorPatterns = [
      /遇到了?(错误|问题|异常|失败)/,
      /出现了?(错误|问题|异常|失败)/,
      /发现了?(错误|问题|bug|Bug|BUG)/,
      /(错误|问题|异常)[:：]/,
      /无法(完成|执行|实现|解决)/,
      /不能(正常|成功)/,
      /(失败|报错|异常|崩溃)/,
      /Error:|error:|ERROR:/,
      /Exception:|exception:/,
      /failed|Failed|FAILED/,
      /blocked|Blocked|阻塞/,
      /卡住了|卡在/,
      /需要.*帮助/,
      /不确定.*如何/
    ];

    for (const line of recentLines) {
      try {
        const msg = JSON.parse(line);
        // 只分析 assistant 的消息
        if (msg.role !== 'assistant') continue;

        const text = typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content || '');

        for (const pattern of errorPatterns) {
          if (pattern.test(text)) {
            // 提取错误上下文（前后 50 字符）
            const match = text.match(pattern);
            if (match) {
              const idx = match.index || 0;
              const start = Math.max(0, idx - 30);
              const end = Math.min(text.length, idx + match[0].length + 50);
              errorContext = text.slice(start, end).replace(/\n/g, ' ').trim();
              if (start > 0) errorContext = '...' + errorContext;
              if (end < text.length) errorContext = errorContext + '...';
              break;
            }
          }
        }
        if (errorContext) break;
      } catch {
        continue;
      }
    }

    if (errorContext) {
      updateLastReminder(sessionId, 'stop_error');

      // 使用 decision: block 来提醒 AI
      const blockReason = `<tanmi-error-detected>
⚠️ 检测到可能遇到了问题或阻碍。

上下文: "${errorContext}"

**MUST** 使用 \`problem_update\` 记录当前问题和下一步计划。
</tanmi-error-detected>`;

      logHookOutput(sessionId, 'Stop', 'output', {
        errorDetected: true,
        context: errorContext.slice(0, 100),
        reminderType: 'stop_error'
      }, blockReason);

      const response = {
        decision: 'block',
        reason: blockReason
      };
      console.log(JSON.stringify(response));
    } else {
      logHookOutput(sessionId, 'Stop', 'silent', { reason: 'no_error_detected' });
      process.exit(0);
    }
  } catch {
    logHookOutput(sessionId, 'Stop', 'silent', { reason: 'read_error' });
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
        if (shouldThrottle(binding, reminderInfo.type)) {
          // 被节流，记录但不输出
          logHookOutput(sessionId, 'UserPromptSubmit', 'throttled', {
            bound: true,
            workspaceId: binding.workspaceId,
            focusNodeId,
            reminderType: reminderInfo.type,
            prompt: promptPreview
          });
          process.exit(0);
          return;
        }

        // 更新上次提醒记录
        updateLastReminder(sessionId, reminderInfo.type);

        // 输出智能提醒
        const reminderContent = `<tanmi-smart-reminder>\n${reminderInfo.message}\n</tanmi-smart-reminder>`;

        logHookOutput(sessionId, 'UserPromptSubmit', 'output', {
          bound: true,
          workspaceId: binding.workspaceId,
          focusNodeId,
          reminderType: reminderInfo.type,
          prompt: promptPreview
        }, reminderContent);

        outputHookResponse('UserPromptSubmit', reminderContent);
        return;
      }
    }

    // 无需提醒，静默退出
    logHookOutput(sessionId, 'UserPromptSubmit', 'silent', {
      bound: true,
      workspaceId: binding.workspaceId,
      focusNodeId: focusNodeId || null,
      reason: focusNodeId ? 'no_reminder_needed' : 'no_focus_node',
      prompt: promptPreview
    });
    process.exit(0);
    return;
  }

  // 未绑定：检测用户消息是否涉及工作区
  const hasKeywords = containsWorkspaceKeywords(userPrompt);

  if (hasKeywords) {
    // 检测到工作区关键词，提醒绑定
    const reminder = generateBindingReminder(sessionId, 'claude-code');

    logHookOutput(sessionId, 'UserPromptSubmit', 'output', {
      bound: false,
      keywordDetected: true,
      prompt: promptPreview
    }, reminder);

    outputHookResponse('UserPromptSubmit', reminder);
  } else {
    // 普通对话，静默退出
    logHookOutput(sessionId, 'UserPromptSubmit', 'silent', {
      bound: false,
      keywordDetected: false,
      prompt: promptPreview
    });
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
      handleSessionStart(sessionId, binding, input);
      break;

    case 'UserPromptSubmit':
      handleUserPromptSubmit(sessionId, binding, input);
      break;

    case 'PostToolUse':
      handlePostToolUse(sessionId, binding, input);
      break;

    case 'PreToolUse':
      handlePreToolUse(sessionId, binding, input);
      break;

    case 'Stop':
      handleStop(sessionId, binding, input);
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
