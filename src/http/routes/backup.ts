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

// JSON Schema 定义
const backupNameParamsSchema = {
  params: {
    type: "object",
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
    },
  },
};

const createBackupSchema = {
  body: {
    type: "object",
    properties: {
      trigger: { type: "string", enum: ["manual", "pre_update", "pre_restore"] },
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
    async (request: FastifyRequest<{ Params: BackupNameParams }>) => {
      const { name } = request.params;
      const backupDir = path.join(
        services.fs.getGlobalBasePath(),
        "backups"
      );
      const backupPath = path.join(backupDir, name);

      // 恢复会自动创建 pre_restore 备份
      await services.backup.restoreGlobalBackup(backupPath);

      // 查找刚创建的 pre_restore 备份
      const backups = await services.backup.listGlobalBackups();
      const preRestoreBackup = backups.find(
        (b) => b.trigger === "pre_restore"
      );

      return {
        success: true,
        preRestoreBackup: preRestoreBackup?.name || null,
      };
    }
  );

  /**
   * DELETE /api/backup/global/:name - 删除全局备份
   */
  fastify.delete<{ Params: BackupNameParams }>(
    "/backup/global/:name",
    { schema: backupNameParamsSchema },
    async (request: FastifyRequest<{ Params: BackupNameParams }>) => {
      const { name } = request.params;
      await services.backup.deleteGlobalBackup(name);
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
      const { name } = request.params;
      const backupDir = path.join(
        services.fs.getGlobalBasePath(),
        "backups"
      );
      const backupPath = path.join(backupDir, name);

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
        `attachment; filename="${encodeURIComponent(name)}"`
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

    // 验证文件扩展名
    const filename = data.filename;
    if (!filename.endsWith(".twbak")) {
      return reply
        .status(400)
        .send({ error: "无效的文件格式，必须为 .twbak 文件" });
    }

    // 保存文件到 backups 目录
    const backupDir = path.join(services.fs.getGlobalBasePath(), "backups");
    await services.fs.ensureDir(backupDir);

    const backupPath = path.join(backupDir, filename);

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
          name: filename,
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
