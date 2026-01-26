/**
 * CLI update 命令测试
 *
 * 测试场景：
 * 1. 插件状态检测 - 无插件安装时跳过更新
 * 2. 插件状态检测 - 插件已是最新版本时跳过更新
 * 3. 插件状态检测 - 检测到需要更新的插件
 * 4. 插件更新执行 - 成功更新
 * 5. 插件更新执行 - 部分失败
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawnSync, SpawnSyncReturns } from "child_process";

// Mock child_process
vi.mock("child_process", async () => {
  const actual = await vi.importActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    spawnSync: vi.fn(),
  };
});

// Mock plugins.js
vi.mock("../../src/cli/plugins.js", () => ({
  getPluginStatus: vi.fn(),
}));

import { updatePluginsIfNeeded } from "../../src/cli/update.js";
import { getPluginStatus } from "../../src/cli/plugins.js";

const mockGetPluginStatus = vi.mocked(getPluginStatus);
const mockSpawnSync = vi.mocked(spawnSync);

describe("CLI update - updatePluginsIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 静默 console.log
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("无插件安装时应跳过更新", () => {
    mockGetPluginStatus.mockReturnValue({
      currentVersion: "1.11.0",
      claude: {
        hooks: false,
        hooksVersion: undefined,
        hooksNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
      cursor: {
        hooks: false,
        hooksVersion: undefined,
        hooksNeedsUpdate: false,
      },
      opencode: {
        plugins: false,
        pluginsVersion: undefined,
        pluginsNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
    });

    const result = updatePluginsIfNeeded();

    expect(result.success).toBe(true);
    expect(result.failedPlatforms).toEqual([]);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("插件已是最新版本时应跳过更新", () => {
    mockGetPluginStatus.mockReturnValue({
      currentVersion: "1.11.0",
      claude: {
        hooks: true,
        hooksVersion: "1.11.0",
        hooksNeedsUpdate: false,
        agents: ["tanmi-executor.md", "tanmi-tester.md"],
        agentsVersion: "1.11.0",
        agentsNeedsUpdate: false,
        skills: ["aligning-intent", "designing-solutions"],
        skillsVersion: "1.11.0",
        skillsNeedsUpdate: false,
      },
      cursor: {
        hooks: true,
        hooksVersion: "1.11.0",
        hooksNeedsUpdate: false,
      },
      opencode: {
        plugins: false,
        pluginsVersion: undefined,
        pluginsNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
    });

    const result = updatePluginsIfNeeded();

    expect(result.success).toBe(true);
    expect(result.failedPlatforms).toEqual([]);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it("检测到 Claude 插件需要更新时应执行更新", () => {
    mockGetPluginStatus.mockReturnValue({
      currentVersion: "1.11.0",
      claude: {
        hooks: true,
        hooksVersion: "1.10.7",
        hooksNeedsUpdate: true,
        agents: ["tanmi-executor.md"],
        agentsVersion: "1.10.7",
        agentsNeedsUpdate: true,
        skills: ["aligning-intent"],
        skillsVersion: "1.10.7",
        skillsNeedsUpdate: true,
      },
      cursor: {
        hooks: false,
        hooksVersion: undefined,
        hooksNeedsUpdate: false,
      },
      opencode: {
        plugins: false,
        pluginsVersion: undefined,
        pluginsNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
    });

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const result = updatePluginsIfNeeded();

    expect(result.success).toBe(true);
    expect(result.failedPlatforms).toEqual([]);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "tanmi-workspace",
      ["plugins", "install", "--claude"],
      expect.objectContaining({ shell: true })
    );
  });

  it("检测到 Cursor 插件需要更新时应执行更新", () => {
    mockGetPluginStatus.mockReturnValue({
      currentVersion: "1.11.0",
      claude: {
        hooks: false,
        hooksVersion: undefined,
        hooksNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
      cursor: {
        hooks: true,
        hooksVersion: "1.10.7",
        hooksNeedsUpdate: true,
      },
      opencode: {
        plugins: false,
        pluginsVersion: undefined,
        pluginsNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
    });

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const result = updatePluginsIfNeeded();

    expect(result.success).toBe(true);
    expect(result.failedPlatforms).toEqual([]);
    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "tanmi-workspace",
      ["plugins", "install", "--cursor"],
      expect.objectContaining({ shell: true })
    );
  });

  it("多个平台都需要更新时应全部执行", () => {
    mockGetPluginStatus.mockReturnValue({
      currentVersion: "1.11.0",
      claude: {
        hooks: true,
        hooksVersion: "1.10.7",
        hooksNeedsUpdate: true,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
      cursor: {
        hooks: true,
        hooksVersion: "1.10.7",
        hooksNeedsUpdate: true,
      },
      opencode: {
        plugins: false,
        pluginsVersion: undefined,
        pluginsNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
    });

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const result = updatePluginsIfNeeded();

    expect(result.success).toBe(true);
    expect(result.failedPlatforms).toEqual([]);
    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      1,
      "tanmi-workspace",
      ["plugins", "install", "--claude"],
      expect.objectContaining({ shell: true })
    );
    expect(mockSpawnSync).toHaveBeenNthCalledWith(
      2,
      "tanmi-workspace",
      ["plugins", "install", "--cursor"],
      expect.objectContaining({ shell: true })
    );
  });

  it("部分平台更新失败时应返回失败的平台列表", () => {
    mockGetPluginStatus.mockReturnValue({
      currentVersion: "1.11.0",
      claude: {
        hooks: true,
        hooksVersion: "1.10.7",
        hooksNeedsUpdate: true,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
      cursor: {
        hooks: true,
        hooksVersion: "1.10.7",
        hooksNeedsUpdate: true,
      },
      opencode: {
        plugins: false,
        pluginsVersion: undefined,
        pluginsNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
    });

    // Claude 成功，Cursor 失败
    mockSpawnSync
      .mockReturnValueOnce({ status: 0 } as SpawnSyncReturns<Buffer>)
      .mockReturnValueOnce({ status: 1 } as SpawnSyncReturns<Buffer>);

    const result = updatePluginsIfNeeded();

    expect(result.success).toBe(false);
    expect(result.failedPlatforms).toEqual(["cursor"]);
  });

  it("只有 agents 需要更新时也应触发 claude 平台更新", () => {
    mockGetPluginStatus.mockReturnValue({
      currentVersion: "1.11.0",
      claude: {
        hooks: false,
        hooksVersion: undefined,
        hooksNeedsUpdate: false,
        agents: ["tanmi-executor.md"],
        agentsVersion: "1.10.7",
        agentsNeedsUpdate: true,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
      cursor: {
        hooks: false,
        hooksVersion: undefined,
        hooksNeedsUpdate: false,
      },
      opencode: {
        plugins: false,
        pluginsVersion: undefined,
        pluginsNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
    });

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const result = updatePluginsIfNeeded();

    expect(result.success).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "tanmi-workspace",
      ["plugins", "install", "--claude"],
      expect.objectContaining({ shell: true })
    );
  });

  it("只有 skills 需要更新时也应触发 claude 平台更新", () => {
    mockGetPluginStatus.mockReturnValue({
      currentVersion: "1.11.0",
      claude: {
        hooks: false,
        hooksVersion: undefined,
        hooksNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: ["aligning-intent"],
        skillsVersion: "1.10.7",
        skillsNeedsUpdate: true,
      },
      cursor: {
        hooks: false,
        hooksVersion: undefined,
        hooksNeedsUpdate: false,
      },
      opencode: {
        plugins: false,
        pluginsVersion: undefined,
        pluginsNeedsUpdate: false,
        agents: [],
        agentsVersion: undefined,
        agentsNeedsUpdate: false,
        skills: [],
        skillsVersion: undefined,
        skillsNeedsUpdate: false,
      },
    });

    mockSpawnSync.mockReturnValue({ status: 0 } as SpawnSyncReturns<Buffer>);

    const result = updatePluginsIfNeeded();

    expect(result.success).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      "tanmi-workspace",
      ["plugins", "install", "--claude"],
      expect.objectContaining({ shell: true })
    );
  });
});
