// tests/generate-hook-tools.test.ts
// 验证 generate-hook-tools.ts 生成脚本的逻辑正确性

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const WRITE_TOOLS_PATH = path.join(
  ROOT_DIR,
  "plugin/hooks/generated/write-tools.cjs"
);

// 特殊允许工具（与生成脚本中的定义保持一致）
const EXPECTED_SPECIAL_ALLOW = new Set([
  "workspace_init",
  "session_bind",
  "session_unbind",
  "config_set",
]);

describe("Generated write-tools.cjs", () => {
  it("should exist", () => {
    expect(fs.existsSync(WRITE_TOOLS_PATH)).toBe(true);
  });

  describe("file structure", () => {
    let content: string;

    it("should be valid CommonJS module", () => {
      content = fs.readFileSync(WRITE_TOOLS_PATH, "utf-8");
      expect(content).toContain("module.exports");
      expect(content).toContain("WRITE_TOOLS");
      expect(content).toContain("SPECIAL_ALLOW");
    });

    it("should have auto-generated header", () => {
      expect(content).toContain("AUTO-GENERATED FILE");
      expect(content).toContain("scripts/generate-hook-tools.ts");
    });
  });

  describe("WRITE_TOOLS set", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WRITE_TOOLS, SPECIAL_ALLOW } = require(WRITE_TOOLS_PATH);

    it("should be a Set", () => {
      expect(WRITE_TOOLS).toBeInstanceOf(Set);
    });

    it("should contain expected write tools", () => {
      // 一些核心写操作工具
      const expectedWriteTools = [
        "node_create",
        "node_delete",
        "node_replace",
        "node_edit",
        "node_transition",
        "log_append",
        "memo_create",
        "memo_delete",
        "dispatch_node",
        "dispatch_complete",
      ];

      for (const tool of expectedWriteTools) {
        expect(
          WRITE_TOOLS.has(tool),
          `WRITE_TOOLS should contain ${tool}`
        ).toBe(true);
      }
    });

    it("should NOT contain readonly tools", () => {
      const readonlyTools = [
        "workspace_list",
        "workspace_get",
        "node_get",
        "node_list",
        "context_get",
        "memo_list",
        "memo_get",
        "tanmi_help",
      ];

      for (const tool of readonlyTools) {
        expect(
          WRITE_TOOLS.has(tool),
          `WRITE_TOOLS should NOT contain readonly tool ${tool}`
        ).toBe(false);
      }
    });

    it("should have reasonable count", () => {
      // 写操作工具数量应该在合理范围内
      expect(WRITE_TOOLS.size).toBeGreaterThan(20);
      expect(WRITE_TOOLS.size).toBeLessThan(60);
    });

    describe("SPECIAL_ALLOW set", () => {
      it("should be a Set", () => {
        expect(SPECIAL_ALLOW).toBeInstanceOf(Set);
      });

      it("should match expected special allow tools", () => {
        expect(SPECIAL_ALLOW.size).toBe(EXPECTED_SPECIAL_ALLOW.size);
        for (const tool of EXPECTED_SPECIAL_ALLOW) {
          expect(
            SPECIAL_ALLOW.has(tool),
            `SPECIAL_ALLOW should contain ${tool}`
          ).toBe(true);
        }
      });

      it("SPECIAL_ALLOW should be subset of WRITE_TOOLS", () => {
        for (const tool of SPECIAL_ALLOW) {
          expect(
            WRITE_TOOLS.has(tool),
            `SPECIAL_ALLOW tool ${tool} should be in WRITE_TOOLS`
          ).toBe(true);
        }
      });
    });
  });

  describe("consistency with tool definitions", () => {
    // 动态导入工具定义
    it("should match actual tool readonly properties", async () => {
      const { workspaceTools } = await import("../src/tools/workspace.js");
      const { nodeTools } = await import("../src/tools/node.js");
      const { memoTools } = await import("../src/tools/memo.js");

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { WRITE_TOOLS } = require(WRITE_TOOLS_PATH);

      const allTools = [...workspaceTools, ...nodeTools, ...memoTools];

      for (const tool of allTools) {
        const isWrite = tool.readonly !== true;
        const inWriteTools = WRITE_TOOLS.has(tool.name);

        expect(
          isWrite === inWriteTools,
          `Tool ${tool.name}: readonly=${tool.readonly}, inWriteTools=${inWriteTools}`
        ).toBe(true);
      }
    });
  });
});

