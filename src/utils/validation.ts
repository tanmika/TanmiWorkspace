// src/utils/validation.ts

import { TanmiError } from "../types/errors.js";

/**
 * 禁止在名称中使用的字符
 */
const INVALID_CHARS = /[/\\:*?"<>|]/;

/**
 * 验证工作区名称
 * @throws TanmiError 如果名称不合法
 */
export function validateWorkspaceName(name: string): void {
  if (!name || name.trim().length === 0) {
    throw new TanmiError("INVALID_NAME", "工作区名称不能为空");
  }
  if (INVALID_CHARS.test(name)) {
    throw new TanmiError("INVALID_NAME", "工作区名称不能包含特殊字符: / \\ : * ? \" < > |");
  }
}

/**
 * 验证节点标题
 * @throws TanmiError 如果标题不合法
 */
export function validateNodeTitle(title: string): void {
  if (!title || title.trim().length === 0) {
    throw new TanmiError("INVALID_TITLE", "节点标题不能为空");
  }
  if (INVALID_CHARS.test(title)) {
    throw new TanmiError("INVALID_TITLE", "节点标题不能包含特殊字符: / \\ : * ? \" < > |");
  }
}

/**
 * 验证 ID 是否为空
 */
export function validateId(id: string | undefined | null, type: "workspace" | "node"): void {
  if (!id || id.trim().length === 0) {
    if (type === "workspace") {
      throw new TanmiError("WORKSPACE_NOT_FOUND", "工作区 ID 不能为空");
    } else {
      throw new TanmiError("NODE_NOT_FOUND", "节点 ID 不能为空");
    }
  }
}
