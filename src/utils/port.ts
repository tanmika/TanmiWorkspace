// src/utils/port.ts
// 端口检测工具

import * as net from "node:net";

/**
 * 检测端口是否被占用
 */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(false);
    });

    // 使用 127.0.0.1 检测本地端口占用（安全）
    server.listen(port, "127.0.0.1");
  });
}
