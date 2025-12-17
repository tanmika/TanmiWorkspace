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

/**
 * 获取两个提交之间的提交列表
 * @returns 提交列表，每项包含 hash 和 message
 */
export async function getCommitsBetween(
  fromCommit: string,
  toCommit: string,
  cwd?: string
): Promise<Array<{ hash: string; message: string }>> {
  try {
    const { stdout } = await execGit(
      `log --oneline ${fromCommit}..${toCommit}`,
      cwd
    );
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [hash, ...messageParts] = line.split(" ");
        return { hash, message: messageParts.join(" ") };
      });
  } catch {
    return [];
  }
}

/**
 * 获取未提交修改的摘要
 */
export async function getUncommittedChangesSummary(
  cwd?: string
): Promise<{ files: number; insertions: number; deletions: number } | null> {
  try {
    const { stdout: statusOutput } = await execGit("status --porcelain", cwd);
    if (!statusOutput.trim()) {
      return null;
    }

    const files = statusOutput.trim().split("\n").length;

    // 尝试获取 diff 统计，但对于未跟踪文件可能不准确
    try {
      const { stdout: diffOutput } = await execGit("diff --stat HEAD", cwd);
      const match = diffOutput.match(/(\d+) insertions?.*?(\d+) deletions?/);
      if (match) {
        return {
          files,
          insertions: parseInt(match[1], 10),
          deletions: parseInt(match[2], 10),
        };
      }
    } catch {
      // 忽略 diff 错误
    }

    return { files, insertions: 0, deletions: 0 };
  } catch {
    return null;
  }
}

/**
 * Squash 合并派发分支到目标分支
 * @returns 新的 commit hash
 */
export async function squashMergeProcessBranch(
  workspaceId: string,
  targetBranch: string,
  commitMessage: string,
  cwd?: string
): Promise<string> {
  const processBranch = `${PROCESS_PREFIX}/${workspaceId}`;

  // 切换到目标分支
  await execGit(`checkout "${targetBranch}"`, cwd);

  // Squash 合并（不自动提交）
  await execGit(`merge --squash "${processBranch}"`, cwd);

  // 提交
  await execGit(`commit -m "${commitMessage}"`, cwd);

  return getCurrentCommit(cwd);
}

/**
 * Rebase 合并派发分支（保留独立提交，线性历史）
 */
export async function rebaseMergeProcessBranch(
  workspaceId: string,
  targetBranch: string,
  cwd?: string
): Promise<void> {
  const processBranch = `${PROCESS_PREFIX}/${workspaceId}`;

  // 切换到目标分支
  await execGit(`checkout "${targetBranch}"`, cwd);

  // Fast-forward 合并（如果可能）或 rebase
  try {
    await execGit(`merge --ff-only "${processBranch}"`, cwd);
  } catch {
    // 如果不能 fast-forward，使用 rebase
    await execGit(`rebase "${processBranch}"`, cwd);
  }
}

/**
 * Cherry-pick 派发分支的提交到工作区（不提交）
 * @param fromCommit - 起始提交（不包含）
 */
export async function cherryPickToWorkingTree(
  workspaceId: string,
  targetBranch: string,
  fromCommit: string,
  cwd?: string
): Promise<void> {
  const processBranch = `${PROCESS_PREFIX}/${workspaceId}`;

  // 切换到目标分支
  await execGit(`checkout "${targetBranch}"`, cwd);

  // 获取要 cherry-pick 的提交
  const commits = await getCommitsBetween(fromCommit, processBranch, cwd);

  if (commits.length === 0) {
    return;
  }

  // 从旧到新 cherry-pick（不提交）
  const commitHashes = commits.map((c) => c.hash).reverse();
  for (const hash of commitHashes) {
    try {
      await execGit(`cherry-pick --no-commit ${hash}`, cwd);
    } catch {
      // 如果有冲突，保持当前状态让用户处理
      break;
    }
  }
}

/**
 * 获取备份分支名（最新的一个）
 */
export async function getLatestBackupBranch(
  workspaceId: string,
  cwd?: string
): Promise<string | null> {
  const pattern = `${BACKUP_PREFIX}/${workspaceId}/*`;
  const branches = await listBranches(pattern, cwd);

  if (branches.length === 0) {
    return null;
  }

  // 按时间戳排序，返回最新的
  return branches.sort().reverse()[0];
}
