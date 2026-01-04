/**
 * 前端错误上报工具
 * 负责收集前端错误信息并发送到后端
 */

/** 错误类型 */
export type ErrorType = 'vue' | 'js' | 'promise' | 'api';

/** 错误上报数据结构 */
export interface ErrorReport {
  /** 错误类型 */
  type: ErrorType;
  /** 错误消息 */
  message: string;
  /** 错误堆栈 */
  stack?: string;
  /** Vue 组件名称（仅 vue 类型错误） */
  component?: string;
  /** 发生错误的页面 URL */
  url?: string;
  /** 额外信息 */
  extra?: Record<string, unknown>;
}

/** 上报端点 */
const REPORT_ENDPOINT = '/api/logs/client';

/**
 * 上报错误到后端
 * 使用 fetch 发送 POST 请求，失败时静默处理
 * @param report 错误上报数据
 */
export function reportError(report: ErrorReport): void {
  // 自动补充当前页面 URL
  const payload: ErrorReport = {
    ...report,
    url: report.url ?? (typeof window !== 'undefined' ? window.location.href : undefined),
  };

  // 使用 fetch 发送请求，静默处理所有错误
  try {
    fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      // 静默处理网络错误，避免上报错误导致更多错误
    });
  } catch {
    // 静默处理同步错误（如 JSON.stringify 失败）
  }
}
