# CrowdDev 众开协商引擎 — 测试策略与用例文档

**版本：** v1.0  
**日期：** 2026年3月  
**范围：** MVP Phase 1 测试策略、单元测试、集成测试、E2E 测试

---

## 一、测试策略总览

### 1.1 测试金字塔

```
              ┌─────────┐
              │  E2E    │  ← 5个：完整协商流程、PRD拆解流程
              │ (少量)   │
            ┌─┴─────────┴─┐
            │  Integration │  ← 15个：API端到端、SSE流、LLM集成
            │  (适量)       │
          ┌─┴─────────────┴─┐
          │   Unit Tests     │  ← 60+个：各引擎、工具函数、解析器
          │   (大量)          │
          └──────────────────┘
```

### 1.2 测试工具链

| 工具 | 用途 |
|------|------|
| Vitest | 单元测试 + 集成测试运行器 |
| Playwright | E2E 测试（浏览器自动化） |
| msw (Mock Service Worker) | HTTP 请求 Mock（前端测试） |
| supertest | 后端 API 测试 |
| better-sqlite3 (内存模式) | 测试用数据库 |

### 1.3 测试环境配置

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/services/**', 'server/llm/**', 'server/utils/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
    // 分组运行
    sequence: { shuffle: true },
  },
});
```

### 1.4 Mock 策略

```typescript
// tests/mocks/llm-mock.ts

/**
 * LLM Mock 策略：
 * 1. 单元测试：完全 Mock，返回预设 JSON
 * 2. 集成测试：Mock LLM 但真实数据库
 * 3. E2E 测试：可选真实 LLM（需 API Key）或 Mock
 */
export class MockClaudeClient {
  private responses: Map<string, string> = new Map();

  /** 预设某个 prompt 关键词对应的回复 */
  setResponse(promptKeyword: string, response: string) {
    this.responses.set(promptKeyword, response);
  }

  async complete(systemPrompt: string, messages: ChatMessage[]): Promise<string> {
    const fullText = systemPrompt + messages.map(m => m.content).join('');
    for (const [keyword, response] of this.responses) {
      if (fullText.includes(keyword)) return response;
    }
    return '默认回复：这是一个测试响应。';
  }

  async completeJson<T>(systemPrompt: string, messages: ChatMessage[]): Promise<T> {
    const text = await this.complete(systemPrompt, messages);
    return JSON.parse(text);
  }
}
```

---

## 二、单元测试用例

### 2.1 角色引擎测试

```typescript
// tests/unit/role-engine.test.ts

