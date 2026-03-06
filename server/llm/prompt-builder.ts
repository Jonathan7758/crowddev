import type { Role, Phase } from '../../src/types/role.js';

export function buildRolePrompt(role: Role, phase: Phase, context?: string): string {
  const blocks = [
    identityBlock(role),
    functionBlock(role),
    cognitionBlock(role),
    personalityBlock(role),
    phaseGuideBlock(phase),
    behaviorBlock(),
  ];
  if (context) blocks.push(contextBlock(context));
  return blocks.join('\n\n');
}

function identityBlock(role: Role): string {
  return `[身份]
你是 ${role.name}，${role.organization} 的 ${role.title}。`;
}

function functionBlock(role: Role): string {
  const resp = role.responsibilities.map(r => `- ${r}`).join('\n');
  const powers = role.decisionPowers.map(d => `- ${d}`).join('\n');
  return `[职能]
你的职责范围：
${resp}

你拥有以下决策权限：
${powers}`;
}

function cognitionBlock(role: Role): string {
  return `[认知背景]
你的专业背景：${role.expertise.join('、')}`;
}

function personalityBlock(role: Role): string {
  const concerns = role.concerns.map(c => `- ${c}`).join('\n');
  return `[人格特征]
你的性格特征：${role.personality.join('、')}

你最关心的问题：
${concerns}`;
}

function phaseGuideBlock(phase: Phase): string {
  const guides: Record<Phase, string> = {
    design: `[阶段引导 - 设计期]
你正在参与系统的设计评审。请从你的职责和关切出发，评估这个设计方案：
- 这个设计是否考虑了你的工作场景？
- 是否有遗漏的边界情况？
- 人机分工的边界是否合理？
- 你的底线是什么（不可妥协的点）？`,
    acceptance: `[阶段引导 - 验收期]
你正在参与系统的验收评审。请从你的实际使用角度评估：
- 实现是否符合之前达成的共识？
- 使用体验是否满足你的工作需要？
- 是否有偏差或遗漏？
- 哪些问题必须在上线前解决？`,
    operations: `[阶段引导 - 运营期]
系统已上线运营。请从你的日常使用角度反馈：
- 哪些功能在实际使用中效果好？哪些不好？
- 是否发现新的需求或优化点？
- 参数配置是否合理？需要调整什么？
- 你的角色认知是否因使用经验而改变？`,
  };
  return guides[phase];
}

function behaviorBlock(): string {
  return `[行为约束]
回复要求：
- 控制在 200 字以内
- 用第一人称，以你的角色身份发言
- 必须具体到操作场景，不能泛泛而谈
- 如果你同意方案，说明为什么；如果你反对，给出具体原因和替代建议
- 使用中文回复`;
}

function contextBlock(context: string): string {
  return `[附加上下文]
${context}`;
}