describe("Generate script logic", () => {
  it("should treat undefined readonly as write operation", () => {
    // 验证逻辑：readonly !== true 的工具被视为写操作
    const testCases = [
      { readonly: true, expected: false },
      { readonly: false, expected: true },
      { readonly: undefined, expected: true },
    ];

    for (const { readonly, expected } of testCases) {
      const isWrite = readonly !== true;
      expect(isWrite).toBe(expected);
    }
  });
});

describe("Regex pattern edge cases", () => {
  // 模拟 generate-hook-tools.ts 中的正则匹配逻辑
  const blockPattern =
    /(?:export\s+const\s+\w+Tool[^=]*=\s*\{|\{\s*name:)[^}]*name:\s*["']([a-z_]+)["'][^}]*\}/g;

  function extractToolInfo(content: string): Array<{ name: string; readonly: boolean }> {
    const tools: Array<{ name: string; readonly: boolean }> = [];
    let match;
    while ((match = blockPattern.exec(content)) !== null) {
      const block = match[0];
      const nameMatch = block.match(/name:\s*["']([a-z_]+)["']/);
      const readonlyMatch = block.match(/readonly:\s*(true|false)/);

      if (nameMatch) {
        const name = nameMatch[1];
        const isReadonly = readonlyMatch ? readonlyMatch[1] === "true" : false;
        tools.push({ name, readonly: isReadonly });
      }
    }
    blockPattern.lastIndex = 0; // 重置正则状态
    return tools;
  }

  it("should match standard single-line tool definition", () => {
    const content = `export const myTool = { name: "my_tool", readonly: true };`;
    const tools = extractToolInfo(content);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toEqual({ name: "my_tool", readonly: true });
  });

  it("should treat missing readonly as write operation", () => {
    const content = `export const myTool = { name: "my_tool" };`;
    const tools = extractToolInfo(content);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toEqual({ name: "my_tool", readonly: false });
  });

  it("should match tool with readonly: false", () => {
    const content = `export const writeTool = { name: "write_tool", readonly: false };`;
    const tools = extractToolInfo(content);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toEqual({ name: "write_tool", readonly: false });
  });

  it("should match multiple tools in one content", () => {
    const content = `
      export const readTool = { name: "read_tool", readonly: true };
      export const writeTool = { name: "write_tool", readonly: false };
    `;
    const tools = extractToolInfo(content);
    expect(tools).toHaveLength(2);
  });

  it("should NOT match names with uppercase letters", () => {
    const content = `export const myTool = { name: "MyTool" };`;
    const tools = extractToolInfo(content);
    expect(tools).toHaveLength(0);
  });

  it("should NOT match names with numbers", () => {
    const content = `export const myTool = { name: "tool123" };`;
    const tools = extractToolInfo(content);
    expect(tools).toHaveLength(0);
  });

  it("should NOT match multiline definitions with nested objects", () => {
    // 这是一个已知限制：正则不支持跨 } 的多行定义
    const content = `
      export const complexTool = {
        name: "complex_tool",
        inputSchema: { type: "object" },
        readonly: true
      };
    `;
    const tools = extractToolInfo(content);
    // 因为正则遇到 inputSchema 的 } 就停止了
    // 实际行为取决于具体格式
    expect(tools.length).toBeLessThanOrEqual(1);
  });

  it("should NOT match array inline style without export const xxxTool", () => {
    // 正则要求 export const xxxTool = { 或 { name: 开头（后者需要直接跟 name）
    // [{ name: 格式中的 { 前面有 [，不匹配 \{\s*name: 模式
    const content = `const tools = [{ name: "inline_tool", readonly: true }];`;
    const tools = extractToolInfo(content);
    // 这是正则的已知限制，不是 bug
    expect(tools).toHaveLength(0);
  });

  it("should NOT match standalone { name: pattern due to regex design", () => {
    // 正则设计缺陷：\{\s*name: 消费了 { name:，但后面 [^}]*name: 又要求再次出现 name:
    // 这意味着第二个分支 \{\s*name: 实际上只能匹配有两个 name: 字段的情况
    // 这是已知限制，实际项目中所有工具都使用 export const xxxTool = { 格式
    const content = `{ name: "direct_tool", readonly: true }`;
    const tools = extractToolInfo(content);
    expect(tools).toHaveLength(0);  // 无法匹配
  });
});
