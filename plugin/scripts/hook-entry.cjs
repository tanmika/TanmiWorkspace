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

  if (isError) {
    const toolPath = tool_name.replace('mcp__tanmi-workspace__', 'tanmi-workspace/');
    const reminder = `<tanmi-mcp-error-hint>
⚠️ MCP 调用可能使用了错误的参数名。

请运行以下命令查看正确的参数 schema：
\`\`\`bash
mcp-cli info ${toolPath}
\`\`\`

然后使用正确的参数名重试。
</tanmi-mcp-error-hint>`;

    logHook(sessionId, 'PostToolUse', {
      tool: toolPath,
      error: true,
      response: responseStr.slice(0, 200)
    });

    outputHookResponse('PostToolUse', reminder);
  } else {
    process.exit(0);
  }
}

/**
 * 处理文件编辑工具 (Edit/Write)
 * 成功后提醒记录日志
 */
function handleFileToolUse(sessionId, binding, tool_name, tool_input, tool_response) {
  // 未绑定工作区时不提醒
  if (!binding?.workspaceId) {
    process.exit(0);
    return;
  }

  // 检查是否成功
  const isSuccess = tool_response?.success !== false;
  if (!isSuccess) {
    process.exit(0);
    return;
  }

  // 节流检查：file_changed 类型，1分钟内不重复提醒
  if (shouldThrottle(binding, 'file_changed', 60000)) {
    process.exit(0);
    return;
  }

  const filePath = tool_input?.file_path || '';
  const fileName = filePath.split('/').pop() || filePath;

  const reminder = `<tanmi-post-tool-reminder>
📝 文件 \`${fileName}\` 已${tool_name === 'Edit' ? '编辑' : '写入'}。

建议：使用 \`log_append\` 记录本次变更的内容和目的，保持工作可追溯。
</tanmi-post-tool-reminder>`;

  updateLastReminder(sessionId, 'file_changed');
  logHook(sessionId, 'PostToolUse', {
    tool: tool_name,
    file: fileName,
    reminder: 'file_changed'
  });

  outputHookResponse('PostToolUse', reminder);
}

/**
 * 处理 Bash 命令
 * 失败后提醒记录问题
 */
function handleBashToolUse(sessionId, binding, tool_input, tool_response) {
  // 未绑定工作区时不提醒
  if (!binding?.workspaceId) {
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
    process.exit(0);
    return;
  }

  // 节流检查：bash_error 类型，30秒内不重复提醒
  if (shouldThrottle(binding, 'bash_error', 30000)) {
    process.exit(0);
    return;
  }

  const command = tool_input?.command || '';
  const cmdPreview = command.length > 50 ? command.slice(0, 50) + '...' : command;

  const reminder = `<tanmi-post-tool-reminder>
⚠️ 命令执行出错${hasExitError ? ` (exit code: ${exitCode})` : ''}。

命令: \`${cmdPreview}\`

建议：使用 \`problem_update\` 记录遇到的问题和解决思路，便于追踪和复盘。
</tanmi-post-tool-reminder>`;

  updateLastReminder(sessionId, 'bash_error');
  logHook(sessionId, 'PostToolUse', {
    tool: 'Bash',
    command: cmdPreview,
    exitCode,
    reminder: 'bash_error'
  });

  outputHookResponse('PostToolUse', reminder);
}

/**
 * 处理 Stop 事件
 * 分析 AI 响应中是否遇到错误/阻碍，提醒记录问题
 */
function handleStop(sessionId, binding, input) {
  const fs = require('node:fs');

  // 未绑定工作区时不处理
  if (!binding?.workspaceId) {
    process.exit(0);
    return;
  }

  // 如果已经因为 Stop hook 继续过，避免无限循环
  if (input.stop_hook_active) {
    process.exit(0);
    return;
  }

  // 节流检查：stop_error 类型，30秒内不重复提醒
  if (shouldThrottle(binding, 'stop_error', 30000)) {
    process.exit(0);
    return;
  }

  // 读取 transcript 分析错误
  const transcriptPath = input.transcript_path;
  if (!transcriptPath) {
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
      logHook(sessionId, 'Stop', {
        error: true,
        context: errorContext.slice(0, 100)
      });

      // 使用 decision: block 来提醒 AI
      const response = {
        decision: 'block',
        reason: `<tanmi-error-detected>
⚠️ 检测到可能遇到了问题或阻碍。

上下文: "${errorContext}"

建议：使用 \`problem_update\` 记录当前问题和下一步计划，便于追踪和复盘。
如果问题已解决，可以忽略此提醒。
</tanmi-error-detected>`
      };
      console.log(JSON.stringify(response));
    } else {
      process.exit(0);
    }
  } catch {
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

    case 'PostToolUse':
      handlePostToolUse(sessionId, binding, input);
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
