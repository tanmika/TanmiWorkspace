// src/tools/help.ts
// TanmiWorkspace 帮助工具 - 为 AI 提供场景化指导

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { HELP_TOPICS, getFullInstructions, USER_PROMPTS } from "../prompts/instructions.js";
import type { InstallationService } from "../services/InstallationService.js";
import type { PlatformType } from "../types/settings.js";

/**
 * 帮助工具定义
 */
export const helpTools: Tool[] = [
  {
    name: "tanmi_help",
    description: `获取 TanmiWorkspace 的使用指南和场景化指导。

**三种调用方式**：
1. **无参数**：返回所有主题列表，用于了解有哪些帮助可用
2. **模糊搜索**：传入关键词，搜索匹配的主题（搜索主题ID和标题）
3. **精确获取**：传入精确的主题ID，获取完整帮助内容

**示例**：
- tanmi_help() → 返回主题列表
- tanmi_help({ topic: "派发" }) → 搜索含"派发"的主题
- tanmi_help({ topic: "dispatch" }) → 获取派发模式完整指南

**使用场景**：
1. 不确定下一步该做什么时
2. 需要向用户解释概念时
3. 遇到特定场景需要指导时`,
    inputSchema: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string",
          description: "帮助主题ID或搜索关键词。不传则返回主题列表"
        }
      },
      required: []
    }
  },
  {
    name: "tanmi_prompt",
    description: `获取用户引导话术模板，帮助 AI 更好地与用户沟通。

**可用模板**：
- welcome: 首次使用欢迎语
- confirm_workspace: 确认创建工作区
- confirm_plan: 确认任务计划
- status_report: 状态报告
- completion_report: 完成报告

**使用场景**：
- 需要向用户解释或确认时
- 报告进度或完成状态时`,
    inputSchema: {
      type: "object" as const,
      properties: {
        template: {
          type: "string",
          description: "模板名称",
          enum: ["welcome", "confirm_workspace", "confirm_plan", "status_report", "completion_report"]
        },
        params: {
          type: "object",
          description: "模板参数（根据不同模板需要不同参数）",
          additionalProperties: true
        }
      },
      required: ["template"]
    }
  }
];

/**
 * 帮助主题类型（精确匹配时使用）
 * 包含 HELP_TOPICS 中的静态主题和动态主题（status, all）
 */
export type HelpTopic = "overview" | "workflow" | "tools" | "start" | "resume" | "session_restore" | "blocked" | "split" | "complete" | "progress" | "guide" | "docs" | "reopen" | "dispatch" | "server" | "status" | "all";

/**
 * 主题列表项
 */
export interface TopicListItem {
  id: string;
  title: string;
}

/**
 * 帮助返回结果类型
 */
export type HelpResult =
  | { type: "list"; topics: TopicListItem[] }
  | { type: "matches"; matches: TopicListItem[]; hint: string }
  | { type: "content"; topic: string; title: string; content: string };

/**
 * 提示模板类型
 */
export type PromptTemplate = "welcome" | "confirm_workspace" | "confirm_plan" | "status_report" | "completion_report";

/**
 * 帮助服务
 */
export class HelpService {
  private installationService: InstallationService | null = null;

  /**
   * 设置 InstallationService 依赖
   */
  setInstallationService(service: InstallationService): void {
    this.installationService = service;
  }

  /**
   * 获取所有主题列表
   */
  private getTopicList(): TopicListItem[] {
    const topics: TopicListItem[] = Object.entries(HELP_TOPICS).map(([id, info]) => ({
      id,
      title: info.title
    }));
    // 添加动态主题
    topics.push({ id: "status", title: "插件安装状态" });
    topics.push({ id: "all", title: "完整指南" });
    return topics;
  }

