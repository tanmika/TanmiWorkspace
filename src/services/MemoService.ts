// src/services/MemoService.ts

import type { FileSystemAdapter } from "../storage/FileSystemAdapter.js";
import type { JsonStorage } from "../storage/JsonStorage.js";
import type { MarkdownStorage } from "../storage/MarkdownStorage.js";
import type {
  MemoCreateParams,
  MemoCreateResult,
  MemoListParams,
  MemoListResult,
  MemoGetParams,
  MemoGetResult,
  MemoDeleteParams,
  MemoDeleteResult,
  MemoReplaceParams,
  MemoEditParams,
  MemoInsertParams,
  Memo,
  MemoListItem,
} from "../types/memo.js";
import { TanmiError } from "../types/errors.js";
import { generateMemoId, generateMemoDirName } from "../utils/id.js";
import { now } from "../utils/time.js";
import { devLog } from "../utils/devLog.js";
import { eventService } from "./EventService.js";
import { computeContentHash } from "../utils/hash.js";

/**
 * Memo 服务
 * 处理备忘相关的业务逻辑
 */
export class MemoService {
  constructor(
    private json: JsonStorage,
    private md: MarkdownStorage,
    private fs: FileSystemAdapter
  ) {}

  /**
   * 根据 workspaceId 获取工作区信息
   */
  private async resolveWorkspaceInfo(workspaceId: string): Promise<{ projectRoot: string; wsDirName: string }> {
    const index = await this.json.readIndex();
    const wsEntry = index.workspaces.find(ws => ws.id === workspaceId);
    if (!wsEntry) {
      devLog.workspaceLookup(workspaceId, false);
      throw new TanmiError("WORKSPACE_NOT_FOUND", `工作区 "${workspaceId}" 不存在`);
    }
    if (wsEntry.status === "error" && wsEntry.errorInfo) {
      throw new TanmiError("WORKSPACE_ERROR", `工作区 "${workspaceId}" 处于错误状态: ${wsEntry.errorInfo.message}`);
    }
    const wsDirName = wsEntry.dirName || wsEntry.id;
    devLog.workspaceLookup(workspaceId, true, wsEntry.status);
    return {
      projectRoot: wsEntry.projectRoot,
      wsDirName,
    };
  }

