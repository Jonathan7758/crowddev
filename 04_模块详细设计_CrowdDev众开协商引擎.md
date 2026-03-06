# CrowdDev 众开协商引擎 — 模块详细设计文档

**版本：** v1.0  
**日期：** 2026年3月  
**范围：** MVP Phase 1 各模块实现级设计

---

## 一、模块总览与依赖关系

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React + TS)                   │
│                                                           │
│  pages/ ──→ components/ ──→ stores/ ──→ api/client       │
└────────────────────────┬──────────────────────────────────┘
                         │ HTTP / SSE
┌────────────────────────▼──────────────────────────────────┐
│                   Backend (Express + TS)                   │
│                                                           │
│  api/routes ──→ services/ ──→ llm/ ──→ db/repository     │
│                                                           │
│  services 依赖关系:                                       │
│  negotiation-engine ──→ role-engine (获取角色 prompt)      │
│  negotiation-engine ──→ llm-service (AI 调用)             │
│  document-engine ──→ llm-service (预筛/提取)              │
│  evolution-engine ──→ db/repository (聚合查询)            │
└───────────────────────────────────────────────────────────┘
```

---

## 二、角色引擎（Role Engine）详细设计

### 2.1 模块职责

角色引擎负责角色档案的全生命周期管理，以及将角色档案转化为 LLM 可消费的 system prompt。

### 2.2 核心类与接口

```typescript
// server/services/role-engine.ts

export interface RoleInput {
  name: string;
  title: string;
  organization: string;
  avatar: string;
  responsibilities: string[];
  decisionPowers: string[];
  expertise: string[];
  personality: string[];
  concerns: string[];
}

export class RoleEngine {
  constructor(private db: RoleRepository) {}

  /** 创建角色，版本初始化为 1.0.0 */
  async create(input: RoleInput): Promise<Role>;

  /** 更新角色，自动升版 patch（1.0.0→1.0.1），记录变更字段 */
  async update(id: string, input: Partial<RoleInput>, notes?: string): Promise<Role>;

  /** 删除角色（软删除：标记 deleted_at，历史协商中仍可引用） */
  async delete(id: string): Promise<void>;

  /** 获取所有活跃角色 */
  async list(): Promise<Role[]>;

  /** 获取单个角色（含完整版本历史） */
  async getById(id: string): Promise<Role | null>;

  /** 生成角色的 system prompt */
  buildSystemPrompt(role: Role, phase: Phase, context?: string): string;

  /** 比较两个版本的角色差异 */
  diffVersions(roleId: string, v1: string, v2: string): FieldDiff[];
}
```

### 2.3 版本管理策略

```
版本号格式: MAJOR.MINOR.PATCH

规则:
- 创建时: 1.0.0
- 修改非关键字段（name/avatar/organization）: PATCH +1
- 修改关切层字段（concerns/personality/decisionPowers）: MINOR +1
- 手动指定大版本升级: MAJOR +1（用于里程碑性质的角色重塑）

示例:
1.0.0  → 修改 avatar          → 1.0.1
1.0.1  → 修改 concerns        → 1.1.0
1.1.0  → 修改 responsibilities → 1.2.0
1.2.0  → 手动升大版本          → 2.0.0
```

字段分级：

| 级别 | 字段 | 升版类型 |
|------|------|---------|
| 关键 | concerns, personality, decisionPowers, expertise | MINOR |
| 普通 | responsibilities, name, title, organization, avatar | PATCH |

### 2.4 System Prompt 构建管道

```typescript
// server/llm/prompt-builder.ts

export function buildRolePrompt(role: Role, phase: Phase, context?: string): string {
  const blocks = [
    identityBlock(role),      // 身份：姓名、头衔、组织
    functionBlock(role),      // 职能：职责、决策权限
    cognitionBlock(role),     // 认知：专业背景
    personalityBlock(role),   // 人格：性格特征、核心关切
    phaseGuideBlock(phase),   // 阶段引导：设计/验收/运营
    behaviorBlock(),          // 行为约束：字数限制、风格要求
  ];
  if (context) blocks.push(contextBlock(context));
  return blocks.join('\n\n');
}
```

各区块模板示例（设计期）：

```
[身份区块]
你是 {name}，{organization} 的 {title}。

[职能区块]
你的职责范围：
{responsibilities.map(r => `- ${r}`).join('\n')}

