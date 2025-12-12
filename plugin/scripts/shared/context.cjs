/**
 * 上下文生成逻辑
 */

/**
 * 生成工作区上下文注入内容
 * @param {object} binding - 会话绑定信息
 * @param {object} config - 工作区配置
 * @param {object} workspaceMdData - 工作区 Markdown 数据
 * @param {object} graph - 节点图
 * @param {object} focusedNodeInfo - 聚焦节点信息
 * @returns {string} 上下文内容
 */
function generateWorkspaceContext(binding, config, workspaceMdData, graph, focusedNodeInfo) {
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

  // 添加聚焦节点信息（优先使用 graph.currentFocus 作为权威来源）
  const focusNodeId = graph?.currentFocus || binding.focusedNodeId;
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
 * 生成 sessionId 注入内容（让 AI 知道自己的会话 ID）
 * @param {string} sessionId - 会话 ID
 * @param {string} platform - 平台标识 ('claude-code' | 'cursor')
 * @returns {string} 注入内容
 */
function generateSessionIdContext(sessionId, platform = 'claude-code') {
  const idName = platform === 'cursor' ? 'conversation_id' : 'sessionId';
  const paramName = platform === 'cursor' ? 'sessionId' : 'sessionId';

  return `<tanmi-session-info>
当前会话 ID: ${sessionId}
如需使用 TanmiWorkspace 管理任务，请调用: session_bind(${paramName}="${sessionId}", workspaceId="...")
可用 session_status(${paramName}="${sessionId}") 查看可用工作区列表。
</tanmi-session-info>`;
}

/**
 * 生成绑定提醒内容（未绑定但检测到工作区关键词时）
 * @param {string} sessionId - 会话 ID
 * @param {string} platform - 平台标识 ('claude-code' | 'cursor')
 * @returns {string} 提醒内容
 */
function generateBindingReminder(sessionId, platform = 'claude-code') {
  const paramName = platform === 'cursor' ? 'sessionId' : 'sessionId';

  return `<tanmi-workspace-reminder>
检测到可能涉及工作区任务，但当前会话未绑定工作区。
如需使用 TanmiWorkspace 功能，请先绑定：
- 查看可用工作区: session_status(${paramName}="${sessionId}")
- 绑定工作区: session_bind(${paramName}="${sessionId}", workspaceId="...")
</tanmi-workspace-reminder>`;
}

/**
 * 获取完整的工作区上下文（组合调用）
 * @param {object} binding - 会话绑定信息
 * @returns {string|null} 上下文内容或 null
 */
function getFullWorkspaceContext(binding) {
  const { getWorkspaceConfig, getWorkspaceMdData, getNodeGraph, getNodeInfo } = require('./workspace.cjs');

  const config = getWorkspaceConfig(binding.workspaceId);
  if (!config) {
    return null;
  }

  const workspaceMdData = getWorkspaceMdData(binding.workspaceId);
  const graph = getNodeGraph(binding.workspaceId);
  // 优先使用 graph.currentFocus 作为权威来源
  const focusNodeId = graph?.currentFocus || binding.focusedNodeId;
  const focusedNodeInfo = focusNodeId ? getNodeInfo(binding.workspaceId, focusNodeId) : null;

  if (workspaceMdData) {
    return generateWorkspaceContext(binding, config, workspaceMdData, graph, focusedNodeInfo);
  }

  return null;
}

module.exports = {
  generateWorkspaceContext,
  generateSessionIdContext,
  generateBindingReminder,
  getFullWorkspaceContext
};
