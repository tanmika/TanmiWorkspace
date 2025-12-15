/**
 * 智能提醒模块
 * 根据节点状态、日志、问题等信息智能判断是否需要提醒
 */

const fs = require('node:fs');
const path = require('node:path');
const { getNodeGraph, getNodeLog, getNodeProblem, getWorkspaceEntry } = require('./workspace.cjs');
const { DIR_SUFFIX } = require('./config.cjs');

// 提醒优先级
const PRIORITY = {
  P0_PROBLEM: 0,        // 有未解决的问题
  P1_LOG_TIMEOUT: 1,    // 执行中但长时间未记录日志
  P2_ALL_COMPLETED: 2,  // 所有子节点已完成
  P3_PLAN_CONFIRM: 3,   // 计划需要用户确认
  P4_NO_LOG: 4,         // 开始执行但未记录日志
  P5_NO_PROBLEM: 5,     // 执行较长时间但未记录问题
  P6_FAILED_NODE: 6,    // 执行节点失败后引导
  P7_NO_DOCS: 7         // 执行中但无文档引用
};

// 时间阈值（分钟）
const THRESHOLDS = {
  LOG_TIMEOUT: 3,       // 日志超时阈值
  NO_LOG_START: 1,      // 开始后无日志阈值
  NO_PROBLEM: 5         // 无问题记录阈值
};

/**
 * 计算时间差（分钟）
 * @param {string} timeStr - 时间字符串 (格式: YYYY-MM-DD HH:mm:ss)
 * @returns {number} 分钟数
 */
function getMinutesSince(timeStr) {
  if (!timeStr) return Infinity;

  try {
    // 解析时间字符串
    const parsed = new Date(timeStr.replace(' ', 'T'));
    if (isNaN(parsed.getTime())) return Infinity;

    const now = new Date();
    const diffMs = now.getTime() - parsed.getTime();
    return Math.floor(diffMs / 60000);
  } catch {
    return Infinity;
  }
}

/**
 * 解析 ISO 时间字符串
 * @param {string} isoStr - ISO 格式时间字符串
 * @returns {number} 分钟数
 */
function getMinutesSinceISO(isoStr) {
  if (!isoStr) return Infinity;

  try {
    const parsed = new Date(isoStr);
    if (isNaN(parsed.getTime())) return Infinity;

    const now = new Date();
    const diffMs = now.getTime() - parsed.getTime();
    return Math.floor(diffMs / 60000);
  } catch {
    return Infinity;
  }
}

/**
 * 检查节点是否有文档引用
 * @param {string} workspaceId - 工作区 ID
 * @param {string} nodeId - 节点 ID
 * @returns {boolean} 是否有文档引用
 */
