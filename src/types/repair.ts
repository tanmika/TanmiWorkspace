// src/types/repair.ts
// 工作区修复相关类型定义

/**
 * 问题严重程度
 */
export type IssueSeverity = "error" | "warning" | "info";

/**
 * 修复类型
 */
export type FixType = "auto" | "interactive" | "manual";

/**
 * 诊断问题
 */
export interface RepairIssue {
  id: string;                    // 问题唯一标识
  severity: IssueSeverity;       // 严重程度
  message: string;               // 问题描述
  detail?: string;               // 详细信息
  fixType: FixType;              // 修复类型
}

/**
 * 诊断结果
 */
export interface DiagnoseResult {
  workspaceId: string;
  workspacePath: string;
  issues: RepairIssue[];
  summary: {
    total: number;
    errors: number;
    warnings: number;
    autoFixable: number;
    interactiveFixable: number;
    manualFixable: number;
  };
}

/**
 * 修复结果
 */
export interface RepairResult {
  workspaceId: string;
  fixed: number;
  failed: number;
  skipped: number;
  details: {
    issueId: string;
    success: boolean;
    message?: string;
  }[];
}

/**
 * 诊断参数
 */
export interface DiagnoseParams {
  workspaceId: string;
}

/**
 * 修复参数
 */
export interface RepairParams {
  workspaceId: string;
  issueIds?: string[];           // 指定要修复的问题，不指定则修复所有可自动修复的
}
