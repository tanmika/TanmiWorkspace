/**
 * 版本号比较工具
 * 支持 semver prerelease 版本
 */

/**
 * 比较 prerelease 部分的单个标识符
 * 数字用数值比较，字符串用字典序比较
 * 数字 < 字符串（按 semver 规范）
 */
function compareIdentifier(a: string, b: string): number {
  const aIsNum = /^\d+$/.test(a);
  const bIsNum = /^\d+$/.test(b);

  if (aIsNum && bIsNum) {
    // 两个都是数字，数值比较
    return parseInt(a, 10) - parseInt(b, 10);
  }
  if (aIsNum) return -1; // 数字 < 字符串
  if (bIsNum) return 1;  // 字符串 > 数字
  // 两个都是字符串，字典序比较
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 比较两个 prerelease 字符串
 * @returns 负数: a < b, 0: a == b, 正数: a > b
 */
function comparePrerelease(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    // 较短的 prerelease 更小（beta < beta.1）
    if (i >= partsA.length) return -1;
    if (i >= partsB.length) return 1;

    const cmp = compareIdentifier(partsA[i], partsB[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

/**
 * 比较版本号，返回 true 如果 v1 < v2
 * 支持 semver prerelease 版本：1.11.0-beta.3 < 1.11.0
 *
 * @example
 * isVersionLessThan("1.11.0-beta.3", "1.11.0") // true
 * isVersionLessThan("1.11.0-beta.3", "1.11.0-beta.4") // true
 * isVersionLessThan("1.11.0-beta.9", "1.11.0-beta.10") // true (数值比较)
 * isVersionLessThan("1.11.0", "1.11.0-beta.3") // false
 * isVersionLessThan("1.10.0", "1.11.0") // true
 */
export function isVersionLessThan(v1: string | null, v2: string): boolean {
  if (!v1) return true; // 无版本号视为最旧

  // 分离主版本和 prerelease 部分
  const parseVersion = (v: string) => {
    const [main, prerelease] = v.split("-");
    const parts = main.split(".").map(n => parseInt(n, 10) || 0);
    return { parts, prerelease: prerelease || null };
  };

  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);

  // 比较主版本号
  const maxLen = Math.max(p1.parts.length, p2.parts.length);
  for (let i = 0; i < maxLen; i++) {
    const a = p1.parts[i] || 0;
    const b = p2.parts[i] || 0;
    if (a < b) return true;
    if (a > b) return false;
  }

  // 主版本相等，比较 prerelease
  // 有 prerelease < 无 prerelease（1.11.0-beta.3 < 1.11.0）
  if (p1.prerelease && !p2.prerelease) return true;
  if (!p1.prerelease && p2.prerelease) return false;

  // 都有 prerelease，使用 semver 规范比较
  if (p1.prerelease && p2.prerelease) {
    return comparePrerelease(p1.prerelease, p2.prerelease) < 0;
  }

  return false; // 完全相等
}