你拥有以下决策权限：
{decisionPowers.map(d => `- ${d}`).join('\n')}

[认知区块]
你的专业背景：{expertise.join('、')}

[人格区块]
你的性格特征：{personality.join('、')}
你最关心的问题：
{concerns.map(c => `- ${c}`).join('\n')}

[阶段引导 - 设计期]
你正在参与系统的设计评审。请从你的职责和关切出发，评估这个设计方案：
- 这个设计是否考虑了你的工作场景？
- 是否有遗漏的边界情况？
- 人机分工的边界是否合理？
- 你的底线是什么（不可妥协的点）？

[行为约束]
回复要求：
- 控制在 200 字以内
- 用第一人称，以你的角色身份发言
- 必须具体到操作场景，不能泛泛而谈
- 如果你同意方案，说明为什么；如果你反对，给出具体原因和替代建议
- 使用中文回复
```

### 2.5 预置角色数据

```typescript
// server/services/preset-roles.ts

export const PRESET_ROLES: RoleInput[] = [
  {
    name: '李Sir',
    title: '调度员 Dispatcher',
    organization: '城市安防指挥中心',
    avatar: '🎯',
    responsibilities: [
      '接收和分配安防任务给一线人员',
      '监控多路视频画面，判断事件优先级',
      '在紧急情况下做出快速调度决策',
      '协调多个一线人员的协同行动',
    ],
    decisionPowers: [
      '任务分配优先级决定权',
      '紧急情况下的即时调度权',
      '人员调配建议权（需上级审批大规模调度）',
    ],
    expertise: [
      '10年安防调度经验',
      '熟悉城市安防运营流程',
      '对多任务并发调度有丰富经验',
    ],
    personality: [
      '务实高效，讨厌繁琐流程',
      '对操作响应速度极度敏感',
      '习惯同时处理多个任务',
      '直言不讳，沟通风格简洁',
    ],
    concerns: [
      '操作效率：每次点击都应有意义，减少无效操作',
      '信息密度：一个屏幕上要能看到所有关键信息',
      '响应速度：系统加载和操作响应必须足够快',
      '多任务切换：在处理紧急任务时不能丢失其他任务的上下文',
    ],
  },
  {
    name: '张警官',
    title: '末端用户 Field Officer',
    organization: '城市安防巡逻队',
    avatar: '👮',
    responsibilities: [
      '执行调度中心下达的安防任务',
      '现场情况评估与反馈',
      '使用移动终端接收任务和上报信息',
      '紧急事件的第一响应处置',
    ],
    decisionPowers: [
      '现场处置方式的决定权',
      '任务执行状态的报告权',
      '紧急情况下的自主判断权',
    ],
    expertise: [
      '5年一线安防执法经验',
      '熟悉现场处置流程',
      '移动设备操作熟练',
    ],
    personality: [
      '注重实际操作体验',
      '在高压环境下需要清晰简洁的指令',
      '对复杂界面容忍度低',
      '重视自身安全和同事安全',
    ],
    concerns: [
      '指令清晰度：收到的任务指令必须一目了然',
      '移动端可用性：在户外、光线不好的环境下也能顺利操作',
      'AI推荐可信度：系统给出的建议是否可靠，能否信任',
      '反馈便捷性：上报现场情况的操作要尽可能简单',
    ],
  },
  {
    name: '王工',
    title: '系统管理员 System Admin',
    organization: '城市安防信息技术部',
    avatar: '🔧',
    responsibilities: [
      '系统的日常运维和监控',
      '用户权限管理和审计',
      '系统参数配置和策略调整',
      '故障排查和性能优化',
      '安全合规审查',
    ],
    decisionPowers: [
      '系统参数调整权',
      '用户权限分配权',
      '系统升级和维护窗口决定权',
    ],
    expertise: [
      '8年 IT 运维经验',
      '熟悉安防系统架构',
      '了解等保合规要求',
      '具备数据库和网络排障能力',
    ],
    personality: [
      '严谨细致，注重日志和审计',
      '风险厌恶，偏好渐进式变更',
      '对系统稳定性有执念',
      '喜欢一切操作可追溯',
    ],
    concerns: [
      '审计合规：所有关键操作必须有日志记录',
      '权限管控：不同角色的权限边界必须清晰',
      '系统稳定性：新功能不能影响现有系统的稳定运行',
      '可维护性：系统配置应该通过管理界面完成，不需要直接改代码',
    ],
  },
];
```

---

## 三、协商引擎（Negotiation Engine）详细设计

### 3.1 模块职责

协商引擎编排四步协商流程，管理会话状态机，并通过 SSE 向前端实时推送进度。

### 3.2 状态机定义

```typescript
// server/services/negotiation-engine.ts

