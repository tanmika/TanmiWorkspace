// src/cli/update.ts
// 自更新命令 - 更新 tanmi-workspace 到最新版本

import { spawn } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

function getVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const require = createRequire(import.meta.url);
    const pkg = require(join(__dirname, "..", "..", "package.json"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function checkLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("npm", ["view", "tanmi-workspace", "version"], {
      shell: true,
      stdio: ["ignore", "pipe", "ignore"],
    });

    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        resolve(null);
      }
    });

    child.on("error", () => resolve(null));
  });
}

export default async function update() {
  const currentVersion = getVersion();
  console.log(`当前版本: v${currentVersion}`);
  console.log("正在检查最新版本...");

  const latestVersion = await checkLatestVersion();

  if (!latestVersion) {
    console.error("\n无法获取最新版本信息，请检查网络连接");
    process.exit(1);
  }

  if (latestVersion === currentVersion) {
    console.log(`\n已是最新版本 v${currentVersion}`);
    return;
  }

  console.log(`最新版本: v${latestVersion}`);
  console.log("\n正在更新...\n");

  const child = spawn("npm", ["install", "-g", "tanmi-workspace@latest"], {
    shell: true,
    stdio: "inherit",
  });

  child.on("close", (code) => {
    if (code === 0) {
      console.log(`\n更新成功! v${currentVersion} -> v${latestVersion}`);
      console.log("请重新启动 WebUI 服务以应用更新: tanmi-workspace webui");
    } else {
      console.error("\n更新失败，请尝试手动更新:");
      console.error("  npm install -g tanmi-workspace");
    }
    process.exit(code || 0);
  });

  child.on("error", (err) => {
    console.error("\n更新失败:", err.message);
    console.error("请尝试手动更新:");
    console.error("  npm install -g tanmi-workspace");
    process.exit(1);
  });
}
