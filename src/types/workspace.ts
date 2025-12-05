// src/types/workspace.ts

/**
 * 工作区索引 - 存储在 ~/.tanmi-workspace/index.json（全局）
 */
export interface WorkspaceIndex {
  version: string;                  // Schema 版本，"2.0" 支持多项目
  workspaces: WorkspaceEntry[];
}

/**
 * 工作区索引条目
 */
export interface WorkspaceEntry {
  id: string;                       // 工作区唯一标识
  name: string;                     // 工作区名称
  projectRoot: string;              // 项目根目录绝对路径
  status: WorkspaceStatus;          // 状态
  createdAt: string;                // ISO 8601 时间戳
  updatedAt: string;                // ISO 8601 时间戳
}

/**
 * 工作区状态
 */
export type WorkspaceStatus = "active" | "archived";

/**
 * 工作区配置 - 存储在 .tanmi-workspace/[workspace-id]/workspace.json
 */
export interface WorkspaceConfig {
  id: string;
  name: string;
  status: WorkspaceStatus;
  createdAt: string;
  updatedAt: string;
  rootNodeId: string;               // 默认 "root"
}

/**
 * 文档引用
 */
export interface DocRef {
  path: string;
  description: string;
}

/**
 * Workspace.md 数据结构
 */
export interface WorkspaceMdData {
  name: string;
  createdAt: string;
  updatedAt: string;
  rules: string[];
  docs: DocRef[];
  goal: string;
}

/**
 * 日志条目
 */
export interface LogEntry {
  time: string;
  operator: string;
  event: string;
}

/**
 * 问题数据
 */
export interface ProblemData {
  currentProblem: string;
  nextStep: string;
}

// ========== API 输入输出类型 ==========

/**
 * workspace_init 输入
 */
export interface WorkspaceInitParams {
  name: string;
  goal: string;
  projectRoot?: string;             // 项目根目录，默认为当前工作目录
  rules?: string[];
  docs?: DocRef[];
}

/**
 * workspace_init 输出
 */
export interface WorkspaceInitResult {
  workspaceId: string;
  path: string;
  projectRoot: string;              // 实际使用的项目根目录
  rootNodeId: string;
  webUrl?: string;                  // Web 访问地址（如果服务运行中）
}

/**
 * workspace_list 输入
 */
export interface WorkspaceListParams {
  status?: "active" | "archived" | "all";
}

/**
 * workspace_list 输出
 */
export interface WorkspaceListResult {
  workspaces: WorkspaceEntry[];
}

/**
 * workspace_get 输入
 */
export interface WorkspaceGetParams {
  workspaceId: string;
}

/**
 * workspace_get 输出
 */
export interface WorkspaceGetResult {
  config: WorkspaceConfig;
  graph: import("./node.js").NodeGraph;
  workspaceMd: string;
}

/**
 * workspace_delete 输入
 */
export interface WorkspaceDeleteParams {
  workspaceId: string;
  force?: boolean;
}

/**
 * workspace_delete 输出
 */
export interface WorkspaceDeleteResult {
  success: boolean;
}

/**
 * workspace_status 输入
 */
export interface WorkspaceStatusParams {
  workspaceId: string;
  format?: "box" | "markdown";
}

/**
 * workspace_status 输出
 */
export interface WorkspaceStatusResult {
  output: string;
  summary: {
    name: string;
    goal: string;
    status: string;
    totalNodes: number;
    completedNodes: number;
    currentFocus: string | null;
  };
}
