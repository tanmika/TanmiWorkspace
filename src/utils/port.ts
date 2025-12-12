// src/utils/port.ts
// 端口检测工具

import * as net from "node:net";

/**
 * 检测端口是否被占用
 * @param port 端口号
 * @param host 主机地址，默认 127.0.0.1
 */
export function isPortInUse(port: number, host: string = "127.0.0.1"): Promise<boolean> {
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

    // 使用指定的 host 检测端口占用
    server.listen(port, host);
  });
}
