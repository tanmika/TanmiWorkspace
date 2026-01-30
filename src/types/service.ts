// src/types/service.ts
// Service 层通用类型定义

/**
 * Service 调用来源标识
 * - mcp: MCP 工具调用（最严格，强制验证所有 hash）
 * - http: HTTP API 调用（自动补全 hash）
 * - internal: 内部调用（跳过验证）
 */
export type ServiceCallSource = 'mcp' | 'http' | 'internal';

/**
 * Service 调用选项
 */
export interface ServiceCallOptions {
  source?: ServiceCallSource;  // 默认 'mcp'
}