export type SessionStatus =
  | 'created'
  | 'opinions_running'
  | 'opinions_done'
  | 'analysis_running'
  | 'analysis_done'
  | 'debate_running'
  | 'debate_done'
  | 'consensus_running'
  | 'consensus_reached'
  | 'prd_check_running'
  | 'prd_check_done';

// 状态转移规则
const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  created:             ['opinions_running'],
  opinions_running:    ['opinions_done'],
  opinions_done:       ['analysis_running'],
  analysis_running:    ['analysis_done'],
  analysis_done:       ['debate_running', 'consensus_running'],
  debate_running:      ['debate_done'],
  debate_done:         ['debate_running', 'consensus_running'],  // 可多轮
  consensus_running:   ['consensus_reached'],
  consensus_reached:   ['debate_running', 'prd_check_running'],  // 可回退辩论
  prd_check_running:   ['prd_check_done'],
  prd_check_done:      ['debate_running'],  // 可继续辩论
};
```

### 3.3 SSE 事件协议

```typescript
// 前后端共享的事件类型
export type NegotiationEvent =
  | { event: 'role_thinking'; roleId: string; roleName: string; step: string }
  | { event: 'role_done'; message: Message }
  | { event: 'analysis_start' }
  | { event: 'analysis_done'; message: Message }
  | { event: 'consensus_start' }
  | { event: 'consensus_done'; message: Message }
  | { event: 'prd_check_done'; message: Message }
  | { event: 'error'; error: string }
  | { event: 'complete'; sessionStatus: SessionStatus };
```

### 3.4 各步骤 LLM 调用策略

#### Step 1: 表态（runOpinions）

```typescript
async *runOpinions(sessionId: string): AsyncGenerator<NegotiationEvent> {
  const session = await this.db.getSession(sessionId);
  const roles = await this.getRoles(session.participantIds);

  for (const role of roles) {
    yield { event: 'role_thinking', roleId: role.id, roleName: role.name, step: 'opinion' };

    const systemPrompt = this.roleEngine.buildSystemPrompt(role, session.phase);
    const userMessage = this.buildOpinionPrompt(session.topic, session.description);
    const response = await this.llm.complete(systemPrompt, [{ role: 'user', content: userMessage }]);

    const message = await this.saveMessage({
      sessionId, roleId: role.id, type: 'opinion',
      content: response, phase: session.phase,
    });
    yield { event: 'role_done', message };
  }

  yield { event: 'complete', sessionStatus: 'opinions_done' };
}
```

#### Step 2: 冲突分析（runAnalysis）

```typescript
async *runAnalysis(sessionId: string): AsyncGenerator<NegotiationEvent> {
  yield { event: 'analysis_start' };

  const messages = await this.db.getMessages(sessionId);
  const opinions = messages.filter(m => m.type === 'opinion');
  const roles = await this.getRolesForSession(sessionId);

  const systemPrompt = ANALYSIS_SYSTEM_PROMPT;
  const userMessage = this.buildAnalysisPrompt(opinions, roles);

  // 要求返回结构化 JSON
  const response = await this.llm.completeJson<ConflictAnalysis>(systemPrompt, [
    { role: 'user', content: userMessage },
  ]);

  const message = await this.saveMessage({
    sessionId, roleId: null, type: 'analysis',
    content: JSON.stringify(response), phase: session.phase,
  });
  yield { event: 'analysis_done', message };
  yield { event: 'complete', sessionStatus: 'analysis_done' };
}
```

冲突分析输出结构：

```typescript
interface ConflictAnalysis {
  summary: string;              // 讨论概述
  conflicts: {
    id: string;
    core: string;               // 冲突核心
    involvedRoles: string[];    // 涉及角色 ID
    positions: {                // 各方立场
      roleId: string;
      position: string;
    }[];
    rootCause: string;          // 冲突根源
    severity: 'high' | 'medium' | 'low';
  }[];
  focusQuestions: string[];     // 需要进一步辩论的焦点问题（1-2个）
}
```

#### Step 3: 辩论回应（runDebate）

```typescript
async *runDebate(
  sessionId: string,
  moderatorPrompt?: string
): AsyncGenerator<NegotiationEvent> {
  const allMessages = await this.db.getMessages(sessionId);
  const roles = await this.getRolesForSession(sessionId);
  const context = this.buildDebateContext(allMessages, moderatorPrompt);

  for (const role of roles) {
    yield { event: 'role_thinking', roleId: role.id, roleName: role.name, step: 'debate' };

    const systemPrompt = this.roleEngine.buildSystemPrompt(role, session.phase);
    const messages = [
      { role: 'user', content: context },
      // 注入角色视角的辩论引导
      { role: 'user', content: this.buildDebateRolePrompt(role, allMessages, moderatorPrompt) },
    ];
    const response = await this.llm.complete(systemPrompt, messages);

    const message = await this.saveMessage({
      sessionId, roleId: role.id, type: 'rebuttal',
      content: response, phase: session.phase,
    });
    yield { event: 'role_done', message };
  }

  yield { event: 'complete', sessionStatus: 'debate_done' };
}
```

#### Step 4: 共识生成（runConsensus）

共识模板根据阶段不同：

```typescript
// server/llm/templates/consensus.ts

