/**
 * 输出适配器
 * 用于将 Service 层的完整输出转换为不同消费者（前端/AI）需要的格式
 */

import type { NodeListResult, NodeTreeItem } from "../types/node.js";
import type { WorkspaceListResult, WorkspaceGetResult, LogEntry } from "../types/workspace.js";

// ========== AI 简化类型 ==========

/**
 * 简化版节点树项（AI 用）
 * 只保留 id 和 title，用于节点查找和定位
 */
export interface LiteNodeTreeItem {
  id: string;
  title: string;
  children?: LiteNodeTreeItem[];
}

/**
 * 简化版节点列表结果（AI 用）
 */
export interface LiteNodeListResult {
  tree: LiteNodeTreeItem;
}

/**
 * 简化版工作区列表项（AI 用）
 * 只保留 id, name, projectRoot
 * status 仅在 filter="all" 时保留
 */
export interface LiteWorkspaceListItem {
  id: string;
  name: string;
  projectRoot: string;
  status?: string;  // 仅在 filter="all" 时存在
}

/**
 * 简化版工作区列表结果（AI 用）
 * - filter 非 "all" 时：顶层显示 filter 字段，各项不含 status
 * - filter 为 "all" 时：无顶层 filter，各项包含 status
 */
export interface LiteWorkspaceListResult {
  filter?: string;  // 仅在 filter 非 "all" 时存在
  workspaces: LiteWorkspaceListItem[];
}

// ========== 转换函数 ==========

/**
 * 将完整节点树转换为简化版
 */
function simplifyNodeTreeItem(item: NodeTreeItem): LiteNodeTreeItem {
  const lite: LiteNodeTreeItem = {
    id: item.id,
    title: item.title,
  };

  if (item.children && item.children.length > 0) {
    lite.children = item.children.map(simplifyNodeTreeItem);
  }

  return lite;
}

/**
 * 将完整节点列表结果转换为简化版
 */
export function simplifyNodeList(result: NodeListResult): LiteNodeListResult {
  return {
    tree: simplifyNodeTreeItem(result.tree),
  };
}

/**
 * 将完整工作区列表结果转换为简化版
 * @param result 完整工作区列表
 * @param filter 过滤条件（默认 "active"）
 */
export function simplifyWorkspaceList(
  result: WorkspaceListResult,
  filter?: "active" | "archived" | "all"
): LiteWorkspaceListResult {
  const effectiveFilter = filter ?? "active";

  if (effectiveFilter === "all") {
    // all: 各项保留 status，无顶层 filter
    return {
      workspaces: result.workspaces.map(ws => ({
        id: ws.id,
        name: ws.name,
        projectRoot: ws.projectRoot,
        status: ws.status,
      })),
    };
  } else {
    // active/archived: 顶层 filter 字段，各项不含 status
    return {
      filter: effectiveFilter,
      workspaces: result.workspaces.map(ws => ({
        id: ws.id,
        name: ws.name,
        projectRoot: ws.projectRoot,
      })),
    };
  }
}

// ========== 日志压缩 ==========

/**
 * 解析日志表格
 */
function parseLogTable(content: string): LogEntry[] {
  if (!content || typeof content !== "string") {
    return [];
  }

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const entries: LogEntry[] = [];

  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (line.includes("时间") || line.includes("Time")) continue;
    if (/^\|[\s-:|]+\|$/.test(line)) continue;

    const cells = line.split("|").map(c => c.trim()).filter(Boolean);
    if (cells.length >= 3) {
      entries.push({
        time: cells[0] || "",
        operator: cells[1] as "AI" | "Human" | "system",
        event: cells[2] || "",
      });
    }
  }

  return entries;
}

/**
 * 压缩 workspace_get 的 logMd（AI 用）
 * - 截取最新 5 条
 * - 简化格式：表格 → 列表
 * - 省略 AI 操作者标注（只标注非 AI）
 */
export function compressWorkspaceLog(logMd: string): string {
  const MAX_LOG_ENTRIES = 5;
  const logs = parseLogTable(logMd);
  const recentLogs = logs.slice(-MAX_LOG_ENTRIES);

  if (recentLogs.length === 0) {
    return "";
  }

  const lines = recentLogs.map(log => {
    const operator = log.operator !== "AI" ? `[${log.operator}] ` : "";
    return `- [${log.time}] ${operator}${log.event}`;
  });

  if (logs.length > MAX_LOG_ENTRIES) {
    lines.unshift(`（共 ${logs.length} 条，显示最新 ${MAX_LOG_ENTRIES} 条）`);
  }

  return lines.join("\n");
}

// ========== 行号添加 ==========

/**
 * 为内容添加行号前缀（AI 用）
 * 格式：空格填充 + 行号 + - + 内容
 *
 * @param content 原始内容
 * @param startLine 起始行号（默认 1）
 * @returns 带行号前缀的内容
 */
export function addLineNumbers(content: string, startLine: number = 1): string {
  const lines = content.split("\n");
  const endLine = startLine + lines.length - 1;
  const lineNumWidth = Math.max(5, String(endLine).length);

  return lines
    .map((line, idx) => {
      const lineNum = startLine + idx;
      const paddedLineNum = String(lineNum).padStart(lineNumWidth, " ");
      return `${paddedLineNum}-${line}`;
    })
    .join("\n");
}

// ========== 适配器接口 ==========

/**
 * 输出适配器接口
 * 定义各工具输出的转换方法
 */
export interface OutputAdapter {
  /** 转换 node_list 输出 */
  transformNodeList(result: NodeListResult): NodeListResult | LiteNodeListResult;
  /** 转换 workspace_list 输出 */
  transformWorkspaceList(
    result: WorkspaceListResult,
    filter?: "active" | "archived" | "all"
  ): WorkspaceListResult | LiteWorkspaceListResult;
  /** 转换 workspace_get 的 logMd */
  transformWorkspaceGetLog(logMd: string): string;
}

/**
 * 前端适配器（identity，原样返回）
 */
export const frontendAdapter: OutputAdapter = {
  transformNodeList: (result) => result,
  transformWorkspaceList: (result) => result,
  transformWorkspaceGetLog: (logMd) => logMd,
};

/**
 * AI 适配器（简化格式）
 */
export const aiAdapter: OutputAdapter = {
  transformNodeList: simplifyNodeList,
  transformWorkspaceList: (result, filter) => simplifyWorkspaceList(result, filter),
  transformWorkspaceGetLog: compressWorkspaceLog,
};
