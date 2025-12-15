/**
 * OpenSpec 格式解析器
 * 用于解析 OpenSpec change 目录结构，提取结构化摘要信息
 *
 * 设计原则：
 * - 只提供结构摘要，不返回完整内容
 * - AI 根据摘要自行决定读取哪些文件
 */

import * as fs from 'fs';
import * as path from 'path';

// ============ 类型定义 ============

export interface OpenSpecSummary {
  changeId: string;
  title: string;
  why: string;
  taskGroups: number;
  totalTasks: number;
  completedTasks: number;
  hasDesign: boolean;
  specFiles: string[];
}

export interface FileGuide {
  path: string;
  purpose: string;
  exists: boolean;
}

export interface ImportGuideResult {
  type: 'openspec';
  basePath: string;
  summary: OpenSpecSummary;
  files: FileGuide[];
  importCommand: string;
}

// ============ 解析函数 ============

/**
 * 解析 proposal.md 提取摘要信息
 */
function parseProposalSummary(filePath: string): { title: string; why: string } {
  if (!fs.existsSync(filePath)) {
    return { title: '', why: '' };
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // 提取标题 (# Change: xxx)
  const titleMatch = content.match(/^#\s*Change:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // 提取 Why 部分（只取第一段）
  const whyMatch = content.match(/##\s*Why\s*\n+([\s\S]*?)(?=\n##|$)/);
  let why = '';
  if (whyMatch) {
    // 只取第一行或前100字符
    const whyText = whyMatch[1].trim();
    const firstLine = whyText.split('\n')[0];
    why = firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;
  }

  return { title, why };
}

/**
 * 解析 tasks.md 提取任务统计
 */
function parseTasksSummary(filePath: string): { taskGroups: number; totalTasks: number; completedTasks: number } {
  if (!fs.existsSync(filePath)) {
    return { taskGroups: 0, totalTasks: 0, completedTasks: 0 };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let taskGroups = 0;
  let totalTasks = 0;
  let completedTasks = 0;

  for (const line of lines) {
    // 匹配主组 ## N. GroupName
    if (/^##\s+\d+\.\s+/.test(line)) {
      taskGroups++;
    }

    // 匹配任务项 - [x] 或 - [ ]
    const taskMatch = line.match(/^-\s+\[([ x])\]/);
    if (taskMatch) {
      totalTasks++;
      if (taskMatch[1] === 'x') {
        completedTasks++;
      }
    }
  }

  return { taskGroups, totalTasks, completedTasks };
}

/**
 * 收集 specs 目录下的文件列表
 */
function collectSpecFiles(specsDir: string): string[] {
  if (!fs.existsSync(specsDir)) {
    return [];
  }

  const specFiles: string[] = [];

  const collect = (dir: string, prefix = '') => {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const relativePath = prefix ? `${prefix}/${item}` : item;
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        collect(itemPath, relativePath);
      } else if (item.endsWith('.md')) {
        specFiles.push(relativePath);
      }
    }
  };

  collect(specsDir);
  return specFiles;
}

/**
 * 生成导入引导信息
 */
export function generateImportGuide(
  openspecPath: string,
  changeId: string,
  projectRoot: string
): ImportGuideResult {
  const changePath = path.join(openspecPath, 'changes', changeId);

  // 检查 change 目录是否存在
  if (!fs.existsSync(changePath)) {
    throw new Error(`Change 目录不存在: ${changePath}`);
  }

  // 解析 proposal.md
  const proposalPath = path.join(changePath, 'proposal.md');
  const { title, why } = parseProposalSummary(proposalPath);

  // 解析 tasks.md
  const tasksPath = path.join(changePath, 'tasks.md');
  const { taskGroups, totalTasks, completedTasks } = parseTasksSummary(tasksPath);

  // 检查 design.md
  const designPath = path.join(changePath, 'design.md');
  const hasDesign = fs.existsSync(designPath);

  // 收集 spec 文件
  const specsDir = path.join(changePath, 'specs');
  const specFiles = collectSpecFiles(specsDir);

  // 构建摘要
  const summary: OpenSpecSummary = {
    changeId,
    title: title || changeId,
    why,
    taskGroups,
    totalTasks,
    completedTasks,
    hasDesign,
    specFiles,
  };

  // 构建文件引导列表
  const files: FileGuide[] = [
    {
      path: path.join(changePath, 'proposal.md'),
      purpose: '了解目标、背景和变更范围',
      exists: fs.existsSync(proposalPath),
    },
    {
      path: path.join(changePath, 'tasks.md'),
      purpose: '了解任务列表和完成进度',
      exists: fs.existsSync(tasksPath),
    },
  ];

  if (hasDesign) {
    files.push({
      path: designPath,
      purpose: '了解技术设计方案',
      exists: true,
    });
  }

  // 添加 spec 文件引导
  for (const specFile of specFiles.slice(0, 3)) { // 最多显示3个
    files.push({
      path: path.join(specsDir, specFile),
      purpose: `规范文件: ${specFile}`,
      exists: true,
    });
  }

  // 构建导入命令（使用绝对路径，因为脚本在 tanmi-workspace 中）
  const scriptPath = path.resolve(import.meta.dirname, '../../plugin/scripts/openspec-import.cjs');
  const importCommand = `node "${scriptPath}" --path "${openspecPath}" --change "${changeId}" --project "${projectRoot}"`;

  return {
    type: 'openspec',
    basePath: changePath,
    summary,
    files,
    importCommand,
  };
}

/**
 * 列出 OpenSpec 目录中的所有 changes
 */
export function listChanges(openspecPath: string): Array<{ id: string; title: string; progress: string }> {
  const changesDir = path.join(openspecPath, 'changes');
  if (!fs.existsSync(changesDir)) {
    return [];
  }

  const items = fs.readdirSync(changesDir);
  const changes: Array<{ id: string; title: string; progress: string }> = [];

  for (const item of items) {
    const itemPath = path.join(changesDir, item);
    const stat = fs.statSync(itemPath);
    if (!stat.isDirectory()) continue;

    // 检查是否有 proposal.md
    const proposalPath = path.join(itemPath, 'proposal.md');
    if (!fs.existsSync(proposalPath)) continue;

    // 获取标题
    const { title } = parseProposalSummary(proposalPath);

    // 获取进度
    const tasksPath = path.join(itemPath, 'tasks.md');
    const { totalTasks, completedTasks } = parseTasksSummary(tasksPath);
    const progress = totalTasks > 0 ? `${completedTasks}/${totalTasks}` : 'N/A';

    changes.push({
      id: item,
      title: title || item,
      progress,
    });
  }

  return changes;
}
