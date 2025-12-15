/**
 * 会话绑定逻辑
 */

const fs = require('node:fs');
const { readJsonFile } = require('./utils.cjs');
const { BINDINGS_PATH } = require('./config.cjs');

// 提醒节流间隔（毫秒）
const THROTTLE_INTERVAL = 3 * 60 * 1000; // 3 分钟

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

/**
 * 判断是否应该节流提醒
 * @param {object} binding - 会话绑定信息
 * @param {string} reminderType - 提醒类型
 * @param {number} [customInterval] - 自定义节流间隔（毫秒），默认使用 THROTTLE_INTERVAL
 * @returns {boolean} true 表示应该节流（不发送提醒）
 */
function shouldThrottle(binding, reminderType, customInterval) {
  // P0 (problem) 类型不节流，每次都提醒
  if (reminderType === 'problem') {
    return false;
  }

  if (!binding || !binding.lastReminder) {
    return false;
  }

  const lastReminder = binding.lastReminder;
  const interval = customInterval || THROTTLE_INTERVAL;

  // 同一类型的提醒需要节流
  if (lastReminder.type === reminderType) {
    const lastTime = new Date(lastReminder.time).getTime();
    const now = Date.now();
    return (now - lastTime) < interval;
  }

  return false;
}

/**
 * 更新上次提醒记录
 * @param {string} sessionId - 会话 ID
 * @param {string} reminderType - 提醒类型
 * @returns {boolean} 是否更新成功
 */
function updateLastReminder(sessionId, reminderType) {
  try {
    const bindings = readJsonFile(BINDINGS_PATH);
    if (!bindings || !bindings.bindings || !bindings.bindings[sessionId]) {
      return false;
    }

    bindings.bindings[sessionId].lastReminder = {
      type: reminderType,
      time: new Date().toISOString()
    };

    fs.writeFileSync(BINDINGS_PATH, JSON.stringify(bindings, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  getSessionBinding,
  containsWorkspaceKeywords,
  shouldThrottle,
  updateLastReminder,
  THROTTLE_INTERVAL
};
