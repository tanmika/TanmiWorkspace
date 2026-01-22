// src/utils/pluginPath.ts
// plugin_path 工具的核心逻辑

import { join } from "path";
import { readdirSync, existsSync, statSync } from "fs";

export interface PluginPathResult {
  path?: string;
  skillsPath?: string;
  agentsPath?: string;
  available?: string[];
  error?: string;
}

export interface PluginPathArgs {
  type?: string;
  name?: string;
}

/**
 * 资源类型配置
 */
const TYPE_CONFIG: Record<string, { dir: string; ext: string; file?: string }> =
  {
    skill: { dir: "skills", ext: "", file: "SKILL.md" },
    agent: { dir: "agents", ext: ".md" },
  };

/**
 * 获取目录下的可用资源列表
 */
function listAvailableResources(
  typeDir: string,
  resourceType: string
): string[] {
  const entries = readdirSync(typeDir);

  if (resourceType === "agent") {
    // agents 目录：过滤 .md 文件并去掉扩展名
    return entries
      .filter((e) => e.endsWith(".md") && e !== "CLAUDE.md")
      .map((e) => e.replace(".md", ""));
  } else {
    // skills 目录：过滤出实际的子目录（排除隐藏文件、CLAUDE.md 等非目录项）
    return entries.filter((e) => {
      if (e.startsWith(".") || e === "CLAUDE.md") return false;
      // 检查是否真的是目录
      try {
        return statSync(join(typeDir, e)).isDirectory();
      } catch {
        return false;
      }
    });
  }
}

/**
 * 解析 plugin_path 请求
 * @param pluginPath 插件根目录路径
 * @param args 请求参数
 */
export function resolvePluginPath(
  pluginPath: string,
  args: PluginPathArgs
): PluginPathResult {
  const { type: resourceType, name: resourceName } = args;

  // 无参数，返回根目录信息
  if (!resourceType) {
    return {
      path: pluginPath,
      skillsPath: join(pluginPath, "skills"),
      agentsPath: join(pluginPath, "agents"),
    };
  }

  // 检查 type 是否有效
  const config = TYPE_CONFIG[resourceType];
  if (!config) {
    return {
      error: `无效的 type: '${resourceType}'`,
      available: Object.keys(TYPE_CONFIG),
    };
  }

  const typeDir = join(pluginPath, config.dir);

  // 只有 type，返回该类型目录和可用资源列表
  if (!resourceName) {
    try {
      const available = listAvailableResources(typeDir, resourceType);
      return {
        path: typeDir,
        available,
      };
    } catch {
      return { error: `目录不存在: ${typeDir}` };
    }
  }

  // 有 type 和 name，返回具体资源路径
  const resourcePath = config.file
    ? join(typeDir, resourceName, config.file)
    : join(typeDir, `${resourceName}${config.ext}`);

  if (existsSync(resourcePath)) {
    return { path: resourcePath };
  }

  // 资源不存在，返回可用列表
  try {
    const available = listAvailableResources(typeDir, resourceType);
    return {
      error: `${resourceType} '${resourceName}' 不存在`,
      available,
    };
  } catch {
    return {
      error: `${resourceType} '${resourceName}' 不存在`,
    };
  }
}
