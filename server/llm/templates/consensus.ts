import type { Phase } from '../../../src/types/role.js';

const DESIGN_CONSENSUS = `你是协商共识生成器。基于所有角色的讨论，生成设计期共识方案。

输出 JSON 格式：
{
  "conclusion": "最终设计决策",
  "compromises": [
    {"roleId": "角色ID", "roleName": "角色名", "compromise": "该角色做出的妥协"}
  ],
  "constraints": ["设计约束条件1", "约束2"],
  "prdSuggestions": [
    {"type": "add/modify/delete", "section": "PRD章节", "content": "具体内容", "reason": "原因"}
  ],
  "acceptanceCriteria": ["验收标准1", "标准2"],
  "unresolvedIssues": ["遗留问题1"]
}

只输出 JSON，不要其他文字。共识应具体可执行，不能空泛。`;

const ACCEPTANCE_CONSENSUS = `你是协商共识生成器。基于所有角色的验收讨论，生成验收期共识。

输出 JSON 格式：
{
  "verdict": "pass/conditional_pass/fail",
  "metItems": ["已满足的需求1"],
  "deviations": [
    {"item": "偏差项", "severity": "high/medium/low", "description": "偏差描述"}
  ],
  "improvements": [
    {"item": "改进项", "priority": "high/medium/low", "assignee": "负责方"}
  ],
  "unresolvedIssues": ["遗留问题"]
}

只输出 JSON。`;

const OPERATIONS_CONSENSUS = `你是协商共识生成器。基于所有角色的运营反馈讨论，生成运营期共识。

输出 JSON 格式：
{
  "insights": ["运营洞察1"],
  "optimizations": [
    {"item": "优化项", "priority": "high/medium/low", "expectedImpact": "预期效果"}
  ],
  "parameterChanges": [
    {"parameter": "参数名", "currentValue": "当前值", "suggestedValue": "建议值", "reason": "原因"}
  ],
  "unresolvedIssues": ["遗留问题"]
}

只输出 JSON。`;

export function getConsensusTemplate(phase: Phase): string {
  const templates: Record<Phase, string> = {
    design: DESIGN_CONSENSUS,
    acceptance: ACCEPTANCE_CONSENSUS,
    operations: OPERATIONS_CONSENSUS,
  };
  return templates[phase];
}

export function buildConsensusUserMessage(topic: string, allMessages: Array<{ roleName: string; type: string; content: string }>): string {
  const formatted = allMessages.map(m => `【${m.roleName || '协商引擎'}】[${m.type}]:\n${m.content}`).join('\n\n---\n\n');
  return `议题：${topic}\n\n完整讨论记录：\n\n${formatted}\n\n请基于以上讨论生成共识方案。`;
}