  /**
   * 创建备忘
   */
  async create(params: MemoCreateParams): Promise<MemoCreateResult> {
    const { workspaceId, title, summary, content, tags = [] } = params;

    // 1. 校验 tags：过滤空白，至少2个有效标签
    const validTags = tags
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    if (validTags.length < 2) {
      throw new TanmiError(
        "INVALID_PARAMS",
        `tags 至少需要2个有效标签，当前有效标签数: ${validTags.length}`
      );
    }

    // 2. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 3. 生成备忘 ID 和目录名
    const memoId = generateMemoId();
    const memoDirName = generateMemoDirName(title, memoId);
    const timestamp = now();

    // 4. 构造备忘对象
    const memo: Memo = {
      id: memoId,
      title,
      summary,
      content,
      tags: validTags,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 5. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 6. 初始化 memos 字段（如果不存在）
    if (!graph.memos) {
      graph.memos = {};
    }

    // 7. 添加备忘到索引
    graph.memos[memoId] = {
      id: memoId,
      title,
      summary,
      tags: validTags,
      contentLength: content.length,
      dirName: memoDirName,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 8. 写回 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 9. 创建备忘目录
    const memoDir = this.fs.getMemoDir(projectRoot, wsDirName, memoDirName);
    await this.fs.ensureDir(memoDir);

    // 10. 写入 Content.md
    const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoDirName);
    await this.fs.writeFile(contentPath, content);

    // 11. 发送事件通知
    eventService.emitMemoUpdate(workspaceId, memoId);

    // 12. 返回结果
    const relativePath = `memos/${memoDirName}/Content.md`;
    return {
      memoId,
      path: relativePath,
      hint: `备忘已创建。使用 node_reference(nodeId, "memo://${memoId}", "add") 关联到节点。`,
    };
  }

  /**
   * 列出备忘（支持 tag 过滤）
   */
  async list(params: MemoListParams): Promise<MemoListResult> {
    const { workspaceId, tags } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 3. 获取备忘索引
    const memosIndex = graph.memos || {};
    let memosList = Object.values(memosIndex);

    // 4. 如果指定了 tags 过滤
    if (tags && tags.length > 0) {
      memosList = memosList.filter(memo =>
        tags.some(tag => memo.tags.includes(tag))
      );
    }

    // 5. 收集所有已使用的 tags
    const allTagsSet = new Set<string>();
    Object.values(memosIndex).forEach(memo => {
      memo.tags.forEach(tag => allTagsSet.add(tag));
    });
    const allTags = Array.from(allTagsSet).sort();

    // 6. 按更新时间倒序排序
    memosList.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return {
      memos: memosList,
      allTags,
      hint: memosList.length === 0
        ? "当前工作区暂无备忘。使用 memo_create 创建第一条备忘。"
        : undefined,
    };
  }

  /**
   * 获取备忘内容（支持按行分页）
   */
  async get(params: MemoGetParams): Promise<MemoGetResult> {
    const { workspaceId, memoId, lineOffset = 1, lineLimit = 500 } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 3. 检查备忘是否存在
    const memosIndex = graph.memos || {};
    const memoMeta = memosIndex[memoId];
    if (!memoMeta) {
      throw new TanmiError("MEMO_NOT_FOUND", `备忘 "${memoId}" 不存在`);
    }

    // 4. 读取 Content.md
    const memoDirName = memoMeta.dirName;
    const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoDirName);
    const fullContent = await this.fs.readFile(contentPath);

    // 5. 按行分页
    const lines = fullContent.split("\n");
    const totalLines = lines.length;
    const startLine = Math.max(1, Math.min(lineOffset, totalLines));
    const endLine = Math.min(startLine + lineLimit - 1, totalLines);
    const pagedLines = lines.slice(startLine - 1, endLine);
    const contentTruncated = startLine > 1 || endLine < totalLines;

    // 5.1 返回原始内容（行号添加由 MCP 适配层处理）
    const content = pagedLines.join("\n");

    // 6. 构造备忘对象
    const memo: Memo = {
      ...memoMeta,
      content,
    };

    // 7. 计算内容 hash（基于完整内容）
    const contentHash = computeContentHash(fullContent);

    // 8. 返回结果
    const result: MemoGetResult = { memo, totalLines, contentHash };
    if (contentTruncated) {
      result.contentTruncated = true;
      const hasMore = endLine < totalLines;

      // 添加分页导航信息
      result.pagination = {
        currentRange: `${startLine}-${endLine}`,
        totalLines,
        hasMore,
        nextOffset: hasMore ? endLine + 1 : undefined,
        nextCommand: hasMore
          ? `memo_get({ workspaceId: "${workspaceId}", memoId: "${memoId}", lineOffset: ${endLine + 1} })`
          : undefined,
      };

      // 生成截断处理提示
      if (hasMore) {
        result.hint = `内容已截断（${startLine}-${endLine}/${totalLines} 行）。建议使用 content_search 搜索定位，或用 pagination.nextCommand 分页读取。`;
      }
    }

    return result;
  }

  /**
   * 全量替换 - 替换整个 memo 内容
   */
  async replace(params: MemoReplaceParams): Promise<{ success: boolean; error?: string; contentHash?: string }> {
    const { workspaceId, memoId, contentHash, content, title, summary, tags } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 3. 检查备忘是否存在
    const memosIndex = graph.memos || {};
    const memoMeta = memosIndex[memoId];
    if (!memoMeta) {
      return { success: false, error: `备忘 "${memoId}" 不存在` };
    }

    // 4. 读取当前内容并校验 contentHash
    const memoDirName = memoMeta.dirName;
    const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoDirName);
    const existingContent = await this.fs.readFile(contentPath);
    const currentHash = computeContentHash(existingContent);
    if (currentHash !== contentHash) {
      return { success: false, error: "内容已变更，请重新 memo_get" };
    }

    // 5. 更新元数据
    const timestamp = now();
    if (title !== undefined) memoMeta.title = title;
    if (summary !== undefined) memoMeta.summary = summary;
    if (tags !== undefined) memoMeta.tags = tags;
    memoMeta.contentLength = content.length;
    memoMeta.updatedAt = timestamp;

