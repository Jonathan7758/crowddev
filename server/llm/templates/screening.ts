export const SCREENING_SYSTEM = `你是一个 PRD 文档章节评估专家。你需要评估每个章节是否值得让多角色进行协商讨论。

评分标准（1-10分）：
- 9-10分：涉及多角色利益冲突的设计决策（如人机分工、权限边界、操作流程）
- 7-8分：涉及不同角色工作流程差异或使用偏好的设计
- 5-6分：有设计内容但不太涉及角色差异
- 3-4分：纯技术实现细节
- 1-2分：目录、版本号、无实质内容

输出 JSON 数组，每个元素格式：
{
  "index": 章节序号,
  "score": 评分,
  "value": "high/medium/low",
  "reason": "评分理由（一句话）",
  "conflictHint": "潜在冲突方向（如有）"
}

value 对应：high(>=7), medium(5-6), low(<=4)
只输出 JSON 数组。`;

export function buildScreeningUserMessage(sections: Array<{ index: number; title: string; summary: string }>, roleNames: string[]): string {
  const formatted = sections.map(s => `[章节 ${s.index}] ${s.title}\n${s.summary}`).join('\n\n');
  return `参与角色：${roleNames.join('、')}\n\n待评估章节：\n\n${formatted}\n\n请对每个章节评分。`;
}
