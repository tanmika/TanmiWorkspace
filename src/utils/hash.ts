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

/**
 * 子节点结论项（用于 conclusionsHash 计算）
 */
export interface ChildConclusionForHash {
  nodeId: string;
  conclusion: string;
}

/**
 * 计算子节点结论的 conclusionsHash
 * 用于检测子节点结论是否发生变化，确保"先读后写"
 * @param childConclusions 子节点结论列表
 * @returns 32 位十六进制字符串
 */
export function computeConclusionsHash(childConclusions: ChildConclusionForHash[]): string {
  const data = childConclusions
    .filter(c => c.conclusion)  // 只包含有结论的子节点
    .map(c => `${c.nodeId}:${c.conclusion}`)
    .join('|');
  return computeContentHash(data);
}
