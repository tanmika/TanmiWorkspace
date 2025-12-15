#!/usr/bin/env node

/**
 * OpenSpec 导入脚本
 * 将 OpenSpec change 目录批量转换为 TanmiWorkspace 工作区
 *
 * 职责：只负责批量创建，不负责分析（分析由 AI 完成）
 *
 * 用法：
 *   node openspec-import.cjs --path <openspec-dir> --change <change-id> --project <project-root>
 */

const fs = require('node:fs');
const path = require('node:path');
const { IS_DEV, DIR_SUFFIX, INDEX_PATH } = require('./shared/config.cjs');

// ========== OpenSpec 解析 ==========

/**
 * 解析 proposal.md 文件
 */
function parseProposal(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  const titleMatch = content.match(/^#\s*Change:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : '';

  const whyMatch = content.match(/##\s*Why\s*\n+([\s\S]*?)(?=\n##|$)/);
  const why = whyMatch ? whyMatch[1].trim() : '';

  const whatMatch = content.match(/##\s*What Changes\s*\n+([\s\S]*?)(?=\n##|$)/);
  const whatChanges = [];
  if (whatMatch) {
    const lines = whatMatch[1].split('\n');
    for (const line of lines) {
      const itemMatch = line.match(/^-\s+(.+)$/);
      if (itemMatch) {
        whatChanges.push(itemMatch[1].trim());
      }
    }
  }

  const impactMatch = content.match(/##\s*Impact\s*\n+([\s\S]*?)(?=\n##|$)/);
  const impact = { specs: [], code: [] };
  if (impactMatch) {
    const impactText = impactMatch[1];
    const specsMatch = impactText.match(/Affected specs?:\s*(.+)/i);
    if (specsMatch) {
      impact.specs = specsMatch[1].split(',').map(s => s.trim());
    }
    const codeMatch = impactText.match(/Affected code:\s*(.+)/i);
    if (codeMatch) {
      impact.code = codeMatch[1].split(',').map(s => s.trim());
    }
  }

  return { title, why, whatChanges, impact, raw: content };
}

/**
 * 解析 tasks.md 文件
 */
function parseTasks(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const groups = [];
  const lines = content.split('\n');

  let currentGroup = null;
  let currentSubGroup = null;

  for (const line of lines) {
    const groupMatch = line.match(/^##\s+(\d+)\.\s+(.+)$/);
    if (groupMatch) {
      if (currentSubGroup && currentSubGroup.tasks.length > 0 && currentGroup) {
        currentGroup.tasks.push(...currentSubGroup.tasks);
      }
      currentSubGroup = null;

      if (currentGroup && currentGroup.tasks.length > 0) {
        groups.push(currentGroup);
      }

      currentGroup = {
        groupId: groupMatch[1],
        groupName: groupMatch[2].trim(),
        tasks: []
      };
      continue;
    }

    const subGroupMatch = line.match(/^###\s+([\d.]+)\s+(.+)$/);
    if (subGroupMatch && currentGroup) {
      if (currentSubGroup && currentSubGroup.tasks.length > 0) {
        currentGroup.tasks.push(...currentSubGroup.tasks);
      }
      currentSubGroup = {
        groupId: subGroupMatch[1],
        groupName: subGroupMatch[2].trim(),
        tasks: []
      };
      continue;
    }

    const taskMatch = line.match(/^-\s+\[([ x])\]\s+([\d.]+)\s+(.+)$/);
    if (taskMatch) {
      const task = {
        id: taskMatch[2],
        text: taskMatch[3].trim(),
        completed: taskMatch[1] === 'x'
      };
      if (currentSubGroup) {
        currentSubGroup.tasks.push(task);
      } else if (currentGroup) {
        currentGroup.tasks.push(task);
      }
    }
  }

  if (currentSubGroup && currentSubGroup.tasks.length > 0 && currentGroup) {
    currentGroup.tasks.push(...currentSubGroup.tasks);
  }
  if (currentGroup && currentGroup.tasks.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * 解析完整的 change 目录
 */
function parseChange(changePath) {
  const changeId = path.basename(changePath);

  const proposalPath = path.join(changePath, 'proposal.md');
  if (!fs.existsSync(proposalPath)) {
    throw new Error(`proposal.md not found in ${changePath}`);
  }
  const proposal = parseProposal(proposalPath);

  const tasksPath = path.join(changePath, 'tasks.md');
  let taskGroups = [];
  if (fs.existsSync(tasksPath)) {
    taskGroups = parseTasks(tasksPath);
  }

  const designPath = path.join(changePath, 'design.md');
  const hasDesign = fs.existsSync(designPath);
  const designContent = hasDesign ? fs.readFileSync(designPath, 'utf-8') : undefined;

  const specsDir = path.join(changePath, 'specs');
  const specFiles = [];
  const specContents = {};

  if (fs.existsSync(specsDir)) {
    const collectSpecs = (dir, prefix = '') => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const relativePath = prefix ? `${prefix}/${item}` : item;
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          collectSpecs(itemPath, relativePath);
        } else if (item.endsWith('.md')) {
          specFiles.push(relativePath);
          specContents[relativePath] = fs.readFileSync(itemPath, 'utf-8');
        }
      }
    };
    collectSpecs(specsDir);
  }

  return {
    changeId,
    proposal,
    taskGroups,
    hasDesign,
    designContent,
    specFiles,
    specContents
  };
}

// ========== ID 生成 ==========

function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

// ========== 工作区生成 ==========

/**
 * 生成工作区 Markdown
 */
function generateWorkspaceMd(name, goal, rules, docs, createdAt) {
  const rulesContent = rules.length > 0
    ? rules.map(rule => `- ${rule}`).join('\n')
    : '';

  const docsContent = docs.length > 0
    ? docs.map(doc => `- [${doc.description}](${doc.path})`).join('\n')
    : '';

  return `---
name: ${name}
createdAt: ${createdAt}
updatedAt: ${createdAt}
---

## 规则

> 只读，上下文必须遵循的约束

${rulesContent}

## 文档

> 读写，全局参考文档

${docsContent}

## 目标

${goal}
`;
}

/**
 * 生成节点 Info.md
 */
function generateNodeInfoMd(node) {
  const typeLabel = node.type === 'planning' ? '规划' : '执行';
  const docsContent = node.docs.length > 0
    ? node.docs.map(doc => `- [${doc.description}](${doc.path})`).join('\n')
    : '';

  return `---
id: ${node.id}
type: ${node.type}
title: ${node.title}
status: ${node.status}
createdAt: ${node.createdAt}
updatedAt: ${node.createdAt}
---

## 节点类型

${typeLabel}节点

## 需求

${node.requirement}

## 文档引用

> 格式：- [文件名](路径) - 说明 (状态)

${docsContent}

## 备注



## 结论

> 节点完成时填写

${node.conclusion || ''}
`;
}

/**
 * 生成节点 Log.md
 */
function generateNodeLogMd(initialLog) {
  let content = `## 日志

| 时间 | 操作者 | 事件 |
|------|--------|------|
`;
  if (initialLog) {
    content += `| ${initialLog.time} | ${initialLog.operator} | ${initialLog.event} |\n`;
  }
  return content;
}

/**
 * 生成节点 Problem.md
 */
function generateNodeProblemMd() {
  return `## 当前问题

（暂无）

## 下一步

（暂无）
`;
}

/**
 * 转换为工作区结构
 */
function convertToWorkspace(change, projectRoot) {
  const now = new Date();
  const createdAt = now.toISOString();
  const workspaceId = generateId('ws');
  const workspaceName = change.proposal.title || change.changeId;
  const goal = change.proposal.why || change.proposal.title;

  // 生成规则
  const rules = [];
  if (change.proposal.whatChanges.length > 0) {
    rules.push(`变更范围: ${change.proposal.whatChanges.slice(0, 3).join(', ')}${change.proposal.whatChanges.length > 3 ? '...' : ''}`);
  }
  if (change.proposal.impact.specs.length > 0) {
    rules.push(`影响规范: ${change.proposal.impact.specs.join(', ')}`);
  }

  // 收集文档
  const docs = [];
  if (change.hasDesign) {
    docs.push({ path: 'docs/design.md', description: '技术设计文档' });
  }
  for (const specFile of change.specFiles.slice(0, 5)) {
    docs.push({ path: `docs/specs/${specFile}`, description: `规范: ${specFile}` });
  }

  // 生成节点树
  const nodeTree = generateNodeTree(change, createdAt);

  return {
    workspaceId,
    workspaceName,
    goal,
    rules,
    docs,
    createdAt,
    nodeTree,
    docContents: {
      design: change.designContent,
      specs: change.specContents
    }
  };
}

/**
 * 生成节点树 (graph.json v3.0 格式)
 */
function generateNodeTree(change, createdAt) {
  const nodes = {};
  const nodesList = [];

  // 创建根节点
  const rootId = generateId('node');
  nodes[rootId] = {
    id: rootId,
    type: 'planning',
    parentId: null,
    children: [],
    status: 'implementing',
    isolate: false,
    references: [],
    conclusion: null,
    createdAt,
    updatedAt: createdAt
  };
  nodesList.push({
    id: rootId,
    type: 'planning',
    title: change.proposal.title || '根节点',
    status: 'implementing',
    requirement: change.proposal.why || '',
    docs: [],
    createdAt,
    conclusion: ''
  });

  // 遍历 taskGroups 生成规划节点和子执行节点
  for (const group of change.taskGroups) {
    const groupId = generateId('node');
    const allCompleted = group.tasks.length > 0 && group.tasks.every(t => t.completed);
    const groupStatus = allCompleted ? 'completed' : 'pending';

    nodes[groupId] = {
      id: groupId,
      type: 'planning',
      parentId: rootId,
      children: [],
      status: groupStatus,
      isolate: false,
      references: [],
      conclusion: allCompleted ? `阶段已完成 (${group.tasks.length} 个任务)` : null,
      createdAt,
      updatedAt: createdAt
    };
    nodes[rootId].children.push(groupId);

    nodesList.push({
      id: groupId,
      type: 'planning',
      title: `${group.groupId}. ${group.groupName}`,
      status: groupStatus,
      requirement: `${group.groupName} 阶段的任务`,
      docs: [],
      createdAt,
      conclusion: allCompleted ? `阶段已完成 (${group.tasks.length} 个任务)` : ''
    });

    // 遍历任务生成执行节点
    for (const task of group.tasks) {
      const taskId = generateId('node');
      const taskStatus = task.completed ? 'completed' : 'pending';

      const requirementParts = [`**任务**: ${task.text}`];
      if (change.proposal.why) {
        requirementParts.push(`\n**背景**: ${change.proposal.why.slice(0, 200)}${change.proposal.why.length > 200 ? '...' : ''}`);
      }

      const taskDocs = [];
      if (change.hasDesign) {
        taskDocs.push({ path: 'docs/design.md', description: '技术设计' });
      }

      nodes[taskId] = {
        id: taskId,
        type: 'execution',
        parentId: groupId,
        children: [],
        status: taskStatus,
        isolate: false,
        references: [],
        conclusion: task.completed ? '任务已在 OpenSpec 中标记为完成' : null,
        createdAt,
        updatedAt: createdAt
      };
      nodes[groupId].children.push(taskId);

      nodesList.push({
        id: taskId,
        type: 'execution',
        title: `${task.id} ${task.text}`,
        status: taskStatus,
        requirement: requirementParts.join('\n'),
        docs: taskDocs,
        createdAt,
        conclusion: task.completed ? '任务已在 OpenSpec 中标记为完成' : ''
      });
    }
  }

  return {
    rootId,
    nodes,
    nodesList
  };
}

// ========== 文件写入 ==========

function formatLogTime(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 写入工作区文件
 */
function writeWorkspace(conversion, projectRoot) {
  const workspacePath = path.join(projectRoot, `.tanmi-workspace${DIR_SUFFIX}`, conversion.workspaceId);

  // 创建目录结构
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'nodes'), { recursive: true });
  fs.mkdirSync(path.join(workspacePath, 'docs'), { recursive: true });

  // 写入 workspace.json
  const workspaceJson = {
    id: conversion.workspaceId,
    name: conversion.workspaceName,
    status: 'active',
    createdAt: conversion.createdAt,
    updatedAt: conversion.createdAt,
    rootNodeId: conversion.nodeTree.rootId
  };
  fs.writeFileSync(
    path.join(workspacePath, 'workspace.json'),
    JSON.stringify(workspaceJson, null, 2)
  );

  // 写入 Workspace.md
  fs.writeFileSync(
    path.join(workspacePath, 'Workspace.md'),
    generateWorkspaceMd(
      conversion.workspaceName,
      conversion.goal,
      conversion.rules,
      conversion.docs,
      conversion.createdAt
    )
  );

  // 写入 graph.json (v3.0 格式)
  const graphJson = {
    version: '3.0',
    currentFocus: conversion.nodeTree.rootId,
    nodes: conversion.nodeTree.nodes
  };
  fs.writeFileSync(
    path.join(workspacePath, 'graph.json'),
    JSON.stringify(graphJson, null, 2)
  );

  // 写入 Log.md
  fs.writeFileSync(
    path.join(workspacePath, 'Log.md'),
    generateNodeLogMd({
      time: formatLogTime(),
      operator: 'System',
      event: '工作区从 OpenSpec 导入创建'
    })
  );

  // 写入 Problem.md
  fs.writeFileSync(
    path.join(workspacePath, 'Problem.md'),
    generateNodeProblemMd()
  );

  // 写入所有节点
  for (const node of conversion.nodeTree.nodesList) {
    const nodePath = path.join(workspacePath, 'nodes', node.id);
    fs.mkdirSync(nodePath, { recursive: true });

    fs.writeFileSync(path.join(nodePath, 'Info.md'), generateNodeInfoMd(node));

    const logEvent = node.status === 'completed'
      ? '节点创建并标记为完成 (从 OpenSpec 导入)'
      : '节点创建 (从 OpenSpec 导入)';
    fs.writeFileSync(
      path.join(nodePath, 'Log.md'),
      generateNodeLogMd({
        time: formatLogTime(),
        operator: 'System',
        event: logEvent
      })
    );

    fs.writeFileSync(path.join(nodePath, 'Problem.md'), generateNodeProblemMd());
  }

  // 复制文档
  if (conversion.docContents.design) {
    fs.writeFileSync(
      path.join(workspacePath, 'docs', 'design.md'),
      conversion.docContents.design
    );
  }
  if (Object.keys(conversion.docContents.specs).length > 0) {
    fs.mkdirSync(path.join(workspacePath, 'docs', 'specs'), { recursive: true });
    for (const [specPath, specContent] of Object.entries(conversion.docContents.specs)) {
      const targetPath = path.join(workspacePath, 'docs', 'specs', specPath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, specContent);
    }
  }

  return workspacePath;
}

/**
 * 更新全局索引
 */
function updateIndex(conversion, projectRoot) {
  let index = { version: '2.0', workspaces: [] };
  if (fs.existsSync(INDEX_PATH)) {
    try {
      index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    } catch {
      // 忽略解析错误
    }
  }

  // 添加新工作区 (正确格式)
  index.workspaces.push({
    id: conversion.workspaceId,
    name: conversion.workspaceName,
    projectRoot,
    status: 'active',
    createdAt: conversion.createdAt,
    updatedAt: conversion.createdAt
  });

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
}

// ========== 主程序 ==========

function printUsage() {
  console.log(`
OpenSpec 导入脚本
将 OpenSpec change 目录批量转换为 TanmiWorkspace 工作区

用法:
  node openspec-import.cjs --path <openspec-dir> --change <change-id> --project <project-root>

参数:
  --path      OpenSpec 目录路径 (包含 changes/ 子目录)
  --change    要导入的 change ID (changes/ 下的目录名)
  --project   目标项目根目录
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  let openspecPath = null;
  let changeId = null;
  let projectRoot = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--path' && args[i + 1]) {
      openspecPath = args[++i];
    } else if (args[i] === '--change' && args[i + 1]) {
      changeId = args[++i];
    } else if (args[i] === '--project' && args[i + 1]) {
      projectRoot = args[++i];
    }
  }

  if (!openspecPath || !changeId || !projectRoot) {
    console.error('错误: 缺少必要参数');
    printUsage();
    process.exit(1);
  }

  const changePath = path.join(openspecPath, 'changes', changeId);
  if (!fs.existsSync(changePath)) {
    console.error(`错误: Change 目录不存在: ${changePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(projectRoot)) {
    console.error(`错误: 项目目录不存在: ${projectRoot}`);
    process.exit(1);
  }

  try {
    console.log(`正在解析 OpenSpec change: ${changeId}`);
    const change = parseChange(changePath);

    console.log(`  - 标题: ${change.proposal.title || '(无)'}`);
    console.log(`  - 任务组: ${change.taskGroups.length}`);

    let totalTasks = 0;
    let completedTasks = 0;
    for (const group of change.taskGroups) {
      totalTasks += group.tasks.length;
      completedTasks += group.tasks.filter(t => t.completed).length;
    }
    console.log(`  - 任务: ${totalTasks} (已完成: ${completedTasks})`);

    console.log(`正在转换为 TanmiWorkspace...`);
    const conversion = convertToWorkspace(change, projectRoot);

    console.log(`  - 工作区 ID: ${conversion.workspaceId}`);
    console.log(`  - 节点数: ${conversion.nodeTree.nodesList.length}`);

    console.log(`正在写入文件...`);
    const workspacePath = writeWorkspace(conversion, projectRoot);

    console.log(`正在更新索引...`);
    updateIndex(conversion, projectRoot);

    const completedNodes = conversion.nodeTree.nodesList.filter(n => n.status === 'completed').length;
    const pendingNodes = conversion.nodeTree.nodesList.filter(n => n.status === 'pending').length;
    const implementingNodes = conversion.nodeTree.nodesList.filter(n => n.status === 'implementing').length;

    console.log(`\n导入完成!`);
    console.log(`  工作区: ${conversion.workspaceName}`);
    console.log(`  ID: ${conversion.workspaceId}`);
    console.log(`  路径: ${workspacePath}`);
    console.log(`  节点: ${completedNodes} 完成 / ${implementingNodes} 进行中 / ${pendingNodes} 待处理`);

    // 输出 JSON 结果
    const result = {
      success: true,
      workspaceId: conversion.workspaceId,
      workspaceName: conversion.workspaceName,
      workspacePath,
      stats: {
        totalNodes: conversion.nodeTree.nodesList.length,
        completedNodes,
        pendingNodes,
        implementingNodes
      }
    };
    console.log(`\n--- JSON ---`);
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error(`导入失败: ${error.message}`);
    process.exit(1);
  }
}

main();