export const CONSENSUS_TEMPLATES = {
  design: {
    outputFormat: `
请生成以下结构的共识方案（JSON）：
{
  "conclusion": "设计结论（具体的设计决策）",
  "compromises": [
    { "roleId": "...", "roleName": "...", "compromise": "该角色做出的妥协" }
  ],
  "constraints": ["设计约束条件1", "设计约束条件2"],
  "prdSuggestions": [
    { "type": "add|modify|delete", "section": "所属PRD章节", "content": "具体修改内容", "reason": "修改理由" }
  ],
  "acceptanceCriteria": ["验收标准1", "验收标准2"],
  "unresolvedIssues": ["遗留问题1（如有）"]
}`,
  },
  acceptance: {
    outputFormat: `
请生成以下结构的验收评审结论（JSON）：
{
  "verdict": "pass|conditional_pass|fail",
  "metItems": ["达标项1", "达标项2"],
  "deviations": [
    { "item": "偏差项", "severity": "high|medium|low", "description": "偏差描述" }
  ],
  "improvements": [
    { "item": "改进项", "priority": "high|medium|low", "assignee": "建议负责人" }
  ],
  "discoveries": ["新发现1"],
  "roleAdjustments": [
    { "roleId": "...", "suggestion": "角色档案调整建议" }
  ]
}`,
  },
  operations: {
    outputFormat: `
请生成以下结构的运营优化方案（JSON）：
{
  "insights": ["数据洞察1", "数据洞察2"],
  "optimizations": [
    { "item": "优化方案", "priority": "high|medium|low", "expectedImpact": "预期效果" }
  ],
  "parameterChanges": [
    { "parameter": "参数名", "currentValue": "当前值", "suggestedValue": "建议值", "reason": "理由" }
  ],
  "roleEvolution": [
    { "roleId": "...", "suggestion": "角色演化建议" }
  ],
  "newTopics": ["新设计议题1"]
}`,
  },
};
```

### 3.5 上下文窗口管理

```typescript
// server/services/context-manager.ts

export class ContextManager {
  private readonly MAX_CONTEXT_CHARS = 30000; // 约 8000 tokens
  private readonly KEEP_RECENT_ROUNDS = 2;

  /**
   * 构建辩论上下文：
   * 1. 始终保留：原始议题 + 所有角色的首轮表态 + 最新共识（如有）
   * 2. 完整保留：最近 N 轮的所有消息
   * 3. 压缩历史：更早的消息用摘要替代
   */
  buildContext(messages: Message[], roles: Role[]): string;

  /** 用 LLM 生成历史消息摘要 */
  private async summarizeHistory(messages: Message[]): Promise<string>;
}
```

---

## 四、文档引擎（Document Engine）详细设计

### 4.1 模块职责

文档引擎负责项目文档的读取、解析、AI 预筛、议题提取和共识回写。

### 4.2 文档解析流程

```typescript
// server/services/document-engine.ts

export class DocumentEngine {
  private readonly projectDocsPath: string;

  /** 扫描项目文档目录，返回可用文档列表 */
  async listDocuments(): Promise<DocumentInfo[]>;

