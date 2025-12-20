// src/types/guidance.ts
// 层级式引导内容结构定义

/**
 * 引导级别
 * - L0: 简短提示（1-2 句话，嵌入在工具返回值的 hint 中）
 * - L1: 工作流片段（关键步骤列表，3-5 个要点）
 * - L2: 完整指南（详细说明，包含示例和错误处理）
 */
export type GuidanceLevel = 0 | 1 | 2;

/**
 * 触发场景类型
 * 定义何时需要显示引导内容
 */
export type GuidanceScenario =
  // 工作区相关
  | "workspace_init"              // 创建工作区后
  | "workspace_first_planning"    // 根节点首次 start（需要信息收集）
  | "workspace_archived"          // 工作区归档时
  | "workspace_restored"          // 工作区恢复时

  // 节点创建
  | "node_create_planning"        // 创建规划节点后
  | "node_create_execution"       // 创建执行节点后
  | "node_create_info_collection" // 创建信息收集节点后

  // 节点状态转换
  | "execution_start"             // 执行节点 start
  | "execution_complete"          // 执行节点 complete
  | "execution_fail"              // 执行节点 fail
  | "planning_start"              // 规划节点 start
  | "planning_complete"           // 规划节点 complete
  | "planning_monitoring"         // 规划节点进入 monitoring
  | "node_reopen_with_children"   // reopen 已有子节点的节点

  // 特殊行为
  | "actionRequired_triggered"    // actionRequired 被触发
  | "confirmation_required"       // Confirmation Token 验证需要
  | "info_collection_missing"     // 缺少信息收集节点
  | "docs_派发_missing"           // 创建子节点时未派发文档

  // 错误场景
  | "error_invalid_transition"    // 非法状态转换
  | "error_execution_has_children" // 执行节点不能有子节点
  | "error_workspace_not_found"   // 工作区不存在（提示检查 ID）

  // 通用
  | "unknown";                    // 未知场景，使用通用引导

/**
 * 引导内容
 * 包含不同级别的引导信息
 */
export interface Guidance {
  /** 引导级别 */
  level: GuidanceLevel;

  /** 触发场景 */
  scenario: GuidanceScenario;

  /** 引导内容 */
  content: string;

  /** 是否可展开到更详细级别 */
  expandable: boolean;

  /** 展开到更详细级别时的场景（如果 expandable 为 true） */
  expandTo?: GuidanceScenario;

  /** 相关主题（用于关联到 tanmi_help 主题） */
  relatedHelpTopics?: string[];

  /** 元数据（可选） */
  metadata?: {
    /** 优先级（数字越大优先级越高） */
    priority?: number;

    /** 触发频率限制（避免重复提示） */
    frequencyLimit?: "once" | "session" | "always";

    /** 是否为关键协议（违反将导致任务失败） */
    critical?: boolean;
  };
}

/**
 * 引导配置
 * 定义不同场景下的引导内容（所有级别）
 */
export interface GuidanceConfig {
  /** 场景标识 */
  scenario: GuidanceScenario;

  /** L0 级别：简短提示（1-2 句话） */
  l0: string;

  /** L1 级别：工作流片段（关键步骤，3-5 个要点） */
  l1: string;

  /** L2 级别：完整指南（详细说明，包含示例） */
  l2: string;

  /** 相关 tanmi_help 主题 */
  relatedHelpTopics?: string[];

  /** 配置元数据 */
  metadata?: {
    priority?: number;
    frequencyLimit?: "once" | "session" | "always";
    critical?: boolean;
  };
}

/**
 * 引导内容生成器接口
 * 用于根据场景和上下文动态生成引导内容
 */
export interface GuidanceGenerator {
  /**
   * 检测当前场景
   * @param context 当前操作上下文
   * @returns 检测到的场景类型
   */
  detectScenario(context: GuidanceContext): GuidanceScenario;

  /**
   * 生成引导内容
   * @param scenario 场景类型
   * @param level 引导级别
   * @param context 上下文数据（用于动态填充）
   * @returns 引导内容
   */
  generate(
    scenario: GuidanceScenario,
    level: GuidanceLevel,
    context?: GuidanceContext
  ): Guidance;

  /**
   * 获取场景的完整配置
   * @param scenario 场景类型
   * @returns 引导配置
   */
  getConfig(scenario: GuidanceScenario): GuidanceConfig | null;
}

/**
 * 引导上下文
 * 用于场景检测和内容生成的上下文数据
 */
export interface GuidanceContext {
  /** 工具名称（如 workspace_init, node_create 等） */
  toolName?: string;

  /** 工具输入参数 */
  toolInput?: Record<string, unknown>;

  /** 工具输出结果 */
  toolOutput?: Record<string, unknown>;

  /** 节点类型 */
  nodeType?: "planning" | "execution";

  /** 节点状态 */
  nodeStatus?: string;

  /** 节点角色 */
  nodeRole?: string;

  /** 是否有子节点 */
  hasChildren?: boolean;

  /** 是否有文档引用 */
  hasDocs?: boolean;

  /** 错误信息（如果有） */
  error?: {
    code: string;
    message: string;
  };

  /** 其他上下文数据 */
  extra?: Record<string, unknown>;
}

/**
 * 引导内容注入策略
 * 定义如何将引导内容注入到工具返回值中
 */
export interface GuidanceInjectionStrategy {
  /** 注入目标字段 */
  targetField: "hint" | "actionRequired.message" | "error.message" | "custom";

  /** 自定义字段名（当 targetField 为 "custom" 时使用） */
  customField?: string;

  /** 是否追加到现有内容（false 则替换） */
  append?: boolean;

  /** 内容格式化函数 */
  format?: (guidance: Guidance, existingContent?: string) => string;
}

/**
 * 引导内容存储接口
 * 用于持久化引导配置和使用记录
 */
export interface GuidanceStorage {
  /**
   * 加载所有引导配置
   * @returns 引导配置映射
   */
  loadConfigs(): Promise<Map<GuidanceScenario, GuidanceConfig>>;

  /**
   * 保存引导配置
   * @param configs 引导配置映射
   */
  saveConfigs(configs: Map<GuidanceScenario, GuidanceConfig>): Promise<void>;

  /**
   * 记录引导内容使用
   * @param scenario 场景类型
   * @param level 引导级别
   * @param sessionId 会话 ID
   */
  recordUsage(
    scenario: GuidanceScenario,
    level: GuidanceLevel,
    sessionId?: string
  ): Promise<void>;

  /**
   * 检查引导内容是否应该显示（基于频率限制）
   * @param scenario 场景类型
   * @param frequencyLimit 频率限制
   * @param sessionId 会话 ID
   * @returns 是否应该显示
   */
  shouldShow(
    scenario: GuidanceScenario,
    frequencyLimit: "once" | "session" | "always",
    sessionId?: string
  ): Promise<boolean>;
}
