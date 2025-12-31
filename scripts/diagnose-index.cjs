#!/usr/bin/env node
/**
 * TanmiWorkspace 索引诊断脚本
 * 检测 index.json 中的数据问题
 *
 * 用法: node diagnose-index.cjs [--dev]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 解析参数
const isDev = process.argv.includes('--dev');
const folderName = isDev ? '.tanmi-workspace-dev' : '.tanmi-workspace';
const indexPath = path.join(os.homedir(), folderName, 'index.json');

// 颜色输出
const colors = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

console.log(colors.bold('\nTanmiWorkspace 索引诊断工具\n'));
console.log(`索引路径: ${colors.gray(indexPath)}`);
console.log(`环境: ${isDev ? '开发' : '生产'}\n`);

// 读取索引
if (!fs.existsSync(indexPath)) {
  console.log(colors.yellow('[WARN] 索引文件不存在'));
  process.exit(0);
}

let index;
try {
  const content = fs.readFileSync(indexPath, 'utf-8');
  index = JSON.parse(content);
} catch (e) {
  console.log(colors.red(`[ERROR] 无法解析索引文件: ${e.message}`));
  process.exit(1);
}

if (!index.workspaces || !Array.isArray(index.workspaces)) {
  console.log(colors.red('[ERROR] 索引格式无效: workspaces 字段缺失或不是数组'));
  process.exit(1);
}

// 诊断
const issues = [];
const seenIds = new Set();
const requiredFields = ['id', 'name', 'projectRoot', 'dirName', 'status'];

for (let i = 0; i < index.workspaces.length; i++) {
  const ws = index.workspaces[i];
  const wsId = ws.id || `(索引 ${i})`;
  const wsName = ws.name || '(无名称)';

  // 检查必要字段
  for (const field of requiredFields) {
    const value = ws[field];
    if (value === undefined || value === null) {
      issues.push({
        severity: 'error',
        workspace: wsName,
        id: wsId,
        field,
        issue: '字段缺失',
      });
    } else if (typeof value !== 'string') {
      issues.push({
        severity: 'error',
        workspace: wsName,
        id: wsId,
        field,
        issue: `类型错误 (期望 string, 实际 ${typeof value})`,
      });
    } else if (value === '') {
      issues.push({
        severity: field === 'projectRoot' ? 'error' : 'warning',
        workspace: wsName,
        id: wsId,
        field,
        issue: '字段为空',
      });
    }
  }

  // 检查 ID 重复
  if (ws.id) {
    if (seenIds.has(ws.id)) {
      issues.push({
        severity: 'error',
        workspace: wsName,
        id: wsId,
        field: 'id',
        issue: 'ID 重复',
      });
    }
    seenIds.add(ws.id);
  }

  // 检查状态值
  if (ws.status && !['active', 'archived', 'error'].includes(ws.status)) {
    issues.push({
      severity: 'warning',
      workspace: wsName,
      id: wsId,
      field: 'status',
      issue: `无效状态值: ${ws.status}`,
    });
  }

  // 检查日期格式
  for (const dateField of ['createdAt', 'updatedAt']) {
    const value = ws[dateField];
    if (value && typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        issues.push({
          severity: 'warning',
          workspace: wsName,
          id: wsId,
          field: dateField,
          issue: `日期格式无效: ${value}`,
        });
      }
    }
  }
}

// 输出结果
console.log(`${colors.blue('工作区总数:')} ${index.workspaces.length}`);

if (issues.length === 0) {
  console.log(colors.green('\n✓ 未发现问题，索引数据完整\n'));
  process.exit(0);
}

const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warning');

console.log(`${colors.red('错误:')} ${errors.length}  ${colors.yellow('警告:')} ${warnings.length}\n`);

if (errors.length > 0) {
  console.log(colors.red('=== 错误 ==='));
  for (const issue of errors) {
    console.log(`  ${colors.red('✗')} [${issue.workspace}] ${issue.field}: ${issue.issue}`);
    console.log(`    ${colors.gray(`ID: ${issue.id}`)}`);
  }
  console.log();
}

if (warnings.length > 0) {
  console.log(colors.yellow('=== 警告 ==='));
  for (const issue of warnings) {
    console.log(`  ${colors.yellow('!')} [${issue.workspace}] ${issue.field}: ${issue.issue}`);
    console.log(`    ${colors.gray(`ID: ${issue.id}`)}`);
  }
  console.log();
}

if (errors.length > 0) {
  console.log(colors.gray('修复建议:'));
  console.log(colors.gray('  1. 运行 tanmi-workspace rebuild --verify 清理无效条目'));
  console.log(colors.gray('  2. 或手动编辑索引文件修复问题'));
  console.log();
}

process.exit(errors.length > 0 ? 1 : 0);