  /** 解析单个文档为章节列表 */
  async parseDocument(filename: string): Promise<Section[]>;

  /** AI 预筛：评估章节的多角色讨论价值 */
  async screenSections(
    filename: string,
    sections: Section[],
    roles: Role[]
  ): Promise<ScreenedSection[]>;

  /** 议题提取：从选中的高价值章节中提取协商议题 */
  async extractTopics(
    filename: string,
    sections: ScreenedSection[],
    roles: Role[]
  ): Promise<Topic[]>;

  /** 共识回写检查：分析共识是否解决了冲突，生成 PRD 修改条目 */
  async checkAndGeneratePrdUpdate(
    sessionId: string,
    consensus: ConsensusResult,
    originalSection: string
  ): Promise<PrdUpdateResult>;
}
```

### 4.3 Markdown 解析器

```typescript
// server/utils/markdown-parser.ts

export interface ParseOptions {
  minSectionChars?: number;  // 最小章节字符数，默认 30
  maxDepth?: number;         // 最大标题深度，默认 3（###）
}

export function parseMarkdownSections(content: string, options?: ParseOptions): Section[] {
  // 实现逻辑：
  // 1. 按行遍历，识别标题行（# / ## / ###）
  // 2. 跳过代码块内的 # 符号（追踪 ``` 状态）
  // 3. 收集每个标题下的正文内容
  // 4. 过滤过短章节
  // 5. 返回结构化章节数组
}

/** 判断章节是否为纯代码（代码占比 > 80% 且文字 < 50字） */
export function isCodeOnlySection(content: string): boolean;

/** 提取章节的文本摘要（去除代码块，限制长度） */
export function extractSectionSummary(content: string, maxChars: number): string;
```

### 4.4 预筛 Prompt 设计

```typescript
// server/llm/templates/screening.ts

export function buildScreeningPrompt(sections: SectionSummary[], roles: Role[]): string {
  return `
你是一个产品设计评审专家。你需要评估以下 PRD 章节对于多角色协商讨论的价值。

当前参与角色：
${roles.map(r => `- ${r.name}（${r.title}）：关切 ${r.concerns.join('、')}`).join('\n')}

请为每个章节评分（1-10分），评分标准：
- 9-10分：章节内容涉及明显的角色利益冲突，多角色讨论价值极高
- 7-8分：章节涉及人机分工或操作流程设计，各角色可能有不同偏好
- 5-6分：章节涉及功能设计但角色差异不明显
- 3-4分：章节以技术实现为主，角色讨论价值有限
- 1-2分：章节与角色关切无关（如纯术语定义、版本历史等）

章节列表：
${sections.map((s, i) => `--- 章节 ${i} ---
标题: ${s.title}
摘要: ${s.summary}`).join('\n\n')}

请以 JSON 数组格式返回，每个元素包含：
- index: 章节编号
- score: 评分 (1-10)
- value: "high"(≥7) / "medium"(5-6) / "low"(≤4)
- reason: 一句话评估理由
- conflictHint: 预判的冲突方向（如有）
`;
}
```

### 4.5 议题提取 Prompt 设计

```typescript
// server/llm/templates/topic-extraction.ts

export function buildTopicExtractionPrompt(
  sections: ScreenedSection[],
  roles: Role[]
): string {
  return `
你是产品设计协商的议题策划专家。基于以下高价值 PRD 章节，提取 5-12 个具体的协商议题。

要求：
1. 每个议题必须是一个可以辩论的具体设计决策点（不能是模糊的方向性问题）
2. 每个议题至少涉及 2 个角色的利益冲突
3. 按冲突强度排序（最可能产生激烈讨论的排前面）
4. 议题标题要具体到场景

当前角色：
${roles.map(r => `- ${r.name}（${r.title}）- ID: ${r.id}`).join('\n')}

高价值章节内容：
${sections.map(s => `=== ${s.title} (评分: ${s.score}) ===\n${s.content}`).join('\n\n')}

请以 JSON 数组格式返回，每个议题包含：
- topic: 议题标题（具体、可辩论）
- description: 背景说明（包含需要讨论的核心决策点）
- involvedRoles: 涉及角色的 ID 数组
- expectedConflict: 预期冲突方向
- priority: "high" / "medium" / "low"
- prdSection: 所属的 PRD 章节标题
`;
}
```

### 4.6 共识回写逻辑

```typescript
// server/llm/templates/prd-update.ts

