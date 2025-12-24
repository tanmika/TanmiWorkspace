// src/http/routes/config.ts
// 全局配置相关 API 路由

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getServices } from "../services.js";
import type { ConfigSetParams } from "../../types/settings.js";

// 请求类型定义
interface ConfigUpdateBody {
  defaultDispatchMode?: "none" | "git" | "no-git";
}

/**
 * 比较版本号，返回 true 如果 v1 < v2
 */
function isVersionLessThan(v1: string | null, v2: string): boolean {
  if (!v1) return true; // 无版本号视为最旧
  const parse = (v: string) => v.split(".").map(n => parseInt(n, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a < b) return true;
    if (a > b) return false;
  }
  return false; // 相等不算 less than
}

export async function configRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * GET /api/config - 获取全局配置
   * 同时检查并创建新手教程工作区（如果尚未创建）
   */
  fastify.get("/config", async () => {
    // 检查并创建新手教程（静默执行，不阻塞）
    await services.tutorial.ensureTutorial();
    return services.config.get();
  });

  /**
   * PUT /api/config - 更新全局配置
   */
  fastify.put<{ Body: ConfigUpdateBody }>(
    "/config",
    async (request: FastifyRequest<{ Body: ConfigUpdateBody }>) => {
      const params: ConfigSetParams = {
        defaultDispatchMode: request.body.defaultDispatchMode,
      };
      return services.config.set(params);
    }
  );

  /**
   * POST /api/tutorial/trigger - 手动触发创建教程工作区
   * 用于设置页面连续点击版本号5次触发
   */
  fastify.post("/tutorial/trigger", async () => {
    return services.tutorial.manualTriggerTutorial();
  });

  /**
   * GET /api/installation-status - 获取插件安装状态
   * 返回各平台组件的安装情况和版本信息（组件级状态）
   */
  fastify.get("/installation-status", async () => {
    const meta = await services.installation.read();
    const currentVersion = services.installation.getPackageVersion();

    // 组件状态类型
    type ComponentStatus = {
      installed: boolean;
      version: string | null;
      outdated: boolean;
    };

    // 默认组件状态
    const defaultComponent = (): ComponentStatus => ({
      installed: false,
      version: null,
      outdated: false,
    });

    // 构建组件状态
    const buildComponentStatus = (
      compInfo: { installed?: boolean; version?: string } | boolean | undefined
    ): ComponentStatus => {
      // 兼容旧格式（boolean）：已安装的统一标记为过期
      if (typeof compInfo === "boolean") {
        return compInfo
          ? { installed: true, version: null, outdated: true }
          : defaultComponent();
      }
      // 新格式
      if (!compInfo?.installed) {
        return defaultComponent();
      }
      return {
        installed: true,
        version: compInfo.version || null,
        outdated: isVersionLessThan(compInfo.version || null, currentVersion),
      };
    };

    // 构建各平台状态（移除 codex）
    const platforms = {
      claudeCode: {
        name: "Claude Code",
        enabled: false,
        components: {
          mcp: defaultComponent(),
          hooks: defaultComponent(),
          agents: defaultComponent(),
          skills: defaultComponent(),
        },
      },
      cursor: {
        name: "Cursor",
        enabled: false,
        components: {
          mcp: defaultComponent(),
          hooks: defaultComponent(),
          agents: defaultComponent(),
          skills: defaultComponent(),
        },
      },
    };

    // 填充实际数据
    for (const [key, platform] of Object.entries(platforms)) {
      const info = meta.global.platforms[key as keyof typeof meta.global.platforms];
      if (info?.enabled) {
        platform.enabled = true;
        platform.components.mcp = buildComponentStatus(info.components.mcp);
        platform.components.hooks = buildComponentStatus(info.components.hooks);
        platform.components.agents = buildComponentStatus(info.components.agents);
        platform.components.skills = buildComponentStatus(info.components.skills);
      }
    }

    return {
      currentVersion,
      platforms,
      updateCommand: "bash ~/.tanmi-workspace/scripts/install-global.sh",
    };
  });
}
