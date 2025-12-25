// src/services/CapabilityService.ts

import * as fs from "fs";
import * as path from "path";
import type {
  CapabilityId,
  CapabilityInfo,
  CapabilityPackConfig,
  ScenarioCapabilities,
  SkillMetadata,
} from "../types/capability.js";
import type { TaskScenario } from "../types/workspace.js";

/**
 * 能力元信息映射（硬编码，作为 Skill 文件缺失时的降级方案）
 */
const CAPABILITY_INFO_MAP: Record<CapabilityId, CapabilityInfo> = {
  requirement_clarify: {
    id: "requirement_clarify",
    name: "需求澄清",
    description: "通过结构化提问澄清需求",
    type: "collection",
  },
  tech_research: {
    id: "tech_research",
    name: "技术调研",
    description: "调研相关技术方案和最佳实践",
    type: "collection",
  },
  tech_design: {
    id: "tech_design",
    name: "技术设计",
    description: "设计技术实现方案",
    type: "collection",
  },
  test_design: {
    id: "test_design",
    name: "测试设计",
    description: "设计测试策略和用例",
    type: "collection",
  },
  doc_scan: {
    id: "doc_scan",
    name: "文档扫描",
    description: "扫描和分析项目文档",
    type: "summary",
  },
  error_analysis: {
    id: "error_analysis",
    name: "错误分析",
    description: "分析错误日志和堆栈信息",
    type: "summary",
  },
  perf_baseline: {
    id: "perf_baseline",
    name: "性能基准",
    description: "建立性能基准和分析瓶颈",
    type: "collection",
  },
};

/**
 * 能力包核心服务
 */
export class CapabilityService {
  private scenarioCapabilities: ScenarioCapabilities | null = null;

  /**
   * 加载场景能力映射配置
   */
  loadScenarioCapabilities(): ScenarioCapabilities {
    if (this.scenarioCapabilities) {
      return this.scenarioCapabilities;
    }

    const configPath = path.join(
      process.cwd(),
      "src",
      "config",
      "scenarioCapabilities.json"
    );

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      this.scenarioCapabilities = JSON.parse(content) as ScenarioCapabilities;
      return this.scenarioCapabilities;
    } catch (error) {
      throw new Error(
        `Failed to load scenarioCapabilities.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取指定场景的能力包配置
   */
  getCapabilitiesForScenario(scenario: TaskScenario): {
    basePack: CapabilityInfo[];
    optionalPack: CapabilityInfo[];
  } {
    const capabilities = this.loadScenarioCapabilities();
    const config = capabilities[scenario];

    if (!config) {
      throw new Error(`Unknown scenario: ${scenario}`);
    }

    return {
      basePack: config.basePack.map((id) => this.getCapabilityInfo(id)),
      optionalPack: config.optionalPack.map((id) => this.getCapabilityInfo(id)),
    };
  }

  /**
   * 获取单个能力的信息
   */
  getCapabilityInfo(capabilityId: CapabilityId): CapabilityInfo {
    // 优先尝试从 Skill 文件读取（如果存在）
    const skillMetadata = this.parseSkillFrontmatter(capabilityId);
    if (skillMetadata) {
      return {
        id: skillMetadata.id,
        name: skillMetadata.name,
        description: skillMetadata.description,
        type: skillMetadata.type,
      };
    }

    // 降级到硬编码映射
    const info = CAPABILITY_INFO_MAP[capabilityId];
    if (!info) {
      throw new Error(`Unknown capability ID: ${capabilityId}`);
    }

    return info;
  }

  /**
   * 获取能力的验收标准（从 Skill 文件或默认配置）
   */
  getAcceptanceCriteria(capabilityId: CapabilityId): import("../types/node.js").AcceptanceCriteria[] {
    // 尝试从 Skill 文件读取
    const skillPath = path.join(
      process.cwd(),
      "src",
      "skills",
      "capabilities",
      `${capabilityId}.md`
    );

    if (fs.existsSync(skillPath)) {
      try {
        const content = fs.readFileSync(skillPath, "utf-8");
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          // 解析 acceptanceCriteria 数组
          const criteriaMatch = frontmatter.match(/acceptanceCriteria:\s*\n((?:\s+-\s+when:[\s\S]*?\n\s+then:[\s\S]*?\n)+)/);
          if (criteriaMatch) {
            const criteriaText = criteriaMatch[1];
            const criteria: import("../types/node.js").AcceptanceCriteria[] = [];
            const items = criteriaText.match(/\s+-\s+when:\s*(.+?)\n\s+then:\s*(.+?)(?=\n\s+-|\n*$)/gs);
            if (items) {
              for (const item of items) {
                const whenMatch = item.match(/when:\s*(.+)/);
                const thenMatch = item.match(/then:\s*(.+)/);
                if (whenMatch && thenMatch) {
                  criteria.push({
                    when: whenMatch[1].trim(),
                    then: thenMatch[1].trim(),
                  });
                }
              }
            }
            if (criteria.length > 0) {
              return criteria;
            }
          }
        }
      } catch (error) {
        // 降级到默认配置
      }
    }

    // 默认验收标准配置
    const defaultCriteria: Record<CapabilityId, import("../types/node.js").AcceptanceCriteria[]> = {
      requirement_clarify: [
        { when: "需求澄清完成", then: "需求描述清晰，无歧义点" },
      ],
      tech_research: [
        { when: "技术调研完成", then: "技术方案可行性已验证" },
      ],
      tech_design: [
        { when: "技术设计完成", then: "设计方案完整且可实施" },
      ],
      test_design: [
        { when: "测试设计完成", then: "测试策略和用例明确" },
      ],
      doc_scan: [
        { when: "文档扫描完成", then: "相关文档已整理归纳" },
      ],
      error_analysis: [
        { when: "错误分析完成", then: "错误原因和影响已明确" },
      ],
      perf_baseline: [
        { when: "性能基准建立", then: "性能瓶颈已识别" },
      ],
    };

    return defaultCriteria[capabilityId] || [];
  }

  /**
   * 解析 Skill 文件的 frontmatter（可选，降级处理）
   * @returns SkillMetadata 或 null（文件不存在或解析失败时）
   */
  parseSkillFrontmatter(capabilityId: CapabilityId): SkillMetadata | null {
    try {
      // Skill 文件路径约定：src/skills/capabilities/{capabilityId}.md
      const skillPath = path.join(
        process.cwd(),
        "src",
        "skills",
        "capabilities",
        `${capabilityId}.md`
      );

      if (!fs.existsSync(skillPath)) {
        return null;
      }

      const content = fs.readFileSync(skillPath, "utf-8");

      // 简单的 frontmatter 解析（仅支持 YAML 格式的 --- 包裹）
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        return null;
      }

      const frontmatterText = frontmatterMatch[1];
      const metadata: Partial<SkillMetadata> = {};

      // 解析 key: value 对
      const lines = frontmatterText.split("\n");
      for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const key = match[1];
          const value = match[2].trim();

          if (key === "id") metadata.id = value as CapabilityId;
          else if (key === "name") metadata.name = value;
          else if (key === "description") metadata.description = value;
          else if (key === "type")
            metadata.type = value as "collection" | "summary";
        }
      }

      // 验证必填字段
      if (
        metadata.id &&
        metadata.name &&
        metadata.description &&
        metadata.type
      ) {
        return metadata as SkillMetadata;
      }

      return null;
    } catch (error) {
      // 任何错误都返回 null，优雅降级
      return null;
    }
  }
}

// 导出单例
export const capabilityService = new CapabilityService();