export function buildPrdCheckPrompt(
  consensus: ConsensusResult,
  originalSection: string,
  allMessages: Message[]
): string {
  return `
你是 PRD 质量审核员。请基于以下协商共识，判断是否仍存在未解决的实质性冲突，并生成 PRD 修改条目。

原始 PRD 章节内容：
${originalSection}

协商过程摘要：
${formatMessagesForReview(allMessages)}

最终共识：
${JSON.stringify(consensus)}

任务：
1. 首先判断：共识中是否仍有未解决的实质性冲突？
   - 如果有，指出具体的未解决点和建议的后续讨论方向
   - 如果没有，继续下一步

2. 生成 PRD 修改条目，包含：
   - type: "add"（新增内容）/ "modify"（修改已有内容）/ "delete"（删除内容）
   - section: 目标 PRD 章节
   - originalText: 原文内容（modify/delete 时需要）
   - newText: 新文本（add/modify 时需要）
   - reason: 修改理由（引用共识中的具体结论）

请以 JSON 格式返回：
{
  "hasUnresolvedConflicts": boolean,
  "unresolvedPoints": ["..."],
  "suggestedNextSteps": ["..."],
  "prdUpdates": [
    { "type": "add|modify|delete", "section": "...", "originalText": "...", "newText": "...", "reason": "..." }
  ]
}
`;
}
```

---

## 五、LLM 服务层详细设计

### 5.1 Claude 客户端

```typescript
// server/llm/claude-client.ts

import Anthropic from '@anthropic-ai/sdk';

export class ClaudeClient {
  private client: Anthropic;
  private config: ClaudeClientConfig;

  constructor(config: ClaudeClientConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.config = {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 1500,
      maxRetries: 2,
      retryDelayMs: 1000,
      ...config,
    };
  }

  /** 普通文本完成 */
  async complete(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    return this.callWithRetry(systemPrompt, messages);
  }

  /** JSON 结构化完成（自动解析和容错） */
  async completeJson<T>(systemPrompt: string, messages: ChatMessage[]): Promise<T> {
    const text = await this.callWithRetry(systemPrompt, messages);
    return robustJsonParse<T>(text);
  }

  private async callWithRetry(
    systemPrompt: string,
    messages: ChatMessage[],
    attempt = 0
  ): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
      return response.content[0].type === 'text' ? response.content[0].text : '';
    } catch (error) {
      if (attempt < this.config.maxRetries) {
        await sleep(this.config.retryDelayMs * (attempt + 1));
        return this.callWithRetry(systemPrompt, messages, attempt + 1);
      }
      throw error;
    }
  }
}
```

### 5.2 火山引擎备用通道

```typescript
// server/llm/volcengine-client.ts

/**
 * 火山引擎（Volcengine / 豆包 Doubao）作为备用 LLM 通道
 * 用于：低优先级任务（预筛）、成本优化、Claude API 不可用时的降级
 *
 * API 兼容 OpenAI 格式，使用 ARK endpoint
 */
export class VolcEngineClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;  // 如 'doubao-pro-256k' / 'doubao-lite-128k'

  constructor(config: VolcEngineConfig) {
    this.baseUrl = config.baseUrl || 'https://ark.cn-beijing.volces.com/api/v3';
    this.apiKey = config.apiKey;
    this.model = config.model || 'doubao-pro-256k';
  }

  async complete(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
      }),
    });
    const data = await response.json();
    return data.choices[0].message.content;
  }
}
```

### 5.3 LLM 路由策略

```typescript
// server/llm/llm-router.ts

export class LLMRouter {
  private claude: ClaudeClient;
  private volc: VolcEngineClient;

  /**
   * 路由策略：
   * - 角色扮演（表态、辩论）: 强制 Claude（角色扮演能力强）
   * - 冲突分析、共识生成: 优先 Claude，降级 VolcEngine
   * - 预筛评分: 优先 VolcEngine（成本低），降级 Claude
   * - 议题提取: 优先 Claude
   * - PRD 回写: 优先 Claude
   */
  async route(task: LLMTask, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const provider = this.selectProvider(task);
    try {
      return await provider.complete(systemPrompt, messages);
    } catch (error) {
      const fallback = this.getFallback(task, provider);
      if (fallback) return fallback.complete(systemPrompt, messages);
      throw error;
    }
  }
}

