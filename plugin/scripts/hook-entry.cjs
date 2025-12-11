#!/usr/bin/env node
/**
 * Tanmi-Workspace Hook 入口脚本
 *
 * 此脚本作为 Claude Code Hook 的入口点，负责：
 * 1. SessionStart 时始终注入 sessionId（让 AI 知道自己的会话 ID）
 * 2. 如果已绑定工作区，同时注入工作区上下文
 * 3. UserPromptSubmit 时检测工作区关键词，未绑定则提醒 AI 绑定
 *
 * 使用方式：由 Claude Code 的 Hook 机制自动调用
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ============================================================================
// 配置
// ============================================================================

// 判断是否为开发模式
const IS_DEV = process.env.NODE_ENV === 'development' || process.env.TANMI_DEV === 'true';
const DIR_SUFFIX = IS_DEV ? '-dev' : '';
const BINDINGS_PATH = path.join(os.homedir(), `.tanmi-workspace${DIR_SUFFIX}`, 'session-bindings.json');
const INDEX_PATH = path.join(os.homedir(), `.tanmi-workspace${DIR_SUFFIX}`, 'index.json');

// HTTP 端口
const HTTP_PORT = process.env.HTTP_PORT || process.env.PORT || (IS_DEV ? '3001' : '3000');
const MCP_URL = `http://localhost:${HTTP_PORT}`;

// 工作区相关关键词（用于检测用户消息是否涉及工作区）
const WORKSPACE_KEYWORDS = [
  '工作区', 'workspace', '任务', '节点', 'node',
  '继续', 'continue', '进度', 'progress',
  'tanmi', 'session_bind', 'workspace_'
];

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 读取 JSON 文件
 */
function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 读取标准输入
 */
async function readStdin() {
  return new Promise((resolve) => {
    let data = '';

    // 设置超时，防止无限等待
    const timeout = setTimeout(() => {
      resolve({});
    }, 3000);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });

    // 如果没有输入，立即结束
    if (process.stdin.isTTY) {
      clearTimeout(timeout);
      resolve({});
    }
  });
}

/**
 * 获取会话绑定信息（本地读取）
 */
function getSessionBinding(sessionId) {
  const bindings = readJsonFile(BINDINGS_PATH);
  if (!bindings || !bindings.bindings) {
    return null;
  }
  return bindings.bindings[sessionId] || null;
}

/**
 * 获取工作区配置
 */
function getWorkspaceConfig(workspaceId) {
  // 先从索引获取 projectRoot
  const index = readJsonFile(INDEX_PATH);
  if (!index || !index.workspaces) {
    return null;
  }

  const entry = index.workspaces.find(ws => ws.id === workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  // 读取工作区配置
  const configPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'workspace.json');
  return readJsonFile(configPath);
}

/**
 * 获取工作区 Markdown 数据
 */
function getWorkspaceMdData(workspaceId) {
  const index = readJsonFile(INDEX_PATH);
  if (!index || !index.workspaces) {
    return null;
  }

  const entry = index.workspaces.find(ws => ws.id === workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  // 读取 Workspace.md 并解析
  const mdPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'Workspace.md');
  try {
    const content = fs.readFileSync(mdPath, 'utf-8');
    return parseWorkspaceMd(content);
  } catch {
    return null;
  }
}

/**
 * 解析 Workspace.md
 */
