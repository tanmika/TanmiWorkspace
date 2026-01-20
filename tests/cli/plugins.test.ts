/**
 * Hook 安装/卸载机制测试
 * 验证用户自定义 hook 的保留逻辑
 */

import { describe, it, expect } from "vitest";
import {
  isTanmiHook,
  isTanmiCursorHook,
  mergeClaudeHooks,
  filterOutTanmiClaudeHooks,
  mergeCursorHooks,
  filterOutTanmiCursorHooks,
  TANMI_HOOK_MARKERS,
  TANMI_CURSOR_HOOK_MARKERS,
  type ClaudeHookEntry,
  type CursorHookEntry,
} from "../../src/cli/plugins.js";

describe("Hook 识别函数", () => {
  describe("isTanmiHook (Claude Code)", () => {
    it("应识别正式模式的 TanmiWorkspace hook", () => {
      const hook: ClaudeHookEntry = {
        matcher: "startup",
        hooks: [
          {
            type: "command",
            command: `node "/Users/test/.tanmi-workspace/scripts/hook-entry.cjs" SessionStart`,
            timeout: 10000,
          },
        ],
      };
      expect(isTanmiHook(hook)).toBe(true);
    });

    it("应识别开发模式的 TanmiWorkspace hook", () => {
      const hook: ClaudeHookEntry = {
        hooks: [
          {
            command: `node "/Users/test/.tanmi-workspace-dev/scripts/hook-entry.cjs" PreToolUse`,
          },
        ],
      };
      expect(isTanmiHook(hook)).toBe(true);
    });

    it("应不识别用户自定义 hook", () => {
      const userHook: ClaudeHookEntry = {
        matcher: "Write",
        hooks: [
          {
            type: "command",
            command: `node "/Users/test/my-custom-hook.js"`,
            timeout: 5000,
          },
        ],
      };
      expect(isTanmiHook(userHook)).toBe(false);
    });

    it("应不识别其他插件的 hook", () => {
      const otherHook: ClaudeHookEntry = {
        hooks: [
          {
            command: `node "/Users/test/.other-plugin/scripts/hook.cjs"`,
          },
        ],
      };
      expect(isTanmiHook(otherHook)).toBe(false);
    });

    it("应处理空 hooks 数组", () => {
      const emptyHook: ClaudeHookEntry = {
        matcher: "test",
        hooks: [],
      };
      expect(isTanmiHook(emptyHook)).toBe(false);
    });

    it("应处理无 hooks 属性", () => {
      const noHooks: ClaudeHookEntry = {
        matcher: "test",
      };
      expect(isTanmiHook(noHooks)).toBe(false);
    });
  });

  describe("isTanmiCursorHook (Cursor)", () => {
    it("应识别正式模式的 TanmiWorkspace Cursor hook", () => {
      const hook: CursorHookEntry = {
        command: `node "/Users/test/.tanmi-workspace/scripts/cursor-hook-entry.cjs"`,
      };
      expect(isTanmiCursorHook(hook)).toBe(true);
    });

    it("应识别开发模式的 TanmiWorkspace Cursor hook", () => {
      const hook: CursorHookEntry = {
        command: `node "/Users/test/.tanmi-workspace-dev/scripts/cursor-hook-entry.cjs"`,
      };
      expect(isTanmiCursorHook(hook)).toBe(true);
    });

    it("应不识别用户自定义 Cursor hook", () => {
      const userHook: CursorHookEntry = {
        command: `node "/Users/test/my-cursor-hook.js"`,
      };
      expect(isTanmiCursorHook(userHook)).toBe(false);
    });

    it("应处理空 command", () => {
      const emptyHook: CursorHookEntry = {};
      expect(isTanmiCursorHook(emptyHook)).toBe(false);
    });
  });
});

