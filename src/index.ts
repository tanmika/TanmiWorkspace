#!/usr/bin/env node
// src/index.ts
// 统一入口：MCP Server + HTTP Server
// 注意：生产环境应通过 check-node-version.js 启动，以确保版本检查在模块加载前执行

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { FastifyInstance } from "fastify";

import { createServices, type Services } from "./http/services.js";
import { createServer } from "./http/server.js";
import { isPortInUse } from "./utils/port.js";
import { handleOldProcess, writePidInfo, removePidFile, getPidFilePath } from "./utils/processManager.js";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { workspaceTools } from "./tools/workspace.js";
import { nodeTools } from "./tools/node.js";
import { stateTools } from "./tools/state.js";
import { contextTools } from "./tools/context.js";
import { logTools } from "./tools/log.js";
import { sessionTools } from "./tools/session.js";
import { helpTools, type HelpTopic, type PromptTemplate } from "./tools/help.js";
import { importTools } from "./tools/import.js";
import { dispatchTools } from "./tools/dispatch.js";
import { configTools } from "./tools/config.js";
import { generateImportGuide, listChanges } from "./services/OpenSpecParser.js";
import { getFullInstructions } from "./prompts/instructions.js";
import { TanmiError } from "./types/errors.js";
import type { TransitionAction, ReferenceAction } from "./types/index.js";
import { validateAndCorrectParams } from "./utils/paramValidator.js";
import { logMcpStart, logMcpEnd, logMcpError } from "./utils/sessionLogger.js";
import { formatManualChangeReminder } from "./utils/manualChangeFormatter.js";
import { devLog } from "./utils/devLog.js";

// ============================================================================
// 配置
// ============================================================================
const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";
// 开发模式默认端口 19541，正式模式默认端口 19540
const DEFAULT_PORT = IS_DEV ? "19541" : "19540";
const HTTP_PORT = parseInt(process.env.HTTP_PORT ?? process.env.PORT ?? DEFAULT_PORT, 10);
const DISABLE_HTTP = process.env.DISABLE_HTTP === "true";

// ============================================================================
// 日志工具
// ============================================================================
const MODE_LABEL = IS_DEV ? "[DEV]" : "[PROD]";

function logMcp(message: string): void {
  console.error(`[mcp]${MODE_LABEL} ${message}`);
}

function logHttp(message: string): void {
  console.error(`[http]${MODE_LABEL} ${message}`);
}

// ============================================================================
// 获取当前版本
// ============================================================================
function getCurrentVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const require = createRequire(import.meta.url);
    const pkg = require(join(__dirname, "..", "package.json"));
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

const CURRENT_VERSION = getCurrentVersion();