function parseWorkspaceMd(content) {
  const result = {
    goal: '',
    rules: [],
    docs: []
  };

  // 解析目标
  const goalMatch = content.match(/## 目标\n\n([\s\S]*?)(?=\n##|$)/);
  if (goalMatch) {
    result.goal = goalMatch[1].trim();
  }

  // 解析规则
  const rulesMatch = content.match(/## 规则\n\n[\s\S]*?\n\n([\s\S]*?)(?=\n##|$)/);
  if (rulesMatch) {
    const rulesText = rulesMatch[1];
    result.rules = rulesText
      .split('\n')
      .filter(line => line.startsWith('- '))
      .map(line => line.slice(2).trim());
  }

  return result;
}

/**
 * 获取节点图
 */
function getNodeGraph(workspaceId) {
  const index = readJsonFile(INDEX_PATH);
  if (!index || !index.workspaces) {
    return null;
  }

  const entry = index.workspaces.find(ws => ws.id === workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  const graphPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'graph.json');
  return readJsonFile(graphPath);
}

/**
 * 获取节点信息
 */
function getNodeInfo(workspaceId, nodeId) {
  const index = readJsonFile(INDEX_PATH);
  if (!index || !index.workspaces) {
    return null;
  }

  const entry = index.workspaces.find(ws => ws.id === workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  const infoPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'nodes', nodeId, 'Info.md');
  try {
    const content = fs.readFileSync(infoPath, 'utf-8');
    return parseNodeInfo(content);
  } catch {
    return null;
  }
}

/**
 * 解析节点 Info.md
 */
function parseNodeInfo(content) {
  const result = {
    title: '',
    status: '',
    requirement: ''
  };

  // 解析标题
  const titleMatch = content.match(/^# (.+)$/m);
  if (titleMatch) {
    result.title = titleMatch[1].trim();
  }

  // 解析状态（从 frontmatter 或内容中）
  const statusMatch = content.match(/status:\s*(.+)/);
  if (statusMatch) {
    result.status = statusMatch[1].trim();
  }

  // 解析需求
  const reqMatch = content.match(/## 需求\n\n([\s\S]*?)(?=\n##|$)/);
  if (reqMatch) {
    result.requirement = reqMatch[1].trim();
  }

  return result;
}

/**
 * 生成上下文注入内容
 */
function generateContext(binding, config, workspaceMdData, graph, focusedNodeInfo) {
  let context = `
<tanmi-workspace-context>
## 当前工作区: ${config.name}

**目标**: ${workspaceMdData.goal}
`;

  // 添加规则
  if (workspaceMdData.rules && workspaceMdData.rules.length > 0) {
    context += `
**规则** (必须遵守):
${workspaceMdData.rules.map(r => `- ${r}`).join('\n')}
`;
  }

  // 添加聚焦节点信息
  const focusNodeId = binding.focusedNodeId || graph?.currentFocus;
  if (focusNodeId && focusedNodeInfo) {
    const nodeStatus = graph?.nodes[focusNodeId]?.status || focusedNodeInfo.status;
    context += `
**当前聚焦节点**: ${focusedNodeInfo.title}
- 节点 ID: ${focusNodeId}
- 状态: ${nodeStatus}
${focusedNodeInfo.requirement ? `- 需求: ${focusedNodeInfo.requirement}` : ''}
`;
  }

  context += `
---
**工作流程提醒**:
- 开始任务前: 调用 node_transition(action='start')
- 完成任务后: 调用 node_transition(action='complete', conclusion='...')
- 重要事件时: 调用 log_append 记录
- 遇到问题时: 调用 problem_update 记录
</tanmi-workspace-context>
`;

  return context;
}

/**
 * 输出 Hook 响应
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

/**
 * 生成 sessionId 注入内容（始终注入，让 AI 知道自己的会话 ID）
 */
function generateSessionIdContext(sessionId) {
  return `<tanmi-session-info>
当前 Claude Code 会话 ID: ${sessionId}
如需使用 TanmiWorkspace 管理任务，请调用: session_bind(sessionId="${sessionId}", workspaceId="...")
可用 session_status(sessionId="${sessionId}") 查看可用工作区列表。
</tanmi-session-info>`;
}

/**
 * 生成绑定提醒内容（未绑定但检测到工作区关键词时）
 */
function generateBindingReminder(sessionId) {
  return `<tanmi-workspace-reminder>
检测到可能涉及工作区任务，但当前会话未绑定工作区。
如需使用 TanmiWorkspace 功能，请先绑定：
- 查看可用工作区: session_status(sessionId="${sessionId}")
- 绑定工作区: session_bind(sessionId="${sessionId}", workspaceId="...")
</tanmi-workspace-reminder>`;
}

/**
 * 检测文本是否涉及工作区关键词
 */
function containsWorkspaceKeywords(text) {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return WORKSPACE_KEYWORDS.some(kw => lowerText.includes(kw.toLowerCase()));
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

/**
 * 处理 SessionStart 事件
 * 始终注入 sessionId，如果已绑定则同时注入工作区上下文
 */
function handleSessionStart(sessionId, binding) {
  let context = '';

  if (binding) {
    // 已绑定：注入工作区上下文
    const config = getWorkspaceConfig(binding.workspaceId);
    if (config) {
      const workspaceMdData = getWorkspaceMdData(binding.workspaceId);
      const graph = getNodeGraph(binding.workspaceId);
      const focusNodeId = binding.focusedNodeId || graph?.currentFocus;
      const focusedNodeInfo = focusNodeId ? getNodeInfo(binding.workspaceId, focusNodeId) : null;

      if (workspaceMdData) {
        context = generateContext(binding, config, workspaceMdData, graph, focusedNodeInfo);
      }
    }
  } else {
    // 未绑定：仅注入 sessionId 信息
    context = generateSessionIdContext(sessionId);
  }

  if (context) {
    outputHookResponse('SessionStart', context);
  } else {
    process.exit(0);
  }
}

/**
 * 处理 UserPromptSubmit 事件
 * 未绑定时检测关键词并提醒
 */
function handleUserPromptSubmit(sessionId, binding, input) {
  // 已绑定则静默（上下文已在 SessionStart 注入）
  if (binding) {
    process.exit(0);
  }

  // 未绑定：检测用户消息是否涉及工作区
  const userPrompt = input.prompt || '';

  if (containsWorkspaceKeywords(userPrompt)) {
    // 检测到工作区关键词，提醒绑定
    const reminder = generateBindingReminder(sessionId);
    outputHookResponse('UserPromptSubmit', reminder);
  } else {
    // 普通对话，静默退出
    process.exit(0);
  }
}

main().catch(() => {
  // 任何错误都静默退出，不干扰用户
  process.exit(0);
});
