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

/**
 * 生成备忘 ID
 */
export function generateMemoId(): string {
  return `memo-${generateId()}`;
}

/**
 * 从 ID 中提取短 ID（时间戳部分，8位）
 * @param id 完整 ID（如 ws-mjb65az5-0wcjuu 或 node-mjb6mj4h-a60yht 或 memo-mjktac6h-49y2xe）
 * @returns 短 ID（如 mjb65az5）
 */
export function extractShortId(id: string): string {
  // 移除前缀（ws-、node- 或 memo-），取时间戳部分
  const withoutPrefix = id.replace(/^(ws-|node-|memo-)/, "");
  return withoutPrefix.split("-")[0];
}

/**
 * 清理名称，移除文件系统不安全的字符
 * 保留中文、字母、数字、下划线、短横线、空格
 */
export function sanitizeName(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, "_")  // 替换不安全字符为下划线
    .replace(/\s+/g, " ")             // 合并连续空格
    .trim()
    .substring(0, 50);                // 限制长度，避免目录名过长
}

/**
 * 生成工作区目录名
 * 格式：{sanitized_name}_{short_id}
 * 示例：UI优化_mjb65az5
 */
export function generateWorkspaceDirName(name: string, workspaceId: string): string {
  const shortId = extractShortId(workspaceId);
  const safeName = sanitizeName(name);
  return `${safeName}_${shortId}`;
}

/**
 * 生成节点目录名
 * 格式：{sanitized_title}_{short_id}
 * 示例：功能分析_mjb6mj4h
 * 注意：根节点 "root" 保持不变
 */
export function generateNodeDirName(title: string, nodeId: string): string {
  if (nodeId === "root") {
    return "root";
  }
  const shortId = extractShortId(nodeId);
  const safeTitle = sanitizeName(title);
  return `${safeTitle}_${shortId}`;
}

/**
 * 生成备忘目录名
 * 格式：{sanitized_title}_{short_id}
 * 示例：长备忘_mjktac6h
 */
export function generateMemoDirName(title: string, memoId: string): string {
  const shortId = extractShortId(memoId);
  const safeTitle = sanitizeName(title);
  return `${safeTitle}_${shortId}`;
}

/**
 * 从目录名中提取短 ID
 * @param dirName 目录名（如 UI优化_mjb65az5）
 * @returns 短 ID（如 mjb65az5）或 null
 */
export function extractShortIdFromDirName(dirName: string): string | null {
  const lastUnderscore = dirName.lastIndexOf("_");
  if (lastUnderscore === -1) {
    return null;
  }
  return dirName.substring(lastUnderscore + 1);
}
