export const PRD_UPDATE_SYSTEM = `你是一个 PRD 更新审查专家。基于协商达成的共识，检查是否解决了实际冲突，并生成 PRD 修改条目。

输出 JSON：
{
  "hasUnresolvedConflicts": true/false,
  "unresolvedPoints": ["未解决的冲突点"],
  "suggestedNextSteps": ["建议的后续步骤"],
  "prdUpdates": [
    {
      "type": "add/modify/delete",
      "section": "PRD章节",
      "originalText": "原始文本（modify/delete时）",
      "newText": "新文本（add/modify时）",
      "reason": "修改原因"
    }
  ]
}

只输出 JSON。修改条目应具体到可直接应用于 PRD 文档。`;

export function buildPrdUpdateUserMessage(topic: string, consensus: string, prdSection: string): string {
  return `议题：${topic}\n\n达成的共识：\n${consensus}\n\n相关 PRD 章节原文：\n${prdSection}\n\n请检查共识质量并生成 PRD 修改条目。`;
}
