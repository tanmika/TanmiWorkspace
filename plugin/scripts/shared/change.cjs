/**
 * 变更追踪共享模块
 * 用于在 Hook 中记录文件变更
 */

const fs = require('node:fs');
const path = require('node:path');
const { getWorkspaceEntry, getNodeGraph } = require('./workspace.cjs');
const { DIR_SUFFIX } = require('./config.cjs');
const { logHook } = require('./logger.cjs');

/**
 * 生成变更 ID
 * @returns {string} chg-{timestamp}-{random}
 */
function generateChangeId() {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `chg-${timestamp}-${randomPart}`;
}

/**
 * 获取活跃的执行节点列表
 * @param {object} graph - 节点图
 * @returns {string[]} 活跃执行节点 ID 列表
 */
function getActiveExecutingNodes(graph) {
  if (!graph?.nodes) return [];

  const activeNodes = [];
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    // 只计算执行节点且处于 implementing/validating 状态的
    if (
      node.type === 'execution' &&
      (node.status === 'implementing' || node.status === 'validating')
    ) {
      activeNodes.push(nodeId);
    }
  }
  return activeNodes;
}

/**
 * 获取变更索引路径
 * @param {string} projectRoot - 项目根目录
 * @param {string} wsDirName - 工作区目录名
 * @returns {string} 索引文件路径
 */
function getChangesIndexPath(projectRoot, wsDirName) {
  return path.join(projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, wsDirName, 'changes-index.json');
}

/**
 * 读取变更索引
 * @param {string} projectRoot - 项目根目录
 * @param {string} wsDirName - 工作区目录名
 * @returns {object} 变更索引
 */
