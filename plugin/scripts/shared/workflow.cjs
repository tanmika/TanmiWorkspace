/**
 * 工作流相关共享函数
 *
 * 用于 Claude Code 和 Cursor 的 Hook 脚本
 */

// 导入生成的工具白名单配置
const { SKILL_INIT_WHITELIST, SIGNAL_CODES } = require('../../hooks/generated/write-tools.cjs');

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
// 流程强制机制
// ============================================================================

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

/**
 * Signal 阶段转换预检查（简化版，完整验证在 MCP 层）
 * @param {object} graph - 节点图
 * @param {string} currentPhase - 当前阶段
 * @param {object} toolInput - 工具输入参数
 * @returns {{ allowed: boolean, reason?: string }}
 */
function validateSignalPreCheck(graph, currentPhase, toolInput) {
  // 使用导入的 SIGNAL_CODES 解析目标阶段
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

module.exports = {
  // 常量
  THROTTLE_MS,
  VALID_WORKFLOW_PHASES,
  // 函数
  isWhitelistedForSkillInit,
  normalizeWorkflowPhase,
  getSkillForPhase,
  validateSignalPreCheck
};
