// src/types/health.ts

// 健康问题类型 - union type
export type HealthIssueType =
  | "version_mismatch"  // 版本不匹配
  | "index_corrupt"     // 索引损坏
  | "node_corrupt"      // 节点损坏
  | "dir_missing"       // 目录缺失
  | "graph_corrupt"     // 图结构损坏
  | "config_corrupt";   // 配置损坏

// 问题严重程度 - union type
export type IssueSeverity = "error" | "warning";

// 健康问题详情
export interface HealthIssue {
  type: HealthIssueType;
  severity: IssueSeverity;
  target?: string;      // 受影响目标：workspaceId 或 nodeId
  message: string;      // 问题描述
  suggestion: string;   // 修复建议
}

// 单个工作区的健康检测结果（供 HealthService 内部使用）
export interface WorkspaceHealthResult {
  workspaceId: string;
  workspaceName: string;
  status: "healthy" | "warning" | "error";
  issues: HealthIssue[];
}

// 健康报告（workspace_health 返回值）
export interface HealthReport {
  status: "healthy" | "warning" | "error";
  checkedAt: string;    // ISO 8601
  codeVersion: string;  // 当前代码版本
  issues: HealthIssue[];
  summary: {
    totalWorkspaces: number;
    healthyWorkspaces: number;
    warningWorkspaces: number;
    errorWorkspaces: number;
  };
}

// 备份元信息
export interface BackupMeta {
  name: string;           // 备份文件名，如 backup_2025-12-31T16-30-00.tar.gz
  workspaceId: string;
  workspaceName: string;
  createdAt: string;      // ISO 8601
  trigger: "manual" | "auto" | "pre_operation";
  codeVersion: string;
  size: number;           // 字节数
  verified: boolean;      // 是否验证通过
}

// 备份列表项 - 继承 BackupMeta 并添加路径
export interface BackupListItem extends BackupMeta {
  path: string;           // 备份文件完整路径
}

// 全局备份触发类型
export type GlobalBackupTrigger = "beta_update" | "manual" | "pre_restore";

// 全局备份清单（打包在 .twbak 内）
export interface GlobalBackupManifest {
  format: "twbak";           // 固定值
  version: "1.0";            // 格式版本
  createdAt: string;         // ISO 8601
  codeVersion: string;       // tanmi-workspace 版本
  trigger: GlobalBackupTrigger;
  checksum: string;          // 内容校验和
  contents: {
    workspaceCount: number;  // index.json 中的工作区数量
  };
}

// 全局备份列表项（API 返回）
export interface GlobalBackupItem {
  name: string;              // 文件名
  path: string;              // 完整路径
  createdAt: string;
  codeVersion: string;
  trigger: GlobalBackupTrigger;
  size: number;              // 字节数
}
