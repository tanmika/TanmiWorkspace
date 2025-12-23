// src/storage/MarkdownStorage.ts
// ============================================================================
// ⚠️ 重要：参数命名约定
// ============================================================================
// 本文件中的方法参数遵循以下命名规范：
//
// - workspaceId: 工作区的唯一标识符（如 "ws-abc123"）
//   用于工作区级别的操作（Workspace.md, Log.md 等）
//
// - wsDirName: 工作区的实际目录名（可能与 workspaceId 不同）
//   用于节点级别的操作，因为需要先定位工作区目录
//
// - nodeDirName: 节点的实际目录名（可能与 nodeId 不同）
//   从 graph.json 中获取：graph.nodes[nodeId].dirName || nodeId
//
// 调用方在使用节点相关方法前，必须先通过 JsonStorage.readGraph() 获取正确的 dirName
// 参见 src/http/services.ts 中的 resolveDirNames() 辅助函数
// ============================================================================

import type { FileSystemAdapter } from "./FileSystemAdapter.js";
import type { WorkspaceMdData, LogEntry, ProblemData, DocRef } from "../types/workspace.js";
import type { NodeInfoData, NodeStatus, NodeType } from "../types/node.js";
import type { DocRefWithStatus, TypedLogEntry } from "../types/context.js";
import { formatShort } from "../utils/time.js";
import {
  validateMultilineContent,
  validateSingleLineContent,
  validateRules,
  escapeTableCell,
  unescapeTableCell,
} from "../utils/contentValidation.js";

/**
 * 解析后的 Markdown 数据
 */
interface ParsedMarkdown {
  frontmatter: Record<string, unknown>;
  content: string;
}

/**
 * Markdown 存储封装
 * 提供 Markdown 文件的读写和 frontmatter 解析
 */
export class MarkdownStorage {
  constructor(private fs: FileSystemAdapter) {}

  // ========== 解析与序列化 ==========

  /**
   * 解析 Markdown 内容（提取 frontmatter 和正文）
   * 增强健壮性：处理各种边界情况和格式变体
   */
  parse(content: string): ParsedMarkdown {
    // 处理空内容
    if (!content || typeof content !== "string") {
      return {
        frontmatter: {},
        content: ""
      };
    }

    // 规范化换行符（处理 Windows \r\n）
    const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // 更宽松的 frontmatter 正则：允许开头有空白，末尾可选换行
    const frontmatterRegex = /^\s*---\n([\s\S]*?)\n---\n?([\s\S]*)$/;
    const match = normalizedContent.match(frontmatterRegex);

    if (!match) {
      return {
        frontmatter: {},
        content: normalizedContent.trim()
      };
    }

    const frontmatterStr = match[1];
    const body = match[2];

    // 增强的 YAML 解析（处理引号值、冒号在值中等情况）
    const frontmatter: Record<string, unknown> = {};
    const lines = frontmatterStr.split("\n");
    for (const line of lines) {
      // 跳过空行和注释
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();

        // 处理引号包裹的值（支持单引号和双引号）
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        if (key) {
          frontmatter[key] = value;
        }
      }
    }

