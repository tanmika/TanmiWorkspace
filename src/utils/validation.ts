// src/utils/validation.ts

import * as path from "node:path";
import * as fs from "node:fs";
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

/**
 * 验证并规范化项目根目录路径
 * @param inputPath 用户输入的路径
 * @param basePath 基准路径（默认为 cwd），用于解析相对路径
 * @returns 规范化后的绝对路径
 * @throws TanmiError 如果路径不安全或不存在
 */
export function validateProjectRoot(inputPath: string, basePath: string = process.cwd()): string {
  // 1. 检查输入是否为空
  if (!inputPath || inputPath.trim().length === 0) {
    throw new TanmiError("INVALID_PATH", "项目路径不能为空");
  }

  // 2. 检查是否包含危险的路径穿越模式
  // 注意：需要在 resolve 之前检查原始输入
  const normalizedInput = inputPath.replace(/\\/g, "/");
  if (normalizedInput.includes("/../") ||
      normalizedInput.startsWith("../") ||
      normalizedInput.endsWith("/..") ||
      normalizedInput === "..") {
    throw new TanmiError("INVALID_PATH", "项目路径不能包含目录穿越 (..)");
  }

  // 3. 解析为绝对路径
  const resolvedPath = path.resolve(basePath, inputPath);

  // 4. 再次验证解析后的路径不会逃逸到意外位置
  // 确保解析后的路径在用户主目录或 basePath 下
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/";
  const isUnderHome = resolvedPath.startsWith(homeDir);
  const isUnderBase = resolvedPath.startsWith(basePath);

  if (!isUnderHome && !isUnderBase) {
    throw new TanmiError("INVALID_PATH", `项目路径必须在用户主目录或当前目录下: ${resolvedPath}`);
  }

  // 5. 验证目录存在
  if (!fs.existsSync(resolvedPath)) {
    throw new TanmiError("INVALID_PATH", `项目目录不存在: ${resolvedPath}`);
  }

  // 6. 验证是目录而非文件
  const stat = fs.statSync(resolvedPath);
  if (!stat.isDirectory()) {
    throw new TanmiError("INVALID_PATH", `路径不是目录: ${resolvedPath}`);
  }

  return resolvedPath;
}

/**
 * 验收标准接口（与 workspace.ts 中保持一致）
 */
interface AcceptanceCriteria {
  when: string;
  then: string;
  [key: string]: string;
}

/**
 * 验证 acceptanceCriteria 格式
 * 必须是 { when: string, then: string } 对象数组
 * @param acceptanceCriteria 验收标准数组
 * @param fieldPrefix 错误消息前缀（如 "acceptanceCriteria" 或 "exec.acceptanceCriteria"）
 * @throws TanmiError 如果格式不合法
 */
export function validateAcceptanceCriteria(
  acceptanceCriteria: unknown[] | undefined,
  fieldPrefix: string = "acceptanceCriteria"
): void {
  if (!acceptanceCriteria || acceptanceCriteria.length === 0) {
    return;
  }

  for (let i = 0; i < acceptanceCriteria.length; i++) {
    const ac = acceptanceCriteria[i];
    if (typeof ac === "string") {
      throw new TanmiError(
        "INVALID_ACCEPTANCE_CRITERIA",
        `${fieldPrefix}[${i}] 格式错误：收到字符串 "${ac}"，应为 { when: "条件", then: "结果" } 对象`
      );
    }
    if (typeof ac !== "object" || ac === null) {
      throw new TanmiError(
        "INVALID_ACCEPTANCE_CRITERIA",
        `${fieldPrefix}[${i}] 格式错误：应为 { when: "条件", then: "结果" } 对象`
      );
    }
    // 检查必须有 when 和 then 字段（MarkdownStorage 依赖这两个字段渲染表格）
    const acObj = ac as Record<string, unknown>;
    if (typeof acObj.when !== "string" || typeof acObj.then !== "string") {
      throw new TanmiError(
        "INVALID_ACCEPTANCE_CRITERIA",
        `${fieldPrefix}[${i}] 缺少必填字段：需要 when(string) 和 then(string)，收到 ${JSON.stringify(ac)}`
      );
    }
  }
}
