/**
 * Skill 名称常量
 * 集中管理 Skill 名称，避免硬编码
 */

/** 工作流阶段 Skill */
export const FLOW_SKILLS = {
  /** 信息收集阶段 */
  INFO: "flow-info",
  /** 设计规划阶段 */
  DESIGN: "flow-design",
  /** 执行实现阶段 */
  IMPL: "flow-impl",
} as const;

/** 废弃的 Skill 名称（用于清理旧版用户残留） */
export const DEPRECATED_SKILLS = [
  "bootstrapping-workspace",
  "starting-info-flow",
] as const;

export type FlowSkillName = (typeof FLOW_SKILLS)[keyof typeof FLOW_SKILLS];
