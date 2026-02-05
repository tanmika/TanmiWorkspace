// src/utils/patchMatcher.ts
// 移植自 apply-patch 的 seek_sequence 算法，支持 4 级模糊匹配

/**
 * 模糊匹配级别
 */
export enum FuzzyLevel {
  EXACT = 0,        // 完全匹配
  PUNCTUATION = 1,  // Unicode 标点标准化（智能引号→直引号）
  WHITESPACE = 2,   // 尾部空白忽略
  AGGRESSIVE = 3,   // 所有空白折叠
}

/**
 * Unicode 标点标准化映射
 * 将智能引号、特殊破折号等转换为 ASCII 等价字符
 */
const PUNCTUATION_MAP: Record<string, string> = {
  // 智能引号 → 直引号
  "\u2018": "'",  // '
  "\u2019": "'",  // '
  "\u201C": '"',  // "
  "\u201D": '"',  // "
  "\u201A": "'",  // ‚
  "\u201E": '"',  // „
  // 破折号
  "\u2013": "-",  // – (en dash)
  "\u2014": "--", // — (em dash)
  "\u2015": "--", // ― (horizontal bar)
  // 省略号
  "\u2026": "...",// …
  // 空格变体
  "\u00A0": " ",  // non-breaking space
  "\u2002": " ",  // en space
  "\u2003": " ",  // em space
  "\u2009": " ",  // thin space
};

/**
 * 标准化标点符号
 */
function normalizePunctuation(text: string): string {
  let result = text;
  for (const [from, to] of Object.entries(PUNCTUATION_MAP)) {
    result = result.split(from).join(to);
  }
  return result;
}

/**
 * 去除尾部空白
 */
function trimTrailing(text: string): string {
  return text.replace(/\s+$/, "");
}

/**
 * 折叠所有空白（多个空白变成单个空格）
 */
function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 根据模糊级别标准化行内容
 */
function normalizeByLevel(text: string, level: FuzzyLevel): string {
  switch (level) {
    case FuzzyLevel.EXACT:
      return text;
    case FuzzyLevel.PUNCTUATION:
      return normalizePunctuation(text);
    case FuzzyLevel.WHITESPACE:
      return trimTrailing(normalizePunctuation(text));
    case FuzzyLevel.AGGRESSIVE:
      return collapseWhitespace(normalizePunctuation(text));
    default:
      return text;
  }
}

/**
 * 比较两行是否匹配（根据模糊级别）
 */
export function fuzzyLineMatch(
  actual: string,
  expected: string,
  level: FuzzyLevel
): boolean {
  const normalizedActual = normalizeByLevel(actual, level);
  const normalizedExpected = normalizeByLevel(expected, level);
  return normalizedActual === normalizedExpected;
}

/**
 * 在 haystack 中查找 needle 序列
 *
 * @param haystack 文件内容（按行分割）
 * @param needle 要查找的内容（按行分割）
 * @param start 开始搜索的行号（0-based）
 * @param isEndOfFile needle 是否在文件末尾（影响搜索策略）
 * @param level 模糊匹配级别
 * @returns 匹配的起始行号（0-based），未找到返回 null
 */
export function seekSequence(
  haystack: string[],
  needle: string[],
  start: number = 0,
  isEndOfFile: boolean = false,
  level: FuzzyLevel = FuzzyLevel.EXACT
): number | null {
  if (needle.length === 0) {
    return start;
  }

  if (haystack.length === 0) {
    return null;
  }

  // 如果是文件末尾，从后向前搜索
  if (isEndOfFile) {
    const endPos = haystack.length - needle.length;
    if (endPos < start) {
      return null;
    }

    // 检查末尾是否匹配
    if (matchesAt(haystack, needle, endPos, level)) {
      return endPos;
    }

    // 向前搜索
    for (let i = endPos - 1; i >= start; i--) {
      if (matchesAt(haystack, needle, i, level)) {
        return i;
      }
    }
    return null;
  }

  // 正向搜索
  const maxPos = haystack.length - needle.length;
  for (let i = start; i <= maxPos; i++) {
    if (matchesAt(haystack, needle, i, level)) {
      return i;
    }
  }

  return null;
}

/**
 * 检查 haystack 在 position 位置是否与 needle 匹配
 */
function matchesAt(
  haystack: string[],
  needle: string[],
  position: number,
  level: FuzzyLevel
): boolean {
  for (let i = 0; i < needle.length; i++) {
    if (position + i >= haystack.length) {
      return false;
    }
    if (!fuzzyLineMatch(haystack[position + i], needle[i], level)) {
      return false;
    }
  }
  return true;
}

/**
 * 尝试使用多级模糊匹配查找序列
 * 按照 EXACT → PUNCTUATION → WHITESPACE → AGGRESSIVE 的顺序尝试
 *
 * @param haystack 文件内容（按行分割）
 * @param needle 要查找的内容（按行分割）
 * @param start 开始搜索的行号（0-based）
 * @param isEndOfFile needle 是否在文件末尾
 * @returns { position: number, level: FuzzyLevel } 或 null
 */
export function seekSequenceMultiLevel(
  haystack: string[],
  needle: string[],
  start: number = 0,
  isEndOfFile: boolean = false
): { position: number; level: FuzzyLevel } | null {
  for (const level of [
    FuzzyLevel.EXACT,
    FuzzyLevel.PUNCTUATION,
    FuzzyLevel.WHITESPACE,
    FuzzyLevel.AGGRESSIVE,
  ]) {
    const position = seekSequence(haystack, needle, start, isEndOfFile, level);
    if (position !== null) {
      return { position, level };
    }
  }
  return null;
}

/**
 * 提取上下文（变更位置前后的行）
 *
 * @param lines 文件内容（按行分割）
 * @param position 目标位置（0-based）
 * @param contextLines 上下文行数
 * @returns { before: string[], after: string[] }
 */
export function extractContext(
  lines: string[],
  position: number,
  length: number,
  contextLines: number = 3
): { before: string[]; after: string[] } {
  const startBefore = Math.max(0, position - contextLines);
  const endAfter = Math.min(lines.length, position + length + contextLines);

  return {
    before: lines.slice(startBefore, position),
    after: lines.slice(position + length, endAfter),
  };
}

/**
 * 计算两个字符串的相似度（Levenshtein 距离的归一化版本）
 * 用于辅助判断匹配质量
 *
 * @returns 0-1 之间的相似度，1 表示完全相同
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const matrix: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // 删除
        matrix[i][j - 1] + 1,     // 插入
        matrix[i - 1][j - 1] + cost // 替换
      );
    }
  }

  const distance = matrix[a.length][b.length];
  const maxLen = Math.max(a.length, b.length);
  return 1 - distance / maxLen;
}
