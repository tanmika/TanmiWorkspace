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
  MemoUpdateParams,
  MemoUpdateResult,
  MemoDeleteParams,
  MemoDeleteResult,
  Memo,
  MemoListItem,
} from "../types/memo.js";
import { TanmiError } from "../types/errors.js";
import { generateMemoId } from "../utils/id.js";
import { now } from "../utils/time.js";
import { devLog } from "../utils/devLog.js";

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

    // 1. 获取工作区信息
    const { projectRoot, wsDirName } = await this.resolveWorkspaceInfo(workspaceId);

    // 2. 生成备忘 ID
    const memoId = generateMemoId();
    const timestamp = now();

    // 3. 构造备忘对象
    const memo: Memo = {
      id: memoId,
      title,
      summary,
      content,
      tags,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 4. 读取 graph.json
    const graph = await this.json.readGraph(projectRoot, wsDirName);

    // 5. 初始化 memos 字段（如果不存在）
    if (!graph.memos) {
      graph.memos = {};
    }

    // 6. 添加备忘到索引
    graph.memos[memoId] = {
      id: memoId,
      title,
      summary,
      tags,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    // 7. 写回 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 8. 创建备忘目录
    const memoDir = this.fs.getMemoDir(projectRoot, wsDirName, memoId);
    await this.fs.ensureDir(memoDir);

    // 9. 写入 Content.md
    const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoId);
    await this.fs.writeFile(contentPath, content);

    // 10. 返回结果
    const relativePath = `memos/${memoId}/Content.md`;
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
   * 获取备忘完整内容
   */
  async get(params: MemoGetParams): Promise<MemoGetResult> {
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

    // 4. 读取 Content.md
    const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoId);
    const content = await this.fs.readFile(contentPath);

    // 5. 构造完整备忘对象
    const memo: Memo = {
      ...memoMeta,
      content,
    };

    return { memo };
  }

  /**
   * 更新备忘
   */
  async update(params: MemoUpdateParams): Promise<MemoUpdateResult> {
    const { workspaceId, memoId, title, summary, content, tags } = params;

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

    // 4. 更新备忘元数据
    const timestamp = now();
    if (title !== undefined) memoMeta.title = title;
    if (summary !== undefined) memoMeta.summary = summary;
    if (tags !== undefined) memoMeta.tags = tags;
    memoMeta.updatedAt = timestamp;

    // 5. 写回 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 6. 更新 Content.md（如果提供了 content）
    if (content !== undefined) {
      const contentPath = this.fs.getMemoContentPath(projectRoot, wsDirName, memoId);
      await this.fs.writeFile(contentPath, content);
    }

    return {
      success: true,
      updatedAt: timestamp,
    };
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
    if (!memosIndex[memoId]) {
      throw new TanmiError("MEMO_NOT_FOUND", `备忘 "${memoId}" 不存在`);
    }

    // 4. 从索引中删除
    delete memosIndex[memoId];

    // 5. 写回 graph.json
    await this.json.writeGraph(projectRoot, wsDirName, graph);

    // 6. 删除备忘目录
    const memoDir = this.fs.getMemoDir(projectRoot, wsDirName, memoId);
    await this.fs.remove(memoDir);

    return { success: true };
  }
}
