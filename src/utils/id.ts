// src/utils/id.ts

/**
 * 生成唯一 ID
 * 使用时间戳 + 随机字符串的组合
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomPart}`;
}

/**
 * 生成工作区 ID
 */
export function generateWorkspaceId(): string {
  return `ws-${generateId()}`;
}

/**
 * 生成节点 ID
 */
export function generateNodeId(): string {
  return `node-${generateId()}`;
}