export type LLMTask =
  | 'role_opinion' | 'role_debate'
  | 'conflict_analysis' | 'consensus'
  | 'screening' | 'topic_extraction'
  | 'prd_update' | 'summarize';
```

---

## 六、演化引擎（Evolution Engine）详细设计

### 6.1 模块职责

演化引擎聚合查询角色变更、协商历史和系统统计数据，为仪表盘提供数据支持。

### 6.2 统计查询接口

```typescript
// server/services/evolution-engine.ts

export class EvolutionEngine {
  /** 总览统计 */
  async getStats(): Promise<{
    totalRoles: number;
    totalSessions: number;
    totalMessages: number;
    totalConsensus: number;
    sessionsByPhase: { design: number; acceptance: number; operations: number };
    consensusByPhase: { design: number; acceptance: number; operations: number };
  }>;

  /** 角色版本时间线 */
  async getRoleTimeline(roleId?: string): Promise<TimelineEvent[]>;

  /** 最近共识列表 */
  async getRecentConsensus(limit?: number): Promise<ConsensusListItem[]>;

  /** 会话生命周期概览 */
  async getSessionLifecycles(): Promise<SessionLifecycle[]>;

  /** 记录演化事件 */
  async logEvent(event: EvolutionEvent): Promise<void>;
}

interface TimelineEvent {
  date: string;
  type: 'role_created' | 'role_updated' | 'consensus_reached';
  entityId: string;
  entityName: string;
  details: string;
}
```

---

## 七、前端模块详细设计

### 7.1 页面组件架构

```
App.tsx
├── Layout (顶部导航 + 侧边栏)
│
├── /sessions → SessionsPage
│   ├── SessionSidebar (会话列表 + 新建按钮)
│   ├── SessionView (消息流 + 操作栏)
│   │   ├── NegotiationFlow (四步流程按钮 + 状态指示)
│   │   ├── MessageList
│   │   │   └── MessageBubble (角色头像 + 内容 + 类型标签)
│   │   └── ModeratorInput (引导问题输入)
│   └── NewSessionModal
│
├── /prd → PRDDecomposerPage
│   ├── StepIndicator (① ② ③ 进度条)
│   ├── Step1: DocSelector (文档列表 + 手动粘贴)
│   ├── Step2: SectionScreener (AI评分结果 + 选择操作)
│   └── Step3: TopicConfirm (议题列表 + 勾选 + 批量创建)
│
├── /roles → RolesPage
│   ├── RoleGrid (角色卡片网格)
│   ├── RoleEditor (创建/编辑表单)
│   └── RoleVersionHistory (版本时间线)
│
└── /evolution → EvolutionPage
    ├── StatsCards (统计卡片)
    ├── PhaseChart (三阶段柱状图)
    ├── RecentConsensus (最近共识列表)
    └── RoleTimeline (角色演化时间线)
```

### 7.2 Zustand Store 详细设计

```typescript
// src/stores/session-store.ts

interface SessionStore {
  // 数据
  sessions: Session[];
  activeSessionId: string | null;
  messages: Record<string, Message[]>; // sessionId → messages

  // 加载状态
  loading: boolean;
  negotiationLoading: boolean;
  negotiationStep: string | null; // 当前执行的步骤名
  thinkingRole: string | null;    // 当前正在思考的角色名

  // CRUD
  fetchSessions: () => Promise<void>;
  createSession: (data: SessionInput) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  fetchMessages: (sessionId: string) => Promise<void>;

  // 协商流程（内部消费 SSE 并实时更新 messages）
  runOpinions: (sessionId: string) => Promise<void>;
  runAnalysis: (sessionId: string) => Promise<void>;
  runDebate: (sessionId: string, moderatorPrompt?: string) => Promise<void>;
  runConsensus: (sessionId: string) => Promise<void>;
  runPrdCheck: (sessionId: string) => Promise<void>;
}
```

### 7.3 SSE 消费封装

```typescript
// src/api/sse-client.ts

