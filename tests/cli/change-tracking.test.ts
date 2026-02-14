/**
 * Change Tracking 变更追踪测试
 *
 * 测试用例：
 * - classifyWriteOperation: Write 工具响应分类（新建 vs 覆盖）
 *   - TC-CHG-001: toolResponse.type='create' 且无 originalFile → 新建文件
 *   - TC-CHG-002: toolResponse 包含 originalFile → 覆盖已有文件
 *   - TC-CHG-003: toolResponse 无 type 无 isNewFile 无 originalFile → 降级处理
 *   - TC-CHG-004: toolResponse.type='create' 且有 originalFile → 以 type 为准（新建）
 *   - TC-CHG-005: toolResponse 为 null/undefined → 安全降级
 *   - TC-CHG-006: toolResponse.isNewFile=true → 向后兼容识别为新建文件
 *   - TC-CHG-007: toolResponse.type='update' 且无 isNewFile → 识别为覆盖
 */

import { describe, it, expect } from "vitest";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../..");

// 变更追踪模块路径
const CHANGE_MODULE_PATH = path.join(
  ROOT_DIR,
  "plugin/scripts/shared/change.cjs"
);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const changeModule = require(CHANGE_MODULE_PATH);

describe("Change Tracking - classifyWriteOperation", () => {
  describe("TC-CHG-001: type='create' 且无 originalFile → 新建文件", () => {
    it("Given: toolResponse.type='create', When: classifyWriteOperation, Then: { isNewFile: true, originalContent: null }", () => {
      const toolResponse = {
        type: "create",
      };

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(true);
      expect(result.originalContent).toBeNull();
    });
  });

  describe("TC-CHG-002: 包含 originalFile → 覆盖已有文件", () => {
    it("Given: toolResponse 含 originalFile, When: classifyWriteOperation, Then: { isNewFile: false, originalContent: '原始内容' }", () => {
      const toolResponse = {
        originalFile: "line1\nline2\nline3",
      };

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(false);
      expect(result.originalContent).toBe("line1\nline2\nline3");
    });

    it("Given: toolResponse 含空字符串 originalFile, When: classifyWriteOperation, Then: { isNewFile: false, originalContent: '' }", () => {
      const toolResponse = {
        originalFile: "",
      };

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(false);
      // 空字符串 originalFile 表示文件存在但内容为空
      expect(result.originalContent).toBe("");
    });
  });

  describe("TC-CHG-003: 无 type 无 isNewFile 无 originalFile → 降级", () => {
    it("Given: toolResponse 无相关字段, When: classifyWriteOperation, Then: { isNewFile: false, originalContent: null }", () => {
      const toolResponse = {
        success: true,
      };

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(false);
      expect(result.originalContent).toBeNull();
    });

    it("Given: toolResponse 为空对象, When: classifyWriteOperation, Then: { isNewFile: false, originalContent: null }", () => {
      const toolResponse = {};

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(false);
      expect(result.originalContent).toBeNull();
    });
  });

  describe("TC-CHG-004: type='create' 且有 originalFile → 以 type 为准", () => {
    it("Given: type='create' 且 originalFile 存在, When: classifyWriteOperation, Then: { isNewFile: true, originalContent: null }", () => {
      // 边界情况：type='create' 与 originalFile 矛盾，以 type 为准
      const toolResponse = {
        type: "create",
        originalFile: "should-be-ignored",
      };

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(true);
      expect(result.originalContent).toBeNull();
    });
  });

  describe("TC-CHG-006: isNewFile=true → 向后兼容识别为新建文件", () => {
    it("Given: toolResponse.isNewFile=true, When: classifyWriteOperation, Then: { isNewFile: true, originalContent: null }", () => {
      const toolResponse = {
        isNewFile: true,
      };

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(true);
      expect(result.originalContent).toBeNull();
    });
  });

  describe("TC-CHG-007: type='update' 且无 isNewFile → 识别为覆盖", () => {
    it("Given: toolResponse.type='update', When: classifyWriteOperation, Then: { isNewFile: false, originalContent: null }", () => {
      const toolResponse = {
        type: "update",
      };

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(false);
      expect(result.originalContent).toBeNull();
    });

    it("Given: toolResponse.type='update' 且有 originalFile, When: classifyWriteOperation, Then: { isNewFile: false, originalContent: '...' }", () => {
      const toolResponse = {
        type: "update",
        originalFile: "existing content",
      };

      const result = changeModule.classifyWriteOperation(toolResponse);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(false);
      expect(result.originalContent).toBe("existing content");
    });
  });

  describe("TC-CHG-005: toolResponse 为 null/undefined → 安全降级", () => {
    it("Given: toolResponse=null, When: classifyWriteOperation, Then: { isNewFile: false, originalContent: null }", () => {
      const result = changeModule.classifyWriteOperation(null);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(false);
      expect(result.originalContent).toBeNull();
    });

    it("Given: toolResponse=undefined, When: classifyWriteOperation, Then: { isNewFile: false, originalContent: null }", () => {
      const result = changeModule.classifyWriteOperation(undefined);

      expect(result).not.toBeNull();
      expect(result.isNewFile).toBe(false);
      expect(result.originalContent).toBeNull();
    });
  });
});

describe("Change Tracking - getActiveExecutingNodes", () => {
  it("Given: 无节点, When: getActiveExecutingNodes, Then: 返回空数组", () => {
    const graph = { nodes: {} };
    const result = changeModule.getActiveExecutingNodes(graph);
    expect(result).toEqual([]);
  });

  it("Given: graph 为 null, When: getActiveExecutingNodes, Then: 返回空数组", () => {
    const result = changeModule.getActiveExecutingNodes(null);
    expect(result).toEqual([]);
  });

  it("Given: 1 个 implementing 执行节点, When: getActiveExecutingNodes, Then: 返回该节点 ID", () => {
    const graph = {
      nodes: {
        exec1: { id: "exec1", type: "execution", status: "implementing" },
      },
    };
    const result = changeModule.getActiveExecutingNodes(graph);
    expect(result).toEqual(["exec1"]);
  });

  it("Given: 1 个 validating 执行节点, When: getActiveExecutingNodes, Then: 返回该节点 ID", () => {
    const graph = {
      nodes: {
        exec1: { id: "exec1", type: "execution", status: "validating" },
      },
    };
    const result = changeModule.getActiveExecutingNodes(graph);
    expect(result).toEqual(["exec1"]);
  });

  it("Given: completed 执行节点, When: getActiveExecutingNodes, Then: 返回空数组", () => {
    const graph = {
      nodes: {
        exec1: { id: "exec1", type: "execution", status: "completed" },
      },
    };
    const result = changeModule.getActiveExecutingNodes(graph);
    expect(result).toEqual([]);
  });

  it("Given: planning 节点, When: getActiveExecutingNodes, Then: 返回空数组（忽略非执行节点）", () => {
    const graph = {
      nodes: {
        plan1: { id: "plan1", type: "planning", status: "planning" },
      },
    };
    const result = changeModule.getActiveExecutingNodes(graph);
    expect(result).toEqual([]);
  });

  it("Given: 混合状态节点, When: getActiveExecutingNodes, Then: 只返回活跃执行节点", () => {
    const graph = {
      nodes: {
        plan1: { id: "plan1", type: "planning", status: "completed" },
        exec1: { id: "exec1", type: "execution", status: "completed" },
        exec2: { id: "exec2", type: "execution", status: "implementing" },
        exec3: { id: "exec3", type: "execution", status: "pending" },
      },
    };
    const result = changeModule.getActiveExecutingNodes(graph);
    expect(result).toEqual(["exec2"]);
  });
});
