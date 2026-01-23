/**
 * Claude Code Hook 事件处理器测试
 *
 * 测试用例（25个）：
 * P0 核心测试:
 * - TC-001: isWhitelistedForSkillInit 非白名单工具检查
 * - TC-002: isWhitelistedForSkillInit 白名单工具检查
 * - TC-003: PreToolUse 流程强制（phaseSkillInvoked=false）
 * - TC-004: PreToolUse signal 工具白名单
 * - TC-005: PreToolUse 阶段约束（getSkillForPhase）
 *
 * P1 辅助测试:
 * - TC-006: validateSignalPreCheck 同阶段转换
 * - TC-007: validateSignalPreCheck design→impl 检查
 * - TC-008: validateSignalPreCheck info→impl 禁止
 *
 * P2 边界测试:
 * - TC-009: MCP 工具名解析（标准格式）
 * - TC-010: MCP 工具名解析（-dev1 格式）
 *
 * 工具函数测试:
 * - normalizeWorkflowPhase 规范化
 * - VALID_WORKFLOW_PHASES 常量
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

// Claude Code hook 入口文件路径
const HOOK_ENTRY_PATH = path.join(
  ROOT_DIR,
  "plugin/scripts/hook-entry.cjs"
);

// 加载 hook 模块
// eslint-disable-next-line @typescript-eslint/no-require-imports
const hookEntry = require(HOOK_ENTRY_PATH);

describe("Claude Code Hook - P0 Core Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TC-001: isWhitelistedForSkillInit 非白名单工具检查", () => {
    // 注：此测试验证 isWhitelistedForSkillInit 函数对非白名单工具返回 false
    // 这是流程强制机制的基础，不是未绑定写操作拦截（那是 WRITE_TOOLS + SPECIAL_ALLOW 的逻辑）
    it("Given: 非白名单工具, When: 检查 isWhitelistedForSkillInit, Then: 返回 false", () => {
      // Given: 非白名单工具（如 node_create）
      const toolName = "node_create";

      // When: 检查是否在流程初始化白名单
      const result = hookEntry.isWhitelistedForSkillInit(toolName);

      // Then: 不在白名单中
      expect(result).toBe(false);
    });
  });

  describe("TC-002: isWhitelistedForSkillInit 白名单工具检查", () => {
    // 注：此测试验证 isWhitelistedForSkillInit 对白名单中的工具返回 true
    // 白名单工具在 phaseSkillInvoked=false 时仍可执行
    it("Given: 白名单工具 Skill, When: 检查 isWhitelistedForSkillInit, Then: 返回 true", () => {
      // Given: 白名单工具 Skill
      const toolName = "Skill";

      // When: 检查是否在流程初始化白名单
      const result = hookEntry.isWhitelistedForSkillInit(toolName);

      // Then: 在白名单中
      expect(result).toBe(true);
    });

    it("Given: 白名单工具 Bash, When: 检查白名单, Then: 返回 true", () => {
      expect(hookEntry.isWhitelistedForSkillInit("Bash")).toBe(true);
    });

    it("Given: 白名单工具 Read, When: 检查白名单, Then: 返回 true", () => {
      expect(hookEntry.isWhitelistedForSkillInit("Read")).toBe(true);
    });
  });

  describe("TC-003: PreToolUse 流程强制", () => {
    it("Given: phaseSkillInvoked=false, When: 调用非白名单工具, Then: 应被拦截", () => {
      // 非白名单工具
      const nonWhitelistTools = ["node_create", "memo_create", "Write", "Edit"];

      for (const tool of nonWhitelistTools) {
        const result = hookEntry.isWhitelistedForSkillInit(tool);
        expect(result).toBe(false);
      }
    });

    it("Given: phaseSkillInvoked=false, When: 调用白名单工具, Then: 应被允许", () => {
      // 白名单工具
      const whitelistTools = [
        "Skill",
        "Bash",
        "Read",
        "session_unbind",
        "session_status",
        "tanmi_help",
        "plugin_path",
        "signal",
      ];

      for (const tool of whitelistTools) {
        const result = hookEntry.isWhitelistedForSkillInit(tool);
        expect(result).toBe(true);
      }
    });
  });

  describe("TC-004: PreToolUse signal 工具白名单", () => {
    it("Given: phaseSkillInvoked=false, When: 调用 signal 工具, Then: 允许执行", () => {
      // signal 应在白名单中（修复死锁问题的关键）
      const result = hookEntry.isWhitelistedForSkillInit("signal");
      expect(result).toBe(true);
    });
  });

  describe("TC-005: PreToolUse 阶段约束", () => {
    it("Given: info 阶段, When: getSkillForPhase, Then: 返回 flow-info", () => {
      const result = hookEntry.getSkillForPhase("info");
      expect(result).toBe("flow-info");
    });

    it("Given: design 阶段, When: getSkillForPhase, Then: 返回 flow-design", () => {
      const result = hookEntry.getSkillForPhase("design");
      expect(result).toBe("flow-design");
    });

    it("Given: impl 阶段, When: getSkillForPhase, Then: 返回 flow-impl", () => {
      const result = hookEntry.getSkillForPhase("impl");
      expect(result).toBe("flow-impl");
    });
  });
});

describe("Claude Code Hook - P1 Signal Validation Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TC-006: validateSignalPreCheck 同阶段转换", () => {
    it("Given: 当前 info 阶段, When: signal 目标也是 info, Then: 允许转换", () => {
      const graph = {
        workflow: { phase: "info", phaseSkillInvoked: false },
        nodes: {},
      };
      const toolInput = { code: "aW5mbw" }; // info

      const result = hookEntry.validateSignalPreCheck(graph, "info", toolInput);
      expect(result.allowed).toBe(true);
    });
  });

  describe("TC-007: validateSignalPreCheck design→impl 检查", () => {
    it("Given: design 阶段有未完成 planning 节点, When: signal 到 impl, Then: 阻止转换", () => {
      const graph = {
        workflow: { phase: "design", phaseSkillInvoked: true },
        nodes: {
          root: { id: "root", type: "planning", status: "completed" },
          plan1: {
            id: "plan1",
            type: "planning",
            status: "planning",
            dirName: "plan-task",
          },
        },
      };
      const toolInput = { code: "aW1wbA" }; // impl

      const result = hookEntry.validateSignalPreCheck(
        graph,
        "design",
        toolInput
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("规划节点未完成");
    });

    it("Given: design 阶段无 execution 节点, When: signal 到 impl, Then: 阻止转换", () => {
      const graph = {
        workflow: { phase: "design", phaseSkillInvoked: true },
        nodes: {
          root: { id: "root", type: "planning", status: "completed" },
          plan1: { id: "plan1", type: "planning", status: "completed" },
        },
      };
      const toolInput = { code: "aW1wbA" }; // impl

      const result = hookEntry.validateSignalPreCheck(
        graph,
        "design",
        toolInput
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("创建至少一个执行节点");
    });

    it("Given: design 阶段有 execution 节点且 planning 都完成, When: signal 到 impl, Then: 允许转换", () => {
      const graph = {
        workflow: { phase: "design", phaseSkillInvoked: true },
        nodes: {
          root: { id: "root", type: "planning", status: "completed" },
          plan1: { id: "plan1", type: "planning", status: "completed" },
          exec1: { id: "exec1", type: "execution", status: "pending" },
        },
      };
      const toolInput = { code: "aW1wbA" }; // impl

      const result = hookEntry.validateSignalPreCheck(
        graph,
        "design",
        toolInput
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe("TC-008: validateSignalPreCheck info→impl 禁止", () => {
    it("Given: info 阶段, When: signal 直接到 impl, Then: 阻止转换", () => {
      const graph = {
        workflow: { phase: "info", phaseSkillInvoked: true },
        nodes: {},
      };
      const toolInput = { code: "aW1wbA" }; // impl

      const result = hookEntry.validateSignalPreCheck(graph, "info", toolInput);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("不允许从信息收集阶段直接跳转");
    });
  });
});

describe("Claude Code Hook - P2 MCP Name Parsing Tests", () => {
  describe("TC-009: MCP 工具名解析（标准格式）", () => {
    it("Given: mcp__tanmi-workspace__signal 格式, When: 检查白名单, Then: 正确解析并返回 true", () => {
      const toolName = "mcp__tanmi-workspace__signal";
      const result = hookEntry.isWhitelistedForSkillInit(toolName);
      expect(result).toBe(true);
    });

    it("Given: mcp__tanmi-workspace__node_create 格式, When: 检查白名单, Then: 正确解析并返回 false", () => {
      const toolName = "mcp__tanmi-workspace__node_create";
      const result = hookEntry.isWhitelistedForSkillInit(toolName);
      expect(result).toBe(false);
    });
  });

  describe("TC-010: MCP 工具名解析（-dev1 格式）", () => {
    it("Given: mcp__tanmi-workspace-dev1__signal 格式, When: 检查白名单, Then: 正确解析并返回 true", () => {
      const toolName = "mcp__tanmi-workspace-dev1__signal";
      const result = hookEntry.isWhitelistedForSkillInit(toolName);
      expect(result).toBe(true);
    });

    it("Given: mcp__tanmi-workspace-dev1__session_status 格式, When: 检查白名单, Then: 正确解析并返回 true", () => {
      const toolName = "mcp__tanmi-workspace-dev1__session_status";
      const result = hookEntry.isWhitelistedForSkillInit(toolName);
      expect(result).toBe(true);
    });

    it("Given: mcp__tanmi-workspace-dev1__memo_create 格式, When: 检查白名单, Then: 正确解析并返回 false", () => {
      const toolName = "mcp__tanmi-workspace-dev1__memo_create";
      const result = hookEntry.isWhitelistedForSkillInit(toolName);
      expect(result).toBe(false);
    });
  });
});

describe("Claude Code Hook - Utility Functions", () => {
  describe("normalizeWorkflowPhase", () => {
    it("Given: 有效阶段 info, When: 规范化, Then: 返回 info", () => {
      expect(hookEntry.normalizeWorkflowPhase("info")).toBe("info");
    });

    it("Given: 有效阶段 design, When: 规范化, Then: 返回 design", () => {
      expect(hookEntry.normalizeWorkflowPhase("design")).toBe("design");
    });

    it("Given: 有效阶段 impl, When: 规范化, Then: 返回 impl", () => {
      expect(hookEntry.normalizeWorkflowPhase("impl")).toBe("impl");
    });

    it("Given: 无效阶段, When: 规范化, Then: 返回默认值 info", () => {
      expect(hookEntry.normalizeWorkflowPhase("invalid")).toBe("info");
      expect(hookEntry.normalizeWorkflowPhase(null)).toBe("info");
      expect(hookEntry.normalizeWorkflowPhase(undefined)).toBe("info");
    });
  });

  describe("VALID_WORKFLOW_PHASES 常量", () => {
    it("应包含三个有效阶段", () => {
      expect(hookEntry.VALID_WORKFLOW_PHASES.has("info")).toBe(true);
      expect(hookEntry.VALID_WORKFLOW_PHASES.has("design")).toBe(true);
      expect(hookEntry.VALID_WORKFLOW_PHASES.has("impl")).toBe(true);
      expect(hookEntry.VALID_WORKFLOW_PHASES.size).toBe(3);
    });
  });
});
