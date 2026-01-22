/**
 * 版本号比较工具
 * 支持 semver prerelease 版本
 */

/**
 * 比较版本号，返回 true 如果 v1 < v2
 * 支持 semver prerelease 版本：1.11.0-beta.3 < 1.11.0
 *
 * @example
 * isVersionLessThan("1.11.0-beta.3", "1.11.0") // true
 * isVersionLessThan("1.11.0-beta.3", "1.11.0-beta.4") // true
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

  // 都有 prerelease，按字典序比较（beta.3 < beta.4）
  if (p1.prerelease && p2.prerelease) {
    return p1.prerelease < p2.prerelease;
  }

  return false; // 完全相等
}
