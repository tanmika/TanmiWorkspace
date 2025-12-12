/**
 * 智能提醒模块
 * 根据节点状态、日志、问题等信息智能判断是否需要提醒
 */

const { getNodeGraph, getNodeLog, getNodeProblem } = require('./workspace.cjs');

// 提醒优先级
const PRIORITY = {
  P0_PROBLEM: 0,        // 有未解决的问题
  P1_LOG_TIMEOUT: 1,    // 执行中但长时间未记录日志
  P2_ALL_COMPLETED: 2,  // 所有子节点已完成
  P3_PLAN_CONFIRM: 3,   // 计划需要用户确认
  P4_NO_LOG: 4,         // 开始执行但未记录日志
  P5_NO_PROBLEM: 5      // 执行较长时间但未记录问题
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

  // P0: 有未解决的问题
  if (problemInfo && problemInfo.problem) {
    return {
      priority: PRIORITY.P0_PROBLEM,
      type: 'problem',
      message: `⚠️ 当前有未解决问题：${problemInfo.problem}${problemInfo.nextStep ? `\n下一步：${problemInfo.nextStep}` : ''}`
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

  const focusNodeId = binding.focusedNodeId;
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
  analyzeNodeStatus,
  generateSmartReminder
};
