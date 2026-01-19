// src/http/routes/admin.ts
// 索引管理 API 路由

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import { existsSync, statSync, createWriteStream, readFileSync, cpSync, mkdirSync } from "fs";
import { mkdir, rm, unlink } from "fs/promises";
import { basename, dirname, join } from "path";
import { pipeline } from "stream/promises";
import {
  scanForProjects,
  readWorkspacesFromProject,
  verifyWorkspace,
  readIndex,
  writeIndex,
  type WorkspaceEntry,
  type IndexFile,
} from "../../cli/rebuild.js";
import { getServices } from "../services.js";

const execAsync = promisify(exec);

// 开发环境判断
const IS_DEV = process.env.NODE_ENV === "development" || process.env.TANMI_DEV === "true";

// 工作区目录名称（根据环境）
const FOLDER_NAME = IS_DEV ? ".tanmi-workspace-dev" : ".tanmi-workspace";

// ============================================================================
// 索引操作队列（防止并发写入竞态条件）
// ============================================================================

let indexOperationQueue: Promise<unknown> = Promise.resolve();

/**
 * 序列化索引操作，确保不会有并发读写冲突
 * 所有修改索引的操作都应该通过这个函数执行
 */
async function withIndexLock<T>(operation: () => T | Promise<T>): Promise<T> {
  const currentOperation = indexOperationQueue.then(async () => {
    return await operation();
  });

  // 更新队列，错误时记录日志但不阻塞后续操作
  indexOperationQueue = currentOperation.catch((err) => {
    console.error("[admin] 索引操作失败:", err instanceof Error ? err.message : String(err));
  });

  return currentOperation;
}

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
 * 验证路径是否为有效目录
 */
function validateDirectoryPath(inputPath: string): { valid: boolean; error?: string } {
  if (!existsSync(inputPath)) {
    return { valid: false, error: "目录不存在" };
  }

  try {
    const stat = statSync(inputPath);
    if (!stat.isDirectory()) {
      return { valid: false, error: "路径不是目录" };
    }
  } catch (e) {
    return { valid: false, error: `无法访问路径: ${e instanceof Error ? e.message : "权限不足"}` };
  }

  return { valid: true };
}

/**
 * 尝试作为裸工作区导入（直接包含 workspace.json 或 config.json 的目录）
 * @param dirPath 目录路径
 * @returns 如果是有效的裸工作区，返回工作区信息；否则返回 null 或错误
 */
function tryImportAsWorkspace(dirPath: string): {
  success: boolean;
  entry?: WorkspaceEntry;
  error?: string;
} {
  // 检查 workspace.json 或 config.json
  const workspacePath = join(dirPath, "workspace.json");
  const configPath = join(dirPath, "config.json");
  const actualPath = existsSync(workspacePath) ? workspacePath : existsSync(configPath) ? configPath : null;

  if (!actualPath) {
    return { success: false, error: "workspace.json 不存在" };
  }

  // 读取并解析配置文件
  let config: { id?: string; name?: string; status?: string; createdAt?: string; updatedAt?: string };
  try {
    const content = readFileSync(actualPath, "utf-8");
    config = JSON.parse(content);
  } catch (e) {
    return { success: false, error: `workspace.json 格式错误: ${e instanceof Error ? e.message : "JSON 解析失败"}` };
  }

  // 验证必要字段
  const missingFields: string[] = [];
  if (!config.id) missingFields.push("id");
  if (!config.name) missingFields.push("name");

  if (missingFields.length > 0) {
    return { success: false, error: `workspace.json 缺少必要字段: ${missingFields.join(", ")}` };
  }

  // 构建工作区条目
  // 裸工作区的 projectRoot 是其父目录的父目录（假设结构为 projectRoot/.tanmi-workspace/dirName）
  // 但对于裸工作区，我们使用其父目录作为 projectRoot
  const dirName = basename(dirPath);
  const parentDir = dirname(dirPath);

  // 检测是否在 .tanmi-workspace 目录下
  const grandParentDir = dirname(parentDir);
  const isUnderTanmiWorkspace = basename(parentDir) === FOLDER_NAME;

  const entry: WorkspaceEntry = {
    id: config.id!,
    name: config.name!,
    projectRoot: isUnderTanmiWorkspace ? grandParentDir : parentDir,
    dirName: dirName,
    status: config.status || "active",
    createdAt: config.createdAt || new Date().toISOString(),
    updatedAt: config.updatedAt || new Date().toISOString(),
  };

  return { success: true, entry };
}