describe('RoleEngine', () => {
  let engine: RoleEngine;
  let db: Repository;

  beforeEach(() => {
    db = new Repository(new Database(':memory:'));
    engine = new RoleEngine(db);
  });

  describe('创建角色', () => {
    test('RE-01: 创建角色应返回完整角色对象，版本为 1.0.0', async () => {
      const input = createMockRoleInput({ name: '测试角色' });
      const role = await engine.create(input);
      expect(role.id).toBeDefined();
      expect(role.name).toBe('测试角色');
      expect(role.version).toBe('1.0.0');
      expect(role.history).toHaveLength(1);
      expect(role.history[0].version).toBe('1.0.0');
    });

    test('创建角色应自动生成 UUID', async () => {
      const role1 = await engine.create(createMockRoleInput());
      const role2 = await engine.create(createMockRoleInput());
      expect(role1.id).not.toBe(role2.id);
    });

    test('缺少必填字段时应抛出验证错误', async () => {
      await expect(engine.create({ name: '' } as any)).rejects.toThrow();
    });
  });

  describe('更新角色与版本管理', () => {
    test('RE-02: 修改普通字段应升 PATCH 版本', async () => {
      const role = await engine.create(createMockRoleInput());
      const updated = await engine.update(role.id, { name: '新名字' });
      expect(updated.version).toBe('1.0.1');
      expect(updated.history).toHaveLength(2);
    });

    test('修改关键字段（concerns）应升 MINOR 版本', async () => {
      const role = await engine.create(createMockRoleInput());
      const updated = await engine.update(role.id, {
        concerns: ['新的关切点'],
      });
      expect(updated.version).toBe('1.1.0');
    });

    test('修改关键字段（personality）应升 MINOR 版本', async () => {
      const role = await engine.create(createMockRoleInput());
      const updated = await engine.update(role.id, {
        personality: ['新的性格特征'],
      });
      expect(updated.version).toBe('1.1.0');
    });

    test('连续修改应正确递增版本', async () => {
      const role = await engine.create(createMockRoleInput());
      await engine.update(role.id, { name: 'v1' });        // 1.0.1
      await engine.update(role.id, { name: 'v2' });        // 1.0.2
      const final = await engine.update(role.id, { concerns: ['x'] }); // 1.1.0
      expect(final.version).toBe('1.1.0');
    });

    test('版本历史应记录变更字段', async () => {
      const role = await engine.create(createMockRoleInput());
      const updated = await engine.update(role.id, { name: '新名', concerns: ['新关切'] });
      const latest = updated.history[updated.history.length - 1];
      expect(latest.changedFields).toContain('name');
      expect(latest.changedFields).toContain('concerns');
    });
  });

  describe('删除角色', () => {
    test('RE-03: 删除角色后列表中不再显示', async () => {
      const role = await engine.create(createMockRoleInput());
      await engine.delete(role.id);
      const roles = await engine.list();
      expect(roles.find(r => r.id === role.id)).toBeUndefined();
    });

    test('删除不存在的角色应抛出错误', async () => {
      await expect(engine.delete('non-existent')).rejects.toThrow();
    });
  });

  describe('System Prompt 构建', () => {
    test('RE-05: 生成的 prompt 应包含所有角色字段', () => {
      const role = createMockRole({
        name: '李Sir',
        title: '调度员',
        concerns: ['效率', '响应速度'],
      });
      const prompt = engine.buildSystemPrompt(role, 'design');
      expect(prompt).toContain('李Sir');
      expect(prompt).toContain('调度员');
      expect(prompt).toContain('效率');
      expect(prompt).toContain('响应速度');
    });

    test('RE-06: 不同阶段应生成不同引导语', () => {
      const role = createMockRole();
      const designPrompt = engine.buildSystemPrompt(role, 'design');
      const acceptPrompt = engine.buildSystemPrompt(role, 'acceptance');
      const opsPrompt = engine.buildSystemPrompt(role, 'operations');

      expect(designPrompt).toContain('应该怎么做');
      expect(acceptPrompt).toContain('做出来的对不对');
      expect(opsPrompt).toContain('怎么让它更好');
    });

    test('RE-07: prompt 应包含字数限制约束', () => {
      const role = createMockRole();
      const prompt = engine.buildSystemPrompt(role, 'design');
      expect(prompt).toContain('200');
    });
  });
});
```

### 2.2 协商引擎测试

```typescript
// tests/unit/negotiation-engine.test.ts