  /**
   * 模糊搜索主题
   * 优先级：ID 前缀匹配 > ID 包含 > 标题包含
   */
  private fuzzySearch(query: string): TopicListItem[] {
    const topics = this.getTopicList();
    const q = query.toLowerCase();

    // 分组匹配结果
    const prefixMatches: TopicListItem[] = [];
    const idContains: TopicListItem[] = [];
    const titleContains: TopicListItem[] = [];

    for (const topic of topics) {
      const idLower = topic.id.toLowerCase();
      const titleLower = topic.title.toLowerCase();

      if (idLower.startsWith(q)) {
        prefixMatches.push(topic);
      } else if (idLower.includes(q)) {
        idContains.push(topic);
      } else if (titleLower.includes(q)) {
        titleContains.push(topic);
      }
    }

    // 按优先级合并，去重
    const seen = new Set<string>();
    const result: TopicListItem[] = [];
    for (const item of [...prefixMatches, ...idContains, ...titleContains]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        result.push(item);
      }
    }
    return result;
  }

  /**
   * 获取帮助内容
   * - 无参数：返回主题列表
   * - 模糊匹配：返回匹配的主题列表
   * - 精确匹配：返回完整内容
   */
  async getHelp(topic?: string): Promise<HelpResult> {
    // 无参数：返回主题列表
    if (!topic) {
      return {
        type: "list",
        topics: this.getTopicList()
      };
    }

    // 精确匹配：all
    if (topic === "all") {
      return {
        type: "content",
        topic: "all",
        title: "TanmiWorkspace 完整指南",
        content: getFullInstructions()
      };
    }

    // 精确匹配：status（动态内容）
    if (topic === "status") {
      return {
        type: "content",
        topic: "status",
        title: "插件安装状态",
        content: await this.generateStatusContent()
      };
    }

    // 精确匹配：HELP_TOPICS 中的主题
    const helpTopic = HELP_TOPICS[topic];
    if (helpTopic) {
      return {
        type: "content",
        topic,
        title: helpTopic.title,
        content: helpTopic.content
      };
    }

    // 模糊搜索
    const matches = this.fuzzySearch(topic);
    if (matches.length === 0) {
      return {
        type: "matches",
        matches: [],
        hint: `未找到与 "${topic}" 相关的主题。使用 tanmi_help() 查看所有主题。`
      };
    }

    // 如果只有一个匹配且是精确前缀，直接返回内容
    if (matches.length === 1 && matches[0].id.toLowerCase().startsWith(topic.toLowerCase())) {
      const matchedId = matches[0].id;
      if (matchedId === "status") {
        return {
          type: "content",
          topic: "status",
          title: "插件安装状态",
          content: await this.generateStatusContent()
        };
      }
      if (matchedId === "all") {
        return {
          type: "content",
          topic: "all",
          title: "TanmiWorkspace 完整指南",
          content: getFullInstructions()
        };
      }
      const matched = HELP_TOPICS[matchedId];
      if (matched) {
        return {
          type: "content",
          topic: matchedId,
          title: matched.title,
          content: matched.content
        };
      }
    }

    return {
      type: "matches",
      matches,
      hint: "请用精确的主题 ID 获取完整内容"
    };
  }

  /**
   * 生成插件安装状态内容
   */
  private async generateStatusContent(): Promise<string> {
    if (!this.installationService) {
      return "⚠️ 无法获取安装状态（服务未初始化）";
    }

    try {
      const meta = await this.installationService.read();
      const currentVersion = this.installationService.getPackageVersion();

      const platforms: Array<{
        name: string;
        platform: PlatformType;
        hooks: string;
        mcp: string;
        agents: string;
        skills: string;
        version: string;
        status: string;
      }> = [
        { name: "Claude Code", platform: "claudeCode", hooks: "-", mcp: "-", agents: "-", skills: "-", version: "-", status: "未安装" },
        { name: "Cursor", platform: "cursor", hooks: "-", mcp: "-", agents: "-", skills: "-", version: "-", status: "未安装" },
        { name: "Codex", platform: "codex", hooks: "-", mcp: "-", agents: "-", skills: "-", version: "-", status: "未安装" },
      ];

      for (const p of platforms) {
        const info = meta.global.platforms[p.platform];
        if (info?.enabled) {
          // 检查各组件安装状态
          p.hooks = info.components.hooks?.installed ? "✅" : "-";
          p.mcp = info.components.mcp?.installed ? "✅" : "-";
          p.agents = info.components.agents?.installed ? "✅" : "-";
          p.skills = info.components.skills?.installed ? "✅" : "-";

          // 从组件中提取版本信息（取第一个已安装组件的版本）
          let foundVersion: string | undefined;
          let hasOutdated = false;

          for (const comp of Object.values(info.components)) {
            const compInfo = comp as { installed?: boolean; version?: string };
            if (compInfo?.installed && compInfo.version) {
              if (!foundVersion) {
                foundVersion = compInfo.version;
              }
              if (compInfo.version !== currentVersion) {
                hasOutdated = true;
              }
            }
          }

          p.version = foundVersion || "-";
          p.status = hasOutdated ? "⚠️ 需更新" : "✅ 最新";
        }
      }

      const table = [
        "| 平台 | Hooks | MCP | Agents | Skills | 版本 | 状态 |",
        "|------|-------|-----|--------|--------|------|------|",
        ...platforms.map(p =>
          `| ${p.name} | ${p.hooks} | ${p.mcp} | ${p.agents} | ${p.skills} | ${p.version} | ${p.status} |`
        )
      ].join("\n");

      return `# 插件安装状态

${table}

**当前版本**: ${currentVersion}
**更新命令**: \`bash ~/.tanmi-workspace/scripts/install-global.sh\`

## 组件说明

- **Hooks**: 自动注入工作区上下文到会话
- **MCP**: MCP 服务器配置
- **Agents**: 派发执行器 (tanmi-executor, tanmi-reviewer)
- **Skills**: 自定义技能（即将支持）
`;
    } catch (err) {
      return `⚠️ 获取安装状态失败: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  /**
   * 获取提示模板
   */
  getPrompt(template: PromptTemplate, params?: Record<string, unknown>): { template: string; content: string } {
    switch (template) {
      case "welcome":
        return {
          template: "welcome",
          content: USER_PROMPTS.welcome
        };

      case "confirm_workspace":
        return {
          template: "confirm_workspace",
          content: USER_PROMPTS.confirmWorkspace(
            (params?.name as string) || "[任务名称]",
            (params?.goal as string) || "[任务目标]"
          )
        };

      case "confirm_plan":
        return {
          template: "confirm_plan",
          content: USER_PROMPTS.confirmPlan(
            (params?.tasks as string[]) || ["[任务1]", "[任务2]", "[任务3]"]
          )
        };

      case "status_report":
        return {
          template: "status_report",
          content: USER_PROMPTS.statusReport(
            (params?.status as string) || "[状态]",
            (params?.current as string) || "[当前任务]",
            params?.problem as string | undefined
          )
        };

      case "completion_report":
        return {
          template: "completion_report",
          content: USER_PROMPTS.completionReport(
            (params?.conclusion as string) || "[结论]",
            (params?.outputs as string[]) || ["[产出1]", "[产出2]"]
          )
        };

      default:
        return {
          template: "error",
          content: `未知模板: ${template}\n\n可用模板: welcome, confirm_workspace, confirm_plan, status_report, completion_report`
        };
    }
  }
}
