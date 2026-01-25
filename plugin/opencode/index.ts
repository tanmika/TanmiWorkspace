/**
 * Tanmi-Workspace OpenCode 插件
 *
 * 此插件为 OpenCode 提供 TanmiWorkspace 集成支持：
 * 1. session.created 时注入会话 ID 和工作区上下文
 * 2. tool.execute.before 权限控制（绑定检查、阶段约束）
 * 3. tool.execute.after 智能提醒（日志记录、问题追踪）
 *
 * 使用方式：在 opencode.json 的 plugin 数组中添加此插件路径
 */

// ============================================================================
// OpenCode Plugin 类型定义
// 基于 OpenCode 官方 Plugin API，内联定义以避免外部依赖
// 参考：https://github.com/anomalyco/opencode
// ============================================================================

/**
 * 插件上下文，由 OpenCode 在加载插件时提供
 */
interface PluginContext {
  /** 项目配置 */
  project: unknown;
  /** OpenCode 客户端 */
  client: unknown;
  /** Shell 执行器 */
  $: unknown;
  /** 当前工作目录 */
  directory: string;
}

/**
 * 事件类型
 */
interface PluginEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * tool.execute.before 输入
 */
interface ToolExecuteBeforeInput {
  tool: string;
  args: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * tool.execute.before 输出（可修改）
 */
interface ToolExecuteBeforeOutput {
  args: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * tool.execute.after 输入
 */
interface ToolExecuteAfterInput {
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  [key: string]: unknown;
}

/**
 * tool.execute.after 输出（可修改）
 */
interface ToolExecuteAfterOutput {
  title?: string;
  output?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * chat.message 输入
 * 收到新消息时触发
 */
interface ChatMessageInput {
  sessionID: string;
  agent?: string;
  model?: {
    providerID: string;
    modelID: string;
  };
  messageID?: string;
  variant?: string;
}

/**
 * TextPart 类型 - 消息文本部件
 */
interface TextPart {
  id?: string;
  type: 'text';
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: {
    start: number;
    end?: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * 通用 Part 类型（简化版，只包含我们需要的）
 */
type Part = TextPart | { type: string; [key: string]: unknown };

/**
 * UserMessage 类型（简化版）
 */
interface UserMessage {
  id: string;
  sessionID: string;
  role: 'user';
  time: {
    created: number;
  };
  agent: string;
  model: {
    providerID: string;
    modelID: string;
  };
  [key: string]: unknown;
}

/**
 * chat.message 输出（可修改）
 */
interface ChatMessageOutput {
  message: UserMessage;
  parts: Part[];
}

/**
 * experimental.chat.system.transform 输入
 * 系统提示转换 hook，用于在发送给 LLM 之前修改系统提示
 */
interface SystemTransformInput {
  /** 原始系统提示数组 */
  system: Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * experimental.chat.system.transform 输出（可修改）
 */
interface SystemTransformOutput {
  /** 修改后的系统提示数组 */
  system: Array<{ type: string; text?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/**
 * 插件返回的 Hook 对象
 */
interface PluginHooks {
  /** 事件监听器 */
  event?: (ctx: { event: PluginEvent }) => Promise<void>;
  /** 工具执行前拦截 */
  'tool.execute.before'?: (input: ToolExecuteBeforeInput, output: ToolExecuteBeforeOutput) => Promise<void>;
  /** 工具执行后处理 */
  'tool.execute.after'?: (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void>;
  /** 收到新消息时触发 */
  'chat.message'?: (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>;
  /** 系统提示转换（实验性） */
  'experimental.chat.system.transform'?: (input: SystemTransformInput, output: SystemTransformOutput) => Promise<void>;
}

/**
 * OpenCode Plugin 类型
 */
type Plugin = (ctx: PluginContext) => Promise<PluginHooks>;

// ============================================================================
// 共享模块引用
// 注意：shared 模块是 CommonJS 格式，使用 require() 引入
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

/**
 * 获取 shared 模块的路径
 * 在编译后，index.js 位于 dist/plugin/opencode/
 * shared 模块位于 plugin/scripts/shared/
 */
function getSharedModulePath(moduleName: string): string {
  // __dirname 在 CommonJS 模式下指向当前文件所在目录
  // 在 ESM 模式下需要使用 import.meta.url
  // 这里使用相对于当前文件的路径
  return path.resolve(__dirname, '../scripts/shared', moduleName);
}

/**
 * 获取 hooks/generated 模块的路径
 * 在编译后，index.js 位于 dist/plugin/opencode/
 * generated 模块位于 plugin/hooks/generated/
 */
function getGeneratedModulePath(moduleName: string): string {
  return path.resolve(__dirname, '../hooks/generated', moduleName);
}

// 延迟加载 shared 模块（避免在模块加载时就引入）
function getBindingModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(getSharedModulePath('binding.cjs'));
}

function getContextModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(getSharedModulePath('context.cjs'));
}

function getWorkspaceModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(getSharedModulePath('workspace.cjs'));
}

function getConfigModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(getSharedModulePath('config.cjs'));
}

function getWriteToolsModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(getGeneratedModulePath('write-tools.cjs'));
}

function getReminderModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(getSharedModulePath('reminder.cjs'));
}

// ============================================================================
// 智能提醒相关常量和函数
// ============================================================================

/**
 * 触发智能提醒的关键词列表
 * 当用户消息包含这些关键词且未绑定工作区时，返回绑定提醒
 */
const WORKSPACE_KEYWORDS = [
  '工作区',
  'workspace',
  '节点',
  'node',
  '任务',
  'task',
  '绑定',
  'bind',
];

/**
 * 检测消息是否包含工作区相关关键词
 * @param text - 消息文本
 * @returns 是否包含关键词
 */
function containsWorkspaceKeywords(text: string): boolean {
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return WORKSPACE_KEYWORDS.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * 插件版本
 */
const PLUGIN_VERSION = '1.0.0';

/**
 * 插件名称
 */
const PLUGIN_NAME = 'tanmi-workspace';

// ============================================================================
// 模块级状态变量
// 用于在 event Hook 和其他 Hook 之间共享数据
// ============================================================================

/**
 * 当前会话的上下文信息
 * 由 session.created 事件处理器设置，供后续 Hook 使用
 */
interface SessionState {
  /** 会话 ID */
  sessionId: string | null;
  /** 会话绑定信息 */
  binding: {
    workspaceId: string;
    focusedNodeId?: string;
    boundAt: string;
    lastReminder?: {
      type: string;
      time: string;
    };
  } | null;
  /** 生成的上下文注入内容 */
  contextToInject: string | null;
  /** 会话创建时间 */
  createdAt: string | null;
  /** 上次调用 tanmi-workspace MCP 工具的时间（ISO 格式） */
  lastMcpToolCallTime: string | null;
  /** 上次调用 log_append 的时间（ISO 格式） */
  lastLogAppendTime: string | null;
}

/**
 * 模块级会话状态
 * event Hook 是只读的，无法直接返回上下文
 * 因此需要存储到模块级变量，供其他 Hook（如 tool.execute.before）使用
 */
let currentSessionState: SessionState = {
  sessionId: null,
  binding: null,
  contextToInject: null,
  createdAt: null,
  lastMcpToolCallTime: null,
  lastLogAppendTime: null,
};

/**
 * 获取当前会话状态（供外部模块或测试使用）
 */
export function getSessionState(): SessionState {
  return { ...currentSessionState };
}

/**
 * 重置会话状态（用于会话结束或测试）
 */
export function resetSessionState(): void {
  currentSessionState = {
    sessionId: null,
    binding: null,
    contextToInject: null,
    createdAt: null,
    lastMcpToolCallTime: null,
    lastLogAppendTime: null,
  };
}

// ============================================================================
// 事件处理器
// ============================================================================

/**
 * 处理 session.created 事件
 * 获取 sessionId，检查绑定状态，生成上下文注入内容
 *
 * @param sessionId - 会话 ID
 * @param directory - 当前工作目录
 */
function handleSessionCreated(sessionId: string, directory: string): void {
  // 1. 获取 shared 模块
  const bindingModule = getBindingModule();
  const contextModule = getContextModule();

  // 2. 检查会话绑定状态
  const binding = bindingModule.getSessionBinding(sessionId);

  // 3. 生成上下文注入内容
  let contextToInject: string;

  if (binding) {
    // 已绑定：生成完整工作区上下文
    // 注意：getFullWorkspaceContext 需要 binding 对象
    const fullContext = contextModule.getFullWorkspaceContext(binding);
    contextToInject = fullContext || contextModule.generateSessionIdContext(sessionId, 'opencode');
  } else {
    // 未绑定：仅生成 sessionId 上下文
    contextToInject = contextModule.generateSessionIdContext(sessionId, 'opencode');
  }

  // 4. 存储到模块级状态，供后续 Hook 使用
  currentSessionState = {
    sessionId,
    binding,
    contextToInject,
    createdAt: new Date().toISOString(),
    lastMcpToolCallTime: null,
    lastLogAppendTime: null,
  };

  // 5. 日志记录（调试用，生产环境可移除）
  // console.error(`[tanmi-workspace] session.created: ${sessionId}, bound: ${!!binding}`);
}

/**
 * 处理 session.deleted 事件
 * 清理会话状态
 *
 * @param sessionId - 会话 ID
 */
function handleSessionDeleted(sessionId: string): void {
  // 验证是否为当前会话
  if (currentSessionState.sessionId === sessionId) {
    resetSessionState();
  }
}

/**
 * 处理 session.idle 事件
 * 检测会话状态：未提交的问题、未完成的节点等
 * 记录警告日志供后续查看
 *
 * 注意：session.idle 是只读事件，无法阻止会话结束，只能记录警告
 */
function handleSessionIdle(): void {
  // 1. 检查是否有绑定的工作区
  if (!currentSessionState.binding?.workspaceId) {
    // 未绑定工作区，无需检测
    return;
  }

  const workspaceId = currentSessionState.binding.workspaceId;
  const focusedNodeId = currentSessionState.binding.focusedNodeId;

  // 2. 获取工作区模块
  const workspaceModule = getWorkspaceModule();

  // 3. 获取节点图以检查状态
  const graph = workspaceModule.getNodeGraph(workspaceId);
  if (!graph || !graph.nodes) {
    return;
  }

  // 4. 检测场景 1：存在未提交的 problem
  // 优先检查当前聚焦节点，然后检查所有 implementing 状态的节点
  const nodesToCheck: string[] = [];

  if (focusedNodeId && focusedNodeId !== 'root') {
    nodesToCheck.push(focusedNodeId);
  }

  // 添加所有 implementing 状态的节点
  for (const node of graph.nodes) {
    if (node.status === 'implementing' && !nodesToCheck.includes(node.id)) {
      nodesToCheck.push(node.id);
    }
  }

  // 检查每个节点的 problem 状态
  for (const nodeId of nodesToCheck) {
    const problemInfo = workspaceModule.getNodeProblem(workspaceId, nodeId);
    if (problemInfo && problemInfo.problem) {
      // 存在未提交的问题，记录警告
      console.warn(
        `[TanmiWorkspace] 会话空闲警告: 工作区 ${workspaceId} 节点 ${nodeId} 存在未提交的问题\n` +
        `问题: ${problemInfo.problem}\n` +
        `下一步: ${problemInfo.nextStep || '未指定'}`
      );
    }
  }

  // 5. 检测场景 2：节点处于 implementing 状态
  const implementingNodes = graph.nodes.filter(
    (node: { id: string; status: string }) => node.status === 'implementing'
  );

  if (implementingNodes.length > 0) {
    const nodeIds = implementingNodes.map((n: { id: string }) => n.id).join(', ');
    console.warn(
      `[TanmiWorkspace] 会话空闲提醒: 工作区 ${workspaceId} 有 ${implementingNodes.length} 个节点处于执行中状态\n` +
      `节点 ID: ${nodeIds}\n` +
      `建议: 下次会话时继续完成这些节点，或使用 node_transition(fail) 标记为失败`
    );
  }
}

/**
 * TanmiWorkspace OpenCode 插件
 *
 * 实现了以下 Hook：
 * - event: 监听 session.created、session.idle 等事件
 * - tool.execute.before: 工具执行前权限检查
 * - tool.execute.after: 工具执行后智能提醒
 */
export const TanmiWorkspacePlugin: Plugin = async ({ project, client, $, directory }) => {
  // 插件初始化
  // TODO: 后续任务中实现具体逻辑

  return {
    /**
     * 事件监听器
     * 处理 session.created、session.idle、session.deleted 等事件
     */
    event: async ({ event }) => {
      const eventType = event.type;

      switch (eventType) {
        case 'session.created': {
          // 会话创建事件：获取 sessionId，检查绑定，生成上下文
          const session = event.session as { id?: string } | undefined;
          const sessionId = session?.id;

          if (sessionId) {
            handleSessionCreated(sessionId, directory);
          }
          break;
        }

        case 'session.deleted': {
          // 会话删除事件：清理会话状态
          const session = event.session as { id?: string } | undefined;
          const sessionId = session?.id;

          if (sessionId) {
            handleSessionDeleted(sessionId);
          }
          break;
        }

        case 'session.idle': {
          // 会话空闲事件：检测未完成的工作状态并记录警告
          handleSessionIdle();
          break;
        }

        default:
          // 未知事件类型，静默忽略
          break;
      }
    },

    /**
     * 工具执行前拦截
     * 实现权限控制：
     * - 未绑定工作区时的写操作检查
     * - 工作流阶段约束检查
     * - 写入限制检查
     */
    'tool.execute.before': async (input, output) => {
      const toolName = input.tool;
      const toolArgs = input.args;

      // 获取必要的模块
      const { WRITE_TOOLS, SPECIAL_ALLOW } = getWriteToolsModule();
      const { getGlobalConfig } = getConfigModule();
      const { getNodeGraph, getWorkspaceConfig } = getWorkspaceModule();

      // 辅助函数：规范化工具名（处理 MCP 工具格式）
      // MCP 工具格式：mcp__tanmi-workspace__xxx 或 mcp__tanmi-workspace-dev1__xxx
      const normalizeToolName = (name: string): string => {
        if (name?.startsWith('mcp__tanmi-workspace')) {
          const parts = name.split('__');
          return parts[parts.length - 1];
        }
        return name;
      };

      const shortToolName = normalizeToolName(toolName);

      // ========================================
      // 1. 未绑定工作区时的检查
      // ========================================
      if (!currentSessionState.binding?.workspaceId) {
        // 特殊工具放行（如 session_bind、workspace_init 等）
        if (SPECIAL_ALLOW.has(shortToolName)) {
          return; // 允许执行
        }

        // 检查是否为 TanmiWorkspace 写操作工具
        if (WRITE_TOOLS.has(shortToolName)) {
          const config = getGlobalConfig();
          // 默认拒绝未绑定的写操作，除非配置明确允许
          if (!config?.security?.allowUnboundWrite) {
            throw new Error(`[TanmiWorkspace] 未绑定工作区，无法使用 ${shortToolName}。请先使用 session_bind 绑定工作区。`);
          }
        }

        // 未绑定时，非写操作工具放行
        return;
      }

      // ========================================
      // 2. 已绑定工作区：检查工作流阶段约束
      // ========================================
      const workspaceId = currentSessionState.binding.workspaceId;
      const graph = getNodeGraph(workspaceId);

      // 获取当前工作流阶段（默认 info）
      const VALID_PHASES = new Set(['info', 'design', 'impl']);
      const rawPhase = graph?.workflow?.phase;
      const phase = (rawPhase && VALID_PHASES.has(rawPhase)) ? rawPhase : 'info';

      // 阶段约束：info/design 阶段禁止文件修改工具
      const phaseConstraints: Record<string, string[]> = {
        'info': ['Write', 'Edit', 'MultiEdit'],
        'design': ['Write', 'Edit', 'MultiEdit'],
        'impl': []
      };

      const blockedTools = phaseConstraints[phase] || [];
      if (blockedTools.includes(toolName)) {
        const phaseLabels: Record<string, string> = {
          'info': '信息收集',
          'design': '方案设计',
          'impl': '实现'
        };
        throw new Error(
          `[TanmiWorkspace] 当前处于「${phaseLabels[phase]}」阶段，不允许使用 ${toolName}。` +
          `请使用 signal 工具切换到实现阶段。`
        );
      }

      // ========================================
      // 3. 检查写入限制（writeRestriction）
      // ========================================
      const wsConfig = getWorkspaceConfig(workspaceId);
      const writeRestriction = wsConfig?.writeRestriction;

      if (writeRestriction?.enabled) {
        // 写入限制已启用，检查是否为文件修改工具
        const fileWriteTools = ['Write', 'Edit', 'MultiEdit'];
        if (fileWriteTools.includes(toolName)) {
          // 检查文件路径是否在限制范围内
          const filePath = toolArgs?.file_path as string;
          if (filePath && writeRestriction.allowedPaths) {
            const isAllowed = writeRestriction.allowedPaths.some((allowedPath: string) => {
              // 支持简单的前缀匹配
              return filePath.startsWith(allowedPath) || filePath === allowedPath;
            });

            if (!isAllowed) {
              throw new Error(
                `[TanmiWorkspace] 写入限制已启用，文件 ${filePath} 不在允许的路径范围内。` +
                `允许的路径: ${writeRestriction.allowedPaths.join(', ')}`
              );
            }
          }
        }
      }

      // 所有检查通过，允许执行
    },

    /**
     * 工具执行后处理
     * 实现智能提醒：
     * - node_transition(action=complete) 后提醒记录 conclusion
     * - 长时间未调用 log_append 时提醒记录日志
     * - 非 tanmi-workspace MCP 工具不提醒
     * - 未绑定工作区时不提醒
     */
    'tool.execute.after': async (input, output) => {
      const toolName = input.tool;
      const toolArgs = input.args;
      const toolResult = input.result;

      // 1. 检查是否为 tanmi-workspace MCP 工具
      // MCP 工具格式：mcp__tanmi-workspace__xxx 或 mcp__tanmi-workspace-dev1__xxx
      const isTanmiWorkspaceTool = toolName?.startsWith('mcp__tanmi-workspace');
      if (!isTanmiWorkspaceTool) {
        // 非 tanmi-workspace MCP 工具，静默返回
        return;
      }

      // 2. 检查工作区绑定状态
      if (!currentSessionState.binding?.workspaceId) {
        // 未绑定工作区，静默返回
        return;
      }

      // 3. 更新工具调用时间
      const now = new Date().toISOString();
      currentSessionState.lastMcpToolCallTime = now;

      // 4. 提取工具短名称
      const parts = toolName.split('__');
      const shortToolName = parts[parts.length - 1];

      // 5. 处理 log_append 调用 - 更新时间戳
      if (shortToolName === 'log_append') {
        currentSessionState.lastLogAppendTime = now;
        // log_append 本身不需要提醒
        return;
      }

      // 6. 检查是否需要生成提醒
      let reminderMessage: string | null = null;

      // 6.1 node_transition(action=complete) 后提醒记录 conclusion
      if (shortToolName === 'node_transition') {
        const action = toolArgs?.action as string;
        if (action === 'complete') {
          // 检查结果是否成功（工具调用成功但可能节点状态转换失败）
          const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult || '');
          const isSuccess = resultStr.includes('"success":true') || resultStr.includes('"currentStatus":"completed"');

          if (isSuccess) {
            reminderMessage = `<tanmi-post-tool-reminder>
节点已完成。请确保 conclusion 中包含：
- 实现内容摘要
- 修改的文件列表
- 验证方式
</tanmi-post-tool-reminder>`;
          }
        }
      }

      // 6.2 长时间未调用 log_append 时提醒（30 分钟 = 1800000 毫秒）
      if (!reminderMessage && currentSessionState.lastLogAppendTime) {
        const { getMinutesSinceISO } = getReminderModule();
        const minutesSinceLog = getMinutesSinceISO(currentSessionState.lastLogAppendTime);

        if (minutesSinceLog >= 30) {
          reminderMessage = `<tanmi-post-tool-reminder>
已 ${minutesSinceLog} 分钟未记录日志。

**建议使用 \`log_append\` 记录当前进展**，保持执行过程可追溯。
</tanmi-post-tool-reminder>`;
          // 更新时间戳，避免重复提醒
          currentSessionState.lastLogAppendTime = now;
        }
      }

      // 6.3 首次 MCP 调用但从未记录日志（检查是否需要初始化 lastLogAppendTime）
      if (!reminderMessage && !currentSessionState.lastLogAppendTime) {
        // 首次调用，初始化 lastLogAppendTime 为当前时间
        // 这样 30 分钟后才会开始提醒
        currentSessionState.lastLogAppendTime = now;
      }

      // 7. 如果有提醒消息，添加到输出
      if (reminderMessage) {
        // OpenCode 的 tool.execute.after 可以修改 output 对象
        // 使用 metadata 存储提醒，或者追加到 output 字符串
        if (typeof output.output === 'string') {
          output.output = output.output + '\n\n' + reminderMessage;
        } else {
          output.output = reminderMessage;
        }
      }
    },

    /**
     * 消息处理 Hook
     * 实现智能提醒功能（UserPromptSubmit 降级版）：
     * - 检测用户消息是否包含工作区相关关键词
     * - 未绑定工作区时返回绑定提醒
     * - 已绑定工作区时不显示提醒
     *
     * 注意：chat.message 是消息发送后触发，无法阻止消息，只能添加提醒
     */
    'chat.message': async (input, output) => {
      // 1. 从 parts 中提取用户消息文本
      const textParts = output.parts.filter(
        (part): part is TextPart => part.type === 'text'
      );
      const userText = textParts.map(part => part.text).join(' ');

      // 2. 检查是否包含工作区关键词
      if (!containsWorkspaceKeywords(userText)) {
        // 不包含关键词，不显示提醒
        return;
      }

      // 3. 检查工作区绑定状态
      if (currentSessionState.binding?.workspaceId) {
        // 已绑定工作区，不显示提醒
        return;
      }

      // 4. 未绑定且包含关键词，生成绑定提醒
      const sessionId = input.sessionID || currentSessionState.sessionId;
      if (!sessionId) {
        // 无法获取 sessionId，静默返回
        return;
      }

      // 5. 使用 shared/context 模块生成绑定提醒
      const contextModule = getContextModule();
      const reminder = contextModule.generateBindingReminder(sessionId, 'opencode');

      // 6. 将提醒添加到 parts 中作为系统消息
      // 使用 synthetic 标记表示这是系统生成的内容
      const reminderPart: TextPart = {
        type: 'text',
        text: reminder,
        synthetic: true,
        metadata: {
          source: 'tanmi-workspace',
          type: 'binding-reminder',
        },
      };

      output.parts.push(reminderPart);
    },

    /**
     * 系统提示转换（实验性）
     * 在发送给 LLM 之前修改系统提示，用于注入 TanmiWorkspace 上下文
     *
     * 这是 OpenCode 独有的功能，允许：
     * - 在系统提示末尾追加工作区上下文
     * - 注入 sessionId 信息
     * - 注入当前聚焦节点的需求和验收标准
     */
    'experimental.chat.system.transform': async (input, output) => {
      // 检查是否有需要注入的上下文
      if (!currentSessionState.contextToInject) {
        return;
      }

      // 在系统提示末尾追加 TanmiWorkspace 上下文
      // OpenCode 的系统提示是一个数组，每个元素是 { type: 'text', text: '...' }
      const contextBlock = {
        type: 'text',
        text: currentSessionState.contextToInject,
      };

      // 追加到系统提示数组
      output.system.push(contextBlock);
    },
  };
};

/**
 * 默认导出插件
 */
export default TanmiWorkspacePlugin;

/**
 * 插件元信息（供调试和版本检查使用）
 */
export const pluginInfo = {
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  description: 'TanmiWorkspace integration for OpenCode',
  hooks: ['event', 'tool.execute.before', 'tool.execute.after', 'chat.message', 'experimental.chat.system.transform'],
};
