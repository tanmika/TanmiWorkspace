// src/types/capability.ts

import type { TaskScenario } from "./workspace.js";

/**
 * 能力 ID 类型
 * 对应 scenarioCapabilities.json 中的能力标识
 */
export type CapabilityId =
  | "requirement_clarify"  // 需求澄清
  | "tech_research"        // 技术调研
  | "tech_design"          // 技术设计
  | "test_design"          // 测试设计
  | "doc_scan"             // 文档扫描
  | "error_analysis"       // 错误分析
  | "perf_baseline";       // 性能基准

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
