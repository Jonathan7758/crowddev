export const TOPIC_EXTRACTION_SYSTEM = `你是一个协商议题提取专家。基于选中的 PRD 章节内容，提取出具体的、可辩论的协商议题。

要求：
- 提取 3-8 个具体议题
- 每个议题必须涉及至少 2 个角色
- 议题应聚焦于可产生有意义辩论的设计决策
- 按冲突强度从高到低排序

输出 JSON 数组：
[
  {
    "topic": "议题标题（简短）",
    "description": "议题描述（说明需要讨论什么）",
    "involvedRoles": ["相关角色名1", "角色名2"],
    "expectedConflict": "预期冲突方向",
    "priority": "high/medium/low",
    "prdSection": "关联的PRD章节标题"
  }
]

只输出 JSON 数组。`;

export function buildTopicExtractionUserMessage(sections: Array<{ title: string; content: string }>, roleNames: string[]): string {
  const formatted = sections.map(s => `## ${s.title}\n${s.content}`).join('\n\n---\n\n');
  return `参与角色：${roleNames.join('、')}\n\n选中的 PRD 章节：\n\n${formatted}\n\n请提取协商议题。`;
}