export async function consumeSSE<T>(
  url: string,
  options: RequestInit,
  handlers: {
    onEvent: (event: T) => void;
    onError?: (error: Error) => void;
    onComplete?: () => void;
  }
): Promise<void> {
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, 'Accept': 'text/event-stream' },
  });

  if (!response.ok) throw new Error(`SSE request failed: ${response.status}`);
  if (!response.body) throw new Error('No response body');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as T;
            handlers.onEvent(event);
          } catch { /* 忽略非 JSON 行 */ }
        }
      }
    }
  } finally {
    reader.releaseLock();
    handlers.onComplete?.();
  }
}
```

### 7.4 关键 UI 组件设计

**MessageBubble 组件：**

```typescript
// src/components/session/MessageBubble.tsx

interface MessageBubbleProps {
  message: Message;
  role?: Role; // message.roleId 为 null 时是协商引擎消息
}

// 消息类型 → 左边框颜色映射
const TYPE_COLORS: Record<MessageType, string> = {
  opinion: 'border-l-blue-500',
  analysis: 'border-l-purple-500',
  rebuttal: 'border-l-amber-500',
  consensus: 'border-l-green-500',
  prd_update: 'border-l-emerald-500',
};

// 消息类型 → 标签映射
const TYPE_LABELS: Record<MessageType, string> = {
  opinion: '立场表态',
  analysis: '冲突分析',
  rebuttal: '辩论回应',
  consensus: '共识方案',
  prd_update: 'PRD更新',
};
```

**NegotiationFlow 组件：**

```typescript
// src/components/session/NegotiationFlow.tsx

// 流程步骤定义
const STEPS = [
  { key: 'opinions', label: '启动表态', icon: '▶', action: 'runOpinions' },
  { key: 'analysis', label: '分析冲突', icon: '🔍', action: 'runAnalysis' },
  { key: 'debate', label: '辩论回应', icon: '💬', action: 'runDebate' },
  { key: 'consensus', label: '寻求共识', icon: '🤝', action: 'runConsensus' },
];

// 基于 session.status 计算哪些按钮可用
function getAvailableActions(status: SessionStatus): string[];
```

---

## 八、数据库操作层详细设计

### 8.1 Repository 模式

```typescript
// server/db/repository.ts

export class Repository {
  constructor(private db: BetterSqlite3.Database) {
    this.init();
  }

  private init() {
    // 创建表、索引
    this.db.exec(SCHEMA_SQL);
    // 开启 WAL 模式提升并发读写性能
    this.db.pragma('journal_mode = WAL');
  }

  // --- 角色 ---
  getRoles(): Role[];
  getRoleById(id: string): Role | null;
  createRole(role: Role): Role;
  updateRole(id: string, data: Partial<Role>): Role;
  deleteRole(id: string): void;

  // --- 会话 ---
  getSessions(): Session[];
  getSessionById(id: string): Session | null;
  createSession(session: Session): Session;
  updateSession(id: string, data: Partial<Session>): Session;
  deleteSession(id: string): void;

  // --- 消息 ---
  getMessages(sessionId: string): Message[];
  createMessage(message: Message): Message;
  getMessagesByType(sessionId: string, type: MessageType): Message[];

  // --- 演化 ---
  logEvolution(event: EvolutionEvent): void;
  getEvolutionStats(): EvolutionStats;
  getEvolutionTimeline(limit?: number): TimelineEvent[];

  // --- 文档缓存 ---
  getDocumentCache(fileHash: string): ScreenedSection[] | null;
  setDocumentCache(filePath: string, fileHash: string, sections: ScreenedSection[]): void;
}
```

### 8.2 JSON 字段序列化策略

SQLite 不支持数组类型，所有数组字段存储为 JSON 字符串：

```typescript
// server/db/serializers.ts

export function serializeRole(role: Role): Record<string, any> {
  return {
    ...role,
    responsibilities: JSON.stringify(role.responsibilities),
    decision_powers: JSON.stringify(role.decisionPowers),
    expertise: JSON.stringify(role.expertise),
    personality: JSON.stringify(role.personality),
    concerns: JSON.stringify(role.concerns),
    history: JSON.stringify(role.history),
    participant_ids: undefined, // roles 表不需要
  };
}

export function deserializeRole(row: any): Role {
  return {
    ...row,
    responsibilities: JSON.parse(row.responsibilities),
    decisionPowers: JSON.parse(row.decision_powers),
    expertise: JSON.parse(row.expertise),
    personality: JSON.parse(row.personality),
    concerns: JSON.parse(row.concerns),
    history: JSON.parse(row.history),
  };
}
```
