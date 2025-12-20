// src/utils/manualChangeFormatter.ts

import type { ManualChange } from "../types/workspace.js";

/**
 * 格式化手动变更记录为提醒文本
 * @param changes 变更记录列表
 * @returns 格式化后的提醒文本
 */
export function formatManualChangeReminder(changes: ManualChange[]): string {
  if (changes.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("---");
  lines.push(`⚠️ 用户在 WebUI 进行了 ${changes.length} 次手动操作：`);

  for (const change of changes) {
    lines.push(`- ${change.description}`);
  }

  lines.push("");
  lines.push("请调用 context_get 了解详情，并向用户核实意图。");

  return lines.join("\n");
}
