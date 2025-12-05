// src/utils/time.ts

/**
 * 获取当前时间的 ISO 8601 格式字符串
 */
export function now(): string {
  return new Date().toISOString();
}

/**
 * 格式化时间为简短格式 (用于日志显示)
 * 例如: "2024-01-15 14:30:25"
 */
export function formatShort(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化时间为 HH:mm 格式 (用于日志记录)
 * 例如: "14:30"
 */
export function formatHHmm(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
