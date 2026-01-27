// src/utils/paramValidator.ts
// MCP 工具参数验证与自动纠错

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * 参数验证结果
 */
export interface ParamValidationResult {
  /** 纠正后的参数（可直接使用） */
  correctedArgs: Record<string, unknown>;
  /** 警告信息（自动纠正的参数） */
  warnings: string[];
  /** 错误信息（无法纠正的参数） */
  errors: string[];
}

/**
 * 自动纠正的相似度阈值
 * >= 此值时自动纠正并警告，< 此值时报错
 */
const AUTO_CORRECT_THRESHOLD = 0.8;

/**
 * 给出建议的最低相似度阈值
 * >= 此值时在错误信息中给出"是否想使用 xxx？"的建议
 * < 此值时只列出支持的参数，不给出具体建议
 */
const SUGGEST_THRESHOLD = 0.5;

/**
 * 计算两个字符串的 Levenshtein 编辑距离
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 0;
  if (aLower.length === 0) return bLower.length;
  if (bLower.length === 0) return aLower.length;

  // 创建距离矩阵
  const matrix: number[][] = [];

  // 初始化第一列
  for (let i = 0; i <= bLower.length; i++) {
    matrix[i] = [i];
  }

  // 初始化第一行
  for (let j = 0; j <= aLower.length; j++) {
    matrix[0][j] = j;
  }

  // 填充矩阵
  for (let i = 1; i <= bLower.length; i++) {
    for (let j = 1; j <= aLower.length; j++) {
      const cost = bLower[i - 1] === aLower[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // 删除
        matrix[i][j - 1] + 1,     // 插入
        matrix[i - 1][j - 1] + cost // 替换
      );
    }
  }

  return matrix[bLower.length][aLower.length];
}

/**
 * 计算两个字符串的相似度 (0-1)
 * 1 表示完全相同，0 表示完全不同
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * 从 Tool schema 中提取有效参数名列表
 */
export function getSchemaProperties(tool: Tool): string[] {
  const schema = tool.inputSchema;
  if (!schema || typeof schema !== "object") return [];

  const properties = (schema as { properties?: Record<string, unknown> }).properties;
  if (!properties || typeof properties !== "object") return [];

  return Object.keys(properties);
}

/**
 * 找到最相似的参数名
 * @returns [最相似的参数名, 相似度] 或 null（如果没有找到）
 */
function findMostSimilar(
  unknownParam: string,
  validParams: string[]
): [string, number] | null {
  if (validParams.length === 0) return null;

  let bestMatch: string | null = null;
  let bestSimilarity = 0;

  for (const validParam of validParams) {
    const sim = similarity(unknownParam, validParam);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestMatch = validParam;
    }
  }

  return bestMatch ? [bestMatch, bestSimilarity] : null;
}

/**
 * 允许空字符串的字段白名单
 * 格式：{ toolName: [fieldName, ...] }
 */
const ALLOW_EMPTY_STRING: Record<string, string[]> = {
  // 暂时没有需要允许空字符串的必填字段
};

/**
 * 允许空数组的字段白名单
 * 格式：{ toolName: [fieldName, ...] }
 */
const ALLOW_EMPTY_ARRAY: Record<string, string[]> = {
  // 暂时没有需要允许空数组的必填字段
};

/**
 * 判断字段是否允许空字符串
 */
function isEmptyStringAllowed(toolName: string, field: string): boolean {
  return ALLOW_EMPTY_STRING[toolName]?.includes(field) ?? false;
}

/**
 * 判断字段是否允许空数组
 */
function isEmptyArrayAllowed(toolName: string, field: string): boolean {
  return ALLOW_EMPTY_ARRAY[toolName]?.includes(field) ?? false;
}

/**
 * 检查值是否为"空"（undefined、null、空字符串、纯空白字符串、空数组）
 */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * 验证并纠正 MCP 工具参数
 *
 * @param toolName 工具名称（用于错误提示）
 * @param args 用户传入的参数
 * @param tool 工具定义（包含 inputSchema）
 * @returns 验证结果，包含纠正后的参数、警告和错误
 */
export function validateAndCorrectParams(
  toolName: string,
  args: Record<string, unknown> | undefined,
  tool: Tool
): ParamValidationResult {
  const result: ParamValidationResult = {
    correctedArgs: { ...(args || {}) },
    warnings: [],
    errors: [],
  };

  const schema = tool.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };

  const validParams = getSchemaProperties(tool);

  // ========== 未知参数检测与自动纠正（优先于必填检查） ==========
  // 必须先执行自动纠正，否则命名变体（如 new_str→newStr）
  // 会在必填检查中被误报为缺失
  if (args && Object.keys(args).length > 0 && validParams.length > 0) {
    const inputParams = Object.keys(args);

    for (const inputParam of inputParams) {
      // 跳过有效参数
      if (validParams.includes(inputParam)) {
        continue;
      }

      // 检测未知参数
      const match = findMostSimilar(inputParam, validParams);

      if (match) {
        const [suggestedParam, sim] = match;

        if (sim >= AUTO_CORRECT_THRESHOLD) {
          // 高相似度：自动纠正 + 警告
          // 只有当目标参数未被设置时才纠正
          if (result.correctedArgs[suggestedParam] === undefined) {
            result.correctedArgs[suggestedParam] = args[inputParam];
            delete result.correctedArgs[inputParam];
            result.warnings.push(
              `参数自动纠正: "${inputParam}" → "${suggestedParam}"`
            );
          } else {
            // 目标参数已存在，报错
            result.errors.push(
              `未知参数 "${inputParam}"（与已存在的 "${suggestedParam}" 冲突）`
            );
          }
        } else if (sim >= SUGGEST_THRESHOLD) {
          // 中等相似度：报错 + 建议
          result.errors.push(
            `未知参数 "${inputParam}"，是否想使用 "${suggestedParam}"？`
          );
        } else {
          // 低相似度：报错 + 列出支持参数（不给具体建议）
          result.errors.push(
            `未知参数 "${inputParam}"。${toolName} 支持的参数: ${validParams.join(", ")}`
          );
        }
      } else {
        // 没有找到相似参数
        result.errors.push(
          `未知参数 "${inputParam}"。${toolName} 支持的参数: ${validParams.join(", ")}`
        );
      }
    }
  }
  // ==============================================================

  // ========== 必填字段检查（在自动纠正之后执行） ==========
  const requiredFields = schema.required || [];
  for (const field of requiredFields) {
    const value = result.correctedArgs[field];

    if (value === undefined || value === null) {
      // 完全缺失
      result.errors.push(`缺少必填参数 '${field}'`);
    } else if (typeof value === "string" && value.trim() === "") {
      // 空字符串或纯空白
      if (!isEmptyStringAllowed(toolName, field)) {
        result.errors.push(`参数 '${field}' 不能为空`);
      }
    } else if (Array.isArray(value) && value.length === 0) {
      // 空数组
      if (!isEmptyArrayAllowed(toolName, field)) {
        result.errors.push(`参数 '${field}' 不能为空数组`);
      }
    }
  }
  // ==================================

  return result;
}
