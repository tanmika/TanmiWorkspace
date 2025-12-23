#!/usr/bin/env node

/**
 * TanmiWorkspace - 更新安装元信息脚本
 * 在 Hook/Agents 安装后调用，记录安装状态到 installation-meta.json
 *
 * 用法:
 *   node update-installation-meta.cjs <command> [args...]
 *
 * 全局组件:
 *   node update-installation-meta.cjs update claudeCode hooks 1.7.2
 *   node update-installation-meta.cjs remove cursor hooks
 *
 * 项目组件:
 *   node update-installation-meta.cjs project-update /path/to/project agents 1.7.2
 *   node update-installation-meta.cjs project-remove /path/to/project agents
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 配置
const isDev = process.env.NODE_ENV === 'development' || process.env.TANMI_DEV === 'true';
const baseDir = isDev ? '.tanmi-workspace-dev' : '.tanmi-workspace';
const metaPath = path.join(os.homedir(), baseDir, 'installation-meta.json');

// 支持的平台和组件
const PLATFORMS = ['claudeCode', 'cursor', 'codex'];
const COMPONENTS = ['hooks', 'mcp', 'agentsMd', 'modes'];
const PROJECT_COMPONENTS = ['agents', 'skills'];

/**
 * 读取元信息
 */
function readMeta() {
  try {
    if (fs.existsSync(metaPath)) {
      const content = fs.readFileSync(metaPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('读取元信息失败:', err.message);
  }

  // 返回默认结构
  const now = new Date().toISOString();
  return {
    schemaVersion: '1.0',
    global: {
      installedAt: now,
      lastUpdatedAt: now,
      packageVersion: '0.0.0',
      platforms: {}
    }
  };
}

/**
 * 写入元信息
 */
function writeMeta(meta) {
  // 确保目录存在
  const metaDir = path.dirname(metaPath);
  if (!fs.existsSync(metaDir)) {
    fs.mkdirSync(metaDir, { recursive: true });
  }

  // 更新时间戳
  meta.global.lastUpdatedAt = new Date().toISOString();

  // 写入文件
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

/**
 * 更新平台组件信息
 */
function updatePlatform(platform, component, version) {
  const meta = readMeta();
  const now = new Date().toISOString();

  // 初始化平台信息
  if (!meta.global.platforms[platform]) {
    meta.global.platforms[platform] = {
      enabled: true,
      installedAt: now,
      version: version || meta.global.packageVersion || '0.0.0',
      components: {
        hooks: false,
        mcp: false
      }
    };

    // 平台特有组件
    if (platform === 'codex') {
      meta.global.platforms[platform].components.agentsMd = false;
    }
    if (platform === 'cursor') {
      meta.global.platforms[platform].components.modes = false;
    }
  }

  // 更新组件状态
  const platformInfo = meta.global.platforms[platform];
  platformInfo.components[component] = true;

  // 更新版本（如果提供）
  if (version) {
    platformInfo.version = version;
    meta.global.packageVersion = version;
  }

  writeMeta(meta);
  console.log(`✓ 已更新 ${platform}.${component} 到 installation-meta.json`);
}

/**
 * 移除平台组件信息
 */
function removePlatformComponent(platform, component) {
  const meta = readMeta();

  if (meta.global.platforms[platform]) {
    meta.global.platforms[platform].components[component] = false;

    // 检查是否所有组件都已禁用
    const components = meta.global.platforms[platform].components;
    const allDisabled = Object.values(components).every(v => v === false);

    if (allDisabled) {
      meta.global.platforms[platform].enabled = false;
    }

    writeMeta(meta);
    console.log(`✓ 已从 installation-meta.json 移除 ${platform}.${component}`);
  }
}

/**
 * 更新项目组件信息
 */
function updateProject(projectPath, component, version) {
  const meta = readMeta();
  const now = new Date().toISOString();

  // 标准化项目路径
  const normalizedPath = path.resolve(projectPath);

  // 初始化 projects 对象
  if (!meta.projects) {
    meta.projects = {};
  }

  // 初始化项目信息
  if (!meta.projects[normalizedPath]) {
    meta.projects[normalizedPath] = {
      installedAt: now,
      version: version || meta.global.packageVersion || '0.0.0',
      agents: false,
      skills: false
    };
  }

  // 更新组件状态
  const projectInfo = meta.projects[normalizedPath];
  projectInfo[component] = true;

  // 更新版本（如果提供）
  if (version) {
    projectInfo.version = version;
  }

  writeMeta(meta);
  console.log(`✓ 已更新项目 ${normalizedPath} 的 ${component} 到 installation-meta.json`);
}

/**
 * 移除项目组件信息
 */
function removeProjectComponent(projectPath, component) {
  const meta = readMeta();

  if (!meta.projects) {
    return;
  }

  const normalizedPath = path.resolve(projectPath);

  if (meta.projects[normalizedPath]) {
    meta.projects[normalizedPath][component] = false;

    // 检查是否所有组件都已禁用
    const projectInfo = meta.projects[normalizedPath];
    const allDisabled = !projectInfo.agents && !projectInfo.skills;

    if (allDisabled) {
      delete meta.projects[normalizedPath];
    }

    writeMeta(meta);
    console.log(`✓ 已从 installation-meta.json 移除项目 ${normalizedPath} 的 ${component}`);
  }
}

/**
 * 显示当前状态
 */
function showStatus() {
  const meta = readMeta();
  console.log('\n安装元信息:');
  console.log('  路径:', metaPath);
  console.log('  版本:', meta.global.packageVersion);
  console.log('  首次安装:', meta.global.installedAt);
  console.log('  最后更新:', meta.global.lastUpdatedAt);
  console.log('\n平台状态:');

  for (const [platform, info] of Object.entries(meta.global.platforms)) {
    console.log(`  ${platform}:`);
    console.log(`    启用: ${info.enabled}`);
    console.log(`    版本: ${info.version}`);
    console.log(`    组件:`, info.components);
  }

  if (meta.projects && Object.keys(meta.projects).length > 0) {
    console.log('\n项目状态:');
    for (const [projectPath, info] of Object.entries(meta.projects)) {
      console.log(`  ${projectPath}:`);
      console.log(`    版本: ${info.version}`);
      console.log(`    agents: ${info.agents}`);
      console.log(`    skills: ${info.skills}`);
    }
  }
}

// 主逻辑
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help') {
    console.log('用法: node update-installation-meta.cjs <命令> [参数...]');
    console.log('');
    console.log('全局组件命令:');
    console.log('  update <platform> <component> [version]  更新平台组件');
    console.log('  remove <platform> <component>            移除平台组件');
    console.log('');
    console.log('项目组件命令:');
    console.log('  project-update <path> <component> [version]  更新项目组件');
    console.log('  project-remove <path> <component>            移除项目组件');
    console.log('');
    console.log('其他命令:');
    console.log('  status                                   显示当前状态');
    console.log('');
    console.log('平台: claudeCode, cursor, codex');
    console.log('全局组件: hooks, mcp, agentsMd, modes');
    console.log('项目组件: agents, skills');
    process.exit(0);
  }

  const command = args[0];

  switch (command) {
    case 'update': {
      const platform = args[1];
      const component = args[2];
      const version = args[3];

      if (!platform || !component) {
        console.error('错误: 需要指定平台和组件');
        process.exit(1);
      }

      if (!PLATFORMS.includes(platform)) {
        console.error(`错误: 不支持的平台 "${platform}"`);
        console.error('支持的平台:', PLATFORMS.join(', '));
        process.exit(1);
      }

      if (!COMPONENTS.includes(component)) {
        console.error(`错误: 不支持的组件 "${component}"`);
        console.error('支持的组件:', COMPONENTS.join(', '));
        process.exit(1);
      }

      updatePlatform(platform, component, version);
      break;
    }

    case 'remove': {
      const platform = args[1];
      const component = args[2];

      if (!platform || !component) {
        console.error('错误: 需要指定平台和组件');
        process.exit(1);
      }

      removePlatformComponent(platform, component);
      break;
    }

    case 'status': {
      showStatus();
      break;
    }

    case 'project-update': {
      const projectPath = args[1];
      const component = args[2];
      const version = args[3];

      if (!projectPath || !component) {
        console.error('错误: 需要指定项目路径和组件');
        process.exit(1);
      }

      if (!PROJECT_COMPONENTS.includes(component)) {
        console.error(`错误: 不支持的项目组件 "${component}"`);
        console.error('支持的项目组件:', PROJECT_COMPONENTS.join(', '));
        process.exit(1);
      }

      updateProject(projectPath, component, version);
      break;
    }

    case 'project-remove': {
      const projectPath = args[1];
      const component = args[2];

      if (!projectPath || !component) {
        console.error('错误: 需要指定项目路径和组件');
        process.exit(1);
      }

      if (!PROJECT_COMPONENTS.includes(component)) {
        console.error(`错误: 不支持的项目组件 "${component}"`);
        console.error('支持的项目组件:', PROJECT_COMPONENTS.join(', '));
        process.exit(1);
      }

      removeProjectComponent(projectPath, component);
      break;
    }

    default: {
      // 兼容旧格式: platform component [version]
      if (PLATFORMS.includes(command)) {
        const platform = command;
        const component = args[1];
        const version = args[2];

        if (!component) {
          console.error('错误: 需要指定组件');
          process.exit(1);
        }

        updatePlatform(platform, component, version);
      } else {
        console.error(`错误: 未知命令 "${command}"`);
        process.exit(1);
      }
    }
  }
}

main();
