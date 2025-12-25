// src/types/capability.ts

import type { TaskScenario } from "./workspace.js";

/**
 * 能力 ID 类型
 * 对应 scenarioCapabilities.json 中的能力标识
 */
export type CapabilityId =
  | "intent_alignment"      // 意图对齐（原 requirement_clarify）
  | "context_discovery"     // 上下文探索（原 doc_scan）
  | "diagnosis"             // 诊断分析（原 error_analysis）
  | "tech_research"         // 技术调研（不变）
  | "measurement_analysis"  // 度量分析（原 perf_baseline）
  | "solution_design"       // 方案设计（原 tech_design）
  | "verification_strategy"; // 验证策略（原 test_design）

/**
 * 能力信息（用于列表展示）
 */
export interface CapabilityInfo {
  id: CapabilityId;
  name: string;            // 显示名称
  description: string;     // 简短描述
  type: "collection" | "summary";  // 收集类/总结类
}

/**
 * 能力包配置
 */
export interface CapabilityPackConfig {
  basePack: CapabilityId[];      // 基础包（默认选中）
  optionalPack: CapabilityId[];  // 选装包（用户可选）
}

/**
 * 场景能力映射
 */
export type ScenarioCapabilities = Record<TaskScenario, CapabilityPackConfig>;

/**
 * Skill 文件元数据（frontmatter）
 */
export interface SkillMetadata {
  id: CapabilityId;
  name: string;
  description: string;
  type: "collection" | "summary";
}
