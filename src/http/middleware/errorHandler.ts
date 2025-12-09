// src/http/middleware/errorHandler.ts
// 统一错误处理中间件

import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { TanmiError, ErrorCode } from "../../types/errors.js";
import { getServices } from "../services.js";

/**
 * 错误码到 HTTP 状态码的映射
 */
const ERROR_STATUS_MAP: Partial<Record<ErrorCode, number>> = {
  // 404 Not Found
  WORKSPACE_NOT_FOUND: 404,
  NODE_NOT_FOUND: 404,
  PARENT_NOT_FOUND: 404,
  REFERENCE_NOT_FOUND: 404,

  // 409 Conflict
  WORKSPACE_EXISTS: 409,
  WORKSPACE_ACTIVE: 409,
  REFERENCE_EXISTS: 409,

  // 400 Bad Request
  INVALID_NAME: 400,
  INVALID_TITLE: 400,
  INVALID_TRANSITION: 400,
  CONCLUSION_REQUIRED: 400,
  SPLIT_REQUIRES_IMPLEMENTING: 400,

  // 500 Internal Server Error
  INIT_FAILED: 500,
  LOG_APPEND_FAILED: 500,
  GRAPH_CORRUPTED: 500,
  NODE_DIR_MISSING: 500,
  NODE_INFO_MISSING: 500,
};

/**
 * 错误响应接口
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    availableWorkspaces?: unknown[];
  };
}

/**
 * Fastify 错误处理器
 */
export async function errorHandler(
  error: FastifyError | Error,
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // TanmiError 业务错误
  if (error instanceof TanmiError) {
    const status = ERROR_STATUS_MAP[error.code] || 400;
    const errorResponse: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
      },
    };

    // 对于 WORKSPACE_NOT_FOUND 错误，附加活跃工作区列表以帮助恢复
    if (error.code === "WORKSPACE_NOT_FOUND") {
      try {
        const services = getServices();
        const listResult = await services.workspace.list({ status: "active" });
        errorResponse.error.availableWorkspaces = listResult.workspaces;
      } catch {
        // 获取列表失败时忽略，不影响错误响应
      }
    }

    reply.status(status).send(errorResponse);
    return;
  }

  // Fastify 验证错误
  if ("validation" in error && error.validation) {
    reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: error.message,
      },
    } as ErrorResponse);
    return;
  }

  // 未知错误
  console.error("Unhandled error:", error);
  reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: error.message || "内部服务器错误",
    },
  } as ErrorResponse);
}