describe("Claude Code Hook 合并/过滤", () => {
  // 用户自定义 hook
  const userHook: ClaudeHookEntry = {
    matcher: "Write",
    hooks: [{ command: `node "/Users/test/my-hook.js"` }],
  };

  // TanmiWorkspace hook
  const tanmiHook: ClaudeHookEntry = {
    matcher: "startup",
    hooks: [{ command: `node "/Users/test/.tanmi-workspace/scripts/hook-entry.cjs" SessionStart` }],
  };

  describe("mergeClaudeHooks", () => {
    it("应保留用户自定义 hook 并添加 TanmiWorkspace hook", () => {
      const existing: Record<string, ClaudeHookEntry[]> = {
        PostToolUse: [userHook],
      };
      const tanmiConfig: Record<string, ClaudeHookEntry[]> = {
        SessionStart: [tanmiHook],
      };

      const result = mergeClaudeHooks(existing, tanmiConfig);

      // 用户 hook 保留
      expect(result.PostToolUse).toHaveLength(1);
      expect(isTanmiHook(result.PostToolUse[0])).toBe(false);

      // TanmiWorkspace hook 添加
      expect(result.SessionStart).toHaveLength(1);
      expect(isTanmiHook(result.SessionStart[0])).toBe(true);
    });

    it("应在同一事件上合并用户和 TanmiWorkspace hook", () => {
      const existing: Record<string, ClaudeHookEntry[]> = {
        PostToolUse: [userHook],
      };
      const tanmiConfig: Record<string, ClaudeHookEntry[]> = {
        PostToolUse: [tanmiHook],
      };

      const result = mergeClaudeHooks(existing, tanmiConfig);

      expect(result.PostToolUse).toHaveLength(2);
      // 用户 hook 在前
      expect(isTanmiHook(result.PostToolUse[0])).toBe(false);
      // TanmiWorkspace hook 在后
      expect(isTanmiHook(result.PostToolUse[1])).toBe(true);
    });

    it("应替换已有的 TanmiWorkspace hook", () => {
      const oldTanmiHook: ClaudeHookEntry = {
        hooks: [{ command: `node "/Users/test/.tanmi-workspace/scripts/hook-entry.cjs" OLD` }],
      };
      const newTanmiHook: ClaudeHookEntry = {
        hooks: [{ command: `node "/Users/test/.tanmi-workspace/scripts/hook-entry.cjs" NEW` }],
      };

      const existing: Record<string, ClaudeHookEntry[]> = {
        SessionStart: [userHook, oldTanmiHook],
      };
      const tanmiConfig: Record<string, ClaudeHookEntry[]> = {
        SessionStart: [newTanmiHook],
      };

      const result = mergeClaudeHooks(existing, tanmiConfig);

      expect(result.SessionStart).toHaveLength(2);
      // 用户 hook 保留
      expect(isTanmiHook(result.SessionStart[0])).toBe(false);
      // 新的 TanmiWorkspace hook
      expect(result.SessionStart[1].hooks?.[0].command).toContain("NEW");
    });

    it("应处理空的现有配置", () => {
      const result = mergeClaudeHooks({}, { SessionStart: [tanmiHook] });

      expect(result.SessionStart).toHaveLength(1);
      expect(isTanmiHook(result.SessionStart[0])).toBe(true);
    });
  });

  describe("filterOutTanmiClaudeHooks", () => {
    it("应只删除 TanmiWorkspace hook，保留用户 hook", () => {
      const existing: Record<string, ClaudeHookEntry[]> = {
        PostToolUse: [userHook, tanmiHook],
      };

      const result = filterOutTanmiClaudeHooks(existing);

      expect(result.PostToolUse).toHaveLength(1);
      expect(isTanmiHook(result.PostToolUse[0])).toBe(false);
    });

    it("应删除只有 TanmiWorkspace hook 的事件", () => {
      const existing: Record<string, ClaudeHookEntry[]> = {
        SessionStart: [tanmiHook],
        PostToolUse: [userHook],
      };

      const result = filterOutTanmiClaudeHooks(existing);

      expect(result.SessionStart).toBeUndefined();
      expect(result.PostToolUse).toHaveLength(1);
    });

    it("应处理全部是用户 hook 的情况", () => {
      const existing: Record<string, ClaudeHookEntry[]> = {
        PostToolUse: [userHook],
      };

      const result = filterOutTanmiClaudeHooks(existing);

      expect(result.PostToolUse).toHaveLength(1);
    });

    it("应处理空配置", () => {
      const result = filterOutTanmiClaudeHooks({});
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});

describe("Cursor Hook 合并/过滤", () => {
  const userHook: CursorHookEntry = {
    command: `node "/Users/test/my-cursor-hook.js"`,
  };
  const tanmiHook: CursorHookEntry = {
    command: `node "/Users/test/.tanmi-workspace/scripts/cursor-hook-entry.cjs"`,
  };
  const eventNames = ["beforeSubmitPrompt", "afterMCPExecution"];

  describe("mergeCursorHooks", () => {
    it("应保留用户自定义 hook 并添加 TanmiWorkspace hook", () => {
      const existing: Record<string, CursorHookEntry[]> = {
        beforeSubmitPrompt: [userHook],
      };

      const result = mergeCursorHooks(existing, tanmiHook, eventNames);

      // beforeSubmitPrompt: 用户 hook + TanmiWorkspace hook
      expect(result.beforeSubmitPrompt).toHaveLength(2);
      expect(isTanmiCursorHook(result.beforeSubmitPrompt[0])).toBe(false);
      expect(isTanmiCursorHook(result.beforeSubmitPrompt[1])).toBe(true);

      // afterMCPExecution: 只有 TanmiWorkspace hook
      expect(result.afterMCPExecution).toHaveLength(1);
      expect(isTanmiCursorHook(result.afterMCPExecution[0])).toBe(true);
    });

    it("应替换已有的 TanmiWorkspace hook", () => {
      const oldTanmiHook: CursorHookEntry = {
        command: `node "/Users/test/.tanmi-workspace/scripts/cursor-hook-entry.cjs" OLD`,
      };
      const newTanmiHook: CursorHookEntry = {
        command: `node "/Users/test/.tanmi-workspace/scripts/cursor-hook-entry.cjs" NEW`,
      };

      const existing: Record<string, CursorHookEntry[]> = {
        beforeSubmitPrompt: [userHook, oldTanmiHook],
      };

      const result = mergeCursorHooks(existing, newTanmiHook, eventNames);

      expect(result.beforeSubmitPrompt).toHaveLength(2);
      expect(isTanmiCursorHook(result.beforeSubmitPrompt[0])).toBe(false);
      expect(result.beforeSubmitPrompt[1].command).toContain("NEW");
    });

    it("应保留不在事件列表中的其他 hook", () => {
      const existing: Record<string, CursorHookEntry[]> = {
        beforeSubmitPrompt: [userHook],
        someOtherEvent: [userHook],
      };

      const result = mergeCursorHooks(existing, tanmiHook, eventNames);

      // 其他事件保持不变
      expect(result.someOtherEvent).toHaveLength(1);
      expect(isTanmiCursorHook(result.someOtherEvent[0])).toBe(false);
    });
  });

  describe("filterOutTanmiCursorHooks", () => {
    it("应只删除 TanmiWorkspace hook，保留用户 hook", () => {
      const existing: Record<string, CursorHookEntry[]> = {
        beforeSubmitPrompt: [userHook, tanmiHook],
        afterMCPExecution: [tanmiHook],
      };

      const result = filterOutTanmiCursorHooks(existing, eventNames);

      expect(result.beforeSubmitPrompt).toHaveLength(1);
      expect(isTanmiCursorHook(result.beforeSubmitPrompt[0])).toBe(false);
      expect(result.afterMCPExecution).toBeUndefined();
    });

    it("应保留不在事件列表中的 hook", () => {
      const existing: Record<string, CursorHookEntry[]> = {
        beforeSubmitPrompt: [tanmiHook],
        someOtherEvent: [userHook],
      };

      const result = filterOutTanmiCursorHooks(existing, eventNames);

      expect(result.beforeSubmitPrompt).toBeUndefined();
      expect(result.someOtherEvent).toHaveLength(1);
    });

    it("应处理空配置", () => {
      const result = filterOutTanmiCursorHooks({}, eventNames);
      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});

describe("Hook 标记常量", () => {
  it("TANMI_HOOK_MARKERS 应包含正式和开发模式路径", () => {
    expect(TANMI_HOOK_MARKERS).toContain(".tanmi-workspace/scripts/hook-entry.cjs");
    expect(TANMI_HOOK_MARKERS).toContain(".tanmi-workspace-dev/scripts/hook-entry.cjs");
  });

  it("TANMI_CURSOR_HOOK_MARKERS 应包含正式和开发模式路径", () => {
    expect(TANMI_CURSOR_HOOK_MARKERS).toContain(".tanmi-workspace/scripts/cursor-hook-entry.cjs");
    expect(TANMI_CURSOR_HOOK_MARKERS).toContain(".tanmi-workspace-dev/scripts/cursor-hook-entry.cjs");
  });
});