    return {
      frontmatter,
      content: body
    };
  }

  /**
   * 安全地提取 section 内容
   * @param content Markdown 内容
   * @param sectionName section 名称（不含 ##）
   * @param isLast 是否是最后一个 section（不需要后续 section 作为结束标记）
   * @returns 提取的内容，如果未找到返回空字符串
   */
  private extractSection(content: string, sectionName: string, isLast = false): string {
    if (!content) return "";

    // 规范化换行符
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // 构建更宽松的正则：允许 section 标题后有可选的提示行（> 开头）
    const pattern = isLast
      ? new RegExp(`## ${sectionName}\\n\\n(?:>.*\\n\\n)?([\\s\\S]*)$`)
      : new RegExp(`## ${sectionName}\\n\\n(?:>.*\\n\\n)?([\\s\\S]*?)(?=\\n## |$)`);

    const match = normalized.match(pattern);
    return match ? match[1].trim() : "";
  }

  /**
   * 安全解析列表项
   * @param content section 内容
   * @returns 列表项数组
   */
  private parseListItems(content: string): string[] {
    if (!content) return [];
    return content
      .split("\n")
      .filter(line => line.trim().startsWith("- "))
      .map(line => line.trim().substring(2).trim())
      .filter(item => item.length > 0);
  }

  /**
   * 序列化 Markdown 数据
   */
  serialize(data: ParsedMarkdown): string {
    const frontmatterLines: string[] = [];
    for (const [key, value] of Object.entries(data.frontmatter)) {
      frontmatterLines.push(`${key}: ${value}`);
    }

    return `---\n${frontmatterLines.join("\n")}\n---\n${data.content}`;
  }

  // ========== Workspace.md ==========

  /**
   * 读取 Workspace.md
   * @param isArchived 是否为归档工作区
   */
  async readWorkspaceMd(projectRoot: string, workspaceId: string, isArchived = false): Promise<WorkspaceMdData> {
    const mdPath = isArchived
      ? this.fs.getWorkspaceMdPathWithArchive(projectRoot, workspaceId, true)
      : this.fs.getWorkspaceMdPath(projectRoot, workspaceId);
    const content = await this.fs.readFile(mdPath);
    const parsed = this.parse(content);

    // 解析规则
    const rules: string[] = [];
    const rulesMatch = parsed.content.match(/## 规则\n\n(?:>.*\n\n)?([\s\S]*?)(?=\n## |$)/);
    if (rulesMatch) {
      const rulesContent = rulesMatch[1].trim();
      if (rulesContent) {
        const ruleLines = rulesContent.split("\n").filter(line => line.startsWith("- "));
        for (const line of ruleLines) {
          rules.push(line.substring(2).trim());
        }
      }
    }

    // 解析文档
    const docs: DocRef[] = [];
    const docsMatch = parsed.content.match(/## 文档\n\n(?:>.*\n\n)?([\s\S]*?)(?=\n## |$)/);
    if (docsMatch) {
      const docsContent = docsMatch[1].trim();
      if (docsContent) {
        const docLines = docsContent.split("\n").filter(line => line.startsWith("- "));
        for (const line of docLines) {
          const docMatch = line.match(/- \[(.+?)\]\((.+?)\)(?: - (.+))?/);
          if (docMatch) {
            docs.push({
              path: docMatch[2],
              description: docMatch[3] || docMatch[1]
            });
          }
        }
      }
    }

    // 解析目标
    let goal = "";
    const goalMatch = parsed.content.match(/## 目标\n\n([\s\S]*?)(?=\n## |$)/);
    if (goalMatch) {
      goal = goalMatch[1].trim();
    }

    return {
      name: parsed.frontmatter.name as string || "",
      createdAt: parsed.frontmatter.createdAt as string || "",
      updatedAt: parsed.frontmatter.updatedAt as string || "",
      rules,
      docs,
      goal
    };
  }

  /**
   * 写入 Workspace.md
   */
  async writeWorkspaceMd(projectRoot: string, workspaceId: string, data: WorkspaceMdData): Promise<void> {
    // 验证内容格式
    validateSingleLineContent(data.name, "工作区名称");
    if (data.goal) {
      validateMultilineContent(data.goal, "工作区目标");
    }
    if (data.rules.length > 0) {
      validateRules(data.rules);
    }

    const mdPath = this.fs.getWorkspaceMdPath(projectRoot, workspaceId);

    const rulesContent = data.rules.length > 0
      ? data.rules.map(rule => `- ${rule}`).join("\n")
      : "";

    const docsContent = data.docs.length > 0
      ? data.docs.map(doc => `- [${doc.description}](${doc.path})`).join("\n")
      : "";

    const content = `---
name: ${data.name}
createdAt: ${data.createdAt}
updatedAt: ${data.updatedAt}
---

## 规则

> 只读，上下文必须遵循的约束

${rulesContent}

## 文档

> 读写，全局参考文档

${docsContent}

## 目标

${data.goal ?? ""}
`;

    await this.fs.writeFile(mdPath, content);
  }

  // ========== Node Info.md ==========

  /**
   * 读取节点 Info.md
   * @param wsDirName 工作区目录名（非 workspaceId，需通过 graph 解析）
   * @param nodeDirName 节点目录名（非 nodeId，需通过 graph.nodes[nodeId].dirName 获取）
   * @param isArchived 是否为归档工作区
   */
  async readNodeInfo(projectRoot: string, wsDirName: string, nodeDirName: string, isArchived: boolean = false): Promise<NodeInfoData> {
    const infoPath = isArchived
      ? this.fs.getNodeInfoPathWithArchive(projectRoot, wsDirName, nodeDirName, true)
      : this.fs.getNodeInfoPath(projectRoot, wsDirName, nodeDirName);
    const content = await this.fs.readFile(infoPath);
    const parsed = this.parse(content);

    // 解析需求
    let requirement = "";
    const reqMatch = parsed.content.match(/## 需求\n\n([\s\S]*?)(?=\n## |$)/);
    if (reqMatch) {
      requirement = reqMatch[1].trim();
    }

    // 解析文档引用
    const docs: DocRef[] = [];
    const docsMatch = parsed.content.match(/## 文档引用\n\n(?:>.*\n\n)?([\s\S]*?)(?=\n## |$)/);
    if (docsMatch) {
      const docsContent = docsMatch[1].trim();
      if (docsContent) {
        const docLines = docsContent.split("\n").filter(line => line.startsWith("- "));
        for (const line of docLines) {
          const docMatch = line.match(/- \[(.+?)\]\((.+?)\)(?: - (.+))?/);
          if (docMatch) {
            docs.push({
              path: docMatch[2],
              description: docMatch[3] || docMatch[1]
            });
          }
        }
      }
    }

    // 解析备注
    let notes = "";
    const notesMatch = parsed.content.match(/## 备注\n\n([\s\S]*?)(?=\n## |$)/);
    if (notesMatch) {
      notes = notesMatch[1].trim();
    }

    // 解析结论
    let conclusion = "";
    const conclusionMatch = parsed.content.match(/## 结论\n\n(?:>.*\n\n)?([\s\S]*?)$/);
    if (conclusionMatch) {
      conclusion = conclusionMatch[1].trim();
    }

    return {
      id: parsed.frontmatter.id as string || nodeDirName,
      type: (parsed.frontmatter.type as NodeType) || "execution",
      title: parsed.frontmatter.title as string || "",
      status: (parsed.frontmatter.status as NodeStatus) || "pending",
      createdAt: parsed.frontmatter.createdAt as string || "",
      updatedAt: parsed.frontmatter.updatedAt as string || "",
      requirement,
      docs,
      notes,
      conclusion
    };
  }

  /**
   * 写入节点 Info.md
   * @param wsDirName 工作区目录名（非 workspaceId）
   * @param nodeDirName 节点目录名（非 nodeId）
   */
  async writeNodeInfo(projectRoot: string, wsDirName: string, nodeDirName: string, data: NodeInfoData): Promise<void> {
    // 验证内容格式
    validateSingleLineContent(data.title, "节点标题");
    if (data.requirement) {
      validateMultilineContent(data.requirement, "需求描述");
    }
    if (data.notes) {
      validateMultilineContent(data.notes, "备注");
    }
    if (data.conclusion) {
      validateMultilineContent(data.conclusion, "结论");
    }

    const infoPath = this.fs.getNodeInfoPath(projectRoot, wsDirName, nodeDirName);

    const docsContent = data.docs.length > 0
      ? data.docs.map(doc => `- [${doc.description}](${doc.path})`).join("\n")
      : "";

    const typeLabel = data.type === "planning" ? "规划" : "执行";

    const content = `---
id: ${data.id}
type: ${data.type}
title: ${data.title}
status: ${data.status}
createdAt: ${data.createdAt}
updatedAt: ${data.updatedAt}
---

## 节点类型

${typeLabel}节点

## 需求

${data.requirement ?? ""}

## 文档引用

> 格式：- [文件名](路径) - 说明 (状态)

${docsContent}

## 备注

${data.notes}

## 结论

> 节点完成时填写

${data.conclusion}
`;

    await this.fs.writeFile(infoPath, content);
  }

  // ========== Log.md ==========

  /**
   * 读取日志
   * 增强健壮性：处理各种表格格式变体
   */
  async readLog(projectRoot: string, workspaceId: string, nodeId?: string): Promise<LogEntry[]> {
    const logPath = nodeId
      ? this.fs.getNodeLogPath(projectRoot, workspaceId, nodeId)
      : this.fs.getWorkspaceLogPath(projectRoot, workspaceId);

    if (!(await this.fs.exists(logPath))) {
      return [];
    }

    try {
      const content = await this.fs.readFile(logPath);
      return this.parseLogTableSafe(content);
    } catch {
      // 文件读取或解析失败，返回空数组
      return [];
    }
  }

  /**
   * 安全解析日志表格
   * @param content 日志内容
   * @returns 解析后的日志条目
   */
  private parseLogTableSafe(content: string): LogEntry[] {
    if (!content || typeof content !== "string") {
      return [];
    }

    const logs: LogEntry[] = [];

    // 规范化换行符
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    // 解析表格行
    const lines = normalized.split("\n");
    for (const line of lines) {
      // 跳过非表格行、表头和分隔线
      if (!line.startsWith("|")) continue;
      if (line.includes("时间") || line.includes("Time")) continue;
      if (/^\|[\s-:|]+\|$/.test(line)) continue;

      const parts = line.split("|").map(p => p.trim()).filter(p => p);
      if (parts.length >= 3) {
        // 还原转义的表格内容
        const event = unescapeTableCell(parts[2] || "");
        logs.push({
          time: parts[0] || "",
          operator: parts[1] || "AI",
          event
        });
      }
    }

    return logs;
  }

  /**
   * 获取日志文件路径（支持归档目录）
   */
  private getLogPath(projectRoot: string, wsDirName: string, nodeId?: string, isArchived = false): string {
    const basePath = isArchived
      ? this.fs.getArchivePath(projectRoot, wsDirName)
      : this.fs.getWorkspacePath(projectRoot, wsDirName);

    if (nodeId) {
      return `${basePath}/nodes/${nodeId}/Log.md`;
    }
    return `${basePath}/Log.md`;
  }

  /**
   * 追加日志
   * @param isArchived 是否写入归档目录（当 nodeId 为 true 时表示 isArchived）
   */
  async appendLog(projectRoot: string, workspaceId: string, entry: LogEntry, nodeIdOrIsArchived?: string | boolean, isArchived = false): Promise<void> {
    // 处理参数重载：appendLog(projectRoot, workspaceId, entry, isArchived) 或 appendLog(projectRoot, workspaceId, entry, nodeId, isArchived)
    let nodeId: string | undefined;
    let archived = isArchived;
    if (typeof nodeIdOrIsArchived === "boolean") {
      archived = nodeIdOrIsArchived;
    } else if (typeof nodeIdOrIsArchived === "string") {
      nodeId = nodeIdOrIsArchived;
    }

    const logPath = this.getLogPath(projectRoot, workspaceId, nodeId, archived);

    let content: string;
    if (await this.fs.exists(logPath)) {
      content = await this.fs.readFile(logPath);
    } else {
      content = `## 日志

| 时间 | 操作者 | 事件 |
|------|--------|------|
`;
    }

    const formattedTime = formatShort(entry.time);
    // 转义表格单元格内容（换行符和管道符）
    const escapedEvent = escapeTableCell(entry.event);
    content += `| ${formattedTime} | ${entry.operator} | ${escapedEvent} |\n`;

    await this.fs.writeFile(logPath, content);
  }

  /**
   * 创建空的日志文件
   */
  async createEmptyLog(projectRoot: string, workspaceId: string, nodeId?: string): Promise<void> {
    const logPath = nodeId
      ? this.fs.getNodeLogPath(projectRoot, workspaceId, nodeId)
      : this.fs.getWorkspaceLogPath(projectRoot, workspaceId);

    const content = `## 日志

| 时间 | 操作者 | 事件 |
|------|--------|------|
`;

    await this.fs.writeFile(logPath, content);
  }

  // ========== Problem.md ==========

  /**
   * 读取问题
   * @param isArchived 是否为归档工作区
   */
  async readProblem(projectRoot: string, workspaceId: string, nodeId?: string, isArchived: boolean = false): Promise<ProblemData> {
    const problemPath = nodeId
      ? (isArchived
          ? this.fs.getNodeProblemPathWithArchive(projectRoot, workspaceId, nodeId, true)
          : this.fs.getNodeProblemPath(projectRoot, workspaceId, nodeId))
      : (isArchived
          ? this.fs.getWorkspaceProblemPathWithArchive(projectRoot, workspaceId, true)
          : this.fs.getWorkspaceProblemPath(projectRoot, workspaceId));

    if (!(await this.fs.exists(problemPath))) {
      return {
        currentProblem: "（暂无）",
        nextStep: "（暂无）"
      };
    }

    const content = await this.fs.readFile(problemPath);

    let currentProblem = "（暂无）";
    const problemMatch = content.match(/## 当前问题\n\n([\s\S]*?)(?=\n## |$)/);
    if (problemMatch) {
      currentProblem = problemMatch[1].trim();
    }

    let nextStep = "（暂无）";
    const nextMatch = content.match(/## 下一步\n\n([\s\S]*?)$/);
    if (nextMatch) {
      nextStep = nextMatch[1].trim();
    }

    return { currentProblem, nextStep };
  }

  /**
   * 写入问题
   */
  async writeProblem(projectRoot: string, workspaceId: string, data: ProblemData, nodeId?: string): Promise<void> {
    // 验证内容格式（跳过默认占位符）
    if (data.currentProblem && data.currentProblem !== "（暂无）") {
      validateMultilineContent(data.currentProblem, "当前问题");
    }
    if (data.nextStep && data.nextStep !== "（暂无）") {
      validateMultilineContent(data.nextStep, "下一步");
    }

    const problemPath = nodeId
      ? this.fs.getNodeProblemPath(projectRoot, workspaceId, nodeId)
      : this.fs.getWorkspaceProblemPath(projectRoot, workspaceId);

    const content = `## 当前问题

${data.currentProblem}

## 下一步

${data.nextStep}
`;

    await this.fs.writeFile(problemPath, content);
  }

  /**
   * 创建空的问题文件
   */
  async createEmptyProblem(projectRoot: string, workspaceId: string, nodeId?: string): Promise<void> {
    await this.writeProblem(projectRoot, workspaceId, {
      currentProblem: "（暂无）",
      nextStep: "（暂无）"
    }, nodeId);
  }

  // ========== 原始文件读取 ==========

  /**
   * 读取 Workspace.md 原始内容
   * @param isArchived 是否为归档工作区
   */
  async readWorkspaceMdRaw(projectRoot: string, workspaceId: string, isArchived = false): Promise<string> {
    const mdPath = isArchived
      ? this.fs.getWorkspaceMdPathWithArchive(projectRoot, workspaceId, true)
      : this.fs.getWorkspaceMdPath(projectRoot, workspaceId);
    return await this.fs.readFile(mdPath);
  }

  /**
   * 读取节点 Info.md 原始内容
   * @param wsDirName 工作区目录名（非 workspaceId）
   * @param nodeDirName 节点目录名（非 nodeId）
   * @param isArchived 是否为归档工作区
   */
  async readNodeInfoRaw(projectRoot: string, wsDirName: string, nodeDirName: string, isArchived: boolean = false): Promise<string> {
    const infoPath = isArchived
      ? this.fs.getNodeInfoPathWithArchive(projectRoot, wsDirName, nodeDirName, true)
      : this.fs.getNodeInfoPath(projectRoot, wsDirName, nodeDirName);
    return await this.fs.readFile(infoPath);
  }

  /**
   * 读取日志原始内容
   */
  async readLogRaw(projectRoot: string, workspaceId: string, nodeId?: string, isArchived: boolean = false): Promise<string> {
    let logPath: string;
    if (nodeId) {
      logPath = isArchived
        ? this.fs.getNodeLogPathWithArchive(projectRoot, workspaceId, nodeId, true)
        : this.fs.getNodeLogPath(projectRoot, workspaceId, nodeId);
    } else {
      // 工作区级别日志暂不支持归档路径（归档工作区通常只读取节点）
      logPath = this.fs.getWorkspaceLogPath(projectRoot, workspaceId);
    }

    if (!(await this.fs.exists(logPath))) {
      return "";
    }
    return await this.fs.readFile(logPath);
  }

  /**
   * 读取问题原始内容
   */
  async readProblemRaw(projectRoot: string, workspaceId: string, nodeId?: string, isArchived: boolean = false): Promise<string> {
    let problemPath: string;
    if (nodeId) {
      problemPath = isArchived
        ? this.fs.getNodeProblemPathWithArchive(projectRoot, workspaceId, nodeId, true)
        : this.fs.getNodeProblemPath(projectRoot, workspaceId, nodeId);
    } else {
      // 工作区级别问题暂不支持归档路径
      problemPath = this.fs.getWorkspaceProblemPath(projectRoot, workspaceId);
    }

    if (!(await this.fs.exists(problemPath))) {
      return "";
    }
    return await this.fs.readFile(problemPath);
  }

  // ========== Phase 2 扩展方法 ==========

  /**
   * 解析日志表格（返回带类型的日志条目）
   * 增强健壮性：处理各种表格格式变体
   */
  parseLogTable(content: string): TypedLogEntry[] {
    if (!content || typeof content !== "string") {
      return [];
    }

    // 规范化换行符
    const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    const entries: TypedLogEntry[] = [];

    for (const line of lines) {
      // 跳过非表格行
      if (!line.startsWith("|")) continue;
      // 跳过表头和分隔线
      if (line.includes("时间") || line.includes("Time")) continue;
      if (/^\|[\s-:|]+\|$/.test(line)) continue;

      const cells = line.split("|").map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        const operator = cells[1];
        // 还原转义的表格内容
        const event = unescapeTableCell(cells[2] || "");
        entries.push({
          timestamp: cells[0] || "",
          operator: operator === "AI" || operator === "Human" ? operator : "AI",
          event,
        });
      }
    }

    return entries;
  }

  /**
   * 追加带类型的日志条目
   */
  async appendTypedLogEntry(
    projectRoot: string,
    workspaceId: string,
    entry: TypedLogEntry,
    nodeId?: string
  ): Promise<void> {
    const logPath = nodeId
      ? this.fs.getNodeLogPath(projectRoot, workspaceId, nodeId)
      : this.fs.getWorkspaceLogPath(projectRoot, workspaceId);

    let content: string;
    if (await this.fs.exists(logPath)) {
      content = await this.fs.readFile(logPath);
    } else {
      content = `## 日志

| 时间 | 操作者 | 事件 |
|------|--------|------|
`;
    }

    // 转义表格单元格内容（换行符和管道符）
    const escapedEvent = escapeTableCell(entry.event);
    const newLine = `| ${entry.timestamp} | ${entry.operator} | ${escapedEvent} |`;
    const updatedContent = content.trimEnd() + "\n" + newLine + "\n";
    await this.fs.writeFile(logPath, updatedContent);
  }

  /**
   * 解析文档引用（含状态）
   * 格式：- [文件名](路径) - 说明 (状态)
   */
  parseDocsWithStatus(content: string): DocRefWithStatus[] {
    const docs: DocRefWithStatus[] = [];
    // 匹配可选状态的格式
    const regex = /^- \[([^\]]+)\]\(([^)]+)\)(?: - (.+?))?(?: \((active|expired)\))?$/gm;

    let match;
    while ((match = regex.exec(content)) !== null) {
      docs.push({
        path: match[2],
        description: match[3] || match[1],
        status: (match[4] as "active" | "expired") ?? "active",
      });
    }

    return docs;
  }

  /**
   * 序列化带状态的文档引用
   */
  serializeDocWithStatus(doc: DocRefWithStatus): string {
    const name = doc.path.split("/").pop() ?? doc.path;
    return `- [${name}](${doc.path}) - ${doc.description} (${doc.status})`;
  }

  /**
   * 更新 Info.md 的结论部分
   * @param wsDirName 工作区目录名（非 workspaceId）
   * @param nodeDirName 节点目录名（非 nodeId）
   */
  async updateConclusion(
    projectRoot: string,
    wsDirName: string,
    nodeDirName: string,
    conclusion: string
  ): Promise<void> {
    const info = await this.readNodeInfo(projectRoot, wsDirName, nodeDirName);
    // 将字面量 \\n 转换为真正的换行符（MCP 工具调用时可能传入转义字符串）
    info.conclusion = conclusion.replace(/\\n/g, "\n");
    await this.writeNodeInfo(projectRoot, wsDirName, nodeDirName, info);
  }

  /**
   * 更新 Info.md 的状态
   * @param wsDirName 工作区目录名（非 workspaceId）
   * @param nodeDirName 节点目录名（非 nodeId）
   */
  async updateNodeStatus(
    projectRoot: string,
    wsDirName: string,
    nodeDirName: string,
    status: NodeStatus
  ): Promise<void> {
    const info = await this.readNodeInfo(projectRoot, wsDirName, nodeDirName);
    info.status = status;
    await this.writeNodeInfo(projectRoot, wsDirName, nodeDirName, info);
  }

  /**
   * 读取节点 Info.md（带状态的文档引用）
   * @param wsDirName 工作区目录名（非 workspaceId）
   * @param nodeDirName 节点目录名（非 nodeId）
   * @param isArchived 是否为归档工作区
   */
  async readNodeInfoWithStatus(projectRoot: string, wsDirName: string, nodeDirName: string, isArchived: boolean = false): Promise<NodeInfoData & { docsWithStatus: DocRefWithStatus[] }> {
    const infoPath = isArchived
      ? this.fs.getNodeInfoPathWithArchive(projectRoot, wsDirName, nodeDirName, true)
      : this.fs.getNodeInfoPath(projectRoot, wsDirName, nodeDirName);
    const content = await this.fs.readFile(infoPath);
    const parsed = this.parse(content);

    // 解析需求
    let requirement = "";
    const reqMatch = parsed.content.match(/## 需求\n\n([\s\S]*?)(?=\n## |$)/);
    if (reqMatch) {
      requirement = reqMatch[1].trim();
    }

    // 解析文档引用（含状态）
    const docsWithStatus: DocRefWithStatus[] = [];
    const docs: DocRef[] = [];
    const docsMatch = parsed.content.match(/## 文档引用\n\n(?:>.*\n\n)?([\s\S]*?)(?=\n## |$)/);
    if (docsMatch) {
      const docsContent = docsMatch[1].trim();
      if (docsContent) {
        const docLines = docsContent.split("\n").filter(line => line.startsWith("- "));
        for (const line of docLines) {
          // 匹配带状态的格式
          const docMatch = line.match(/- \[(.+?)\]\((.+?)\)(?: - (.+?))?(?: \((active|expired)\))?$/);
          if (docMatch) {
            const status = (docMatch[4] as "active" | "expired") ?? "active";
            docsWithStatus.push({
              path: docMatch[2],
              description: docMatch[3] || docMatch[1],
              status,
            });
            docs.push({
              path: docMatch[2],
              description: docMatch[3] || docMatch[1],
            });
          }
        }
      }
    }

    // 解析备注
    let notes = "";
    const notesMatch = parsed.content.match(/## 备注\n\n([\s\S]*?)(?=\n## |$)/);
    if (notesMatch) {
      notes = notesMatch[1].trim();
    }

    // 解析结论
    let conclusion = "";
    const conclusionMatch = parsed.content.match(/## 结论\n\n(?:>.*\n\n)?([\s\S]*?)$/);
    if (conclusionMatch) {
      conclusion = conclusionMatch[1].trim();
    }

    return {
      id: parsed.frontmatter.id as string || nodeDirName,
      type: (parsed.frontmatter.type as NodeType) || "execution",
      title: parsed.frontmatter.title as string || "",
      status: (parsed.frontmatter.status as NodeStatus) || "pending",
      createdAt: parsed.frontmatter.createdAt as string || "",
      updatedAt: parsed.frontmatter.updatedAt as string || "",
      requirement,
      docs,
      docsWithStatus,
      notes,
      conclusion,
    };
  }

  /**
   * 读取 Workspace.md（带状态的文档引用）
   * @param isArchived 是否为归档工作区
   */
  async readWorkspaceMdWithStatus(projectRoot: string, workspaceId: string, isArchived: boolean = false): Promise<WorkspaceMdData & { docsWithStatus: DocRefWithStatus[] }> {
    const mdPath = isArchived
      ? this.fs.getWorkspaceMdPathWithArchive(projectRoot, workspaceId, true)
      : this.fs.getWorkspaceMdPath(projectRoot, workspaceId);
    const content = await this.fs.readFile(mdPath);
    const parsed = this.parse(content);

    // 解析规则
    const rules: string[] = [];
    const rulesMatch = parsed.content.match(/## 规则\n\n(?:>.*\n\n)?([\s\S]*?)(?=\n## |$)/);
    if (rulesMatch) {
      const rulesContent = rulesMatch[1].trim();
      if (rulesContent) {
        const ruleLines = rulesContent.split("\n").filter(line => line.startsWith("- "));
        for (const line of ruleLines) {
          rules.push(line.substring(2).trim());
        }
      }
    }

    // 解析文档（含状态）
    const docs: DocRef[] = [];
    const docsWithStatus: DocRefWithStatus[] = [];
    const docsMatch = parsed.content.match(/## 文档\n\n(?:>.*\n\n)?([\s\S]*?)(?=\n## |$)/);
    if (docsMatch) {
      const docsContent = docsMatch[1].trim();
      if (docsContent) {
        const docLines = docsContent.split("\n").filter(line => line.startsWith("- "));
        for (const line of docLines) {
          const docMatch = line.match(/- \[(.+?)\]\((.+?)\)(?: - (.+?))?(?: \((active|expired)\))?$/);
          if (docMatch) {
            const status = (docMatch[4] as "active" | "expired") ?? "active";
            docsWithStatus.push({
              path: docMatch[2],
              description: docMatch[3] || docMatch[1],
              status,
            });
            docs.push({
              path: docMatch[2],
              description: docMatch[3] || docMatch[1],
            });
          }
        }
      }
    }

    // 解析目标
    let goal = "";
    const goalMatch = parsed.content.match(/## 目标\n\n([\s\S]*?)(?=\n## |$)/);
    if (goalMatch) {
      goal = goalMatch[1].trim();
    }

    return {
      name: parsed.frontmatter.name as string || "",
      createdAt: parsed.frontmatter.createdAt as string || "",
      updatedAt: parsed.frontmatter.updatedAt as string || "",
      rules,
      docs,
      docsWithStatus,
      goal,
    };
  }

  /**
   * 写入节点 Info.md（带状态的文档引用）
   * @param wsDirName 工作区目录名（非 workspaceId）
   * @param nodeDirName 节点目录名（非 nodeId）
   */
  async writeNodeInfoWithStatus(
    projectRoot: string,
    wsDirName: string,
    nodeDirName: string,
    data: NodeInfoData & { docsWithStatus?: DocRefWithStatus[] }
  ): Promise<void> {
    // 验证内容格式
    validateSingleLineContent(data.title, "节点标题");
    if (data.requirement) {
      validateMultilineContent(data.requirement, "需求描述");
    }
    if (data.notes) {
      validateMultilineContent(data.notes, "备注");
    }
    if (data.conclusion) {
      validateMultilineContent(data.conclusion, "结论");
    }

    const infoPath = this.fs.getNodeInfoPath(projectRoot, wsDirName, nodeDirName);

    // 如果有 docsWithStatus，优先使用
    let docsContent = "";
    if (data.docsWithStatus && data.docsWithStatus.length > 0) {
      docsContent = data.docsWithStatus.map(doc => this.serializeDocWithStatus(doc)).join("\n");
    } else if (data.docs.length > 0) {
      docsContent = data.docs.map(doc => `- [${doc.description}](${doc.path})`).join("\n");
    }

    const typeLabel = data.type === "planning" ? "规划" : "执行";

    const content = `---
id: ${data.id}
type: ${data.type}
title: ${data.title}
status: ${data.status}
createdAt: ${data.createdAt}
updatedAt: ${data.updatedAt}
---

## 节点类型

${typeLabel}节点

## 需求

${data.requirement ?? ""}

## 文档引用

> 格式：- [文件名](路径) - 说明 (状态)

${docsContent}

## 备注

${data.notes}

## 结论

> 节点完成时填写

${data.conclusion}
`;

    await this.fs.writeFile(infoPath, content);
  }
}
