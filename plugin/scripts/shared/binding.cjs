/**
 * 会话绑定逻辑
 */

const { readJsonFile } = require('./utils.cjs');
const { BINDINGS_PATH } = require('./config.cjs');

/**
 * 获取会话绑定信息（本地读取）
 * @param {string} sessionId - 会话 ID（CC 的 session_id 或 Cursor 的 conversation_id）
 * @returns {object|null} 绑定信息或 null
 */
function getSessionBinding(sessionId) {
  const bindings = readJsonFile(BINDINGS_PATH);
  if (!bindings || !bindings.bindings) {
    return null;
  }
  return bindings.bindings[sessionId] || null;
}

/**
 * 检测文本是否涉及工作区关键词
 * @param {string} text - 要检测的文本
 * @returns {boolean}
 */
function containsWorkspaceKeywords(text) {
  const { WORKSPACE_KEYWORDS } = require('./config.cjs');
  if (!text) return false;
  const lowerText = text.toLowerCase();
  return WORKSPACE_KEYWORDS.some(kw => lowerText.includes(kw.toLowerCase()));
}

module.exports = {
  getSessionBinding,
  containsWorkspaceKeywords
};
