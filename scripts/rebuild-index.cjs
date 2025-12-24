#!/usr/bin/env node

/**
 * TanmiWorkspace - 索引重建脚本
 * 扫描指定项目目录，从 .tanmi-workspace 中的 config.json 重建 index.json
 *
 * 用法:
 *   node rebuild-index.cjs [--dev] <projectRoot1> [projectRoot2] ...
 *   node rebuild-index.cjs [--dev] --scan ~/Projects
 *
 * 示例:
 *   node rebuild-index.cjs /Users/me/project1 /Users/me/project2
 *   node rebuild-index.cjs --dev /Users/me/project1
 *   node rebuild-index.cjs --scan ~/WebProject ~/PixCake
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 解析参数
const args = process.argv.slice(2);
let isDev = false;
let scanMode = false;
const projectRoots = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--dev') {
    isDev = true;
  } else if (arg === '--scan') {
    scanMode = true;
  } else if (arg === '--help' || arg === '-h') {
    console.log(`
TanmiWorkspace 索引重建脚本

用法:
  node rebuild-index.cjs [选项] <projectRoot1> [projectRoot2] ...

选项:
  --dev     重建开发环境索引 (.tanmi-workspace-dev)
  --scan    扫描模式：递归搜索目录下所有包含 .tanmi-workspace 的项目
  --help    显示帮助

示例:
  # 指定项目目录
  node rebuild-index.cjs /Users/me/project1 /Users/me/project2

  # 开发环境
  node rebuild-index.cjs --dev /Users/me/project1

  # 扫描父目录下的所有项目
  node rebuild-index.cjs --scan ~/WebProject ~/PixCake
`);
    process.exit(0);
  } else {
    // 展开 ~ 为 home 目录
    const resolved = arg.startsWith('~')
      ? path.join(os.homedir(), arg.slice(1))
      : path.resolve(arg);
    projectRoots.push(resolved);
  }
}

if (projectRoots.length === 0) {
  console.error('错误: 请指定至少一个项目目录');
  console.error('使用 --help 查看帮助');
  process.exit(1);
}

// 配置
const folderName = isDev ? '.tanmi-workspace-dev' : '.tanmi-workspace';
const globalDir = path.join(os.homedir(), folderName);
const indexPath = path.join(globalDir, 'index.json');

// 系统目录（不是工作区）
const SYSTEM_DIRS = ['scripts', 'logs', 'tutorial', 'node_modules'];

/**
 * 扫描目录查找包含 .tanmi-workspace 的项目
 */
function findProjectsWithWorkspaces(searchDir, maxDepth = 3) {
  const projects = [];

  function scan(dir, depth) {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') && entry.name !== folderName) continue;

        const fullPath = path.join(dir, entry.name);

        // 找到 .tanmi-workspace 目录
        if (entry.name === folderName) {
          // 父目录是项目根目录
          projects.push(dir);
          return; // 不再深入
        }

        // 继续递归
        scan(fullPath, depth + 1);
      }
    } catch (err) {
      // 忽略权限错误
    }
  }

  scan(searchDir, 0);
  return projects;
}

/**
 * 从项目目录读取工作区信息
 */
function readWorkspacesFromProject(projectRoot) {
  const wsDir = path.join(projectRoot, folderName);
  const workspaces = [];

  if (!fs.existsSync(wsDir)) {
    return workspaces;
  }

  try {
    const entries = fs.readdirSync(wsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SYSTEM_DIRS.includes(entry.name)) continue;

      // 尝试 workspace.json（新版）或 config.json（兼容旧版）
      let configPath = path.join(wsDir, entry.name, 'workspace.json');
      if (!fs.existsSync(configPath)) {
        configPath = path.join(wsDir, entry.name, 'config.json');
      }

      if (!fs.existsSync(configPath)) {
        console.warn(`  跳过 ${entry.name}: 无 workspace.json`);
        continue;
      }

      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);

        // 构建索引条目
        const wsEntry = {
          id: config.id,
          name: config.name,
          projectRoot: projectRoot,
          status: config.status || 'active',
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
          dirName: config.dirName || entry.name
        };

        workspaces.push(wsEntry);
        console.log(`  ✓ ${config.name} (${config.id})`);
      } catch (err) {
        console.warn(`  跳过 ${entry.name}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`读取 ${wsDir} 失败: ${err.message}`);
  }

  return workspaces;
}

/**
 * 主函数
 */
function main() {
  console.log(`\n重建 ${isDev ? '开发' : '生产'}环境索引`);
  console.log(`索引路径: ${indexPath}\n`);

  // 确定要扫描的项目列表
  let allProjects = [];

  if (scanMode) {
    console.log('扫描模式: 搜索包含工作区的项目...\n');
    for (const searchDir of projectRoots) {
      console.log(`扫描 ${searchDir}...`);
      const found = findProjectsWithWorkspaces(searchDir);
      console.log(`  找到 ${found.length} 个项目`);
      allProjects.push(...found);
    }
    console.log('');
  } else {
    allProjects = projectRoots;
  }

  // 收集所有工作区
  const allWorkspaces = [];
  const seenIds = new Set();

  for (const projectRoot of allProjects) {
    console.log(`项目: ${projectRoot}`);

    if (!fs.existsSync(projectRoot)) {
      console.warn(`  目录不存在，跳过`);
      continue;
    }

    const workspaces = readWorkspacesFromProject(projectRoot);

    for (const ws of workspaces) {
      if (seenIds.has(ws.id)) {
        console.warn(`  重复 ID ${ws.id}，跳过`);
        continue;
      }
      seenIds.add(ws.id);
      allWorkspaces.push(ws);
    }

    console.log('');
  }

  // 按更新时间排序
  allWorkspaces.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  // 备份现有索引
  if (fs.existsSync(indexPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = indexPath.replace('.json', `.backup.${timestamp}.json`);
    fs.copyFileSync(indexPath, backupPath);
    console.log(`已备份原索引到: ${backupPath}`);
  }

  // 写入新索引
  const newIndex = {
    version: '5.0',
    workspaces: allWorkspaces
  };

  // 确保目录存在
  if (!fs.existsSync(globalDir)) {
    fs.mkdirSync(globalDir, { recursive: true });
  }

  fs.writeFileSync(indexPath, JSON.stringify(newIndex, null, 2), 'utf-8');

  console.log(`\n✅ 索引重建完成`);
  console.log(`   共恢复 ${allWorkspaces.length} 个工作区`);
  console.log(`   索引已写入: ${indexPath}`);
}

main();
