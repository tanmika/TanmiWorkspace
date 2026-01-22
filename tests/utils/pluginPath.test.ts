// tests/utils/pluginPath.test.ts

import { describe, it, expect, beforeAll } from "vitest";
import { resolvePluginPath } from "../../src/utils/pluginPath.js";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

describe("resolvePluginPath", () => {
  let pluginPath: string;

  beforeAll(() => {
    // 计算 plugin 目录路径（从测试文件位置推导）
    const currentFilePath = fileURLToPath(import.meta.url);
    pluginPath = join(dirname(currentFilePath), "..", "..", "plugin");
  });

  describe("无参数调用", () => {
    it("应该返回插件根目录和子目录路径", () => {
      const result = resolvePluginPath(pluginPath, {});

      expect(result.path).toBe(pluginPath);
      expect(result.skillsPath).toBe(join(pluginPath, "skills"));
      expect(result.agentsPath).toBe(join(pluginPath, "agents"));
      expect(result.error).toBeUndefined();
    });
  });

  describe("type 参数验证", () => {
    it("无效的 type 应该返回错误和可用类型列表", () => {
      const result = resolvePluginPath(pluginPath, { type: "invalid" });

      expect(result.error).toBe("无效的 type: 'invalid'");
      expect(result.available).toEqual(["skill", "agent"]);
      expect(result.path).toBeUndefined();
    });

    it("type=skill 应该返回 skills 目录和可用列表", () => {
      const result = resolvePluginPath(pluginPath, { type: "skill" });

      expect(result.path).toBe(join(pluginPath, "skills"));
      expect(result.available).toBeDefined();
      expect(result.available!.length).toBeGreaterThan(0);
      expect(result.available).toContain("flow-info");
      expect(result.available).toContain("flow-design");
      expect(result.error).toBeUndefined();
    });

    it("type=agent 应该返回 agents 目录和可用列表", () => {
      const result = resolvePluginPath(pluginPath, { type: "agent" });

      expect(result.path).toBe(join(pluginPath, "agents"));
      expect(result.available).toBeDefined();
      expect(result.available!.length).toBeGreaterThan(0);
      expect(result.available).toContain("tanmi-executor");
      expect(result.available).toContain("tanmi-reviewer");
      expect(result.error).toBeUndefined();
    });
  });

  describe("name 参数验证", () => {
    it("有效的 skill name 应该返回 SKILL.md 路径", () => {
      const result = resolvePluginPath(pluginPath, {
        type: "skill",
        name: "flow-info",
      });

      expect(result.path).toBe(
        join(pluginPath, "skills", "flow-info", "SKILL.md")
      );
      expect(result.error).toBeUndefined();
      expect(result.available).toBeUndefined();
    });

    it("有效的 agent name 应该返回 .md 文件路径", () => {
      const result = resolvePluginPath(pluginPath, {
        type: "agent",
        name: "tanmi-executor",
      });

      expect(result.path).toBe(
        join(pluginPath, "agents", "tanmi-executor.md")
      );
      expect(result.error).toBeUndefined();
      expect(result.available).toBeUndefined();
    });

    it("无效的 skill name 应该返回错误和可用列表", () => {
      const result = resolvePluginPath(pluginPath, {
        type: "skill",
        name: "not-exist",
      });

      expect(result.error).toBe("skill 'not-exist' 不存在");
      expect(result.available).toBeDefined();
      expect(result.available).toContain("flow-info");
      expect(result.path).toBeUndefined();
    });

    it("无效的 agent name 应该返回错误和可用列表", () => {
      const result = resolvePluginPath(pluginPath, {
        type: "agent",
        name: "not-exist",
      });

      expect(result.error).toBe("agent 'not-exist' 不存在");
      expect(result.available).toBeDefined();
      expect(result.available).toContain("tanmi-executor");
      expect(result.path).toBeUndefined();
    });
  });

  describe("available 列表过滤", () => {
    it("skill 列表不应包含 CLAUDE.md", () => {
      const result = resolvePluginPath(pluginPath, { type: "skill" });

      expect(result.available).not.toContain("CLAUDE.md");
    });

    it("agent 列表不应包含 CLAUDE.md", () => {
      const result = resolvePluginPath(pluginPath, { type: "agent" });

      expect(result.available).not.toContain("CLAUDE.md");
      // agent 列表应该是去掉 .md 后缀的名称
      result.available?.forEach((name) => {
        expect(name).not.toMatch(/\.md$/);
      });
    });
  });

  describe("边界情况", () => {
    it("只传 name 不传 type 应该返回根目录（忽略 name）", () => {
      const result = resolvePluginPath(pluginPath, { name: "flow-info" });

      expect(result.path).toBe(pluginPath);
      expect(result.skillsPath).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it("空字符串 type 应该返回根目录", () => {
      const result = resolvePluginPath(pluginPath, { type: "" });

      expect(result.path).toBe(pluginPath);
      expect(result.skillsPath).toBeDefined();
    });
  });
});
