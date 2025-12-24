// src/tools/help.ts
// TanmiWorkspace 帮助工具 - 为 AI 提供场景化指导

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { HELP_TOPICS, getFullInstructions, USER_PROMPTS } from "../prompts/instructions.js";

/**
 * 帮助工具定义
 */
export const helpTools: Tool[] = [
  {
    name: "tanmi_help",
    description: `获取 TanmiWorkspace 的使用指南和场景化指导。

**首次使用时**：调用 tanmi_help(topic="overview") 获取系统概述。

**可用主题**：
- overview: 系统概述，了解 TanmiWorkspace 是什么
- workflow: 核心工作流程，状态流转规则
- tools: 工具速查表，所有工具的快速参考
- start: 如何开始新任务
- resume: 如何继续之前的任务
- session_restore: 会话恢复（从摘要恢复时验证 ID）
- blocked: 任务遇到问题时怎么办
- split: 何时以及如何分解任务
- complete: 如何完成任务
- progress: 如何查看和报告进度
- guide: 如何引导不熟悉的用户
- docs: 文档引用管理（派发、查找、生命周期）
- dispatch: 派发模式（subagent 执行、自动验证、失败回滚）
- server: 服务器状态与自检（端口、CLI 命令、常见问题）
- all: 获取完整指南

**使用场景**：
1. 不确定下一步该做什么时
2. 需要向用户解释概念时
3. 遇到特定场景需要指导时`,
    inputSchema: {
      type: "object" as const,
      properties: {
        topic: {
          type: "string",
          description: "帮助主题：overview, workflow, tools, start, resume, session_restore, blocked, split, complete, progress, guide, docs, dispatch, server, all",
          enum: ["overview", "workflow", "tools", "start", "resume", "session_restore", "blocked", "split", "complete", "progress", "guide", "docs", "dispatch", "server", "all"]
        }
      },
      required: ["topic"]
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
 * 帮助主题类型
 */
export type HelpTopic = "overview" | "workflow" | "tools" | "start" | "resume" | "session_restore" | "blocked" | "split" | "complete" | "progress" | "guide" | "docs" | "dispatch" | "server" | "all";

/**
 * 提示模板类型
 */
export type PromptTemplate = "welcome" | "confirm_workspace" | "confirm_plan" | "status_report" | "completion_report";

/**
 * 帮助服务
 */
export class HelpService {
  /**
   * 获取帮助内容
   */
  getHelp(topic: HelpTopic): { topic: string; title: string; content: string } {
    if (topic === "all") {
      return {
        topic: "all",
        title: "TanmiWorkspace 完整指南",
        content: getFullInstructions()
      };
    }

    const helpTopic = HELP_TOPICS[topic];
    if (!helpTopic) {
      return {
        topic: "error",
        title: "未知主题",
        content: `未找到主题: ${topic}\n\n可用主题: ${Object.keys(HELP_TOPICS).join(", ")}, all`
      };
    }

    return {
      topic,
      title: helpTopic.title,
      content: helpTopic.content
    };
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
