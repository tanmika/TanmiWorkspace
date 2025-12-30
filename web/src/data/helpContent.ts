/**
 * 用户帮助内容数据
 * 用于设置弹窗的帮助区块
 */

/**
 * 快速入门内容 (Markdown 字符串)
 */
export const quickStartContent = `在对话中提及「**工作区**」或「**工作台**」即可触发。

**示例**：
- 「用工作台帮我实现 xxx」
- 「创建一个工作区，帮我做 xxx」

创建后会显示 WebUI 地址，可在浏览器中查看任务进度。`;

/**
 * 触发词项类型
 */
export interface TriggerWord {
  /** 意图描述 */
  intent: string;
  /** 可用的说法 */
  phrases: string[];
}

/**
 * 触发词速查表
 */
export const triggerWords: TriggerWord[] = [
  {
    intent: '创建工作区',
    phrases: ['用工作台帮我...', '创建一个工作区'],
  },
  {
    intent: '恢复任务',
    phrases: ['看看工作区状态'],
  },
  {
    intent: '查看进度',
    phrases: ['进度', '做到哪了'],
  },
  {
    intent: '确认计划',
    phrases: ['好', '可以', '继续'],
  },
  {
    intent: '调整计划',
    phrases: ['不对', '调整一下', '先不做'],
  },
  {
    intent: '重新执行',
    phrases: ['重新做', '再试一次'],
  },
  {
    intent: '放弃任务',
    phrases: ['先不做了', '取消'],
  },
];
