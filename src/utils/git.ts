// src/utils/git.ts

import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import { devLog } from "./devLog.js";

const execAsync = promisify(exec);

/**
 * 需要从 git 跟踪中排除的目录
 */
const EXCLUDED_DIRS = [".tanmi-workspace/", ".tanmi-workspace-dev/"];

/**
 * 执行 git 命令
 */
async function execGit(
  command: string,
  cwd?: string
): Promise<{ stdout: string; stderr: string }> {
  const options = cwd ? { cwd } : {};
  return execAsync(`git ${command}`, options);
}

/**
 * 检查当前目录是否是 git 仓库
 */
export async function isGitRepo(cwd?: string): Promise<boolean> {
  try {
    await execGit("rev-parse --is-inside-work-tree", cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * 确保 TanmiWorkspace 目录被 git 排除
 * 通过添加到 .git/info/exclude（不影响项目的 .gitignore）
 */
export async function ensureGitExclude(cwd?: string): Promise<void> {
  const workDir = cwd || process.cwd();

  try {
    // 获取 git 仓库根目录
    const { stdout } = await execGit("rev-parse --git-dir", workDir);
    const gitDir = path.resolve(workDir, stdout.trim());
    const excludePath = path.join(gitDir, "info", "exclude");

    // 读取现有内容
    let content = "";
    try {
      content = await fs.readFile(excludePath, "utf-8");
    } catch {
      // 文件不存在，使用空内容
    }

    // 检查并添加缺失的排除项
    const lines = content.split("\n");
    let modified = false;

    for (const dir of EXCLUDED_DIRS) {
      if (!lines.includes(dir)) {
        lines.push(dir);
        modified = true;
      }
    }

    // 只在有修改时写入
    if (modified) {
      await fs.writeFile(excludePath, lines.join("\n"), "utf-8");
    }
  } catch (error) {
    // 记录错误但不抛出（可能不是 git 仓库或权限问题）
    devLog.gitError("ensureGitExclude", error, { cwd: workDir });
  }
}
