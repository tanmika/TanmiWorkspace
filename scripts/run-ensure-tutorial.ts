/**
 * 独立运行 ensureTutorial 的脚本
 * 必须作为单独进程运行，以确保读取最新的 package.json 版本
 */

import { createServices } from "../dist/http/services.js";

async function main() {
  const services = createServices();
  await services.tutorial.ensureTutorial();
  console.log("  ✓ ensureTutorial 执行完成");
}

main().catch(console.error);
