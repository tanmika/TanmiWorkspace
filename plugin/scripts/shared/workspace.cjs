/**
 * 工作区数据读取逻辑
 */

const fs = require('node:fs');
const path = require('node:path');
const { readJsonFile } = require('./utils.cjs');
const { INDEX_PATH, DIR_SUFFIX } = require('./config.cjs');

/**
 * 获取工作区入口信息
 * @param {string} workspaceId - 工作区 ID
 * @returns {object|null} 工作区入口信息
 */
function getWorkspaceEntry(workspaceId) {
  const index = readJsonFile(INDEX_PATH);
  if (!index || !index.workspaces) {
    return null;
  }
  return index.workspaces.find(ws => ws.id === workspaceId) || null;
}

/**
 * 获取工作区配置
 * @param {string} workspaceId - 工作区 ID
 * @returns {object|null} 工作区配置
 */
function getWorkspaceConfig(workspaceId) {
  const entry = getWorkspaceEntry(workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  const configPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'workspace.json');
  return readJsonFile(configPath);
}

/**
 * 解析 Workspace.md
 * @param {string} content - Markdown 内容
 * @returns {object} 解析结果
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
 * 获取工作区 Markdown 数据
 * @param {string} workspaceId - 工作区 ID
 * @returns {object|null} 解析后的 Markdown 数据
 */
function getWorkspaceMdData(workspaceId) {
  const entry = getWorkspaceEntry(workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  const mdPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'Workspace.md');
  try {
    const content = fs.readFileSync(mdPath, 'utf-8');
    return parseWorkspaceMd(content);
  } catch {
    return null;
  }
}

/**
 * 获取节点图
 * @param {string} workspaceId - 工作区 ID
 * @returns {object|null} 节点图数据
 */
function getNodeGraph(workspaceId) {
  const entry = getWorkspaceEntry(workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  const graphPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'graph.json');
  return readJsonFile(graphPath);
}

/**
 * 解析节点 Info.md
 * @param {string} content - Markdown 内容
 * @returns {object} 解析结果
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
 * 获取节点信息
 * @param {string} workspaceId - 工作区 ID
 * @param {string} nodeId - 节点 ID
 * @returns {object|null} 节点信息
 */
function getNodeInfo(workspaceId, nodeId) {
  const entry = getWorkspaceEntry(workspaceId);
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

module.exports = {
  getWorkspaceEntry,
  getWorkspaceConfig,
  getWorkspaceMdData,
  getNodeGraph,
  getNodeInfo,
  parseWorkspaceMd,
  parseNodeInfo
};