    // 6. 写回 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 7. 写入新内容
    await this.fs.writeFile(contentPath, content);

    // 8. 发送事件通知
    eventService.emitMemoUpdate(workspaceId, memoId);

    // 9. 计算并返回新的 contentHash（供后续操作复用，避免重复 memo_get）
    const newContentHash = computeContentHash(content);

    return { success: true, contentHash: newContentHash };
  }

  /**
   * 精确替换 - 替换指定字段中的特定字符串或行范围
   *
   * 替换模式：
   * - mode='string': 字符串精确替换，需提供 oldStr + newStr
   * - mode='line_range': 行范围替换，需提供 lineStart + lineEnd + newStr
   */
  async edit(params: MemoEditParams): Promise<{ success: boolean; error?: string; contentHash?: string }> {
    const { workspaceId, memoId, contentHash, field, oldStr, newStr, lineStart, lineEnd } = params;

    // 1. 验证 mode 参数（默认 'string'）
    const mode = params.mode ?? "string";

    // 2. 参数校验
    if (mode === "string") {
      if (!oldStr) {
        return { success: false, error: "mode=string 时 oldStr 必填" };
      }
      if (lineStart !== undefined || lineEnd !== undefined) {
        return { success: false, error: "mode=string 时不能指定 lineStart/lineEnd" };
      }
    } else if (mode === "line_range") {
      if (lineStart === undefined || lineEnd === undefined) {
        return { success: false, error: "mode=line_range 时 lineStart 和 lineEnd 必填" };
      }
      if (oldStr !== undefined) {
        return { success: false, error: "mode=line_range 时不能指定 oldStr" };
      }
      // 行号基本校验
      if (lineStart < 1) {
        return { success: false, error: "lineStart 必须 >= 1" };
      }
      if (lineStart > lineEnd) {
        return { success: false, error: "lineStart 不能大于 lineEnd" };
      }
    } else {
      return { success: false, error: `无效的 mode: ${mode}，支持 'string' 或 'line_range'` };
    }

    // 3. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 4. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 5. 检查备忘是否存在
    const memosIndex = graph.memos || {};
    const memoMeta = memosIndex[memoId];
    if (!memoMeta) {
      return { success: false, error: `备忘 "${memoId}" 不存在` };
    }

    // 6. 读取当前内容并校验 contentHash
    const memoDirName = memoMeta.dirName;
    const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoDirName);
    const existingContent = await this.fs.readFile(contentPath);
    const currentHash = computeContentHash(existingContent);
    if (currentHash !== contentHash) {
      return { success: false, error: "内容已变更，请重新 memo_get" };
    }

    // 7. 获取目标字段内容
    let targetContent: string;
    if (field === "content") {
      targetContent = existingContent;
    } else if (field === "title") {
      targetContent = memoMeta.title;
    } else {
      targetContent = memoMeta.summary;
    }

    let newContent: string;
    const timestamp = now();

    if (mode === "string") {
      // 8a. 字符串模式：检查 oldStr 存在性和唯一性
      const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escapeRegExp(oldStr!), "g");
      const matches = targetContent.match(regex);
      const count = matches ? matches.length : 0;

      if (count === 0) {
        return { success: false, error: "oldStr 未找到" };
      }
      if (count > 1) {
        return { success: false, error: "oldStr 出现多次，请提供更精确的匹配" };
      }

      // 执行替换
      newContent = targetContent.replace(oldStr!, newStr);
    } else {
      // 8b. 行范围模式：按行替换
      const lines = targetContent.split("\n");
      const totalLines = lines.length;

      // 验证行号范围
      if (lineEnd! > totalLines) {
        return { success: false, error: `lineEnd (${lineEnd}) 超出总行数 (${totalLines})` };
      }

      // 执行行范围替换：
      // - 删除 lineStart 到 lineEnd 的行（闭区间）
      // - 在 lineStart 位置插入 newStr（可能是多行或空字符串）
      const beforeLines = lines.slice(0, lineStart! - 1);
      const afterLines = lines.slice(lineEnd!);

      if (newStr === "") {
        // 空字符串：删除指定行
        newContent = [...beforeLines, ...afterLines].join("\n");
      } else {
        // 非空：替换为新内容（可能是多行）
        const newLines = newStr.split("\n");
        newContent = [...beforeLines, ...newLines, ...afterLines].join("\n");
      }
    }

    // 9. 更新内容和元数据
    if (field === "content") {
      // 更新内容文件
      await this.fs.writeFile(contentPath, newContent);
      memoMeta.contentLength = newContent.length;
    } else if (field === "title") {
      memoMeta.title = newContent;
    } else {
      memoMeta.summary = newContent;
    }
    memoMeta.updatedAt = timestamp;

    // 10. 写回 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 11. 发送事件通知
    eventService.emitMemoUpdate(workspaceId, memoId);

    // 12. 计算并返回新的 contentHash（供后续操作复用，避免重复 memo_get）
    // 仅编辑 content 字段时 hash 变化，编辑 title/summary 时内容文件不变
    const newContentHash = field === "content"
      ? computeContentHash(newContent)
      : contentHash;

    return { success: true, contentHash: newContentHash };
  }

  /**
   * 行号插入 - 在指定行后插入文本
   */
  async insert(params: MemoInsertParams): Promise<{ success: boolean; error?: string; contentHash?: string }> {
    const { workspaceId, memoId, contentHash, line, text } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 3. 检查备忘是否存在
    const memosIndex = graph.memos || {};
    const memoMeta = memosIndex[memoId];
    if (!memoMeta) {
      return { success: false, error: `备忘 "${memoId}" 不存在` };
    }

    // 4. 读取当前内容并校验 contentHash
    const memoDirName = memoMeta.dirName;
    const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoDirName);
    const existingContent = await this.fs.readFile(contentPath);
    const currentHash = computeContentHash(existingContent);
    if (currentHash !== contentHash) {
      return { success: false, error: "内容已变更，请重新 memo_get" };
    }

    // 5. 验证行号范围
    const isEmptyContent = existingContent === "";
    const lines = existingContent.split("\n");
    const totalLines = lines.length;

    // 特殊处理：空内容只允许 line=0 插入
    if (isEmptyContent) {
      if (line !== 0) {
        return { success: false, error: "内容为空，只能在 line=0（开头）处插入" };
      }
    } else if (line < 0 || line > totalLines) {
      return { success: false, error: `行号无效，有效范围 0-${totalLines}` };
    }

    // 6. 在指定行后插入
    let finalContent: string;
    if (isEmptyContent) {
      // 空内容：直接使用插入的文本，不添加多余换行
      finalContent = text;
    } else if (line === 0) {
      // 在开头插入
      finalContent = text + "\n" + existingContent;
    } else {
      // 在第 N 行后插入
      const before = lines.slice(0, line);
      const after = lines.slice(line);
      finalContent = [...before, text, ...after].join("\n");
    }

    // 7. 更新元数据
    const timestamp = now();
    memoMeta.contentLength = finalContent.length;
    memoMeta.updatedAt = timestamp;

    // 8. 写回 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 9. 写入新内容
    await this.fs.writeFile(contentPath, finalContent);

    // 10. 发送事件通知
    eventService.emitMemoUpdate(workspaceId, memoId);

    // 11. 计算并返回新的 contentHash（供后续操作复用，避免重复 memo_get）
    const newContentHash = computeContentHash(finalContent);

    return { success: true, contentHash: newContentHash };
  }

  /**
   * 删除备忘
   */
  async delete(params: MemoDeleteParams): Promise<MemoDeleteResult> {
    const { workspaceId, memoId } = params;

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 3. 检查备忘是否存在
    const memosIndex = graph.memos || {};
    const memoMeta = memosIndex[memoId];
    if (!memoMeta) {
      throw new TanmiError("MEMO_NOT_FOUND", `备忘 "${memoId}" 不存在`);
    }

    // 4. 获取目录名
    const memoDirName = memoMeta.dirName;

    // 5. 从索引中删除
    delete memosIndex[memoId];

    // 6. 写回 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 7. 删除备忘目录
    const memoDir = this.fs.getMemoDir(projectRoot, wsDirName, memoDirName);
    await this.fs.remove(memoDir);

    // 8. 发送事件通知
    eventService.emitMemoUpdate(workspaceId, memoId);

    return { success: true };
  }
}