/**
 * 检测路径类型并智能导入
 * 优先级：裸工作区 → .tanmi-workspace 目录 → 递归扫描
 * @param inputPath 输入路径
 * @param targetDir 目标目录（仅裸工作区导入时使用，复制工作区到此目录）
 */
function smartImport(inputPath: string, targetDir?: string): {
  success: boolean;
  added: number;
  existing: number;
  workspaces: Array<{ id: string; name: string; isNew: boolean }>;
  error?: string;
} {
  // 验证路径
  const validation = validateDirectoryPath(inputPath);
  if (!validation.valid) {
    return { success: false, added: 0, existing: 0, workspaces: [], error: validation.error };
  }

  const index = readIndex() || { version: "1.0", workspaces: [] };
  const existingIds = new Set(index.workspaces.map((ws) => ws.id));
  const results: Array<{ id: string; name: string; isNew: boolean }> = [];
  let added = 0;
  let existing = 0;

  // 检测路径类型
  const dirName = basename(inputPath);

  // 优先级1：尝试作为裸工作区导入（直接包含 workspace.json/config.json 的目录）
  const bareWorkspaceResult = tryImportAsWorkspace(inputPath);
  if (bareWorkspaceResult.success && bareWorkspaceResult.entry) {
    let entry = bareWorkspaceResult.entry;

    // 检查是否是"裸工作区"（不在 .tanmi-workspace 目录下）
    const parentDirName = basename(dirname(inputPath));
    const isBareWorkspace = parentDirName !== FOLDER_NAME;

    // 裸工作区必须提供目标目录
    if (isBareWorkspace && !targetDir) {
      console.log("[smartImport] 裸工作区缺少 targetDir");
      return { success: false, added: 0, existing: 0, workspaces: [], error: "裸工作区导入需要指定目标目录" };
    }

    console.log("[smartImport] isBareWorkspace:", isBareWorkspace, "targetDir:", targetDir);

    // 如果提供了目标目录，复制工作区到目标目录
    if (targetDir) {
      try {
        // 展开 ~ 为用户主目录
        const expandedTargetDir = targetDir.startsWith("~")
          ? targetDir.replace("~", os.homedir())
          : targetDir;

        // 创建目标目录结构: targetDir/.tanmi-workspace/
        const tanmiDir = join(expandedTargetDir, FOLDER_NAME);
        console.log("[smartImport] 复制目标:", { expandedTargetDir, tanmiDir, FOLDER_NAME });

        if (!existsSync(tanmiDir)) {
          mkdirSync(tanmiDir, { recursive: true });
        }

        // 目标路径: targetDir/.tanmi-workspace/dirName
        const destPath = join(tanmiDir, entry.dirName);
        console.log("[smartImport] 复制:", inputPath, "->", destPath);

        // 检查目标是否已存在
        if (existsSync(destPath)) {
          return { success: false, added: 0, existing: 0, workspaces: [], error: `目标路径已存在: ${destPath}` };
        }

        // 复制工作区目录
        cpSync(inputPath, destPath, { recursive: true });
        console.log("[smartImport] 复制完成, 新 projectRoot:", expandedTargetDir);

        // 更新 entry 的 projectRoot 为新位置
        entry = {
          ...entry,
          projectRoot: expandedTargetDir,
        };
      } catch (e) {
        console.error("[smartImport] 复制失败:", e);
        return { success: false, added: 0, existing: 0, workspaces: [], error: `复制工作区失败: ${e instanceof Error ? e.message : "未知错误"}` };
      }
    } else {
      console.log("[smartImport] 无 targetDir，原地注册");
    }

    if (existingIds.has(entry.id)) {
      existing++;
      results.push({ id: entry.id, name: entry.name, isNew: false });
    } else {
      index.workspaces.push(entry);
      existingIds.add(entry.id);
      added++;
      results.push({ id: entry.id, name: entry.name, isNew: true });
    }
  }

  // 优先级2：是 .tanmi-workspace 目录
  if (results.length === 0 && dirName === FOLDER_NAME) {
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

  // 优先级3：使用 2 层递归扫描
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

  // 根据不同情况返回具体错误信息
  if (results.length === 0) {
    // 检查是否是因为 workspace.json 问题
    if (bareWorkspaceResult.error && bareWorkspaceResult.error !== "workspace.json 不存在") {
      // workspace.json 存在但有问题（格式错误或缺少字段）
      return { success: false, added: 0, existing: 0, workspaces: [], error: bareWorkspaceResult.error };
    }
    return { success: false, added: 0, existing: 0, workspaces: [], error: "未找到有效的工作区" };
  }

  // 保存索引
  if (added > 0) {
    writeIndex(index);
  }

  return { success: true, added, existing, workspaces: results };
}

/**
 * 导入预检查：分析路径类型，决定是否需要二级弹窗
 * - single: 单工作区（裸工作区或 .twsp），需要选择目标目录
 * - multiple: 多工作区（项目目录或 .tanmi-workspace），原地注册
 */
function importPreview(inputPath: string): {
  success: boolean;
  type: "single" | "multiple";
  workspaces: Array<{ id: string; name: string; isNew: boolean }>;
  needsTargetDir: boolean;
  suggestedTargetDir?: string;
  error?: string;
} {
  // 建议的默认导入目录（根据环境）
  const suggestedTargetDir = `~/${FOLDER_NAME}/import/`;
  // 验证路径
  const validation = validateDirectoryPath(inputPath);
  if (!validation.valid) {
    return { success: false, type: "single", workspaces: [], needsTargetDir: false, error: validation.error };
  }

  const index = readIndex() || { version: "1.0", workspaces: [] };
  const existingIds = new Set(index.workspaces.map((ws) => ws.id));
  const dirName = basename(inputPath);

  // 优先级1：尝试作为裸工作区检测
  const bareWorkspaceResult = tryImportAsWorkspace(inputPath);
  if (bareWorkspaceResult.success && bareWorkspaceResult.entry) {
    const entry = bareWorkspaceResult.entry;
    const isNew = !existingIds.has(entry.id);
    return {
      success: true,
      type: "single",
      workspaces: [{ id: entry.id, name: entry.name, isNew }],
      needsTargetDir: true, // 单工作区需要选择目标目录
      suggestedTargetDir,
    };
  }

  // 优先级2：是 .tanmi-workspace 目录
  if (dirName === FOLDER_NAME) {
    const projectRoot = dirname(inputPath);
    const workspaces = readWorkspacesFromProject(projectRoot);

    if (workspaces.length > 0) {
      return {
        success: true,
        type: "multiple",
        workspaces: workspaces.map((ws) => ({
          id: ws.id,
          name: ws.name,
          isNew: !existingIds.has(ws.id),
        })),
        needsTargetDir: false, // 多工作区原地注册
      };
    }
  }

  // 优先级3：递归扫描项目目录
  const projects = scanForProjects(inputPath, 2);
  const allWorkspaces: Array<{ id: string; name: string; isNew: boolean }> = [];

  for (const project of projects) {
    const workspaces = readWorkspacesFromProject(project);
    for (const ws of workspaces) {
      allWorkspaces.push({
        id: ws.id,
        name: ws.name,
        isNew: !existingIds.has(ws.id),
      });
    }
  }

  if (allWorkspaces.length > 0) {
    return {
      success: true,
      type: allWorkspaces.length === 1 ? "single" : "multiple",
      workspaces: allWorkspaces,
      needsTargetDir: allWorkspaces.length === 1, // 单工作区需要选择目标目录
      suggestedTargetDir: allWorkspaces.length === 1 ? suggestedTargetDir : undefined,
    };
  }

  // 没有找到任何工作区
  // 返回详细错误信息
  if (bareWorkspaceResult.error && bareWorkspaceResult.error !== "workspace.json 不存在") {
    return { success: false, type: "single", workspaces: [], needsTargetDir: false, error: bareWorkspaceResult.error };
  }

  return { success: false, type: "single", workspaces: [], needsTargetDir: false, error: "未找到有效的工作区" };
}

// ============================================================================
// 同步清理：公共逻辑提取
// ============================================================================

interface SyncCleanAnalysis {
  index: IndexFile;
  existingIds: Set<string>;
  projectRoots: Set<string>;
  toAdd: Array<{ id: string; name: string; projectRoot: string; entry: WorkspaceEntry }>;
  toRemove: Array<{ id: string; name: string; reason: string }>;
}

/**
 * 分析索引状态，找出需要添加和移除的工作区
 * 公共逻辑，供 preview 和 execute 共用
 */
function analyzeSyncClean(): SyncCleanAnalysis | null {
  const index = readIndex();
  if (!index || index.workspaces.length === 0) {
    return null;
  }

  const existingIds = new Set(index.workspaces.map((ws) => ws.id));
  const toAdd: SyncCleanAnalysis["toAdd"] = [];
  const toRemove: SyncCleanAnalysis["toRemove"] = [];

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
        toAdd.push({ id: ws.id, name: ws.name, projectRoot, entry: ws });
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

  return { index, existingIds, projectRoots, toAdd, toRemove };
}

/**
 * 同步清理预览：扫描已索引路径，返回预览结果（只读操作）
 */
function syncCleanPreview(): {
  toAdd: Array<{ id: string; name: string; projectRoot: string }>;
  toRemove: Array<{ id: string; name: string; reason: string }>;
} {
  const analysis = analyzeSyncClean();
  if (!analysis) {
    return { toAdd: [], toRemove: [] };
  }

  // 预览只返回简化信息，不包含完整 entry
  return {
    toAdd: analysis.toAdd.map(({ id, name, projectRoot }) => ({ id, name, projectRoot })),
    toRemove: analysis.toRemove,
  };
}

/**
 * 执行同步清理（写入操作）
 */
function syncCleanExecute(): {
  added: number;
  removed: number;
  addedList: Array<{ id: string; name: string }>;
  removedList: Array<{ id: string; name: string }>;
} {
  const analysis = analyzeSyncClean();
  if (!analysis) {
    return { added: 0, removed: 0, addedList: [], removedList: [] };
  }

  const { index, toAdd, toRemove } = analysis;
  const addedList: Array<{ id: string; name: string }> = [];
  const removedList: Array<{ id: string; name: string }> = [];
  const removeIds = new Set(toRemove.map((r) => r.id));

  // 添加新工作区
  for (const item of toAdd) {
    index.workspaces.push(item.entry);
    addedList.push({ id: item.id, name: item.name });
  }

  // 过滤掉无效的工作区
  index.workspaces = index.workspaces.filter((ws) => {
    if (removeIds.has(ws.id)) {
      removedList.push({ id: ws.id, name: ws.name });
      return false;
    }
    return true;
  });

  // 只在有变更时写入
  if (addedList.length > 0 || removedList.length > 0) {
    writeIndex(index);
  }

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
  targetDir?: string; // 目标目录（仅单工作区导入时使用）
}

// JSON Schema 定义
const importSchema = {
  body: {
    type: "object",
    required: ["path"],
    properties: {
      path: { type: "string", minLength: 1 },
      targetDir: { type: "string" },
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
   * 使用操作队列防止并发写入冲突
   */
  fastify.post<{ Body: ImportBody }>(
    "/admin/import",
    { schema: importSchema },
    async (request: FastifyRequest<{ Body: ImportBody }>, reply: FastifyReply) => {
      const { path, targetDir } = request.body;

      fastify.log.info({ path, targetDir, FOLDER_NAME }, "导入请求参数");

      try {
        // 使用锁序列化索引操作
        const result = await withIndexLock(() => smartImport(path, targetDir));
        fastify.log.info({ result }, "导入结果");

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
   * 使用操作队列防止并发写入冲突
   */
  fastify.post("/admin/sync-clean-execute", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      // 使用锁序列化索引操作
      const result = await withIndexLock(() => syncCleanExecute());
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

  /**
   * GET /api/admin/export-workspace/:workspaceId/check - 预检查工作区导出
   * 返回警告信息，不执行导出
   */
  fastify.get<{ Params: { workspaceId: string } }>(
    "/admin/export-workspace/:workspaceId/check",
    async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
      const { workspaceId } = request.params;

      try {
        const services = getServices();
        const warnings = await services.workspace.checkExportWarnings(workspaceId);

        return reply.send({
          canExport: true,
          warnings,
        });
      } catch (error) {
        fastify.log.error(error, "检查工作区导出失败");
        return reply.status(500).send({
          error: "CHECK_ERROR",
          message: error instanceof Error ? error.message : "检查失败",
        });
      }
    }
  );

  /**
   * GET /api/admin/export-workspace/:workspaceId - 导出工作区为 .twsp 文件
   * 响应: application/zip 文件流
   */
  fastify.get<{ Params: { workspaceId: string } }>(
    "/admin/export-workspace/:workspaceId",
    async (request: FastifyRequest<{ Params: { workspaceId: string } }>, reply: FastifyReply) => {
      const { workspaceId } = request.params;

      try {
        const services = getServices();
        const { buffer, filename, warnings } = await services.workspace.exportAsTwsp(workspaceId);

        // 设置响应头
        reply.header("Content-Type", "application/zip");
        reply.header("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
        reply.header("Content-Length", buffer.length);

        // 如果有警告，通过自定义 header 传递（Base64 编码避免非 ASCII 字符问题）
        if (warnings.length > 0) {
          reply.header("X-Export-Warnings", Buffer.from(JSON.stringify(warnings)).toString("base64"));
        }

        return reply.send(buffer);
      } catch (error) {
        fastify.log.error(error, "导出工作区失败");
        return reply.status(500).send({
          error: "EXPORT_ERROR",
          message: error instanceof Error ? error.message : "导出失败",
        });
      }
    }
  );

  /**
   * POST /api/admin/import-preview - 导入预检查
   * 请求: { path: string }
   * 响应: { success, type: "single"|"multiple", workspaces, needsTargetDir, error? }
   */
  fastify.post("/admin/import-preview", async (request: FastifyRequest, reply: FastifyReply) => {
    const { path: inputPath } = request.body as { path?: string };

    if (!inputPath) {
      return reply.status(400).send({
        error: "MISSING_PATH",
        message: "缺少 path 参数",
      });
    }

    const result = importPreview(inputPath);

    if (!result.success) {
      return reply.status(400).send({
        error: "INVALID_PATH",
        message: result.error,
        ...result,
      });
    }

    return reply.send(result);
  });

  /**
   * POST /api/admin/import-twsp - 导入 .twsp 工作区文件
   * 请求: multipart/form-data，文件字段名 file，可选字段 targetDir
   * 响应: { workspaceId, name, path, warnings }
   */
  fastify.post("/admin/import-twsp", async (request: FastifyRequest, reply: FastifyReply) => {
    let tempFilePath: string | null = null;

    try {
      fastify.log.info("开始处理 .twsp 导入请求");

      // 解析 multipart 数据
      // 注意：file 流必须在遍历过程中立即消费，不能等到循环结束后
      const parts = request.parts();
      let filename: string | null = null;
      let targetDir: string | undefined;

      // 先准备临时目录
      const tempDir = join(os.tmpdir(), "twsp-upload");
      await mkdir(tempDir, { recursive: true });

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          filename = part.filename || "upload.twsp";
          fastify.log.info({ filename }, "接收到文件");

          // 验证文件扩展名
          if (!filename.endsWith(".twsp")) {
            // 必须消费掉流，否则会导致连接挂起
            await part.file.resume();
            return reply.status(400).send({
              error: "INVALID_FILE_TYPE",
              message: "仅支持 .twsp 文件",
            });
          }

          // 立即保存到临时文件（在循环内消费流）
          tempFilePath = join(tempDir, `${Date.now()}-${basename(filename)}`);
          const writeStream = createWriteStream(tempFilePath);
          await pipeline(part.file, writeStream);
          fastify.log.info({ tempFilePath }, "文件已保存到临时路径");

        } else if (part.type === "field" && part.fieldname === "targetDir") {
          targetDir = part.value as string;
          fastify.log.info({ targetDir }, "目标目录");
        }
      }

      if (!tempFilePath || !filename) {
        return reply.status(400).send({
          error: "NO_FILE",
          message: "未上传文件",
        });
      }

      // 调用导入服务
      fastify.log.info("开始导入工作区");
      const services = getServices();
      const result = await services.workspace.importFromTwsp(tempFilePath, targetDir || undefined);
      fastify.log.info({ workspaceId: result.workspaceId }, "导入完成");

      return reply.send({
        success: true,
        workspaceId: result.workspaceId,
        name: result.name,
        path: result.path,
        warnings: result.warnings,
      });
    } catch (error) {
      fastify.log.error(error, "导入 .twsp 文件失败");
      return reply.status(500).send({
        error: "IMPORT_ERROR",
        message: error instanceof Error ? error.message : "导入失败",
      });
    } finally {
      // 清理临时文件
      if (tempFilePath && existsSync(tempFilePath)) {
        try {
          await unlink(tempFilePath);
        } catch {
          // 清理失败不影响响应
        }
      }
    }
  });
}
