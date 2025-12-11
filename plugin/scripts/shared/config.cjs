/**
 * 共享配置
 */

const path = require('node:path');
const os = require('node:os');

// 判断是否为开发模式
const IS_DEV = process.env.NODE_ENV === 'development' || process.env.TANMI_DEV === 'true';
const DIR_SUFFIX = IS_DEV ? '-dev' : '';

// 路径配置
const TANMI_HOME = path.join(os.homedir(), `.tanmi-workspace${DIR_SUFFIX}`);
const BINDINGS_PATH = path.join(TANMI_HOME, 'session-bindings.json');
const INDEX_PATH = path.join(TANMI_HOME, 'index.json');

// HTTP 端口
const HTTP_PORT = process.env.HTTP_PORT || process.env.PORT || (IS_DEV ? '3001' : '3000');
const MCP_URL = `http://localhost:${HTTP_PORT}`;

// 工作区相关关键词（用于检测用户消息是否涉及工作区）
const WORKSPACE_KEYWORDS = [
  '工作区', 'workspace', '任务', '节点', 'node',
  '继续', 'continue', '进度', 'progress',
  'tanmi', 'session_bind', 'workspace_'
];

module.exports = {
  IS_DEV,
  DIR_SUFFIX,
  TANMI_HOME,
  BINDINGS_PATH,
  INDEX_PATH,
  HTTP_PORT,
  MCP_URL,
  WORKSPACE_KEYWORDS
};
