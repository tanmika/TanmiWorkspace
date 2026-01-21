/**
 * Cursor Hook 事件处理器测试
 *
 * 测试用例（11个）：
 * P0 核心测试:
 * - TC-001: sessionStart 上下文注入
 * - TC-002: sessionStart 工作区建议
 * - TC-003: beforeMCPExecution 写操作阻止
 * - TC-004: beforeMCPExecution 流程强制
 * - TC-005: stop 错误分析
 *
 * P1 辅助测试:
 * - TC-006: afterShellExecution Bash 错误
 * - TC-007: afterFileEdit 文件提醒
 * - TC-008: beforeSubmitPrompt 缓存注入
 * - TC-009: 节流机制
 *
 * P2 边界测试:
 * - TC-010: 无 sessionId 静默通过
 * - TC-011: 白名单工具放行
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

// Cursor hook 入口文件路径
const CURSOR_HOOK_PATH = path.join(
  ROOT_DIR,
  "plugin/scripts/cursor-hook-entry.cjs"
);

// 模拟绑定状态
interface MockBinding {
  workspaceId: string;
  workspaceName: string;
  phase: string;
  phaseSkillInvoked: boolean;
}

// 加载 cursor hook 模块
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cursorHook = require(CURSOR_HOOK_PATH);

describe("Cursor Hook - P0 Core Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 清空缓存（如果存在）
    if (typeof cursorHook.clearPendingReminders === "function") {
      cursorHook.clearPendingReminders("test-session");
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TC-001: sessionStart 上下文注入", () => {
    it("Given: 已绑定工作区, When: 会话启动, Then: 返回 additional_context 包含工作区信息", () => {
      // Given: 已绑定工作区
      const sessionId = "test-session-001";
      const binding: MockBinding = {
        workspaceId: "ws-test-001",
        workspaceName: "Test Workspace",
        phase: "impl",
        phaseSkillInvoked: true,
      };
      const input = {
        session_id: sessionId,
        is_background_agent: false,
        composer_mode: "normal",
      };

      // When: 调用 handleSessionStart
      const result = cursorHook.handleSessionStart(sessionId, binding, input);

      // Then: 返回 additional_context 包含工作区信息
      expect(result).toBeDefined();
      expect(result.continue).toBe(true);
      expect(result.additional_context).toBeDefined();
      expect(result.additional_context).toContain("Test Workspace");
      expect(result.additional_context).toContain("ws-test-001");
    });
  });

  describe("TC-002: sessionStart 工作区建议", () => {
    it("Given: 未绑定但有匹配工作区, When: 会话启动, Then: 返回绑定建议", () => {
      // Given: 未绑定工作区
      const sessionId = "test-session-002";
      const binding = null; // 未绑定
      const input = {
        session_id: sessionId,
        is_background_agent: false,
        composer_mode: "normal",
      };

      // 模拟存在匹配的工作区
      const mockWorkspaces = [
        { id: "ws-match-001", name: "Matching Workspace" },
      ];

      // When: 调用 handleSessionStart（带模拟工作区列表）
      const result = cursorHook.handleSessionStart(
        sessionId,
        binding,
        input,
        mockWorkspaces
      );

      // Then: 返回绑定建议
      expect(result).toBeDefined();
      expect(result.continue).toBe(true);
      expect(result.additional_context).toBeDefined();
      expect(result.additional_context).toContain("session_bind");
    });
  });

  describe("TC-003: beforeMCPExecution 写操作阻止", () => {
    it("Given: 未绑定工作区, When: 调用 node_create, Then: 返回 permission: deny", () => {
      // Given: 未绑定工作区
      const sessionId = "test-session-003";
      const binding = null;
      const input = {
        tool_name: "node_create",
        tool_input: { title: "Test Node" },
      };

      // When: 调用 handleBeforeMCPExecution
      const result = cursorHook.handleBeforeMCPExecution(
        sessionId,
        binding,
        input
      );

      // Then: 返回 permission: deny
      expect(result).toBeDefined();
      expect(result.permission).toBe("deny");
      expect(result.agent_message).toBeDefined();
      expect(result.agent_message).toContain("session_bind");
    });
  });

  describe("TC-004: beforeMCPExecution 流程强制", () => {
    it("Given: 已绑定但 phaseSkillInvoked=false, When: 调用非白名单工具, Then: 返回 permission: deny", () => {
      // Given: 已绑定但 phaseSkillInvoked=false
      const sessionId = "test-session-004";
      const binding: MockBinding = {
        workspaceId: "ws-test-004",
        workspaceName: "Test Workspace",
        phase: "impl",
        phaseSkillInvoked: false, // 未调用流程 Skill
      };
      const input = {
        tool_name: "node_create", // 非白名单工具
        tool_input: { title: "Test Node" },
      };

      // When: 调用 handleBeforeMCPExecution
      const result = cursorHook.handleBeforeMCPExecution(
        sessionId,
        binding,
        input
      );

      // Then: 返回 permission: deny
      expect(result).toBeDefined();
      expect(result.permission).toBe("deny");
      expect(result.agent_message).toBeDefined();
      expect(result.agent_message).toContain("flow-");
    });
  });

  describe("TC-005: stop 错误分析", () => {
    it("Given: 已绑定工作区, When: AI 响应包含错误关键词, Then: 返回 followup_message", () => {
      // Given: 已绑定工作区
      const sessionId = "test-session-005";
      const binding: MockBinding = {
        workspaceId: "ws-test-005",
        workspaceName: "Test Workspace",
        phase: "impl",
        phaseSkillInvoked: true,
      };
      const input = {
        status: "error",
        loop_count: 1,
        last_response: "Error: Cannot find module 'xyz'",
      };

      // When: 调用 handleStop
      const result = cursorHook.handleStop(sessionId, binding, input);

      // Then: 返回 followup_message
      expect(result).toBeDefined();
      expect(result.followup_message).toBeDefined();
      expect(result.followup_message).toContain("problem_update");
    });
  });
});

describe("Cursor Hook - P1 Auxiliary Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof cursorHook.clearPendingReminders === "function") {
      cursorHook.clearPendingReminders("test-session");
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TC-006: afterShellExecution Bash 错误", () => {
    it("Given: 已绑定工作区, When: Shell 命令出错, Then: 错误提醒被缓存", () => {
      // Given: 已绑定工作区
      const sessionId = "test-session-006";
      const binding: MockBinding = {
        workspaceId: "ws-test-006",
        workspaceName: "Test Workspace",
        phase: "impl",
        phaseSkillInvoked: true,
      };
      const input = {
        command: "npm run build",
        output: "Error: Build failed\nexit code 1",
        duration: 5000,
        exit_code: 1,
      };

      // When: 调用 handleAfterShellExecution
      cursorHook.handleAfterShellExecution(sessionId, binding, input);

      // Then: 错误提醒被缓存
      const pending = cursorHook.getPendingReminders(sessionId);
      expect(pending).toBeDefined();
      expect(pending.messages.length).toBeGreaterThan(0);
      expect(pending.messages[0].type).toBe("bash_error");
    });
  });

  describe("TC-007: afterFileEdit 文件提醒", () => {
    it("Given: 已绑定工作区, When: 文件编辑成功, Then: 日志提醒被缓存", () => {
      // Given: 已绑定工作区
      const sessionId = "test-session-007";
      const binding: MockBinding = {
        workspaceId: "ws-test-007",
        workspaceName: "Test Workspace",
        phase: "impl",
        phaseSkillInvoked: true,
      };
      const input = {
        file_path: "/path/to/file.ts",
        edits: [{ old_string: "old", new_string: "new" }],
      };

      // When: 调用 handleAfterFileEdit
      cursorHook.handleAfterFileEdit(sessionId, binding, input);

      // Then: 日志提醒被缓存
      const pending = cursorHook.getPendingReminders(sessionId);
      expect(pending).toBeDefined();
      expect(pending.messages.length).toBeGreaterThan(0);
      expect(pending.messages[0].type).toBe("file_changed");
    });
  });

  describe("TC-008: beforeSubmitPrompt 缓存注入", () => {
    it("Given: 有缓存提醒, When: 用户提交消息, Then: agent_message 包含缓存内容", () => {
      // Given: 有缓存提醒
      const sessionId = "test-session-008";
      const binding: MockBinding = {
        workspaceId: "ws-test-008",
        workspaceName: "Test Workspace",
        phase: "impl",
        phaseSkillInvoked: true,
      };

      // 先添加缓存
      cursorHook.addPendingReminder(
        sessionId,
        "bash_error",
        "Build failed error"
      );

      const input = {
        user_message: "continue",
      };

      // When: 调用 handleBeforeSubmitPrompt
      const result = cursorHook.handleBeforeSubmitPrompt(
        sessionId,
        binding,
        input
      );

      // Then: agent_message 包含缓存内容
      expect(result).toBeDefined();
      expect(result.agent_message).toBeDefined();
      expect(result.agent_message).toContain("Build failed error");

      // And: 缓存被清空
      const pending = cursorHook.getPendingReminders(sessionId);
      expect(pending.messages.length).toBe(0);
    });
  });

  describe("TC-009: 节流机制", () => {
    it("Given: 刚提醒过, When: 再次触发提醒, Then: 被节流，不重复提醒", () => {
      // Given: 刚触发过文件编辑提醒
      const sessionId = "test-session-009";
      const binding: MockBinding = {
        workspaceId: "ws-test-009",
        workspaceName: "Test Workspace",
        phase: "impl",
        phaseSkillInvoked: true,
      };
      const input = {
        file_path: "/path/to/file.ts",
        edits: [{ old_string: "old", new_string: "new" }],
      };

      // When: 连续两次调用 handleAfterFileEdit
      cursorHook.handleAfterFileEdit(sessionId, binding, input);
      const firstCount = cursorHook.getPendingReminders(sessionId).messages
        .length;

      cursorHook.handleAfterFileEdit(sessionId, binding, input);
      const secondCount = cursorHook.getPendingReminders(sessionId).messages
        .length;

      // Then: 第二次被节流，缓存数量不增加
      expect(secondCount).toBe(firstCount);
    });
  });
});

describe("Cursor Hook - P2 Edge Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("TC-010: 无 sessionId 静默通过", () => {
    it("Given: 缺少 session_id, When: 任何事件, Then: 静默通过", () => {
      // Given: 缺少 session_id
      const sessionId = null;
      const binding = null;
      const input = {
        tool_name: "node_create",
        tool_input: {},
      };

      // When: 调用 handleBeforeMCPExecution
      const result = cursorHook.handleBeforeMCPExecution(
        sessionId,
        binding,
        input
      );

      // Then: 静默通过（返回 allow 或空）
      expect(result.permission).not.toBe("deny");
    });
  });

  describe("TC-011: 白名单工具放行", () => {
    it("Given: phaseSkillInvoked=false, When: 调用 Skill 工具, Then: 允许执行", () => {
      // Given: 已绑定但 phaseSkillInvoked=false
      const sessionId = "test-session-011";
      const binding: MockBinding = {
        workspaceId: "ws-test-011",
        workspaceName: "Test Workspace",
        phase: "impl",
        phaseSkillInvoked: false,
      };
      const input = {
        tool_name: "Skill", // 白名单工具
        tool_input: { skill: "flow-impl" },
      };

      // When: 调用 handleBeforeMCPExecution
      const result = cursorHook.handleBeforeMCPExecution(
        sessionId,
        binding,
        input
      );

      // Then: 允许执行
      expect(result.permission).not.toBe("deny");
    });
  });
});
