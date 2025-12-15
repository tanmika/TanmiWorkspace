/**
 * 共享配置
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 判断是否为开发模式（通过环境变量）
const IS_DEV_ENV = process.env.NODE_ENV === 'development' || process.env.TANMI_DEV === 'true';

// 两个可能的目录路径
const TANMI_HOME_DEV = path.join(os.homedir(), '.tanmi-workspace-dev');
const TANMI_HOME_PROD = path.join(os.homedir(), '.tanmi-workspace');

/**
 * 自动检测实际使用的目录
 * 优先检查 dev 目录是否存在绑定文件，如果存在则使用 dev 目录
 * 这解决了 Hook 脚本没有 TANMI_DEV 环境变量但需要访问 dev 数据的问题
 */
function detectTanmiHome() {
  // 如果环境变量明确指定了 dev 模式，直接使用
  if (IS_DEV_ENV) {
    return TANMI_HOME_DEV;
  }

  // 否则，检查 dev 目录是否存在且有绑定文件（说明服务在 dev 模式运行）
  const devBindingsPath = path.join(TANMI_HOME_DEV, 'session-bindings.json');
  if (fs.existsSync(devBindingsPath)) {
    return TANMI_HOME_DEV;
  }

  // 默认使用生产目录
  return TANMI_HOME_PROD;
}

const TANMI_HOME = detectTanmiHome();
const IS_DEV = TANMI_HOME === TANMI_HOME_DEV;
const DIR_SUFFIX = IS_DEV ? '-dev' : '';

// 路径配置
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
