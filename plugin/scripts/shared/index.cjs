/**
 * 共享模块统一导出
 */

const config = require('./config.cjs');
const utils = require('./utils.cjs');
const binding = require('./binding.cjs');
const workspace = require('./workspace.cjs');
const context = require('./context.cjs');
const reminder = require('./reminder.cjs');

module.exports = {
  // 配置
  ...config,

  // 工具函数
  ...utils,

  // 绑定逻辑
  ...binding,

  // 工作区数据
  ...workspace,

  // 上下文生成
  ...context,

  // 智能提醒
  ...reminder
};
