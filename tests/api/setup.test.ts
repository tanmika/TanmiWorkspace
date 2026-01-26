// tests/api/setup.test.ts
// POST /api/setup/install API 测试用例
// TDD 红灯阶段：API 尚未实现，所有测试应失败

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { createServer } from "../../src/http/server.js";

// API 响应类型定义
interface InstallStep {
  name: string;
  success: boolean;
  message?: string;
}

interface PlatformResult {
  platform: string;
  steps: InstallStep[];
}

interface SuccessResponse {
  success: true;
  results: PlatformResult[];
}

interface ErrorResponse {
  success: false;
  error: string;
}

type InstallResponse = SuccessResponse | ErrorResponse;

describe("POST /api/setup/install", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("单平台安装", () => {
    it("请求安装 claude，返回成功结构", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {
          platforms: ["claude"],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as InstallResponse;
      expect(body.success).toBe(true);

      if (body.success) {
        // 验证返回了 claude 平台结果
        expect(body.results).toHaveLength(1);
        expect(body.results[0].platform).toBe("claude");

        // 验证 steps 结构
        expect(Array.isArray(body.results[0].steps)).toBe(true);
        expect(body.results[0].steps.length).toBeGreaterThan(0);

        // 验证每个 step 有 name 和 success 字段
        for (const step of body.results[0].steps) {
          expect(step).toHaveProperty("name");
          expect(step).toHaveProperty("success");
          expect(typeof step.name).toBe("string");
          expect(typeof step.success).toBe("boolean");
        }
      }
    });
  });

  describe("多平台安装", () => {
    it("请求安装 claude+cursor，返回两个平台结果", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {
          platforms: ["claude", "cursor"],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as InstallResponse;
      expect(body.success).toBe(true);

      if (body.success) {
        // 验证返回了两个平台结果
        expect(body.results).toHaveLength(2);

        // 验证平台名称
        const platformNames = body.results.map((r) => r.platform);
        expect(platformNames).toContain("claude");
        expect(platformNames).toContain("cursor");

        // 验证每个平台都有 steps
        for (const result of body.results) {
          expect(Array.isArray(result.steps)).toBe(true);
        }
      }
    });

    it("请求安装所有支持的平台 (claude+cursor+opencode)", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {
          platforms: ["claude", "cursor", "opencode"],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as InstallResponse;
      expect(body.success).toBe(true);

      if (body.success) {
        expect(body.results).toHaveLength(3);
        const platformNames = body.results.map((r) => r.platform);
        expect(platformNames).toContain("claude");
        expect(platformNames).toContain("cursor");
        expect(platformNames).toContain("opencode");
      }
    });
  });

  describe("无效平台", () => {
    it("请求无效平台名，返回错误", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {
          platforms: ["invalid_platform"],
        },
      });

      // 无效平台应返回 400 错误
      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as InstallResponse;
      expect(body.success).toBe(false);

      if (!body.success) {
        expect(body.error).toBeDefined();
        expect(typeof body.error).toBe("string");
        expect(body.error.length).toBeGreaterThan(0);
      }
    });

    it("空平台列表，返回错误", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {
          platforms: [],
        },
      });

      // 空列表应返回 400 错误
      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as InstallResponse;
      expect(body.success).toBe(false);

      if (!body.success) {
        expect(body.error).toBeDefined();
      }
    });

    it("混合有效和无效平台，返回错误", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {
          platforms: ["claude", "invalid_platform"],
        },
      });

      // 包含无效平台应返回 400 错误
      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as InstallResponse;
      expect(body.success).toBe(false);
    });
  });

  describe("安装失败场景", () => {
    it("步骤失败时，返回包含错误信息的结果", async () => {
      // 这个测试验证 API 能正确处理安装步骤失败的情况
      // 实际实现时，可能需要 mock 某些步骤来模拟失败
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {
          platforms: ["claude"],
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as InstallResponse;

      // 验证响应结构正确（无论成功或失败都应有正确结构）
      if (body.success) {
        // 如果安装成功，验证结构
        expect(body.results).toBeDefined();
        expect(Array.isArray(body.results)).toBe(true);

        // 检查 steps 结构，失败的 step 应该有 message
        for (const result of body.results) {
          for (const step of result.steps) {
            if (!step.success) {
              expect(step.message).toBeDefined();
              expect(typeof step.message).toBe("string");
            }
          }
        }
      } else {
        // 如果整体失败，应该有 error 信息
        expect(body.error).toBeDefined();
      }
    });
  });

  describe("请求体验证", () => {
    it("缺少 platforms 字段，返回错误", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {},
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as InstallResponse;
      expect(body.success).toBe(false);
    });

    it("platforms 不是数组，返回错误", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/setup/install",
        payload: {
          platforms: "claude",
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as InstallResponse;
      expect(body.success).toBe(false);
    });
  });
});