function hasDocumentReferences(workspaceId, nodeId) {
  const entry = getWorkspaceEntry(workspaceId);
  if (!entry || !entry.projectRoot) {
    return true; // 无法确认时不提醒
  }

  const infoPath = path.join(entry.projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, workspaceId, 'nodes', nodeId, 'Info.md');
  try {
    const content = fs.readFileSync(infoPath, 'utf-8');
    // 查找文档引用区块
    const docsMatch = content.match(/## 文档引用\n\n([\s\S]*?)(?=\n##|$)/);
    if (!docsMatch) {
      return false;
    }
    // 检查是否有实际的文档引用（排除"无"或空内容）
    const docsText = docsMatch[1].trim();
    if (!docsText || docsText === '无' || docsText === '（无）') {
      return false;
    }
    // 检查是否有 active 状态的文档
    return docsText.includes('- ') && !docsText.includes('[expired]');
  } catch {
    return true; // 文件读取失败时不提醒
  }
}

/**
 * 分析节点状态，返回需要的提醒
 * @param {string} workspaceId - 工作区 ID
 * @param {string} nodeId - 节点 ID
 * @returns {object|null} 提醒信息 { priority, type, message } 或 null
 */
function analyzeNodeStatus(workspaceId, nodeId) {
  const graph = getNodeGraph(workspaceId);
  if (!graph || !graph.nodes || !graph.nodes[nodeId]) {
    return null;
  }

  const node = graph.nodes[nodeId];
  const status = node.status;
  const nodeType = node.type;
  const parentId = node.parentId;

  // 获取日志和问题信息
  const logInfo = getNodeLog(workspaceId, nodeId);
  const problemInfo = getNodeProblem(workspaceId, nodeId);

  // P0: 有未解决的问题（排除空问题占位符）
  const hasProblem = problemInfo && problemInfo.problem &&
    problemInfo.problem !== '（暂无）' &&
    problemInfo.problem !== '暂无' &&
    problemInfo.problem.trim() !== '';
  if (hasProblem) {
    return {
      priority: PRIORITY.P0_PROBLEM,
      type: 'problem',
      message: `⚠️ 当前有未解决问题：${problemInfo.problem}${problemInfo.nextStep ? `\n下一步：${problemInfo.nextStep}` : ''}`
    };
  }

  // P6: 执行节点失败后引导
  if (nodeType === 'execution' && status === 'failed') {
    return {
      priority: PRIORITY.P6_FAILED_NODE,
      type: 'failed_node',
      message: `❌ 任务执行失败。请分析失败原因：
- 如果是可修复的问题（如临时错误、配置问题），使用 node_transition(action="retry") 重试
- 如果任务过于复杂或需要重新规划，回到父规划节点 ${parentId || 'root'} 重新分解任务`
    };
  }

  // 执行节点状态检查
  if (nodeType === 'execution' && status === 'implementing') {
    const nodeUpdatedAt = node.updatedAt;
    const minutesSinceUpdate = getMinutesSinceISO(nodeUpdatedAt);

    // 获取日志时间
    const lastLogTime = logInfo?.lastTime;
    const minutesSinceLog = getMinutesSince(lastLogTime);
    const hasLog = logInfo && logInfo.entryCount > 0;

    // P4: 开始执行但未记录日志（1分钟）
    if (!hasLog && minutesSinceUpdate >= THRESHOLDS.NO_LOG_START) {
      return {
        priority: PRIORITY.P4_NO_LOG,
        type: 'no_log',
        message: `💡 任务已开始 ${minutesSinceUpdate} 分钟但未记录日志，建议用 log_append 记录执行过程`
      };
    }

    // P1: 执行中但长时间未记录日志（3分钟）
    if (hasLog && minutesSinceLog >= THRESHOLDS.LOG_TIMEOUT) {
      return {
        priority: PRIORITY.P1_LOG_TIMEOUT,
        type: 'log_timeout',
        message: `💡 任务执行中，已 ${minutesSinceLog} 分钟未记录日志，建议用 log_append 记录进展`
      };
    }

    // P5: 执行较长时间但未记录问题（5分钟）
    if (minutesSinceUpdate >= THRESHOLDS.NO_PROBLEM && (!problemInfo || !problemInfo.problem)) {
      return {
        priority: PRIORITY.P5_NO_PROBLEM,
        type: 'no_problem',
        message: `💡 任务已执行 ${minutesSinceUpdate} 分钟，如遇到阻塞请用 problem_update 记录问题和下一步计划`
      };
    }

    // P7: 执行中但无文档引用（仅在执行超过1分钟后提醒）
    if (minutesSinceUpdate >= THRESHOLDS.NO_LOG_START && !hasDocumentReferences(workspaceId, nodeId)) {
      return {
        priority: PRIORITY.P7_NO_DOCS,
        type: 'no_docs',
        message: `📄 当前节点无文档引用。如需参考文档请用 node_reference 添加，或确认父节点是否遗漏派发文档。`
      };
    }
  }

  // 规划节点状态检查
  if (nodeType === 'planning') {
    const children = node.children || [];

    // P2: monitoring 状态且所有子节点已完成
    if (status === 'monitoring' && children.length > 0) {
      const allCompleted = children.every(childId => {
        const child = graph.nodes[childId];
        return child && ['completed', 'failed', 'cancelled'].includes(child.status);
      });

      if (allCompleted) {
        return {
          priority: PRIORITY.P2_ALL_COMPLETED,
          type: 'all_completed',
          message: `✅ 所有 ${children.length} 个子节点已完成，请调用 node_transition(action="complete") 汇总结论`
        };
      }
    }

    // P3: planning 状态 + 有子节点 + 是根节点的直接子节点
    if (status === 'planning' && children.length > 0 && parentId === 'root') {
      return {
        priority: PRIORITY.P3_PLAN_CONFIRM,
        type: 'plan_confirm',
        message: `📋 计划已创建 ${children.length} 个子节点，请向用户展示计划并等待确认后再开始执行`
      };
    }
  }

  return null;
}

/**
 * 生成智能提醒内容
 * @param {object} binding - 会话绑定信息
 * @returns {string|null} 提醒内容或 null
 */
function generateSmartReminder(binding) {
  if (!binding || !binding.workspaceId) {
    return null;
  }

  // 获取聚焦节点（优先使用 graph.currentFocus 作为权威来源）
  const graph = getNodeGraph(binding.workspaceId);
  const focusNodeId = graph?.currentFocus || binding.focusedNodeId;
  if (!focusNodeId) {
    return null;
  }

  const reminder = analyzeNodeStatus(binding.workspaceId, focusNodeId);
  if (!reminder) {
    return null;
  }

  return `<tanmi-smart-reminder>\n${reminder.message}\n</tanmi-smart-reminder>`;
}

module.exports = {
  PRIORITY,
  THRESHOLDS,
  getMinutesSince,
  getMinutesSinceISO,
  hasDocumentReferences,
  analyzeNodeStatus,
  generateSmartReminder
};
