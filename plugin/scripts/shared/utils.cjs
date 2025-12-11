/**
 * 通用工具函数
 */

const fs = require('node:fs');

/**
 * 读取 JSON 文件
 * @param {string} filePath - 文件路径
 * @returns {object|null} 解析后的 JSON 对象或 null
 */
function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * 读取标准输入
 * @returns {Promise<object>} 解析后的 JSON 对象
 */
async function readStdin() {
  return new Promise((resolve) => {
    let data = '';

    // 设置超时，防止无限等待
    const timeout = setTimeout(() => {
      resolve({});
    }, 3000);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });

    // 如果没有输入，立即结束
    if (process.stdin.isTTY) {
      clearTimeout(timeout);
      resolve({});
    }
  });
}

module.exports = {
  readJsonFile,
  readStdin
};
