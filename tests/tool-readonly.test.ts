// tests/tool-readonly.test.ts
// 验证工具 readonly 属性标记正确性

import { describe, it, expect } from "vitest";
import type { TanmiTool } from "../src/types/tool.js";

// 导入所有工具
import { workspaceTools } from "../src/tools/workspace.js";
import { nodeTools } from "../src/tools/node.js";
import { stateTools } from "../src/tools/state.js";
import { contextTools } from "../src/tools/context.js";
import { logTools } from "../src/tools/log.js";
import { sessionTools } from "../src/tools/session.js";
import { importTools } from "../src/tools/import.js";
import { dispatchTools } from "../src/tools/dispatch.js";
import { configTools } from "../src/tools/config.js";
import { memoTools } from "../src/tools/memo.js";
import { capabilityTools } from "../src/tools/capability.js";
import { searchTools } from "../src/tools/search.js";
import { helpTools } from "../src/tools/help.js";

// 汇总所有工具
const allTools: TanmiTool[] = [
  ...workspaceTools,
  ...nodeTools,
  ...stateTools,
  ...contextTools,
  ...logTools,
  ...sessionTools,
  ...importTools,
  ...dispatchTools,
  ...configTools,
  ...memoTools,
  ...capabilityTools,
  ...searchTools,
  ...helpTools,
];

// 预期的只读工具（查询类操作）
const EXPECTED_READONLY_TOOLS = new Set([
  // workspace
  "workspace_list",
  "workspace_get",
  "workspace_health",
  // node
  "node_get",
  "node_list",
  // context
  "context_get",
  "context_focus",
  // session
  "session_status",
  "get_pending_changes",
  // import
  "workspace_import_guide",
  "workspace_import_list",
  // config
  "config_get",
  // memo
  "memo_list",
  "memo_get",
  // capability
  "capability_list",
  "plugin_path",
  // dispatch
  "dispatch_cleanup",
  // search
  "workspace_search",
  "content_search",
  // help
  "tanmi_help",
  "tanmi_prompt",
]);

// 预期的写操作工具
const EXPECTED_WRITE_TOOLS = new Set([
  // workspace
  "workspace_init",
  "workspace_delete",
  "workspace_update_rules",
  "workspace_rename",
  "workspace_archive",
  "workspace_restore",
  "signal",
  // node
  "node_create",
  "node_delete",
  "node_move",
  "node_reorder",
  "node_replace",
  "node_edit",
  // state
  "node_transition",
  // context
  "node_isolate",
  "node_reference",
  // log
  "log_append",
  "problem_update",
  "problem_clear",
  // session
  "session_bind",
  "session_unbind",
  // dispatch
  "dispatch_node",
  "dispatch_complete",
  "dispatch_enable",
  "dispatch_disable",
  "dispatch_disable_execute",
  "dispatch_create",
  // config
  "config_set",
  // memo
  "memo_create",
  "memo_delete",
  "memo_replace",
  "memo_edit",
  "memo_insert",
  // capability
  "capability_select",
]);

describe("Tool readonly property", () => {
  describe("readonly tools", () => {
    it("should have readonly=true for all expected readonly tools", () => {
      for (const toolName of EXPECTED_READONLY_TOOLS) {
        const tool = allTools.find((t) => t.name === toolName);
        expect(tool, `Tool ${toolName} should exist`).toBeDefined();
        expect(tool?.readonly, `Tool ${toolName} should be readonly`).toBe(
          true
        );
      }
    });
  });

  describe("write tools", () => {
    it("should have readonly=false or undefined for all expected write tools", () => {
      for (const toolName of EXPECTED_WRITE_TOOLS) {
        const tool = allTools.find((t) => t.name === toolName);
        expect(tool, `Tool ${toolName} should exist`).toBeDefined();
        // readonly 未定义或为 false 都视为写操作
        expect(
          tool?.readonly === false || tool?.readonly === undefined,
          `Tool ${toolName} should not be readonly (got ${tool?.readonly})`
        ).toBe(true);
      }
    });
  });

  describe("complete coverage", () => {
    it("should have all tools categorized", () => {
      const categorizedTools = new Set([
        ...EXPECTED_READONLY_TOOLS,
        ...EXPECTED_WRITE_TOOLS,
      ]);

      for (const tool of allTools) {
        expect(
          categorizedTools.has(tool.name),
          `Tool ${tool.name} should be categorized as readonly or write`
        ).toBe(true);
      }
    });

    it("should not have tools in both categories", () => {
      const intersection = [...EXPECTED_READONLY_TOOLS].filter((t) =>
        EXPECTED_WRITE_TOOLS.has(t)
      );
      expect(intersection, "No tool should be both readonly and write").toEqual(
        []
      );
    });
  });

  describe("readonly property consistency", () => {
    it("readonly tools should have explicit readonly=true", () => {
      for (const tool of allTools) {
        if (EXPECTED_READONLY_TOOLS.has(tool.name)) {
          expect(
            tool.readonly,
            `Readonly tool ${tool.name} should have explicit readonly=true`
          ).toBe(true);
        }
      }
    });

    it("should report tools missing explicit readonly property", () => {
      const missingExplicit = allTools.filter(
        (t) => typeof t.readonly !== "boolean"
      );
      // 记录但不失败 - 这些工具应该添加显式 readonly 属性
      if (missingExplicit.length > 0) {
        console.log(
          "Tools missing explicit readonly property:",
          missingExplicit.map((t) => t.name)
        );
      }
      // 这是一个软警告，不会导致测试失败
      // 但生成脚本会将 undefined 视为 false（写操作）
    });
  });
});

describe("Hook write-tools.cjs consistency", () => {
  // 特殊允许工具（未绑定时也允许执行）
  const SPECIAL_ALLOW = new Set([
    "workspace_init",
    "session_bind",
    "session_unbind",
    "config_set",
  ]);

  it("SPECIAL_ALLOW tools should be subset of write tools", () => {
    for (const toolName of SPECIAL_ALLOW) {
      expect(
        EXPECTED_WRITE_TOOLS.has(toolName),
        `SPECIAL_ALLOW tool ${toolName} should be a write tool`
      ).toBe(true);
    }
  });

  it("SPECIAL_ALLOW tools should not be readonly", () => {
    for (const toolName of SPECIAL_ALLOW) {
      const tool = allTools.find((t) => t.name === toolName);
      expect(tool, `SPECIAL_ALLOW tool ${toolName} should exist`).toBeDefined();
      // readonly 未定义或为 false 都视为写操作
      expect(
        tool?.readonly === false || tool?.readonly === undefined,
        `SPECIAL_ALLOW tool ${toolName} should not be readonly (got ${tool?.readonly})`
      ).toBe(true);
    }
  });
});
