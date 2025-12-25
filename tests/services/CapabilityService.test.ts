// tests/services/CapabilityService.test.ts

import { describe, it, expect, beforeEach } from "vitest";
import { CapabilityService } from "../../src/services/CapabilityService.js";
import type { TaskScenario } from "../../src/types/workspace.js";
import type { CapabilityId } from "../../src/types/capability.js";

describe("CapabilityService", () => {
  let service: CapabilityService;

  beforeEach(() => {
    service = new CapabilityService();
  });

  describe("类型定义验证", () => {
    it("应该正确导出 CapabilityId 类型（7个能力ID）", () => {
      const expectedIds: CapabilityId[] = [
        "requirement_clarify",
        "tech_research",
        "tech_design",
        "test_design",
        "doc_scan",
        "error_analysis",
        "perf_baseline",
      ];

      // 验证每个 ID 都能正确获取信息（类型检查）
      expectedIds.forEach((id) => {
        const info = service.getCapabilityInfo(id);
        expect(info.id).toBe(id);
        expect(info.name).toBeDefined();
        expect(info.description).toBeDefined();
        expect(["collection", "summary"]).toContain(info.type);
      });
    });

    it("应该正确返回 CapabilityInfo 接口", () => {
      const info = service.getCapabilityInfo("requirement_clarify");
      
      expect(info).toHaveProperty("id");
      expect(info).toHaveProperty("name");
      expect(info).toHaveProperty("description");
      expect(info).toHaveProperty("type");
      expect(typeof info.id).toBe("string");
      expect(typeof info.name).toBe("string");
      expect(typeof info.description).toBe("string");
      expect(["collection", "summary"]).toContain(info.type);
    });

    it("应该正确返回 CapabilityPackConfig 接口", () => {
      const result = service.getCapabilitiesForScenario("feature");
      
      expect(result).toHaveProperty("basePack");
      expect(result).toHaveProperty("optionalPack");
      expect(Array.isArray(result.basePack)).toBe(true);
      expect(Array.isArray(result.optionalPack)).toBe(true);
      
      // 验证数组元素类型
      result.basePack.forEach((info) => {
        expect(info).toHaveProperty("id");
        expect(info).toHaveProperty("name");
        expect(info).toHaveProperty("description");
        expect(info).toHaveProperty("type");
      });
    });
  });

  describe("服务方法验证", () => {
    it("loadScenarioCapabilities() 应该正确加载 JSON 配置", () => {
      const capabilities = service.loadScenarioCapabilities();
      
      expect(capabilities).toBeDefined();
      expect(capabilities).toHaveProperty("feature");
      expect(capabilities).toHaveProperty("debug");
      expect(capabilities).toHaveProperty("optimize");
      expect(capabilities).toHaveProperty("summary");
      expect(capabilities).toHaveProperty("misc");
    });

    it("loadScenarioCapabilities() 应该支持缓存", () => {
      const first = service.loadScenarioCapabilities();
      const second = service.loadScenarioCapabilities();
      
      expect(first).toBe(second); // 应该是同一个对象引用
    });

    it("getCapabilitiesForScenario() 应该返回正确的 basePack/optionalPack", () => {
      const result = service.getCapabilitiesForScenario("feature");
      
      expect(result.basePack).toBeDefined();
      expect(result.optionalPack).toBeDefined();
      expect(result.basePack.length).toBeGreaterThan(0);
      expect(result.optionalPack.length).toBeGreaterThan(0);
      
      // 验证返回的是 CapabilityInfo 对象，而不是 ID 字符串
      expect(typeof result.basePack[0]).toBe("object");
      expect(result.basePack[0]).toHaveProperty("id");
      expect(result.basePack[0]).toHaveProperty("name");
    });

    it("getCapabilityInfo() 应该返回正确的能力信息", () => {
      const info = service.getCapabilityInfo("requirement_clarify");
      
      expect(info.id).toBe("requirement_clarify");
      expect(info.name).toBe("需求澄清");
      expect(info.description).toBe("通过结构化提问澄清需求");
      expect(info.type).toBe("collection");
    });

    it("getCapabilityInfo() 应该对未知 ID 抛出错误", () => {
      expect(() => {
        service.getCapabilityInfo("unknown_capability" as CapabilityId);
      }).toThrow("Unknown capability ID");
    });

    it("getCapabilitiesForScenario() 应该对未知场景抛出错误", () => {
      expect(() => {
        service.getCapabilitiesForScenario("unknown_scenario" as TaskScenario);
      }).toThrow("Unknown scenario");
    });
  });

  describe("场景对齐验证", () => {
    it("feature 场景应该返回正确的能力包", () => {
      const result = service.getCapabilitiesForScenario("feature");
      
      const basePackIds = result.basePack.map((info) => info.id);
      const optionalPackIds = result.optionalPack.map((info) => info.id);
      
      expect(basePackIds).toEqual(["requirement_clarify", "tech_design"]);
      expect(optionalPackIds).toEqual(["test_design", "doc_scan"]);
    });

    it("debug 场景应该返回正确的能力包", () => {
      const result = service.getCapabilitiesForScenario("debug");
      
      const basePackIds = result.basePack.map((info) => info.id);
      const optionalPackIds = result.optionalPack.map((info) => info.id);
      
      expect(basePackIds).toEqual(["error_analysis"]);
      expect(optionalPackIds).toEqual([
        "tech_research",
        "perf_baseline",
        "test_design",
      ]);
    });

    it("optimize 场景应该返回正确的能力包", () => {
      const result = service.getCapabilitiesForScenario("optimize");
      
      const basePackIds = result.basePack.map((info) => info.id);
      const optionalPackIds = result.optionalPack.map((info) => info.id);
      
      expect(basePackIds).toEqual(["perf_baseline", "tech_research"]);
      expect(optionalPackIds).toEqual(["tech_design", "test_design"]);
    });

    it("summary 场景应该返回正确的能力包", () => {
      const result = service.getCapabilitiesForScenario("summary");
      
      const basePackIds = result.basePack.map((info) => info.id);
      const optionalPackIds = result.optionalPack.map((info) => info.id);
      
      expect(basePackIds).toEqual(["doc_scan"]);
      expect(optionalPackIds).toEqual(["requirement_clarify"]);
    });

    it("misc 场景应该返回正确的能力包", () => {
      const result = service.getCapabilitiesForScenario("misc");
      
      const basePackIds = result.basePack.map((info) => info.id);
      const optionalPackIds = result.optionalPack.map((info) => info.id);
      
      expect(basePackIds).toEqual([]);
      expect(optionalPackIds).toEqual([
        "requirement_clarify",
        "tech_research",
        "tech_design",
        "test_design",
        "doc_scan",
        "error_analysis",
        "perf_baseline",
      ]);
    });

    it("所有场景应该返回的能力ID都应该在 scenarioCapabilities.json 中", () => {
      const scenarios: TaskScenario[] = [
        "feature",
        "debug",
        "optimize",
        "summary",
        "misc",
      ];
      const config = service.loadScenarioCapabilities();

      scenarios.forEach((scenario) => {
        const result = service.getCapabilitiesForScenario(scenario);
        const basePackIds = result.basePack.map((info) => info.id);
        const optionalPackIds = result.optionalPack.map((info) => info.id);

        expect(basePackIds).toEqual(config[scenario].basePack);
        expect(optionalPackIds).toEqual(config[scenario].optionalPack);
      });
    });
  });

  describe("parseSkillFrontmatter 降级处理", () => {
    it("Skill 文件不存在时应该返回 null", () => {
      const result = service.parseSkillFrontmatter("requirement_clarify");
      
      // 由于 Skill 文件尚未创建，应该返回 null
      expect(result).toBeNull();
    });

    it("getCapabilityInfo 应该在 Skill 文件不存在时降级到硬编码映射", () => {
      const info = service.getCapabilityInfo("requirement_clarify");
      
      // 应该从硬编码映射获取信息
      expect(info).toBeDefined();
      expect(info.id).toBe("requirement_clarify");
      expect(info.name).toBe("需求澄清");
    });
  });

  describe("所有能力ID的元信息验证", () => {
    it("所有7个能力ID都应该有完整的元信息", () => {
      const allCapabilityIds: CapabilityId[] = [
        "requirement_clarify",
        "tech_research",
        "tech_design",
        "test_design",
        "doc_scan",
        "error_analysis",
        "perf_baseline",
      ];

      allCapabilityIds.forEach((id) => {
        const info = service.getCapabilityInfo(id);
        
        expect(info.id).toBe(id);
        expect(info.name).toBeTruthy();
        expect(info.description).toBeTruthy();
        expect(["collection", "summary"]).toContain(info.type);
      });
    });

    it("collection 类型和 summary 类型应该正确分类", () => {
      const collectionIds: CapabilityId[] = [
        "requirement_clarify",
        "tech_research",
        "tech_design",
        "test_design",
        "perf_baseline",
      ];
      
      const summaryIds: CapabilityId[] = [
        "doc_scan",
        "error_analysis",
      ];

      collectionIds.forEach((id) => {
        const info = service.getCapabilityInfo(id);
        expect(info.type).toBe("collection");
      });

      summaryIds.forEach((id) => {
        const info = service.getCapabilityInfo(id);
        expect(info.type).toBe("summary");
      });
    });
  });
});
