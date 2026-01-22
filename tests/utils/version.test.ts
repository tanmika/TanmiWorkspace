/**
 * 版本比较工具测试
 */

import { describe, it, expect } from "vitest";
import { isVersionLessThan } from "../../src/utils/version.js";

describe("isVersionLessThan", () => {
  describe("基础版本比较", () => {
    it("应正确比较主版本号", () => {
      expect(isVersionLessThan("1.0.0", "2.0.0")).toBe(true);
      expect(isVersionLessThan("2.0.0", "1.0.0")).toBe(false);
    });

    it("应正确比较次版本号", () => {
      expect(isVersionLessThan("1.10.0", "1.11.0")).toBe(true);
      expect(isVersionLessThan("1.11.0", "1.10.0")).toBe(false);
    });

    it("应正确比较补丁版本号", () => {
      expect(isVersionLessThan("1.11.0", "1.11.1")).toBe(true);
      expect(isVersionLessThan("1.11.1", "1.11.0")).toBe(false);
    });

    it("相等版本应返回 false", () => {
      expect(isVersionLessThan("1.11.0", "1.11.0")).toBe(false);
    });
  });

  describe("prerelease 版本比较", () => {
    it("beta 版本应小于正式版", () => {
      expect(isVersionLessThan("1.11.0-beta.3", "1.11.0")).toBe(true);
    });

    it("正式版不应小于 beta 版本", () => {
      expect(isVersionLessThan("1.11.0", "1.11.0-beta.3")).toBe(false);
    });

    it("应正确比较同系列 beta 版本", () => {
      expect(isVersionLessThan("1.11.0-beta.3", "1.11.0-beta.4")).toBe(true);
      expect(isVersionLessThan("1.11.0-beta.4", "1.11.0-beta.3")).toBe(false);
    });

    it("alpha 版本应小于 beta 版本", () => {
      expect(isVersionLessThan("1.11.0-alpha.1", "1.11.0-beta.1")).toBe(true);
    });

    it("相同 prerelease 应返回 false", () => {
      expect(isVersionLessThan("1.11.0-beta.3", "1.11.0-beta.3")).toBe(false);
    });

    // 数值比较测试（修复 beta.9 vs beta.10 的 bug）
    it("应使用数值比较 prerelease 中的数字部分", () => {
      expect(isVersionLessThan("1.11.0-beta.9", "1.11.0-beta.10")).toBe(true);
      expect(isVersionLessThan("1.11.0-beta.10", "1.11.0-beta.9")).toBe(false);
      expect(isVersionLessThan("1.11.0-beta.19", "1.11.0-beta.20")).toBe(true);
    });

    it("rc 版本应大于 beta 版本", () => {
      expect(isVersionLessThan("1.11.0-beta.1", "1.11.0-rc.1")).toBe(true);
      expect(isVersionLessThan("1.11.0-rc.1", "1.11.0-beta.99")).toBe(false);
    });

    it("应正确处理多段 prerelease", () => {
      // beta < beta.0 < beta.1
      expect(isVersionLessThan("1.11.0-beta", "1.11.0-beta.0")).toBe(true);
      expect(isVersionLessThan("1.11.0-beta.0", "1.11.0-beta.1")).toBe(true);
    });
  });

  describe("边界情况", () => {
    it("null 版本应视为最旧", () => {
      expect(isVersionLessThan(null, "1.0.0")).toBe(true);
      expect(isVersionLessThan(null, "0.0.1")).toBe(true);
    });

    it("应处理不同长度的版本号", () => {
      expect(isVersionLessThan("1.0", "1.0.1")).toBe(true);
      expect(isVersionLessThan("1.0.0", "1.0")).toBe(false);
    });
  });

  describe("实际升级场景", () => {
    it("beta.3 → beta.4 应检测为需要更新", () => {
      // minVersion = 1.11.0-beta.4, 用户版本 = 1.11.0-beta.3
      expect(isVersionLessThan("1.11.0-beta.3", "1.11.0-beta.4")).toBe(true);
    });

    it("beta.3 → 正式版应检测为需要更新", () => {
      // minVersion = 1.11.0, 用户版本 = 1.11.0-beta.3
      expect(isVersionLessThan("1.11.0-beta.3", "1.11.0")).toBe(true);
    });

    it("正式版 → 下一个正式版应检测为需要更新", () => {
      // minVersion = 1.12.0, 用户版本 = 1.11.0
      expect(isVersionLessThan("1.11.0", "1.12.0")).toBe(true);
    });

    it("已是最新版不应提示更新", () => {
      // minVersion = 1.11.0, 用户版本 = 1.11.0
      expect(isVersionLessThan("1.11.0", "1.11.0")).toBe(false);
      // minVersion = 1.11.0, 用户版本 = 1.12.0
      expect(isVersionLessThan("1.12.0", "1.11.0")).toBe(false);
    });
  });
});