// ============================================================================
// HTTP Server 后台启动
// ============================================================================
async function startHttpServerInBackground(port: number): Promise<FastifyInstance | null> {
  // 检查是否禁用 HTTP
  if (DISABLE_HTTP) {
    logHttp("HTTP server 已禁用 (DISABLE_HTTP=true)");
    return null;
  }

  // 使用与 server.ts 一致的 host 设置（默认 127.0.0.1，可通过环境变量覆盖）
  const host = process.env.TANMI_HOST || "127.0.0.1";

  // 处理旧版本进程
  const canStart = handleOldProcess(port, CURRENT_VERSION, logHttp);
  if (!canStart) {
    // 检查是否是因为相同版本已在运行（不是真正的错误）
    if (await isPortInUse(port, host)) {
      logHttp(`相同版本已在运行，复用现有服务`);
    }
    return null;
  }

  // 再次检测端口占用（处理非 tanmi-workspace 进程占用的情况）
  if (await isPortInUse(port, host)) {
    logHttp(`端口 ${host}:${port} 被其他服务占用，跳过 HTTP 启动`);
    return null;
  }

  try {
    const server = await createServer();
    await server.listen({ port, host });
    logHttp(`Listening on http://${host}:${port} (v${CURRENT_VERSION})`);

    // 写入 PID 信息
    writePidInfo({
      pid: process.pid,
      port,
      version: CURRENT_VERSION,
      startedAt: new Date().toISOString(),
    });

    // 进程退出时清理
    const cleanup = () => {
      removePidFile();
    };
    process.on("exit", cleanup);
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    return server;
  } catch (err) {
    logHttp(`启动失败: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ============================================================================
// MCP Server 创建
// ============================================================================
function createMcpServer(services: Services): Server {
  const server = new Server(
    {
      name: "tanmi-workspace",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    }
  );

  // 所有工具列表
  const allTools = [
    ...workspaceTools,
    ...nodeTools,
    ...stateTools,
    ...contextTools,
    ...logTools,
    ...sessionTools,
    ...helpTools,
    ...importTools,
    ...dispatchTools,
    ...configTools,
  ];

  // 创建工具名到 Tool 定义的映射（用于参数验证）
  const toolMap = new Map(allTools.map(tool => [tool.name, tool]));

  // 注册工具列表处理器
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  // 注册工具调用处理器
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const startTime = Date.now();

    // 记录 MCP 调用开始
    logMcpStart(name, rawArgs as Record<string, unknown> || {});

    try {
      // 确保基础目录存在
      await services.fs.ensureIndex();

      // 参数验证与自动纠错
      let args = rawArgs as Record<string, unknown> | undefined;
      let paramWarnings: string[] = [];

      const tool = toolMap.get(name);
      if (tool) {
        const validation = validateAndCorrectParams(
          name,
          rawArgs as Record<string, unknown> | undefined,
          tool
        );

        // 如果有错误，抛出异常
        if (validation.errors.length > 0) {
          throw new TanmiError("UNKNOWN_PARAMS", validation.errors.join("\n"));
        }

        // 使用纠正后的参数
        args = validation.correctedArgs;
        paramWarnings = validation.warnings;
      }

      let result: unknown;

      switch (name) {
        // Workspace 工具
        case "workspace_init": {
          // 参数验证：检测常见的错误参数名
          const wrongParamMapping: Record<string, string> = {
            description: "goal",
            desc: "goal",
            objective: "goal",
            target: "goal",
            purpose: "goal",
          };
          const wrongParams = Object.keys(wrongParamMapping).filter(wrong => args?.[wrong] !== undefined);
          if (wrongParams.length > 0) {
            const corrections = wrongParams.map(wrong => `"${wrong}" → "${wrongParamMapping[wrong]}"`).join(", ");
            throw new TanmiError(
              "INVALID_PARAMS",
              `参数名错误: ${corrections}。请使用正确的参数名重新调用。`
            );
          }

          // 验证必填参数
          if (!args?.name) {
            throw new TanmiError("INVALID_PARAMS", "缺少必填参数 'name'（工作区名称）");
          }
          if (!args?.goal) {
            throw new TanmiError("INVALID_PARAMS", "缺少必填参数 'goal'（工作区目标描述）");
          }

          result = await services.workspace.init({
            name: args.name as string,
            goal: args.goal as string,
            rules: args?.rules as string[] | undefined,
            docs: args?.docs as Array<{ path: string; description: string }> | undefined,
          });
          break;
        }

        case "workspace_list":
          result = await services.workspace.list({
            status: args?.status as "active" | "archived" | "all" | undefined,
          });
          break;

        case "workspace_get":
          result = await services.workspace.get({
            workspaceId: args?.workspaceId as string,
          });
          break;

        case "workspace_delete":
          result = await services.workspace.delete({
            workspaceId: args?.workspaceId as string,
            force: args?.force as boolean | undefined,
          });
          break;

        case "workspace_status":
          result = await services.workspace.status({
            workspaceId: args?.workspaceId as string,
            format: args?.format as "box" | "markdown" | undefined,
          });
          break;

        case "workspace_update_rules":
          result = await services.workspace.updateRules({
            workspaceId: args?.workspaceId as string,
            action: args?.action as "add" | "remove" | "replace",
            rule: args?.rule as string | undefined,
            rules: args?.rules as string[] | undefined,
          });
          break;

        case "workspace_archive":
          result = await services.workspace.archive({
            workspaceId: args?.workspaceId as string,
          });
          break;

        case "workspace_restore":
          result = await services.workspace.restore({
            workspaceId: args?.workspaceId as string,
          });
          break;

        // Node 工具
        case "node_create":
          result = await services.node.create({
            workspaceId: args?.workspaceId as string,
            parentId: args?.parentId as string,
            type: args?.type as "planning" | "execution",
            title: args?.title as string,
            requirement: args?.requirement as string | undefined,
            docs: args?.docs as Array<{ path: string; description: string }> | undefined,
            rulesHash: args?.rulesHash as string | undefined,
            role: args?.role as "info_collection" | "validation" | "summary" | undefined,
            isNeedTest: args?.isNeedTest as boolean | undefined,
            testRequirement: args?.testRequirement as string | undefined,
          });
          break;

        case "node_get":
          result = await services.node.get({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
          });
          break;

        case "node_list":
          result = await services.node.list({
            workspaceId: args?.workspaceId as string,
            rootId: args?.rootId as string | undefined,
            depth: args?.depth as number | undefined,
          });
          break;

        case "node_delete":
          result = await services.node.delete({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
          });
          break;

        // Phase 3: 节点更新
        case "node_update":
          result = await services.node.update({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
            title: args?.title as string | undefined,
            requirement: args?.requirement as string | undefined,
            note: args?.note as string | undefined,
            conclusion: args?.conclusion as string | undefined,
          });
          break;

        case "node_move":
          result = await services.node.move({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
            newParentId: args?.newParentId as string,
          });
          break;

        // Phase 2: 状态转换工具
        case "node_transition":
          result = await services.state.transition({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
            action: args?.action as TransitionAction,
            reason: args?.reason as string | undefined,
            conclusion: args?.conclusion as string | undefined,
          });
          break;

        // Phase 2: 上下文工具
        case "context_get":
          result = await services.context.get({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
            includeLog: args?.includeLog as boolean | undefined,
            maxLogEntries: args?.maxLogEntries as number | undefined,
            reverseLog: args?.reverseLog as boolean | undefined,
            includeProblem: args?.includeProblem as boolean | undefined,
          });
          break;

        case "context_focus":
          result = await services.context.focus({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
          });
          break;

        case "node_isolate":
          result = await services.reference.isolate({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
            isolate: args?.isolate as boolean,
          });
          break;

        case "node_reference":
          result = await services.reference.reference({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string,
            targetIdOrPath: args?.targetIdOrPath as string,
            action: args?.action as ReferenceAction,
            description: args?.description as string | undefined,
          });
          break;

        // Phase 2: 日志工具
        case "log_append":
          result = await services.log.append({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string | undefined,
            operator: args?.operator as "AI" | "Human",
            event: args?.event as string,
          });
          break;

        case "problem_update":
          result = await services.log.updateProblem({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string | undefined,
            problem: args?.problem as string,
            nextStep: args?.nextStep as string | undefined,
          });
          break;

        case "problem_clear":
          result = await services.log.clearProblem({
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string | undefined,
          });
          break;

        // Session 工具
        case "session_bind":
          result = await services.session.bind({
            sessionId: args?.sessionId as string,
            workspaceId: args?.workspaceId as string,
            nodeId: args?.nodeId as string | undefined,
          });
          break;

        case "session_unbind":
          result = await services.session.unbind({
            sessionId: args?.sessionId as string,
          });
          break;

        case "session_status":
          result = await services.session.status({
            sessionId: args?.sessionId as string,
          });
          break;

        case "get_pending_changes":
          result = await services.session.getPendingChanges({
            sessionId: args?.sessionId as string,
            workspaceId: args?.workspaceId as string | undefined,
          });
          break;

        // Help 工具
        case "tanmi_help":
          result = services.help.getHelp(args?.topic as HelpTopic);
          break;

        case "tanmi_prompt":
          result = services.help.getPrompt(
            args?.template as PromptTemplate,
            args?.params as Record<string, unknown> | undefined
          );
          break;

        // Import 工具
        case "workspace_import_guide": {
          const path = args?.path as string;
          const type = args?.type as string;
          const changeId = args?.changeId as string;
          const projectRoot = args?.projectRoot as string;

          if (type !== 'openspec') {
            throw new Error(`不支持的规范类型: ${type}`);
          }

          result = generateImportGuide(path, changeId, projectRoot);
          break;
        }

        case "workspace_import_list": {
          const path = args?.path as string;
          const type = args?.type as string;

          if (type !== 'openspec') {
            throw new Error(`不支持的规范类型: ${type}`);
          }

          const changes = listChanges(path);
          result = { type, changes };
          break;
        }

        // Dispatch 工具
        case "dispatch_enable": {
          const workspaceId = args?.workspaceId as string;
          const useGit = args?.useGit as boolean | undefined;
          const projectRoot = await services.workspace.resolveProjectRoot(workspaceId);
          result = await services.dispatch.enableDispatch(workspaceId, projectRoot, { useGit });
          break;
        }

        case "dispatch_disable": {
          const workspaceId = args?.workspaceId as string;
          const projectRoot = await services.workspace.resolveProjectRoot(workspaceId);
          result = await services.dispatch.queryDisableDispatch(workspaceId, projectRoot);
          break;
        }

        case "dispatch_disable_execute": {
          const workspaceId = args?.workspaceId as string;
          const mergeStrategy = args?.mergeStrategy as "sequential" | "squash" | "cherry-pick" | "skip";
          const keepBackupBranch = args?.keepBackupBranch as boolean | undefined;
          const keepProcessBranch = args?.keepProcessBranch as boolean | undefined;
          const commitMessage = args?.commitMessage as string | undefined;
          const projectRoot = await services.workspace.resolveProjectRoot(workspaceId);
          result = await services.dispatch.executeDisableChoice(projectRoot, {
            workspaceId,
            mergeStrategy,
            keepBackupBranch: keepBackupBranch ?? false,
            keepProcessBranch: keepProcessBranch ?? false,
            commitMessage,
          });
          break;
        }

        case "node_dispatch": {
          const workspaceId = args?.workspaceId as string;
          const nodeId = args?.nodeId as string;
          const projectRoot = await services.workspace.resolveProjectRoot(workspaceId);
          result = await services.dispatch.prepareDispatch(workspaceId, projectRoot, nodeId);
          break;
        }

        case "node_dispatch_complete": {
          const workspaceId = args?.workspaceId as string;
          const nodeId = args?.nodeId as string;
          const success = args?.success as boolean;
          const conclusion = args?.conclusion as string | undefined;
          const projectRoot = await services.workspace.resolveProjectRoot(workspaceId);
          result = await services.dispatch.completeDispatch(workspaceId, projectRoot, nodeId, success, conclusion);
          break;
        }

        case "dispatch_cleanup": {
          const workspaceId = args?.workspaceId as string;
          const projectRoot = await services.workspace.resolveProjectRoot(workspaceId);
          result = await services.dispatch.cleanupBranches(workspaceId, projectRoot);
          break;
        }

        // Config 工具
        case "config_get": {
          result = await services.config.get();
          break;
        }

        case "config_set": {
          const defaultDispatchMode = args?.defaultDispatchMode as "none" | "git" | "no-git" | undefined;
          result = await services.config.set({ defaultDispatchMode });
          break;
        }

        default:
          throw new Error(`未知工具: ${name}`);
      }

      // 记录 MCP 调用成功
      const duration = Date.now() - startTime;
      logMcpEnd(name, true, result, duration);

      // 检查并附加手动变更提醒（针对工作区相关工具）
      let responseText = JSON.stringify(result, null, 2);

      // 附加参数纠正警告
      if (paramWarnings.length > 0) {
        responseText = responseText + "\n\n⚠️ " + paramWarnings.join("\n⚠️ ");
      }

      const workspaceId = args?.workspaceId as string | undefined;

      // 排除 context_get 和 workspace_get（它们会清除变更，所以不需要提醒）
      const shouldCheckManualChanges = workspaceId &&
        name !== "context_get" &&
        name !== "workspace_get";

      if (shouldCheckManualChanges) {
        try {
          const manualChanges = await services.workspace.getManualChanges(workspaceId);
          if (manualChanges.length > 0) {
            const reminder = formatManualChangeReminder(manualChanges);
            responseText = responseText + "\n\n" + reminder;
          }
        } catch (error) {
          // 静默失败：如果获取变更失败，不影响主响应
          devLog.warn("获取手动变更失败", { error });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
      };
    } catch (error) {
      // 记录 MCP 调用错误
      const duration = Date.now() - startTime;
      logMcpError(name, error instanceof Error ? error : String(error));
      logMcpEnd(name, false, error instanceof Error ? error.message : String(error), duration);
      if (error instanceof TanmiError) {
        // 对于 WORKSPACE_NOT_FOUND 错误，附加活跃工作区列表以帮助恢复
        let errorResponse: { error: { code: string; message: string; availableWorkspaces?: unknown[] } } = {
          error: {
            code: error.code,
            message: error.message,
          },
        };

        if (error.code === "WORKSPACE_NOT_FOUND") {
          try {
            const listResult = await services.workspace.list({ status: "active" });
            errorResponse.error.availableWorkspaces = listResult.workspaces;
          } catch {
            // 获取列表失败时忽略，不影响错误响应
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResponse, null, 2),
            },
          ],
          isError: true,
        };
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: {
                code: "INTERNAL_ERROR",
                message,
              },
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  // 注册 Prompts 列表处理器
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: [
      {
        name: "tanmi-instructions",
        description: "TanmiWorkspace 完整使用指南 - AI 首次使用时应获取此指南",
      },
      {
        name: "tanmi-quick-start",
        description: "快速开始指南 - 简要的工作流程说明",
      },
    ],
  }));

  // 注册 Prompt 获取处理器
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params;

    switch (name) {
      case "tanmi-instructions":
        return {
          description: "TanmiWorkspace 完整使用指南",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: getFullInstructions(),
              },
            },
          ],
        };

      case "tanmi-quick-start":
        return {
          description: "TanmiWorkspace 快速开始",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `# TanmiWorkspace 快速开始

## 基本流程
1. workspace_init - 创建工作区
2. node_create - 创建子任务
3. node_transition(action="start") - 开始执行
4. log_append - 记录过程
5. node_transition(action="complete") - 完成任务

## 常用工具
- tanmi_help(topic="overview") - 获取系统概述
- workspace_status - 查看当前状态
- context_get - 获取聚焦上下文

详细信息请调用 tanmi_help(topic="all")`,
              },
            },
          ],
        };

      default:
        throw new Error(`未知 Prompt: ${name}`);
    }
  });

  return server;
}

// ============================================================================
// 主函数
// ============================================================================
async function main() {
  // 1. 创建共享服务实例
  const services = createServices();

  // 2. 尝试启动 HTTP server（后台）
  const httpServer = await startHttpServerInBackground(HTTP_PORT);

  // 3. 创建并启动 MCP server
  const mcpServer = createMcpServer(services);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  logMcp("Server started");

  // 4. 优雅退出处理
  const shutdown = async (signal: string) => {
    logMcp(`收到 ${signal}，正在关闭...`);

    // 关闭 HTTP server
    if (httpServer) {
      try {
        await httpServer.close();
        logHttp("Server closed");
      } catch (err) {
        logHttp(`关闭失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 关闭 MCP server
    try {
      await mcpServer.close();
      logMcp("Server closed");
    } catch (err) {
      logMcp(`关闭失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[main] 启动失败:", err);
  process.exit(1);
});
