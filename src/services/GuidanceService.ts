// src/services/GuidanceService.ts
// 引导内容生成服务 - 场景检测与内容生成

import {
  GuidanceScenario,
  GuidanceContext,
  GuidanceGenerator,
  Guidance,
  GuidanceConfig,
  GuidanceLevel,
} from "../types/guidance.js";
import { getGuidanceConfig } from "../prompts/guidanceContent.js";

/**
 * 引导服务
 * 实现场景检测和引导内容生成
 */
export class GuidanceService implements GuidanceGenerator {
  /**
   * 检测当前场景
   * @param context 当前操作上下文
   * @returns 检测到的场景类型
   */
  detectScenario(context: GuidanceContext): GuidanceScenario {
    // 1. 优先检查错误场景
    if (context.error) {
      return this.detectErrorScenario(context);
    }

    // 2. 检查工具名称，确定操作类型
    const toolName = context.toolName;

    if (!toolName) {
      return "unknown";
    }

    // 3. 根据工具名称分发到具体的检测逻辑
    switch (toolName) {
      case "workspace_init":
        return "workspace_init";

      case "workspace_archive":
        return "workspace_archived";

      case "workspace_restore":
        return "workspace_restored";

      case "node_create":
        return this.detectNodeCreateScenario(context);

      case "node_transition":
        return this.detectNodeTransitionScenario(context);

      case "node_get":
      case "context_get":
        return this.detectContextScenario(context);

      default:
        return "unknown";
    }
  }

  /**
   * 检测错误场景
   */
  private detectErrorScenario(context: GuidanceContext): GuidanceScenario {
    const errorCode = context.error?.code;

    if (!errorCode) {
      return "unknown";
    }

    // 映射错误代码到场景
    if (errorCode === "INVALID_TRANSITION") {
      return "error_invalid_transition";
    }

    if (errorCode === "EXECUTION_HAS_CHILDREN") {
      return "error_execution_has_children";
    }

    if (
      errorCode === "WORKSPACE_NOT_FOUND" ||
      errorCode === "NODE_NOT_FOUND"
    ) {
      return "error_workspace_not_found";
    }

    return "unknown";
  }

  /**
   * 检测节点创建场景
   */
  private detectNodeCreateScenario(
    context: GuidanceContext
  ): GuidanceScenario {
    const nodeType = context.nodeType;
    const nodeRole = context.nodeRole;

    // 信息收集节点优先识别
    if (nodeRole === "info_collection") {
      return "node_create_info_collection";
    }

    // 根据节点类型
    if (nodeType === "planning") {
      return "node_create_planning";
    }

    if (nodeType === "execution") {
      return "node_create_execution";
    }

    return "unknown";
  }

  /**
   * 检测节点状态转换场景
   */
  private detectNodeTransitionScenario(
    context: GuidanceContext
  ): GuidanceScenario {
    const action = context.toolInput?.action as string;
    const nodeType = context.nodeType;
    const nodeStatus = context.nodeStatus;
    const hasChildren = context.hasChildren;

    if (!action || !nodeType) {
      return "unknown";
    }

    // 检查 reopen 已有子节点的情况
    if (action === "reopen" && hasChildren) {
      return "node_reopen_with_children";
    }

    // 检查是否是根节点首次 start
    if (
      action === "start" &&
      nodeType === "planning" &&
      nodeStatus === "pending" &&
      context.extra?.isRootNode
    ) {
      return "workspace_first_planning";
    }

    // 执行节点状态转换
    if (nodeType === "execution") {
      switch (action) {
        case "start":
          return "execution_start";
        case "complete":
          return "execution_complete";
        case "fail":
          return "execution_fail";
        default:
          return "unknown";
      }
    }

    // 规划节点状态转换
    if (nodeType === "planning") {
      switch (action) {
        case "start":
          return "planning_start";
        case "complete":
          return "planning_complete";
        default:
          return "unknown";
      }
    }

    // 规划节点进入 monitoring
    if (nodeType === "planning" && nodeStatus === "monitoring") {
      return "planning_monitoring";
    }

    return "unknown";
  }

  /**
   * 检测上下文查询场景
   * 用于检测特殊情况（如缺少信息收集节点、文档派发等）
   */
  private detectContextScenario(context: GuidanceContext): GuidanceScenario {
    // 检查是否有 actionRequired
    if (context.toolOutput?.actionRequired) {
      const actionRequired = context.toolOutput.actionRequired as Record<
        string,
        unknown
      >;
      if (actionRequired.confirmationToken) {
        return "confirmation_required";
      }
      return "actionRequired_triggered";
    }

    // 检查是否缺少信息收集节点
    if (context.extra?.needsInfoCollection) {
      return "info_collection_missing";
    }

    // 检查是否缺少文档派发
    if (context.extra?.docsNotDispatched) {
      return "docs_派发_missing";
    }

    return "unknown";
  }

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
  ): Guidance {
    const config = this.getConfig(scenario);

    if (!config) {
      return {
        level,
        scenario,
        content: "未找到对应的引导内容配置",
        expandable: false,
      };
    }

    // 根据级别选择内容
    let content: string;
    let expandable: boolean;

    switch (level) {
      case 0:
        content = config.l0;
        expandable = true;
        break;
      case 1:
        content = config.l1;
        expandable = true;
        break;
      case 2:
        content = config.l2;
        expandable = false;
        break;
      default:
        content = config.l0;
        expandable = true;
    }

    // 动态替换占位符（如果有 context）
    if (context) {
      content = this.replacePlaceholders(content, context);
    }

    return {
      level,
      scenario,
      content,
      expandable,
      expandTo: expandable && level < 2 ? scenario : undefined,
      relatedHelpTopics: config.relatedHelpTopics,
      metadata: config.metadata,
    };
  }

  /**
   * 替换内容中的占位符
   */
  private replacePlaceholders(
    content: string,
    context: GuidanceContext
  ): string {
    let result = content;

    // 替换节点类型
    if (context.nodeType) {
      result = result.replace(/\{nodeType\}/g, context.nodeType);
    }

    // 替换节点状态
    if (context.nodeStatus) {
      result = result.replace(/\{nodeStatus\}/g, context.nodeStatus);
    }

    // 替换错误信息
    if (context.error) {
      result = result.replace(/\{errorCode\}/g, context.error.code);
      result = result.replace(/\{errorMessage\}/g, context.error.message);
    }

    return result;
  }

  /**
   * 获取场景的完整配置
   * @param scenario 场景类型
   * @returns 引导配置
   */
  getConfig(scenario: GuidanceScenario): GuidanceConfig | null {
    return getGuidanceConfig(scenario);
  }

  /**
   * 便捷方法：直接获取指定场景和级别的内容
   * @param scenario 场景类型
   * @param level 引导级别（默认 L0）
   * @param context 上下文数据
   * @returns 引导内容字符串，如果未找到则返回空字符串
   */
  getContent(
    scenario: GuidanceScenario,
    level: GuidanceLevel = 0,
    context?: GuidanceContext
  ): string {
    const guidance = this.generate(scenario, level, context);
    return guidance.content;
  }

  /**
   * 便捷方法：从上下文自动检测场景并生成引导
   * @param context 上下文数据
   * @param level 引导级别（默认 L0）
   * @returns 引导内容
   */
  generateFromContext(
    context: GuidanceContext,
    level: GuidanceLevel = 0
  ): Guidance {
    const scenario = this.detectScenario(context);
    return this.generate(scenario, level, context);
  }
}
