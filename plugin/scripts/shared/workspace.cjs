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

/**
 * 解析 Log.md 获取日志信息
 * @param {string} content - Markdown 内容
 * @returns {object} 解析结果 { lastEntry, lastTime, entryCount }
 */
function parseLogMd(content) {
  const result = {
    lastEntry: null,
    lastTime: null,
    entryCount: 0
  };

  // 匹配日志表格行: | 时间 | 操作者 | 事件 |
  const tableRows = content.match(/\| \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \|[^|]+\|[^|]+\|/g);
  if (!tableRows || tableRows.length === 0) {
    return result;
  }

  result.entryCount = tableRows.length;

  // 获取最后一条日志
  const lastRow = tableRows[tableRows.length - 1];
  const parts = lastRow.split('|').map(s => s.trim()).filter(s => s);
  if (parts.length >= 3) {
    result.lastTime = parts[0];
    result.lastEntry = {
      time: parts[0],
      operator: parts[1],
      event: parts[2]
    };
  }

  return result;
}

/**
 * 获取节点日志信息
 * @param {string} workspaceId - 工作区 ID
 * @param {string} nodeId - 节点 ID
 * @returns {object|null} 日志信息 { lastEntry, lastTime, entryCount }
 */
function getNodeLog(workspaceId, nodeId) {
  const entry = getWorkspaceEntry(workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  const logPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'nodes', nodeId, 'Log.md');
  try {
    const content = fs.readFileSync(logPath, 'utf-8');
    return parseLogMd(content);
  } catch {
    return null;
  }
}

/**
 * 解析 Problem.md 获取问题信息
 * @param {string} content - Markdown 内容
 * @returns {object} 解析结果 { problem, nextStep }
 */
function parseProblemMd(content) {
  const result = {
    problem: null,
    nextStep: null
  };

  // 解析当前问题
  const problemMatch = content.match(/## 当前问题\n\n([\s\S]*?)(?=\n##|$)/);
  if (problemMatch) {
    const problemText = problemMatch[1].trim();
    if (problemText && problemText !== '无') {
      result.problem = problemText;
    }
  }

  // 解析下一步计划（支持 "下一步" 和 "下一步计划" 两种格式）
  const nextStepMatch = content.match(/## 下一步(?:计划)?\n\n([\s\S]*?)(?=\n##|$)/);
  if (nextStepMatch) {
    const nextStepText = nextStepMatch[1].trim();
    if (nextStepText && nextStepText !== '无' && nextStepText !== '（暂无）') {
      result.nextStep = nextStepText;
    }
  }

  return result;
}

/**
 * 获取节点问题信息
 * @param {string} workspaceId - 工作区 ID
 * @param {string} nodeId - 节点 ID
 * @returns {object|null} 问题信息 { problem, nextStep }
 */
function getNodeProblem(workspaceId, nodeId) {
  const entry = getWorkspaceEntry(workspaceId);
  if (!entry || !entry.projectRoot) {
    return null;
  }

  const problemPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'nodes', nodeId, 'Problem.md');
  try {
    const content = fs.readFileSync(problemPath, 'utf-8');
    return parseProblemMd(content);
  } catch {
    return null;
  }
}

/**
 * 获取与指定 cwd 匹配的活跃工作区列表
 * @param {string} cwd - 当前工作目录
 * @returns {Array<object>} 匹配的工作区列表 [{ id, name, projectRoot, goal }]
 */
function getWorkspacesByCwd(cwd) {
  const index = readJsonFile(INDEX_PATH);
  if (!index || !index.workspaces) {
    return [];
  }

  // 规范化 cwd 路径
  const normalizedCwd = path.resolve(cwd);

  // 查找匹配的活跃工作区
  const matchedWorkspaces = index.workspaces
    .filter(ws => {
      // 只匹配活跃工作区
      if (ws.status !== 'active') return false;

      // 检查 projectRoot 是否匹配
      if (!ws.projectRoot) return false;
      const normalizedRoot = path.resolve(ws.projectRoot);

      // cwd 等于或是 projectRoot 的子目录
      return normalizedCwd === normalizedRoot ||
             normalizedCwd.startsWith(normalizedRoot + path.sep);
    })
    .map(ws => {
      // 获取工作区目标
      const mdData = getWorkspaceMdData(ws.id);
      return {
        id: ws.id,
        name: ws.name,
        projectRoot: ws.projectRoot,
        goal: mdData?.goal || ''
      };
    });

  return matchedWorkspaces;
}

module.exports = {
  getWorkspaceEntry,
  getWorkspaceConfig,
  getWorkspaceMdData,
  getNodeGraph,
  getNodeInfo,
  getNodeLog,
  getNodeProblem,
  parseWorkspaceMd,
  parseNodeInfo,
  parseLogMd,
  parseProblemMd,
  getWorkspacesByCwd
};
