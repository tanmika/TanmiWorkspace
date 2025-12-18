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
 * 派发资源限制配置
 */
export interface DispatchLimits {
  timeoutMs?: number;               // 单节点执行超时，默认 300000 (5分钟)
  maxRetries?: number;              // 最大重试次数，默认 3
}

/**
 * 派发配置 - 存储在 workspace.json 中
 */
export interface DispatchConfig {
  enabled: boolean;                 // 是否启用派发模式
  useGit: boolean;                  // 是否使用 Git 功能
  enabledAt: number;                // 启用时间戳
  originalBranch?: string;          // 派发前的原分支（Git 模式才有）
  processBranch?: string;           // 当前派发分支（Git 模式才有）
  backupBranches?: string[];        // 备份分支列表（Git 模式才有）
  limits?: DispatchLimits;          // 资源限制
}

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
  dispatch?: DispatchConfig;        // 派发配置（可选）
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
 * 项目文档信息（用于 workspace_init 扫描结果）
 */
export interface ProjectDocInfo {
  path: string;                     // 相对于 projectRoot 的路径
  hasFrontmatter: boolean;          // 是否有元文件（frontmatter）
  isFolder?: boolean;               // 是否为文档文件夹（3级目录全是.md）
}

/**
 * 项目文档扫描结果
 */
export interface ProjectDocsScanResult {
  files: ProjectDocInfo[];          // 文档文件列表
  folders: string[];                // 文档文件夹列表（当文件数超过限制时退化）
  totalFound: number;               // 实际找到的文件总数
  degraded: boolean;                // 是否退化为文件夹模式
}

/**
 * AI 必须执行的行为类型
 */
export type ActionRequiredType =
  | "ask_user"                 // 询问用户（如：是否有相关文档）
  | "show_plan"                // 向用户展示计划并等待确认
  | "check_docs"               // 提醒用户检查文档是否需要更新
  | "review_structure"         // reopen 时先查看现有结构再决定下一步
  | "ask_dispatch"             // 询问用户是否启用派发模式
  | "dispatch_task"            // 指示 AI 使用 Task tool 派发任务
  | "dispatch_complete_choice";// 派发完成，让用户选择合并策略

/**
 * AI 必须执行的行为
 * 当此字段存在时，AI 必须执行相应行为，不可忽略
 */
export interface ActionRequired {
  type: ActionRequiredType;
  message: string;                  // 给 AI 的指令说明
  data?: Record<string, unknown>;   // 附加数据（如节点列表、文档列表等）
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
  hint?: string;                    // 工作流提示
  projectDocs?: ProjectDocsScanResult;  // 项目文档扫描结果
  actionRequired?: ActionRequired;  // AI 必须执行的行为
}

/**
 * workspace_list 输入
 */
export interface WorkspaceListParams {
  status?: "active" | "archived" | "all";
  cwd?: string;  // 当前工作目录，匹配的工作区优先显示
}

/**
 * workspace_list 输出项（包含 webUrl）
 */
export interface WorkspaceListItem extends WorkspaceEntry {
  webUrl: string;
}

/**
 * workspace_list 输出
 */
export interface WorkspaceListResult {
  workspaces: WorkspaceListItem[];
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
  webUrl: string;                     // Web UI 访问地址
  rulesCount: number;                 // 规则条数
  rulesHash: string;                  // 规则内容哈希（用于验证）
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
  webUrl: string;                     // Web UI 访问地址
}

/**
 * workspace_update_rules 输入
 */
export interface WorkspaceUpdateRulesParams {
  workspaceId: string;
  action: "add" | "remove" | "replace";
  rule?: string;                      // add/remove 时使用
  rules?: string[];                   // replace 时使用
}

/**
 * workspace_update_rules 输出
 */
export interface WorkspaceUpdateRulesResult {
  success: boolean;
  rulesCount: number;
  rulesHash: string;
  rules: string[];
}

/**
 * workspace_archive 输入
 */
export interface WorkspaceArchiveParams {
  workspaceId: string;
}

/**
 * workspace_archive 输出
 */
export interface WorkspaceArchiveResult {
  success: boolean;
  archivePath: string;
}

/**
 * workspace_restore 输入
 */
export interface WorkspaceRestoreParams {
  workspaceId: string;
}

/**
 * workspace_restore 输出
 */
export interface WorkspaceRestoreResult {
  success: boolean;
  path: string;
  webUrl: string;
}