describe('NegotiationEngine', () => {
  let engine: NegotiationEngine;
  let mockLLM: MockClaudeClient;
  let db: Repository;

  beforeEach(() => {
    db = new Repository(new Database(':memory:'));
    mockLLM = new MockClaudeClient();
    engine = new NegotiationEngine(db, new RoleEngine(db), mockLLM);
    // 预创建测试角色
    seedTestRoles(db);
  });

  describe('会话管理', () => {
    test('NE-01: 创建会话应设置初始状态为 created', async () => {
      const session = await engine.createSession({
        topic: '测试议题',
        description: '测试描述',
        phase: 'design',
        participantIds: ['role_1', 'role_2'],
      });
      expect(session.status).toBe('created');
      expect(session.participantIds).toHaveLength(2);
    });

    test('NE-04: 状态流转应符合有限状态机规则', async () => {
      const session = await engine.createSession(createMockSessionInput());
      // created → opinions_running 合法
      expect(() => engine.validateTransition('created', 'opinions_running')).not.toThrow();
      // created → consensus_running 不合法
      expect(() => engine.validateTransition('created', 'consensus_running')).toThrow();
    });

    test('不允许跳过表态直接分析', () => {
      expect(() => engine.validateTransition('created', 'analysis_running')).toThrow();
    });
  });

  describe('表态流程', () => {
    test('NE-05/NE-06: 每个参与角色应独立发言', async () => {
      mockLLM.setResponse('调度员', '从调度员角度，我认为...');
      mockLLM.setResponse('末端用户', '作为一线人员，我觉得...');

      const session = await engine.createSession({
        topic: '测试',
        description: '',
        phase: 'design',
        participantIds: ['role_1', 'role_2'],
      });

      const events: NegotiationEvent[] = [];
      for await (const event of engine.runOpinions(session.id)) {
        events.push(event);
      }

      const roleThinkingEvents = events.filter(e => e.event === 'role_thinking');
      const roleDoneEvents = events.filter(e => e.event === 'role_done');
      expect(roleThinkingEvents).toHaveLength(2);
      expect(roleDoneEvents).toHaveLength(2);
    });

    test('表态完成后状态应为 opinions_done', async () => {
      const session = await engine.createSession(createMockSessionInput());
      for await (const _ of engine.runOpinions(session.id)) {}
      const updated = await db.getSessionById(session.id);
      expect(updated!.status).toBe('opinions_done');
    });
  });

  describe('冲突分析', () => {
    test('NE-08/NE-09: 分析应输出结构化冲突数据', async () => {
      mockLLM.setResponse('分析', JSON.stringify({
        summary: '存在操作效率与审计合规的冲突',
        conflicts: [{
          id: 'c1',
          core: '一键操作 vs 审计日志',
          involvedRoles: ['role_1', 'role_3'],
          positions: [
            { roleId: 'role_1', position: '要求一键操作' },
            { roleId: 'role_3', position: '要求审计记录' },
          ],
          rootCause: '效率与合规的根本张力',
          severity: 'high',
        }],
        focusQuestions: ['如何在不影响操作速度的前提下完成审计记录？'],
      }));

      const session = await setupSessionWithOpinions(engine, db);
      const events: NegotiationEvent[] = [];
      for await (const event of engine.runAnalysis(session.id)) {
        events.push(event);
      }

      const analysisDone = events.find(e => e.event === 'analysis_done');
      expect(analysisDone).toBeDefined();
      const analysis = JSON.parse((analysisDone as any).message.content);
      expect(analysis.conflicts).toHaveLength(1);
      expect(analysis.focusQuestions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('辩论回应', () => {
    test('NE-13: 带引导问题的辩论应将问题传入 prompt', async () => {
      const session = await setupSessionWithAnalysis(engine, db);
      const callSpy = vi.spyOn(mockLLM, 'complete');

      for await (const _ of engine.runDebate(session.id, '请重点讨论审计日志的性能影响')) {}

      const calls = callSpy.mock.calls;
      const hasGuidance = calls.some(([_, msgs]) =>
        msgs.some(m => m.content.includes('审计日志的性能影响'))
      );
      expect(hasGuidance).toBe(true);
    });

    test('NE-12: 辩论可进行多轮', async () => {
      const session = await setupSessionWithAnalysis(engine, db);

      // 第一轮辩论
      for await (const _ of engine.runDebate(session.id)) {}
      let messages = await db.getMessages(session.id);
      const round1Rebuttals = messages.filter(m => m.type === 'rebuttal');

      // 第二轮辩论
      for await (const _ of engine.runDebate(session.id)) {}
      messages = await db.getMessages(session.id);
      const allRebuttals = messages.filter(m => m.type === 'rebuttal');

      expect(allRebuttals.length).toBe(round1Rebuttals.length * 2);
    });
  });

  describe('共识生成', () => {
    test('NE-15/NE-16: 共识应使用阶段对应的模板', async () => {
      const callSpy = vi.spyOn(mockLLM, 'complete');
      mockLLM.setResponse('共识', JSON.stringify({
        conclusion: '采用一键确认+后台审计日志方案',
        compromises: [],
        constraints: [],
        prdSuggestions: [],
        acceptanceCriteria: [],
        unresolvedIssues: [],
      }));

      // 设计期会话
      const designSession = await setupFullDebate(engine, db, 'design');
      for await (const _ of engine.runConsensus(designSession.id)) {}

      const designCall = callSpy.mock.calls.find(([prompt]) =>
        prompt.includes('设计结论')
      );
      expect(designCall).toBeDefined();
    });
  });
});
```

### 2.3 文档引擎测试

```typescript
// tests/unit/document-engine.test.ts

describe('DocumentEngine', () => {
  describe('Markdown 解析', () => {
    test('DE-02: 按标题层级正确拆分章节', () => {
      const md = `# 标题一
内容一

## 标题二
内容二

### 标题三
内容三`;

      const sections = parseMarkdownSections(md);
      expect(sections).toHaveLength(3);
      expect(sections[0].title).toBe('标题一');
      expect(sections[1].title).toBe('标题二');
      expect(sections[2].title).toBe('标题三');
    });

    test('代码块内的 # 不应被当作标题分割符', () => {
      const md = `# 真正的标题

\`\`\`python
# 这是注释不是标题
def foo():
    pass
\`\`\`

## 第二个标题
内容`;

      const sections = parseMarkdownSections(md);
      expect(sections).toHaveLength(2);
      expect(sections[0].title).toBe('真正的标题');
    });

    test('过短章节应被过滤', () => {
      const md = `# 正常章节
这是一段足够长的内容，超过最小字符数限制。

# 短
x

# 另一个正常章节
这也是一段足够长的内容。`;

      const sections = parseMarkdownSections(md, { minSectionChars: 10 });
      expect(sections).toHaveLength(2);
    });

    test('纯代码章节应被标记', () => {
      const content = `\`\`\`typescript
const x = 1;
const y = 2;
const z = x + y;
console.log(z);
\`\`\``;
      expect(isCodeOnlySection(content)).toBe(true);
    });
  });

  describe('AI 预筛', () => {
    test('DE-04/DE-05: 预筛结果应包含评分和价值等级', async () => {
      const mockLLM = new MockClaudeClient();
      mockLLM.setResponse('评估', JSON.stringify([
        { index: 0, score: 9, value: 'high', reason: '涉及人机分工', conflictHint: '调度员vs管理员' },
        { index: 1, score: 3, value: 'low', reason: '纯技术定义', conflictHint: '' },
      ]));

      const engine = new DocumentEngine(mockLLM, '/tmp/docs', db);
      const sections = [
        { index: 0, title: '人机协同设计', content: '...', charCount: 500 },
        { index: 1, title: '术语定义', content: '...', charCount: 200 },
      ];

      const result = await engine.screenSections('test.md', sections, mockRoles);
      expect(result).toHaveLength(2);
      expect(result[0].score).toBe(9);
      expect(result[0].value).toBe('high');
      expect(result[1].value).toBe('low');
    });

    test('DE-06: 结果应按分数降序排列', async () => {
      // ... 设置 mock 返回乱序数据
      const result = await engine.screenSections('test.md', sections, mockRoles);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });

    test('纯代码章节应直接标记为低价值（不调用 LLM）', async () => {
      const callSpy = vi.spyOn(mockLLM, 'completeJson');
      const sections = [
        { index: 0, title: '代码示例', content: '```ts\nconst x = 1;\n```', charCount: 30 },
      ];
      const result = await engine.screenSections('test.md', sections, mockRoles);
      expect(result[0].score).toBeLessThanOrEqual(2);
      // LLM 不应被调用（预过滤掉了）
      expect(callSpy).not.toHaveBeenCalled();
    });
  });

  describe('议题提取', () => {
    test('DE-09: 应从高价值章节提取 5-12 个议题', async () => {
      mockLLM.setResponse('提取', JSON.stringify(
        Array.from({ length: 8 }, (_, i) => ({
          topic: `议题${i + 1}`,
          description: `描述${i + 1}`,
          involvedRoles: ['role_1', 'role_2'],
          expectedConflict: '冲突方向',
          priority: i < 3 ? 'high' : 'medium',
          prdSection: '章节X',
        }))
      ));

      const topics = await engine.extractTopics('test.md', highValueSections, mockRoles);
      expect(topics.length).toBeGreaterThanOrEqual(5);
      expect(topics.length).toBeLessThanOrEqual(12);
    });

    test('DE-10: 每个议题应包含所有必需字段', async () => {
      // ...
      const topics = await engine.extractTopics('test.md', sections, mockRoles);
      for (const topic of topics) {
        expect(topic.topic).toBeTruthy();
        expect(topic.description).toBeTruthy();
        expect(topic.involvedRoles.length).toBeGreaterThanOrEqual(2);
        expect(['high', 'medium', 'low']).toContain(topic.priority);
        expect(topic.prdSection).toBeTruthy();
      }
    });

    test('DE-11: 议题应按冲突强度排序', async () => {
      // ... priority 顺序应为 high → medium → low
      const topics = await engine.extractTopics('test.md', sections, mockRoles);
      const priorities = topics.map(t => t.priority);
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < priorities.length; i++) {
        expect(priorityOrder[priorities[i - 1]]).toBeLessThanOrEqual(priorityOrder[priorities[i]]);
      }
    });
  });
});
```

### 2.4 JSON 解析器测试

```typescript
// tests/unit/json-parser.test.ts

describe('robustJsonParse', () => {
  test('正常 JSON 直接解析', () => {
    const result = robustJsonParse('[{"a":1}]');
    expect(result).toEqual([{ a: 1 }]);
  });

  test('去除 markdown 代码块标记', () => {
    const input = '```json\n[{"a":1}]\n```';
    expect(robustJsonParse(input)).toEqual([{ a: 1 }]);
  });

  test('提取被其他文本包围的 JSON 数组', () => {
    const input = '这是结果:\n[{"a":1}]\n以上是分析。';
    expect(robustJsonParse(input)).toEqual([{ a: 1 }]);
  });

  test('修复尾逗号', () => {
    const input = '[{"a":1},{"b":2},]';
    expect(robustJsonParse(input)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  test('修复未转义的换行', () => {
    const input = '{"text":"第一行\n第二行"}';
    const result = robustJsonParse(input);
    expect(result.text).toContain('第一行');
  });

  test('逐个提取 JSON 对象并组装为数组', () => {
    const input = `
分析结果：
{"index": 0, "score": 8}
然后是第二个：
{"index": 1, "score": 5}
`;
    const result = robustJsonParse(input);
    expect(result).toHaveLength(2);
  });

  test('完全无法解析时抛出错误', () => {
    expect(() => robustJsonParse('这不是JSON')).toThrow();
  });
});
```

### 2.5 版本工具测试

```typescript
// tests/unit/version.test.ts

describe('Version Utils', () => {
  test('bumpPatch: 1.0.0 → 1.0.1', () => {
    expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
  });

  test('bumpMinor: 1.0.3 → 1.1.0', () => {
    expect(bumpVersion('1.0.3', 'minor')).toBe('1.1.0');
  });

  test('bumpMajor: 1.2.3 → 2.0.0', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  test('detectBumpType 应根据字段分级判断', () => {
    expect(detectBumpType(['name'])).toBe('patch');
    expect(detectBumpType(['concerns'])).toBe('minor');
    expect(detectBumpType(['name', 'concerns'])).toBe('minor'); // 取最高级
  });
});
```

---

## 三、集成测试用例

### 3.1 API 集成测试

```typescript
// tests/integration/api-roles.test.ts

describe('Roles API', () => {
  let app: Express;
  let db: Repository;

  beforeEach(() => {
    db = new Repository(new Database(':memory:'));
    app = createApp(db);
  });

  test('POST /api/roles → 创建角色并返回 201', async () => {
    const res = await request(app)
      .post('/api/roles')
      .send({ name: '测试', title: '测试员', organization: '测试组', avatar: '🧪',
        responsibilities: ['测试'], decisionPowers: ['决策'], expertise: ['专业'],
        personality: ['认真'], concerns: ['质量'] })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.version).toBe('1.0.0');
  });

  test('PUT /api/roles/:id → 更新角色并自动升版', async () => {
    const created = await createRoleViaApi(app);
    const res = await request(app)
      .put(`/api/roles/${created.id}`)
      .send({ concerns: ['新关切'] })
      .expect(200);

    expect(res.body.version).toBe('1.1.0');
  });

  test('DELETE /api/roles/:id → 删除角色', async () => {
    const created = await createRoleViaApi(app);
    await request(app).delete(`/api/roles/${created.id}`).expect(204);
    await request(app).get(`/api/roles/${created.id}`).expect(404);
  });

  test('输入校验：缺少必填字段返回 400', async () => {
    await request(app).post('/api/roles').send({ name: '' }).expect(400);
  });
});
```

### 3.2 协商 API SSE 集成测试

```typescript
// tests/integration/api-negotiation.test.ts

describe('Negotiation API (SSE)', () => {
  let app: Express;
  let mockLLM: MockClaudeClient;

  beforeEach(() => {
    const db = new Repository(new Database(':memory:'));
    mockLLM = new MockClaudeClient();
    app = createApp(db, mockLLM);
    seedTestRoles(db);
  });

  test('POST /api/negotiation/:id/opinions → SSE 推送角色表态', async () => {
    mockLLM.setResponse('', '这是我的观点。');
    const session = await createSessionViaApi(app);

    const events = await collectSSEEvents(
      app, 'POST', `/api/negotiation/${session.id}/opinions`
    );

    const thinkingEvents = events.filter(e => e.event === 'role_thinking');
    const doneEvents = events.filter(e => e.event === 'role_done');
    const completeEvent = events.find(e => e.event === 'complete');

    expect(thinkingEvents.length).toBeGreaterThanOrEqual(2);
    expect(doneEvents.length).toBe(thinkingEvents.length);
    expect(completeEvent?.sessionStatus).toBe('opinions_done');
  });

  test('完整四步协商流程', async () => {
    mockLLM.setResponse('', '角色回复');
    mockLLM.setResponse('分析', JSON.stringify({
      summary: '有冲突', conflicts: [], focusQuestions: ['问题1'],
    }));
    mockLLM.setResponse('共识', JSON.stringify({
      conclusion: '达成共识', compromises: [], constraints: [],
      prdSuggestions: [], acceptanceCriteria: [], unresolvedIssues: [],
    }));

    const session = await createSessionViaApi(app);

    // Step 1: 表态
    await collectSSEEvents(app, 'POST', `/api/negotiation/${session.id}/opinions`);
    // Step 2: 分析
    await collectSSEEvents(app, 'POST', `/api/negotiation/${session.id}/analysis`);
    // Step 3: 辩论
    await collectSSEEvents(app, 'POST', `/api/negotiation/${session.id}/debate`);
    // Step 4: 共识
    const consensusEvents = await collectSSEEvents(
      app, 'POST', `/api/negotiation/${session.id}/consensus`
    );

    const complete = consensusEvents.find(e => e.event === 'complete');
    expect(complete?.sessionStatus).toBe('consensus_reached');
  });

  test('无效状态转移应返回 409', async () => {
    const session = await createSessionViaApi(app);
    // 直接跳到分析（没有先表态）应失败
    await request(app)
      .post(`/api/negotiation/${session.id}/analysis`)
      .expect(409);
  });
});

/** SSE 事件收集辅助函数 */
async function collectSSEEvents(app: Express, method: string, path: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const events: any[] = [];
    const req = request(app)[method.toLowerCase()](path)
      .set('Accept', 'text/event-stream')
      .buffer(true)
      .parse((res, callback) => {
        let data = '';
        res.on('data', chunk => { data += chunk.toString(); });
        res.on('end', () => {
          const lines = data.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try { events.push(JSON.parse(line.slice(6))); } catch {}
            }
          }
          callback(null, data);
        });
      });
    req.end(() => resolve(events));
  });
}
```

### 3.3 文档 API 集成测试

```typescript
// tests/integration/api-documents.test.ts

describe('Documents API', () => {
  let app: Express;
  const testDocsPath = '/tmp/test-docs';

  beforeEach(async () => {
    // 创建测试文档
    await fs.mkdir(testDocsPath, { recursive: true });
    await fs.writeFile(`${testDocsPath}/test.md`, `
# 第一章 系统概述
这是系统概述的内容。

## 1.1 背景
背景描述，足够长的文本用于测试。

# 第二章 功能设计
功能设计的详细内容，涉及人机分工和操作流程。

# 第三章 技术实现
\`\`\`typescript
const x = 1;
\`\`\`
`);
    const db = new Repository(new Database(':memory:'));
    app = createApp(db, new MockClaudeClient(), testDocsPath);
  });

  test('GET /api/documents → 列出项目文档', async () => {
    const res = await request(app).get('/api/documents').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].filename).toBe('test.md');
  });

  test('GET /api/documents/:filename/sections → 返回章节列表', async () => {
    const res = await request(app).get('/api/documents/test.md/sections').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  test('POST /api/documents/:filename/screen → AI 预筛返回评分', async () => {
    const res = await request(app)
      .post('/api/documents/test.md/screen')
      .expect(200);
    expect(res.body[0]).toHaveProperty('score');
    expect(res.body[0]).toHaveProperty('value');
  });
});
```

### 3.4 数据持久化集成测试

```typescript
// tests/integration/persistence.test.ts

describe('数据持久化', () => {
  const DB_PATH = '/tmp/test-crowddev.db';

  afterEach(() => { if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); });

  test('DA-01/DA-02: 数据在重新打开数据库后仍然存在', () => {
    // 第一次打开
    const db1 = new Repository(new Database(DB_PATH));
    const role = db1.createRole(createMockRole());
    db1.close();

    // 第二次打开
    const db2 = new Repository(new Database(DB_PATH));
    const found = db2.getRoleById(role.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe(role.name);
    db2.close();
  });

  test('删除会话应级联删除消息', () => {
    const db = new Repository(new Database(':memory:'));
    const session = db.createSession(createMockSession());
    db.createMessage(createMockMessage({ sessionId: session.id }));
    db.createMessage(createMockMessage({ sessionId: session.id }));

    db.deleteSession(session.id);

    const messages = db.getMessages(session.id);
    expect(messages).toHaveLength(0);
  });
});
```

---

## 四、E2E 测试用例

### 4.1 完整协商流程 E2E

```typescript
// tests/e2e/full-negotiation.test.ts

test('AC-02: 完成从表态→分析→辩论→共识的完整四步流程', async ({ page }) => {
  // 1. 创建角色（或使用预置角色）
  await page.goto('/roles');
  await expect(page.locator('[data-testid="role-card"]')).toHaveCount(3);

  // 2. 创建协商会话
  await page.goto('/sessions');
  await page.click('[data-testid="new-session-btn"]');
  await page.fill('[data-testid="topic-input"]', '视频追踪的一键操作 vs 审计合规');
  await page.fill('[data-testid="description-input"]', '讨论追踪功能是否需要二次确认');
  await page.click('[data-testid="phase-design"]');
  await page.click('[data-testid="role-select-role_1"]');
  await page.click('[data-testid="role-select-role_3"]');
  await page.click('[data-testid="create-session-btn"]');

  // 3. 执行四步流程
  // Step 1: 表态
  await page.click('[data-testid="btn-opinions"]');
  await expect(page.locator('[data-testid="message-opinion"]')).toHaveCount(2, { timeout: 60000 });

  // Step 2: 分析
  await page.click('[data-testid="btn-analysis"]');
  await expect(page.locator('[data-testid="message-analysis"]')).toHaveCount(1, { timeout: 30000 });

  // Step 3: 辩论
  await page.click('[data-testid="btn-debate"]');
  await expect(page.locator('[data-testid="message-rebuttal"]')).toHaveCount(2, { timeout: 60000 });

  // Step 4: 共识
  await page.click('[data-testid="btn-consensus"]');
  await expect(page.locator('[data-testid="message-consensus"]')).toHaveCount(1, { timeout: 30000 });

  // 4. 验证会话状态
  await expect(page.locator('[data-testid="session-status"]')).toHaveText('consensus_reached');
});
```

### 4.2 PRD 拆解流程 E2E

```typescript
// tests/e2e/prd-decompose.test.ts

test('AC-04/AC-05: PRD 预筛和议题提取', async ({ page }) => {
  await page.goto('/prd');

  // Step 1: 选择文档
  await page.click('[data-testid="doc-select-MVP_PRD_v3.md"]');
  await page.click('[data-testid="next-step"]');

  // Step 2: AI 预筛
  await expect(page.locator('[data-testid="screening-result"]')).toBeVisible({ timeout: 30000 });
  const highValueSections = page.locator('[data-testid="section-high"]');
  await expect(highValueSections).toHaveCount.greaterThan(0);

  // 选择高价值章节
  await page.click('[data-testid="select-high-value"]');
  await page.click('[data-testid="next-step"]');

  // Step 3: 确认议题
  await expect(page.locator('[data-testid="topic-item"]')).toHaveCount.greaterThanOrEqual(5, { timeout: 30000 });

  // 勾选并批量创建会话
  await page.click('[data-testid="select-all-topics"]');
  await page.click('[data-testid="batch-create-sessions"]');
  await expect(page.locator('[data-testid="sessions-created-toast"]')).toBeVisible();
});
```

### 4.3 CityMatrix 验证 E2E

```typescript
// tests/e2e/citymatrix-validation.test.ts

/**
 * AC-08: 用真实 CityMatrix PRD 跑完至少 5 个议题的完整协商
 * 注意：此测试需要真实 API Key，运行时间较长（约 10-15 分钟）
 * 通过环境变量 RUN_LIVE_TESTS=true 启用
 */
test.skip(process.env.RUN_LIVE_TESTS !== 'true', 'CityMatrix 完整验证');

test('AC-08: CityMatrix PRD 完整协商验证', async ({ page }) => {
  // 1. 导入 CityMatrix PRD
  // 2. 执行预筛
  // 3. 提取议题
  // 4. 对 top 5 个议题分别执行完整四步协商
  // 5. 验证每个协商产出了有意义的共识

  // ... 详细步骤
  // 此测试作为验收标准的最终验证
});
```

---

## 五、测试辅助工具

### 5.1 测试 Fixtures

```typescript
// tests/fixtures/index.ts

export function createMockRoleInput(overrides?: Partial<RoleInput>): RoleInput {
  return {
    name: '测试角色',
    title: '测试员',
    organization: '测试部门',
    avatar: '🧪',
    responsibilities: ['负责测试'],
    decisionPowers: ['决定测试范围'],
    expertise: ['自动化测试'],
    personality: ['细心'],
    concerns: ['代码质量'],
    ...overrides,
  };
}

export function createMockRole(overrides?: Partial<Role>): Role {
  return {
    id: `role_${randomId()}`,
    version: '1.0.0',
    history: [{ version: '1.0.0', date: new Date().toISOString(), notes: '初始创建' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...createMockRoleInput(),
    ...overrides,
  };
}

export function createMockSessionInput(overrides?: Partial<SessionInput>): SessionInput {
  return {
    topic: '测试议题',
    description: '这是一个测试议题的描述',
    phase: 'design' as const,
    participantIds: ['role_1', 'role_2'],
    ...overrides,
  };
}

export function seedTestRoles(db: Repository): void {
  PRESET_ROLES.forEach((input, i) => {
    db.createRole({ ...createMockRole({ id: `role_${i + 1}` }), ...input });
  });
}
```

### 5.2 SSE 测试工具

```typescript
// tests/helpers/sse-helper.ts

/** 在 Node.js 环境中收集 SSE 事件 */
export async function collectSSEEvents(
  url: string,
  options?: RequestInit
): Promise<NegotiationEvent[]> {
  const events: NegotiationEvent[] = [];
  const response = await fetch(url, { ...options, method: 'POST' });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop()!;
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          events.push(JSON.parse(line.slice(6)));
        } catch {}
      }
    }
  }
  return events;
}
```

---

## 六、CI/CD 测试配置

### 6.1 GitHub Actions（或本地脚本等价）

```yaml
# .github/workflows/test.yml (概念参考，实际可能用 Railway 或本地脚本)

name: CrowdDev Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
```

### 6.2 package.json 测试脚本

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test tests/e2e",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch",
    "test:live": "RUN_LIVE_TESTS=true vitest run tests/e2e/citymatrix-validation.test.ts"
  }
}
```
