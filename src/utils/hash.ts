import { createHash } from 'crypto';

/**
 * 计算内容的 MD5 hash
 * @param content 要计算 hash 的内容
 * @returns 32 位十六进制字符串
 */
export function computeContentHash(content: string): string {
  return createHash('md5').update(content, 'utf8').digest('hex');
}

/**
 * 计算节点多字段组合的 hash
 * @param fields 包含 title, requirement, note, conclusion 的对象
 * @returns 32 位十六进制字符串
 */
export function computeNodeHash(fields: {
  title: string;
  requirement: string;
  note: string;
  conclusion: string;
}): string {
  const combined = [
    fields.title,
    fields.requirement,
    fields.note,
    fields.conclusion,
  ].join('\n---\n');
  return computeContentHash(combined);
}