function readChangesIndex(projectRoot, wsDirName) {
  const indexPath = getChangesIndexPath(projectRoot, wsDirName);
  try {
    if (fs.existsSync(indexPath)) {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
  } catch (e) {
    logHook('change', 'warn', `读取变更索引失败: ${e.message}`);
  }
  return {
    version: 1,
    ambiguous: [],
    fileIndex: {},
    sequence: []
  };
}

/**
 * 写入变更索引
 * @param {string} projectRoot - 项目根目录
 * @param {string} wsDirName - 工作区目录名
 * @param {object} index - 变更索引
 */
function writeChangesIndex(projectRoot, wsDirName, index) {
  const indexPath = getChangesIndexPath(projectRoot, wsDirName);
  const indexDir = path.dirname(indexPath);

  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

/**
 * 获取变更记录存储路径
 * @param {string} projectRoot - 项目根目录
 * @param {string} wsDirName - 工作区目录名
 * @param {string|null} nodeId - 节点 ID，null 表示 ambiguous
 * @param {string} changeId - 变更 ID
 * @param {object} graph - 节点图（用于获取节点目录名）
 * @returns {string} 变更记录文件路径
 */
function getChangeRecordPath(projectRoot, wsDirName, nodeId, changeId, graph) {
  const wsPath = path.join(projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, wsDirName);

  if (nodeId === null) {
    // ambiguous-changes 目录
    return path.join(wsPath, 'ambiguous-changes', `${changeId}.json`);
  }

  // 节点 changes 目录
  const nodeDirName = graph?.nodes?.[nodeId]?.dirName || nodeId;
  return path.join(wsPath, 'nodes', nodeDirName, 'changes', `${changeId}.json`);
}

/**
 * 写入变更记录
 * @param {string} changePath - 变更记录路径
 * @param {object} record - 变更记录
 */
function writeChangeRecord(changePath, record) {
  const changeDir = path.dirname(changePath);

  if (!fs.existsSync(changeDir)) {
    fs.mkdirSync(changeDir, { recursive: true });
  }

  fs.writeFileSync(changePath, JSON.stringify(record, null, 2), 'utf-8');
}

/**
 * 提取上下文行
 * @param {string[]} lines - 文件行数组
 * @param {number} position - 目标位置（0-based）
 * @param {number} length - 目标长度
 * @param {number} contextLines - 上下文行数
 * @returns {{ before: string[], after: string[] }}
 */
function extractContext(lines, position, length, contextLines = 3) {
  const startBefore = Math.max(0, position - contextLines);
  const endAfter = Math.min(lines.length, position + length + contextLines);

  return {
    before: lines.slice(startBefore, position),
    after: lines.slice(position + length, endAfter)
  };
}

/**
 * 在文件内容中查找字符串位置
 * @param {string} content - 文件内容
 * @param {string} target - 目标字符串
 * @returns {{ lineNumber: number, position: number } | null}
 */
function findStringPosition(content, target) {
  const lines = content.split('\n');
  const targetLines = target.split('\n');

  if (targetLines.length === 0) return null;

  // 简单实现：逐行查找
  for (let i = 0; i <= lines.length - targetLines.length; i++) {
    let match = true;
    for (let j = 0; j < targetLines.length; j++) {
      if (lines[i + j] !== targetLines[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return { lineNumber: i + 1, position: i };
    }
  }

  return null;
}

/**
 * 记录文件变更（Claude Code Edit/Write 工具）
 * @param {object} params - 参数
 * @param {string} params.workspaceId - 工作区 ID
 * @param {string} params.sessionId - 会话 ID
 * @param {string} params.toolName - 工具名（Edit/Write）
 * @param {object} params.toolInput - 工具输入
 * @param {object} params.toolResponse - 工具响应
 * @returns {{ changeId: string, nodeId: string|null, isAmbiguous: boolean } | null}
 */
function recordFileChange(params) {
  const { workspaceId, sessionId, toolName, toolInput, toolResponse } = params;

  try {
    // 获取工作区信息
    const entry = getWorkspaceEntry(workspaceId);
    if (!entry?.projectRoot) {
      logHook('change', 'debug', `工作区不存在: ${workspaceId}`);
      return null;
    }

    const projectRoot = entry.projectRoot;
    const wsDirName = entry.dirName || entry.id;

    // 获取节点图
    const graph = getNodeGraph(workspaceId);
    if (!graph) {
      logHook('change', 'debug', `无法获取节点图: ${workspaceId}`);
      return null;
    }

    // 确定活跃执行节点
    const activeNodes = getActiveExecutingNodes(graph);
    let targetNodeId = null;
    let isAmbiguous = false;

    if (activeNodes.length === 1) {
      targetNodeId = activeNodes[0];
    } else if (activeNodes.length > 1 || activeNodes.length === 0) {
      // 多个活跃节点或无活跃节点，放入 ambiguous
      targetNodeId = null;
      isAmbiguous = true;
    }

    // 构建变更操作
    const filePath = toolInput?.file_path || '';
    let operation;

    if (toolName === 'Edit') {
      // Edit 工具：精确替换
      const oldString = toolInput?.old_string || '';
      const newString = toolInput?.new_string || '';
      const originalFile = toolResponse?.originalFile || '';

      const oldLines = oldString.split('\n');
      const newLines = newString.split('\n');

      // 尝试定位变更位置
      let lineNumber;
      let contextBefore;
      let contextAfter;

      if (originalFile) {
        const pos = findStringPosition(originalFile, oldString);
        if (pos) {
          lineNumber = pos.lineNumber;
          const fileLines = originalFile.split('\n');
          const ctx = extractContext(fileLines, pos.position, oldLines.length, 3);
          contextBefore = ctx.before;
          contextAfter = ctx.after;
        }
      }

      operation = {
        type: 'update',
        filePath,
        oldLines,
        newLines,
        lineNumber,
        contextBefore,
        contextAfter
      };
    } else if (toolName === 'Write') {
      // Write 工具：新建或覆盖文件
      const content = toolInput?.content || '';
      const isNewFile = toolResponse?.isNewFile;

      if (isNewFile) {
        operation = {
          type: 'add',
          filePath,
          content
        };
      } else {
        // 覆盖文件
        operation = {
          type: 'overwrite',
          filePath,
          // 注意：原始内容可能无法获取
          newContent: content
        };
      }
    } else {
      logHook('change', 'debug', `不支持的工具: ${toolName}`);
      return null;
    }

    // 生成变更记录
    const changeId = generateChangeId();
    const timestamp = new Date().toISOString();

    const record = {
      id: changeId,
      nodeId: targetNodeId,
      timestamp,
      sessionId,
      client: 'claude-code',
      operation
    };

    // 写入变更记录
    const changePath = getChangeRecordPath(projectRoot, wsDirName, targetNodeId, changeId, graph);
    writeChangeRecord(changePath, record);

    // 更新索引
    const changesIndex = readChangesIndex(projectRoot, wsDirName);

    if (isAmbiguous) {
      changesIndex.ambiguous.push(changeId);
    }

    // 更新文件索引
    if (!changesIndex.fileIndex[filePath]) {
      changesIndex.fileIndex[filePath] = [];
    }
    changesIndex.fileIndex[filePath].push({
      nodeId: targetNodeId || '',
      changeId
    });

    // 更新序列
    changesIndex.sequence.push({
      nodeId: targetNodeId,
      changeId
    });

    writeChangesIndex(projectRoot, wsDirName, changesIndex);

    logHook('change', 'info', `记录变更: ${changeId} -> ${targetNodeId || 'ambiguous'}`, {
      filePath,
      operationType: operation.type,
      isAmbiguous
    });

    return {
      changeId,
      nodeId: targetNodeId,
      isAmbiguous
    };
  } catch (e) {
    logHook('change', 'error', `记录变更失败: ${e.message}`, {
      workspaceId,
      toolName,
      error: e.stack
    });
    return null;
  }
}

/**
 * 获取工作区待认领变更数量
 * @param {string} workspaceId - 工作区 ID
 * @returns {number} 待认领变更数量
 */
function getAmbiguousChangeCount(workspaceId) {
  try {
    const entry = getWorkspaceEntry(workspaceId);
    if (!entry?.projectRoot) return 0;

    const changesIndex = readChangesIndex(entry.projectRoot, entry.dirName || entry.id);
    return changesIndex.ambiguous?.length || 0;
  } catch {
    return 0;
  }
}

module.exports = {
  generateChangeId,
  getActiveExecutingNodes,
  readChangesIndex,
  writeChangesIndex,
  recordFileChange,
  getAmbiguousChangeCount,
  extractContext,
  findStringPosition
};
