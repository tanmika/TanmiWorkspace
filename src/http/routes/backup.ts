// src/http/routes/backup.ts
// 备份管理 API 路由

import * as path from "node:path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getServices } from "../services.js";
import type { GlobalBackupTrigger } from "../../types/health.js";

// 请求类型定义
interface BackupNameParams {
  name: string;
}

interface CreateBackupBody {
  trigger?: GlobalBackupTrigger;
}

/**
 * 验证备份文件名安全性（防止路径遍历）
 * @returns 清理后的安全文件名，或 null 表示非法
 */
function sanitizeBackupName(name: string): string | null {
  // 只允许 .twbak 后缀
  if (!name.endsWith(".twbak")) return null;
  // 提取基础文件名（去除路径）
  const baseName = path.basename(name);
  // 检查是否包含路径遍历字符
  if (baseName !== name || name.includes("..") || name.includes("/") || name.includes("\\")) {
    return null;
  }
  return baseName;
}

// JSON Schema 定义
const backupNameParamsSchema = {
  params: {
    type: "object",
    required: ["name"],
    properties: {
      // 白名单：只允许字母、数字、点、短横线、下划线
      name: { type: "string", minLength: 1, maxLength: 200, pattern: "^[a-zA-Z0-9._-]+\\.twbak$" },
    },
  },
};

const createBackupSchema = {
  body: {
    type: "object",
    properties: {
      trigger: { type: "string", enum: ["manual", "beta_update", "pre_restore"] },
    },
    additionalProperties: false,
  },
};

export async function backupRoutes(fastify: FastifyInstance): Promise<void> {
  const services = getServices();

  /**
   * GET /api/backup/global - 列出全局备份
   */
  fastify.get("/backup/global", async () => {
    const backups = await services.backup.listGlobalBackups();
    return { backups };
  });

  /**
   * POST /api/backup/global - 创建全局备份
   */
  fastify.post<{ Body: CreateBackupBody }>(
    "/backup/global",
    { schema: createBackupSchema },
    async (request: FastifyRequest<{ Body: CreateBackupBody }>) => {
      const trigger = request.body?.trigger || "manual";
      const backup = await services.backup.createGlobalBackup(trigger);
      return { backup };
    }
  );

  /**
   * POST /api/backup/global/:name/restore - 恢复全局备份
   */
  fastify.post<{ Params: BackupNameParams }>(
    "/backup/global/:name/restore",
    { schema: backupNameParamsSchema },
    async (request: FastifyRequest<{ Params: BackupNameParams }>, reply: FastifyReply) => {
      const safeName = sanitizeBackupName(request.params.name);
      if (!safeName) {
        return reply.status(400).send({ error: "无效的备份文件名" });
      }
      const backupDir = path.join(
        services.fs.getGlobalBasePath(),
        "backups"
      );
      const backupPath = path.join(backupDir, safeName);

      // 恢复会自动创建 pre_restore 备份并返回
      const preRestoreBackup = await services.backup.restoreGlobalBackup(backupPath);

      return {
        success: true,
        preRestoreBackup: preRestoreBackup.name,
      };
    }
  );

  /**
   * DELETE /api/backup/global/:name - 删除全局备份
   */
  fastify.delete<{ Params: BackupNameParams }>(
    "/backup/global/:name",
    { schema: backupNameParamsSchema },
    async (request: FastifyRequest<{ Params: BackupNameParams }>, reply: FastifyReply) => {
      const safeName = sanitizeBackupName(request.params.name);
      if (!safeName) {
        return reply.status(400).send({ error: "无效的备份文件名" });
      }
      await services.backup.deleteGlobalBackup(safeName);
      return { success: true };
    }
  );

  /**
   * GET /api/backup/global/:name/download - 下载备份文件
   */
  fastify.get<{ Params: BackupNameParams }>(
    "/backup/global/:name/download",
    { schema: backupNameParamsSchema },
    async (
      request: FastifyRequest<{ Params: BackupNameParams }>,
      reply: FastifyReply
    ) => {
      const safeName = sanitizeBackupName(request.params.name);
      if (!safeName) {
        return reply.status(400).send({ error: "无效的备份文件名" });
      }
      const backupDir = path.join(
        services.fs.getGlobalBasePath(),
        "backups"
      );
      const backupPath = path.join(backupDir, safeName);

      // 检查文件是否存在
      if (!(await services.fs.exists(backupPath))) {
        return reply.status(404).send({ error: "备份文件不存在" });
      }

      // 读取文件并发送
      const { createReadStream } = await import("node:fs");
      const stream = createReadStream(backupPath);

      reply.header("Content-Type", "application/octet-stream");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(safeName)}"`
      );

      return reply.send(stream);
    }
  );

  /**
   * POST /api/backup/global/import - 导入备份文件
   */
  fastify.post("/backup/global/import", async (request, reply) => {
    // 获取上传的文件
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: "未上传文件" });
    }

    // 验证并清理文件名（防止路径遍历）
    const safeFilename = sanitizeBackupName(data.filename);
    if (!safeFilename) {
      return reply
        .status(400)
        .send({ error: "无效的文件格式，必须为 .twbak 文件" });
    }

    // 保存文件到 backups 目录
    const backupDir = path.join(services.fs.getGlobalBasePath(), "backups");
    await services.fs.ensureDir(backupDir);

    const backupPath = path.join(backupDir, safeFilename);

    // 检查文件是否已存在
    if (await services.fs.exists(backupPath)) {
      return reply.status(409).send({ error: "同名备份文件已存在" });
    }

    // 将文件流写入磁盘
    const { createWriteStream } = await import("node:fs");
    const { pipeline } = await import("node:stream/promises");

    await pipeline(data.file, createWriteStream(backupPath));

    // 验证文件是否为有效的 .twbak 格式（读取 manifest）
    try {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(backupPath);
      const manifestEntry = zip.getEntry("manifest.json");

      if (!manifestEntry) {
        // 删除无效文件
        await services.fs.remove(backupPath);
        return reply
          .status(400)
          .send({ error: "无效的 .twbak 格式：缺少 manifest.json" });
      }

      const manifestContent = manifestEntry.getData().toString("utf-8");
      const manifest = JSON.parse(manifestContent);

      // 获取文件大小
      const { stat } = await import("node:fs/promises");
      const stats = await stat(backupPath);

      return {
        backup: {
          name: safeFilename,
          path: backupPath,
          createdAt: manifest.createdAt,
          codeVersion: manifest.codeVersion,
          trigger: manifest.trigger,
          size: stats.size,
        },
      };
    } catch (err) {
      // 删除无效文件
      await services.fs.remove(backupPath);
      return reply.status(400).send({
        error: `无效的 .twbak 格式：${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });
}
