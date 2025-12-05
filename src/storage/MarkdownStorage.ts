// src/storage/MarkdownStorage.ts

import type { FileSystemAdapter } from "./FileSystemAdapter.js";
import type { WorkspaceMdData, LogEntry, ProblemData, DocRef } from "../types/workspace.js";
import type { NodeInfoData, NodeStatus } from "../types/node.js";
import type { DocRefWithStatus, TypedLogEntry } from "../types/context.js";
import { formatShort, formatHHmm } from "../utils/time.js";

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
   */
  parse(content: string): ParsedMarkdown {
    const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = content.match(frontmatterRegex);

    if (!match) {
      return {
        frontmatter: {},
        content: content
      };
    }

    const frontmatterStr = match[1];
    const body = match[2];

    // 简单的 YAML 解析（只处理 key: value 格式）
    const frontmatter: Record<string, unknown> = {};
    const lines = frontmatterStr.split("\n");
    for (const line of lines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        frontmatter[key] = value;
      }
    }

    return {
      frontmatter,
      content: body
    };
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
   */
  async readWorkspaceMd(projectRoot: string, workspaceId: string): Promise<WorkspaceMdData> {
    const mdPath = this.fs.getWorkspaceMdPath(projectRoot, workspaceId);
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

${data.goal}
`;

    await this.fs.writeFile(mdPath, content);
  }

  // ========== Node Info.md ==========

  /**
   * 读取节点 Info.md
   */
  async readNodeInfo(projectRoot: string, workspaceId: string, nodeId: string): Promise<NodeInfoData> {
    const infoPath = this.fs.getNodeInfoPath(projectRoot, workspaceId, nodeId);
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
      id: parsed.frontmatter.id as string || nodeId,
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
   */
  async writeNodeInfo(projectRoot: string, workspaceId: string, nodeId: string, data: NodeInfoData): Promise<void> {
    const infoPath = this.fs.getNodeInfoPath(projectRoot, workspaceId, nodeId);

    const docsContent = data.docs.length > 0
      ? data.docs.map(doc => `- [${doc.description}](${doc.path})`).join("\n")
      : "";

    const content = `---
id: ${data.id}
title: ${data.title}
status: ${data.status}
createdAt: ${data.createdAt}
updatedAt: ${data.updatedAt}
---

## 需求

${data.requirement}

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
   */
  async readLog(projectRoot: string, workspaceId: string, nodeId?: string): Promise<LogEntry[]> {
    const logPath = nodeId
      ? this.fs.getNodeLogPath(projectRoot, workspaceId, nodeId)
      : this.fs.getWorkspaceLogPath(projectRoot, workspaceId);

    if (!(await this.fs.exists(logPath))) {
      return [];
    }

    const content = await this.fs.readFile(logPath);
    const logs: LogEntry[] = [];

    // 解析表格行
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.startsWith("|") && !line.includes("时间") && !line.includes("---")) {
        const parts = line.split("|").map(p => p.trim()).filter(p => p);
        if (parts.length >= 3) {
          logs.push({
            time: parts[0],
            operator: parts[1],
            event: parts[2]
          });
        }
      }
    }

    return logs;
  }

  /**
   * 追加日志
   */
  async appendLog(projectRoot: string, workspaceId: string, entry: LogEntry, nodeId?: string): Promise<void> {
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

    const formattedTime = formatShort(entry.time);
    content += `| ${formattedTime} | ${entry.operator} | ${entry.event} |\n`;

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
   */
  async readProblem(projectRoot: string, workspaceId: string, nodeId?: string): Promise<ProblemData> {
    const problemPath = nodeId
      ? this.fs.getNodeProblemPath(projectRoot, workspaceId, nodeId)
      : this.fs.getWorkspaceProblemPath(projectRoot, workspaceId);

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
   */
  async readWorkspaceMdRaw(projectRoot: string, workspaceId: string): Promise<string> {
    const mdPath = this.fs.getWorkspaceMdPath(projectRoot, workspaceId);
    return await this.fs.readFile(mdPath);
  }

  /**
   * 读取节点 Info.md 原始内容
   */
  async readNodeInfoRaw(projectRoot: string, workspaceId: string, nodeId: string): Promise<string> {
    const infoPath = this.fs.getNodeInfoPath(projectRoot, workspaceId, nodeId);
    return await this.fs.readFile(infoPath);
  }

  /**
   * 读取日志原始内容
   */
  async readLogRaw(projectRoot: string, workspaceId: string, nodeId?: string): Promise<string> {
    const logPath = nodeId
      ? this.fs.getNodeLogPath(projectRoot, workspaceId, nodeId)
      : this.fs.getWorkspaceLogPath(projectRoot, workspaceId);

    if (!(await this.fs.exists(logPath))) {
      return "";
    }
    return await this.fs.readFile(logPath);
  }

  /**
   * 读取问题原始内容
   */
  async readProblemRaw(projectRoot: string, workspaceId: string, nodeId?: string): Promise<string> {
    const problemPath = nodeId
      ? this.fs.getNodeProblemPath(projectRoot, workspaceId, nodeId)
      : this.fs.getWorkspaceProblemPath(projectRoot, workspaceId);

    if (!(await this.fs.exists(problemPath))) {
      return "";
    }
    return await this.fs.readFile(problemPath);
  }

  // ========== Phase 2 扩展方法 ==========

  /**
   * 解析日志表格（返回带类型的日志条目）
   */
  parseLogTable(content: string): TypedLogEntry[] {
    const lines = content.split("\n");
    const entries: TypedLogEntry[] = [];

    for (const line of lines) {
      // 跳过表头和分隔线
      if (line.startsWith("|") && !line.includes("---") && !line.includes("时间")) {
        const cells = line.split("|").map(c => c.trim()).filter(Boolean);
        if (cells.length >= 3) {
          const operator = cells[1];
          entries.push({
            timestamp: cells[0],
            operator: operator === "AI" || operator === "Human" ? operator : "AI",
            event: cells[2],
          });
        }
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

    const newLine = `| ${entry.timestamp} | ${entry.operator} | ${entry.event} |`;
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
   */
  async updateConclusion(
    projectRoot: string,
    workspaceId: string,
    nodeId: string,
    conclusion: string
  ): Promise<void> {
    const info = await this.readNodeInfo(projectRoot, workspaceId, nodeId);
    info.conclusion = conclusion;
    await this.writeNodeInfo(projectRoot, workspaceId, nodeId, info);
  }

  /**
   * 更新 Info.md 的状态
   */
  async updateNodeStatus(
    projectRoot: string,
    workspaceId: string,
    nodeId: string,
    status: NodeStatus
  ): Promise<void> {
    const info = await this.readNodeInfo(projectRoot, workspaceId, nodeId);
    info.status = status;
    await this.writeNodeInfo(projectRoot, workspaceId, nodeId, info);
  }

  /**
   * 读取节点 Info.md（带状态的文档引用）
   */
  async readNodeInfoWithStatus(projectRoot: string, workspaceId: string, nodeId: string): Promise<NodeInfoData & { docsWithStatus: DocRefWithStatus[] }> {
    const infoPath = this.fs.getNodeInfoPath(projectRoot, workspaceId, nodeId);
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
      id: parsed.frontmatter.id as string || nodeId,
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
   */
  async readWorkspaceMdWithStatus(projectRoot: string, workspaceId: string): Promise<WorkspaceMdData & { docsWithStatus: DocRefWithStatus[] }> {
    const mdPath = this.fs.getWorkspaceMdPath(projectRoot, workspaceId);
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
   */
  async writeNodeInfoWithStatus(
    projectRoot: string,
    workspaceId: string,
    nodeId: string,
    data: NodeInfoData & { docsWithStatus?: DocRefWithStatus[] }
  ): Promise<void> {
    const infoPath = this.fs.getNodeInfoPath(projectRoot, workspaceId, nodeId);

    // 如果有 docsWithStatus，优先使用
    let docsContent = "";
    if (data.docsWithStatus && data.docsWithStatus.length > 0) {
      docsContent = data.docsWithStatus.map(doc => this.serializeDocWithStatus(doc)).join("\n");
    } else if (data.docs.length > 0) {
      docsContent = data.docs.map(doc => `- [${doc.description}](${doc.path})`).join("\n");
    }

    const content = `---
id: ${data.id}
title: ${data.title}
status: ${data.status}
createdAt: ${data.createdAt}
updatedAt: ${data.updatedAt}
---

## 需求

${data.requirement}

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
