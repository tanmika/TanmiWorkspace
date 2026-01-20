// src/types/tool.ts

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * 扩展的工具类型
 * 添加 readonly 属性用于标识工具是读操作还是写操作
 */
export interface TanmiTool extends Tool {
  /**
   * 是否为只读工具
   * - true: 只读操作，未绑定会话时可执行
   * - false/undefined: 写操作，未绑定会话时默认拒绝
   */
  readonly?: boolean;
}
