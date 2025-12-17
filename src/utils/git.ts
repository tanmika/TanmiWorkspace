// src/utils/git.ts

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * 分支命名常量
 */
const BRANCH_PREFIX = "tanmi_workspace";
const BACKUP_PREFIX = `${BRANCH_PREFIX}/backup`;
const PROCESS_PREFIX = `${BRANCH_PREFIX}/process`;

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
 * 获取当前分支名
 */
export async function getCurrentBranch(cwd?: string): Promise<string> {
  const { stdout } = await execGit("rev-parse --abbrev-ref HEAD", cwd);
  return stdout.trim();
}

/**
 * 检查是否有未提交的修改（包括未跟踪文件）
 */
export async function hasUncommittedChanges(cwd?: string): Promise<boolean> {
  const { stdout } = await execGit("status --porcelain", cwd);
  return stdout.trim().length > 0;
}

/**
 * 检查是否有已暂存但未提交的修改
 */
export async function hasStagedChanges(cwd?: string): Promise<boolean> {
  const { stdout } = await execGit("diff --cached --name-only", cwd);
  return stdout.trim().length > 0;
}

/**
 * 列出匹配模式的分支
 * @param pattern - 分支名模式，如 "tanmi_workspace/process/*"
 */
export async function listBranches(
  pattern: string,
  cwd?: string
): Promise<string[]> {
  try {
    const { stdout } = await execGit(`branch --list "${pattern}"`, cwd);
    return stdout
      .split("\n")
      .map((line) => line.trim().replace(/^\*\s*/, ""))
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

/**
 * 创建备份分支（用于保存未提交内容）
 * 分支名格式: tanmi_workspace/backup/{workspaceId}/{timestamp}
 * @returns 备份分支名
 */
export async function createBackupBranch(
  workspaceId: string,
  cwd?: string
): Promise<string> {
  const timestamp = Date.now();
  const branchName = `${BACKUP_PREFIX}/${workspaceId}/${timestamp}`;

  // 创建并切换到备份分支
  await execGit(`checkout -b "${branchName}"`, cwd);

  // 添加所有文件并提交
  await execGit("add -A", cwd);
  await execGit(
    `commit -m "tanmi: 派发前自动备份 - ${workspaceId}" --allow-empty`,
    cwd
  );

  return branchName;
}

/**
 * 创建并切换到派发分支
 * 分支名格式: tanmi_workspace/process/{workspaceId}
 */
export async function createProcessBranch(
  workspaceId: string,
  cwd?: string
): Promise<string> {
  const branchName = `${PROCESS_PREFIX}/${workspaceId}`;
  await execGit(`checkout -b "${branchName}"`, cwd);
  return branchName;
}

/**
 * 切换到派发分支
 */
export async function checkoutProcessBranch(
  workspaceId: string,
  cwd?: string
): Promise<void> {
  const branchName = `${PROCESS_PREFIX}/${workspaceId}`;
  await execGit(`checkout "${branchName}"`, cwd);
}

/**
 * 切换到指定分支
 */
export async function checkoutBranch(
  branchName: string,
  cwd?: string
): Promise<void> {
  await execGit(`checkout "${branchName}"`, cwd);
}

/**
 * 获取当前 commit hash
 */
export async function getCurrentCommit(cwd?: string): Promise<string> {
  const { stdout } = await execGit("rev-parse HEAD", cwd);
  return stdout.trim();
}

/**
 * 提交派发修改
 * @returns commit hash
 */
export async function commitDispatch(
  nodeId: string,
  title: string,
  cwd?: string
): Promise<string> {
  await execGit("add -A", cwd);

  // 检查是否有内容需要提交
  const hasChanges = await hasStagedChanges(cwd);
  if (!hasChanges) {
    // 没有修改，返回当前 commit
    return getCurrentCommit(cwd);
  }

  const message = `tanmi: ${nodeId} - ${title}`;
  await execGit(`commit -m "${message}"`, cwd);
  return getCurrentCommit(cwd);
}

/**
 * 回滚到指定 commit
 */
export async function resetToCommit(
  commitHash: string,
  cwd?: string
): Promise<void> {
  await execGit(`reset --hard "${commitHash}"`, cwd);
}

/**
 * 合并派发分支到目标分支（使用 --no-ff）
 */
export async function mergeProcessBranch(
  workspaceId: string,
  targetBranch: string,
  cwd?: string
): Promise<void> {
  const processBranch = `${PROCESS_PREFIX}/${workspaceId}`;

  // 切换到目标分支
  await execGit(`checkout "${targetBranch}"`, cwd);

  // 合并派发分支
  await execGit(
    `merge --no-ff "${processBranch}" -m "tanmi: 完成工作区 ${workspaceId} 任务"`,
    cwd
  );
}

/**
 * 删除派发分支
 */
export async function deleteProcessBranch(
  workspaceId: string,
  cwd?: string
): Promise<void> {
  const branchName = `${PROCESS_PREFIX}/${workspaceId}`;
  try {
    await execGit(`branch -D "${branchName}"`, cwd);
  } catch {
    // 分支不存在，忽略错误
  }
}

/**
 * 删除备份分支
 * @param timestamp - 可选，指定时间戳删除特定备份；不指定则删除该工作区所有备份
 */
export async function deleteBackupBranch(
  workspaceId: string,
  timestamp?: string,
  cwd?: string
): Promise<void> {
  if (timestamp) {
    const branchName = `${BACKUP_PREFIX}/${workspaceId}/${timestamp}`;
    try {
      await execGit(`branch -D "${branchName}"`, cwd);
    } catch {
      // 分支不存在，忽略错误
    }
  } else {
    // 删除该工作区所有备份分支
    const pattern = `${BACKUP_PREFIX}/${workspaceId}/*`;
    const branches = await listBranches(pattern, cwd);
    for (const branch of branches) {
      try {
        await execGit(`branch -D "${branch}"`, cwd);
      } catch {
        // 忽略错误
      }
    }
  }
}

/**
 * 删除工作区相关的所有分支（备份 + 派发）
 */
export async function deleteAllWorkspaceBranches(
  workspaceId: string,
  cwd?: string
): Promise<void> {
  await deleteProcessBranch(workspaceId, cwd);
  await deleteBackupBranch(workspaceId, undefined, cwd);
}

/**
 * 检查是否有派发分支存在（用于并发检查）
 * @returns 如果存在派发分支，返回工作区 ID；否则返回 null
 */
export async function getActiveDispatchWorkspace(
  cwd?: string
): Promise<string | null> {
  const pattern = `${PROCESS_PREFIX}/*`;
  const branches = await listBranches(pattern, cwd);

  if (branches.length === 0) {
    return null;
  }

  // 从分支名提取工作区 ID
  const match = branches[0].match(/tanmi_workspace\/process\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * 获取派发分支名
 */
export function getProcessBranchName(workspaceId: string): string {
  return `${PROCESS_PREFIX}/${workspaceId}`;
}

/**
 * 检查当前是否在派发分支上
 */
export async function isOnProcessBranch(
  workspaceId: string,
  cwd?: string
): Promise<boolean> {
  const currentBranch = await getCurrentBranch(cwd);
  return currentBranch === `${PROCESS_PREFIX}/${workspaceId}`;
}
