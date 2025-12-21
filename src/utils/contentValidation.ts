// src/utils/contentValidation.ts

import { TanmiError } from "../types/errors.js";

/**
 * 验证多行内容（不能包含行首 ## 标题）
 *
 * Info.md/Problem.md/Workspace.md 使用 ## 作为 section 分隔符
 * 解析正则使用 (?=\n## |$) 作为边界，所以只有 ## 会触发边界
 *
 * 注意：# 一级标题和 ### 三级标题等不会破坏解析，允许使用
 *
 * @param content 要验证的内容
 * @param fieldName 字段名称（用于错误信息）
 * @throws TanmiError 如果内容包含 ## 标题
 */
export function validateMultilineContent(content: string, fieldName: string): void {
  if (!content) return;

  // 只检测行首的 ## 二级标题格式（唯一会破坏 section 解析的格式）
  // 匹配：行首的 ##（后跟空格），但不匹配 ### 及更多 #
  const headerPattern = /^##(?!#)\s/m;

  if (headerPattern.test(content)) {
    throw new TanmiError(
      "INVALID_CONTENT",
      `「${fieldName}」不能包含 Markdown 二级标题（## ）格式，这会破坏文件的 section 解析。` +
      `请使用其他格式替代，如：### 三级标题、# 一级标题、**加粗文本**、或直接去掉 ## 前缀。`
    );
  }
}

/**
 * 验证单行内容（不能包含换行符）
 * Frontmatter 和列表项使用单行格式，换行符会破坏解析
 *
 * @param content 要验证的内容
 * @param fieldName 字段名称（用于错误信息）
 * @throws TanmiError 如果内容包含换行符
 */
export function validateSingleLineContent(content: string, fieldName: string): void {
  if (!content) return;

  // 检测任何形式的换行符
  if (/[\r\n]/.test(content)) {
    throw new TanmiError(
      "INVALID_CONTENT",
      `「${fieldName}」不能包含换行符，必须是单行文本。`
    );
  }
}

/**
 * 转义表格单元格内容
 * Log.md 使用 Markdown 表格格式，需要转义特殊字符
 *
 * @param content 原始内容
 * @returns 转义后的内容
 */
export function escapeTableCell(content: string): string {
  if (!content) return "";

  return content
    // 换行符转为 <br>
    .replace(/\r\n/g, "<br>")
    .replace(/\r/g, "<br>")
    .replace(/\n/g, "<br>")
    // 管道符转为全角（避免破坏表格结构）
    .replace(/\|/g, "｜");
}

/**
 * 还原表格单元格内容
 * 读取时将转义的内容还原
 *
 * @param content 转义后的内容
 * @returns 原始内容
 */
export function unescapeTableCell(content: string): string {
  if (!content) return "";

  return content
    // <br> 还原为换行符
    .replace(/<br>/g, "\n")
    // 全角管道符还原
    .replace(/｜/g, "|");
}

/**
 * 验证规则列表
 * 每条规则必须是单行，不能包含 ## 标题
 *
 * @param rules 规则列表
 * @throws TanmiError 如果任何规则不合法
 */
export function validateRules(rules: string[]): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || rule.trim().length === 0) {
      throw new TanmiError(
        "INVALID_CONTENT",
        `第 ${i + 1} 条规则不能为空`
      );
    }
    // 规则是列表项，不能包含换行
    validateSingleLineContent(rule, `第 ${i + 1} 条规则`);
  }
}
