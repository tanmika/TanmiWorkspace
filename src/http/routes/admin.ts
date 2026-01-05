// src/http/routes/admin.ts
// 索引管理 API 路由

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { existsSync } from "fs";
import { basename, dirname, join } from "path";
import {
  scanForProjects,
  readWorkspacesFromProject,
  verifyWorkspace,
  readIndex,
  writeIndex,
  type WorkspaceEntry,
  type IndexFile,
} from "../../cli/rebuild.js";

const execAsync = promisify(exec);

// 工作区目录名称
const FOLDER_NAME = ".tanmi-workspace";

/**
 * 跨平台原生文件夹选择对话框
 * 支持 macOS 和 Windows
 */
async function selectFolder(): Promise<string | null> {
  const platform = os.platform();

  try {
    if (platform === "darwin") {
      // macOS: 使用 AppleScript
      const { stdout } = await execAsync(
        `osascript -e 'POSIX path of (choose folder with prompt "选择目录")'`
      );
      return stdout.trim();
    } else if (platform === "win32") {
      // Windows: 使用 PowerShell + .NET
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = '选择目录'
        $dialog.RootFolder = 'MyComputer'
        if ($dialog.ShowDialog() -eq 'OK') {
          Write-Output $dialog.SelectedPath
        } else {
          exit 1
        }
      `.replace(/\n/g, " ");
      const { stdout } = await execAsync(
        `powershell -ExecutionPolicy Bypass -Command "${script}"`
      );
      return stdout.trim();
    } else {
      throw new Error(`不支持的平台: ${platform}`);
    }
  } catch (error) {
    // 用户取消或其他错误
    return null;
  }
}

/**
 * 检测路径类型并智能导入
 * 支持：项目目录、.tanmi-workspace 目录、名称_id 工作区目录
 */
function smartImport(inputPath: string): {
  success: boolean;
  added: number;
  existing: number;
  workspaces: Array<{ id: string; name: string; isNew: boolean }>;
  error?: string;
} {
  if (!existsSync(inputPath)) {
    return { success: false, added: 0, existing: 0, workspaces: [], error: "路径不存在" };
  }

  const index = readIndex() || { version: "1.0", workspaces: [] };
  const existingIds = new Set(index.workspaces.map((ws) => ws.id));
  const results: Array<{ id: string; name: string; isNew: boolean }> = [];
  let added = 0;
  let existing = 0;

  // 检测路径类型
  const dirName = basename(inputPath);

  // 情况1：直接是 名称_id 格式的工作区目录
  if (dirName.includes("_ws-") || dirName.includes("_node-")) {
    // 检查是否有 config.json 或 workspace.json
    const configPath = join(inputPath, "config.json");
    const workspacePath = join(inputPath, "workspace.json");

    if (existsSync(configPath) || existsSync(workspacePath)) {
      // 解析工作区信息
      const match = dirName.match(/^(.+)_(ws-[a-z0-9]+)$/);
      if (match) {
        const [, name, id] = match;
        const parentDir = dirname(inputPath);
        const grandParentDir = dirname(parentDir);

        const wsEntry: WorkspaceEntry = {
          id,
          name,
          projectRoot: grandParentDir,
          dirName,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        if (existingIds.has(id)) {
          existing++;
          results.push({ id, name, isNew: false });
        } else {
          index.workspaces.push(wsEntry);
          added++;
          results.push({ id, name, isNew: true });
        }
      }
    }
  }

  // 情况2：是 .tanmi-workspace 目录
  if (dirName === FOLDER_NAME) {
    const projectRoot = dirname(inputPath);
    const workspaces = readWorkspacesFromProject(projectRoot);

    for (const ws of workspaces) {
      if (existingIds.has(ws.id)) {
        existing++;
        results.push({ id: ws.id, name: ws.name, isNew: false });
      } else {
        index.workspaces.push(ws);
        existingIds.add(ws.id);
        added++;
        results.push({ id: ws.id, name: ws.name, isNew: true });
      }
    }
  }

  // 情况3：使用 2 层递归扫描
  if (results.length === 0) {
    const projects = scanForProjects(inputPath, 2);

    for (const project of projects) {
      const workspaces = readWorkspacesFromProject(project);

      for (const ws of workspaces) {
        if (existingIds.has(ws.id)) {
          existing++;
          results.push({ id: ws.id, name: ws.name, isNew: false });
        } else {
          index.workspaces.push(ws);
          existingIds.add(ws.id);
          added++;
          results.push({ id: ws.id, name: ws.name, isNew: true });
        }
      }
    }
  }

  if (results.length === 0) {
    return { success: false, added: 0, existing: 0, workspaces: [], error: "未找到有效的工作区" };
  }

  // 保存索引
  if (added > 0) {
    writeIndex(index);
  }

  return { success: true, added, existing, workspaces: results };
}

/**
 * 同步清理预览：扫描已索引路径，返回预览结果
 */
function syncCleanPreview(): {
  toAdd: Array<{ id: string; name: string; projectRoot: string }>;
  toRemove: Array<{ id: string; name: string; reason: string }>;
} {
  const index = readIndex();
  if (!index || index.workspaces.length === 0) {
    return { toAdd: [], toRemove: [] };
  }

  const existingIds = new Set(index.workspaces.map((ws) => ws.id));
  const toAdd: Array<{ id: string; name: string; projectRoot: string }> = [];
  const toRemove: Array<{ id: string; name: string; reason: string }> = [];

  // 收集所有唯一的 projectRoot
  const projectRoots = new Set<string>();
  for (const ws of index.workspaces) {
    if (ws.projectRoot) {
      projectRoots.add(ws.projectRoot);
    }
  }

  // 扫描每个 projectRoot 发现新工作区
  for (const projectRoot of projectRoots) {
    if (!existsSync(projectRoot)) {
      continue;
    }

    const workspaces = readWorkspacesFromProject(projectRoot);
    for (const ws of workspaces) {
      if (!existingIds.has(ws.id)) {
        toAdd.push({ id: ws.id, name: ws.name, projectRoot });
      }
    }
  }

  // 验证现有工作区，找出无效的
  for (const ws of index.workspaces) {
    const verification = verifyWorkspace(ws);
    if (!verification.valid) {
      toRemove.push({
        id: ws.id,
        name: ws.name,
        reason: verification.reason || "未知原因",
      });
    }
  }

  return { toAdd, toRemove };
}

/**
 * 执行同步清理
 */
function syncCleanExecute(): {
  added: number;
  removed: number;
  addedList: Array<{ id: string; name: string }>;
  removedList: Array<{ id: string; name: string }>;
} {
  const index = readIndex();
  if (!index) {
    return { added: 0, removed: 0, addedList: [], removedList: [] };
  }

  const existingIds = new Set(index.workspaces.map((ws) => ws.id));
  const addedList: Array<{ id: string; name: string }> = [];
  const removedList: Array<{ id: string; name: string }> = [];

  // 收集所有唯一的 projectRoot
  const projectRoots = new Set<string>();
  for (const ws of index.workspaces) {
    if (ws.projectRoot) {
      projectRoots.add(ws.projectRoot);
    }
  }

  // 扫描每个 projectRoot 添加新工作区
  for (const projectRoot of projectRoots) {
    if (!existsSync(projectRoot)) {
      continue;
    }

    const workspaces = readWorkspacesFromProject(projectRoot);
    for (const ws of workspaces) {
      if (!existingIds.has(ws.id)) {
        index.workspaces.push(ws);
        existingIds.add(ws.id);
        addedList.push({ id: ws.id, name: ws.name });
      }
    }
  }

  // 过滤掉无效的工作区
  const validWorkspaces: WorkspaceEntry[] = [];
  for (const ws of index.workspaces) {
    const verification = verifyWorkspace(ws);
    if (verification.valid) {
      validWorkspaces.push(ws);
    } else {
      removedList.push({ id: ws.id, name: ws.name });
    }
  }

  index.workspaces = validWorkspaces;
  writeIndex(index);

  return {
    added: addedList.length,
    removed: removedList.length,
    addedList,
    removedList,
  };
}

// 请求类型定义
interface ImportBody {
  path: string;
}

// JSON Schema 定义
const importSchema = {
  body: {
    type: "object",
    required: ["path"],
    properties: {
      path: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
};

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/admin/pick-directory - 打开原生目录选择对话框
   */
  fastify.post("/admin/pick-directory", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await selectFolder();
      if (result) {
        return { path: result };
      } else {
        return { cancelled: true };
      }
    } catch (error) {
      fastify.log.error(error, "打开目录选择对话框失败");
      return reply.status(500).send({
        error: "DIALOG_ERROR",
        message: error instanceof Error ? error.message : "无法打开目录选择对话框",
      });
    }
  });

  /**
   * POST /api/admin/import - 智能导入工作区
   * 支持：项目目录、.tanmi-workspace 目录、名称_id 工作区目录
   * 使用 2 层递归扫描
   */
  fastify.post<{ Body: ImportBody }>(
    "/admin/import",
    { schema: importSchema },
    async (request: FastifyRequest<{ Body: ImportBody }>, reply: FastifyReply) => {
      const { path } = request.body;

      try {
        const result = smartImport(path);

        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: "IMPORT_ERROR",
            message: result.error,
          });
        }

        return {
          success: true,
          added: result.added,
          existing: result.existing,
          workspaces: result.workspaces,
        };
      } catch (error) {
        fastify.log.error(error, "导入工作区失败");
        return reply.status(500).send({
          success: false,
          error: "IMPORT_ERROR",
          message: error instanceof Error ? error.message : "导入失败",
        });
      }
    }
  );

  /**
   * POST /api/admin/sync-clean-preview - 同步清理预览
   * 扫描已索引路径，返回将要添加和清理的工作区
   */
  fastify.post("/admin/sync-clean-preview", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = syncCleanPreview();
      return {
        toAdd: result.toAdd,
        toRemove: result.toRemove,
        hasChanges: result.toAdd.length > 0 || result.toRemove.length > 0,
      };
    } catch (error) {
      fastify.log.error(error, "同步清理预览失败");
      return reply.status(500).send({
        error: "PREVIEW_ERROR",
        message: error instanceof Error ? error.message : "预览失败",
      });
    }
  });

  /**
   * POST /api/admin/sync-clean-execute - 执行同步清理
   */
  fastify.post("/admin/sync-clean-execute", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = syncCleanExecute();
      return {
        success: true,
        added: result.added,
        removed: result.removed,
        addedList: result.addedList,
        removedList: result.removedList,
      };
    } catch (error) {
      fastify.log.error(error, "同步清理执行失败");
      return reply.status(500).send({
        error: "EXECUTE_ERROR",
        message: error instanceof Error ? error.message : "执行失败",
      });
    }
  });

  /**
   * GET /api/admin/index-stats - 获取索引统计信息
   */
  fastify.get("/admin/index-stats", async () => {
    const index = readIndex();
    if (!index) {
      return { total: 0, valid: 0, invalid: 0 };
    }

    let valid = 0;
    let invalid = 0;

    for (const ws of index.workspaces) {
      const verification = verifyWorkspace(ws);
      if (verification.valid) {
        valid++;
      } else {
        invalid++;
      }
    }

    return {
      total: index.workspaces.length,
      valid,
      invalid,
    };
  });
}
