// src/http/routes/config.ts
// 全局配置相关 API 路由

import type { FastifyInstance, FastifyRequest } from "fastify";
import { getServices } from "../services.js";
import type { ConfigSetParams } from "../../types/settings.js";

// 请求类型定义
interface ConfigUpdateBody {
  defaultDispatchMode?: "none" | "git" | "no-git";
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
   * 返回各平台组件的安装情况和版本信息
   */
  fastify.get("/installation-status", async () => {
    const meta = await services.installation.read();
    const currentVersion = services.installation.getPackageVersion();

    // 构建各平台状态
    const platforms = {
      claudeCode: {
        name: "Claude Code",
        enabled: false,
        version: null as string | null,
        needsUpdate: false,
        components: {
          hooks: false,
          mcp: false,
          agents: false,
          skills: false,
        },
      },
      cursor: {
        name: "Cursor",
        enabled: false,
        version: null as string | null,
        needsUpdate: false,
        components: {
          hooks: false,
          mcp: false,
          agents: false,
          skills: false,
        },
      },
      codex: {
        name: "Codex",
        enabled: false,
        version: null as string | null,
        needsUpdate: false,
        components: {
          hooks: false,
          mcp: false,
          agents: false,
          skills: false,
        },
      },
    };

    // 填充实际数据
    for (const [key, platform] of Object.entries(platforms)) {
      const info = meta.global.platforms[key as keyof typeof meta.global.platforms];
      if (info?.enabled) {
        platform.enabled = true;
        platform.version = info.version;
        platform.needsUpdate = info.version !== currentVersion;
        platform.components.hooks = info.components.hooks || false;
        platform.components.mcp = info.components.mcp || false;
        // agents 和 skills 暂时从 projects 字段获取（待实现）
      }
    }

    return {
      currentVersion,
      platforms,
      updateCommand: "bash ~/.tanmi-workspace/scripts/install-global.sh",
    };
  });
}
