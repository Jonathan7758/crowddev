# CrowdDev 众开协商引擎 — Claude Code 开发指导

**版本：** v1.0  
**日期：** 2026年3月  
**适用：** 使用 Claude Code 作为主力开发工具的开发者

---

## 一、Claude Code 开发工作流

### 1.1 总体原则

CrowdDev 项目使用 Claude Code 作为主力编码工具。以下原则确保开发效率和质量：

1. **CLAUDE.md 是入口**：Claude Code 每次启动时自动读取项目根目录的 CLAUDE.md，确保上下文一致
2. **文档驱动开发**：先更新设计文档，再编码，再测试——Claude Code 可以直接读取 docs/ 目录理解需求
3. **单模块推进**：每次对话聚焦一个模块或功能点，避免跨模块混杂
4. **测试先行可选**：可以要求 Claude Code 先写测试，再实现功能
5. **Prompt 模板独立迭代**：LLM prompt 放在 templates/ 目录，可以单独让 Claude Code 优化

### 1.2 项目 CLAUDE.md 维护

随着开发推进，CLAUDE.md 应动态更新：

```markdown
## 当前进度

- [x] 蓝图方案文档
- [x] MVP PRD 文档
- [x] 技术架构文档
- [x] 模块详细设计文档
- [x] 项目初始化          ← 完成后打勾
- [ ] Week 1: 基础设施     ← 当前进行中
- [ ] Week 2: 角色引擎

## 开发约定

- 所有 LLM prompt 模板在 server/llm/templates/ 目录
- 使用 zod 做 API 输入校验
- SSE 事件使用 NegotiationEvent 类型
- 角色 prompt 使用 buildRolePrompt() 构建
- JSON 解析一律使用 robustJsonParse()
```

---

## 二、逐模块 Claude Code 指令模板

### 2.1 项目初始化

```
# 第一次对话：项目初始化

请阅读 docs/ 目录下的所有设计文档，然后：

1. 初始化项目：
   - 使用 Vite + React 18 + TypeScript 创建前端
   - 创建 server/ 目录作为 Express 后端
   - 配置 Tailwind CSS
   - 配置 tsconfig.json（strict 模式）
   - 配置 ESLint + Prettier

2. 创建以下基础文件：
   - server/config.ts（环境变量管理）
   - server/db/schema.ts（参考技术架构中的 SQL schema）
   - server/db/repository.ts（基础 CRUD 骨架）
   - .env.example（ANTHROPIC_API_KEY, VOLCENGINE_API_KEY, PORT 等）

3. 确保 npm run dev 可以同时启动前端和后端。
```

### 2.2 LLM 客户端

```
# 第二次对话：LLM 层

参考 docs/architecture.md 的 LLM 服务层设计和 docs/module-design.md 的详细设计，实现：

1. server/llm/claude-client.ts
   - 使用 @anthropic-ai/sdk
   - complete() 和 completeJson<T>() 方法
   - 重试机制（最多 2 次，指数退避）

2. server/llm/volcengine-client.ts
   - 使用 OpenAI 兼容 API 格式
   - 火山引擎 ARK endpoint

3. server/llm/llm-router.ts
   - 任务级路由（角色扮演→Claude，预筛→火山引擎）
   - 自动降级

4. server/llm/json-parser.ts
   - 6 层容错 JSON 解析器
   - 为解析器写单元测试（至少 7 个用例）

请确保所有文件有完整的 TypeScript 类型标注。
```

### 2.3 角色引擎

```
# 角色引擎开发

参考 docs/module-design.md 第二章的角色引擎详细设计：

后端部分：
1. server/services/role-engine.ts — 完整实现 RoleEngine 类
   - create/update/delete/list/getById
   - 版本管理（字段分级 + 自动升版）
   - buildSystemPrompt（六个区块 + 三阶段引导）

2. server/llm/templates/role-system.ts — 角色 prompt 模板

3. server/services/preset-roles.ts — 3 个预置角色数据

4. server/api/roles.ts — REST API 路由 + zod 校验

5. 单元测试：tests/unit/role-engine.test.ts

前端部分：
1. src/stores/role-store.ts — Zustand store
2. src/api/roles.ts — API 客户端
3. src/pages/RolesPage.tsx — 角色管理页面
4. src/components/role/RoleCard.tsx — 角色卡片
5. src/components/role/RoleEditor.tsx — 创建/编辑 Modal
6. src/components/role/RoleVersionHistory.tsx — 版本时间线

请使用深色主题（bg-gray-900），角色卡片用 emoji 头像。
```

### 2.4 协商引擎

```
# 协商引擎开发（后端）

参考 docs/module-design.md 第三章的协商引擎详细设计：

1. server/services/negotiation-engine.ts
   - 完整的状态机（VALID_TRANSITIONS）
   - runOpinions() — AsyncGenerator 产出 SSE 事件
   - runAnalysis() — 结构化 ConflictAnalysis 输出
   - runDebate() — 支持 moderatorPrompt + 多轮
   - runConsensus() — 三阶段共识模板
   - runPrdCheck() — 冲突检查 + PRD 修改条目

2. server/services/context-manager.ts
   - 滑动窗口上下文管理
   - 保留最近 2 轮 + 压缩历史

3. SSE 模板：
   - server/llm/templates/conflict-analysis.ts
   - server/llm/templates/consensus.ts（含三阶段模板）
   - server/llm/templates/prd-update.ts

4. server/api/negotiation.ts — SSE 路由

5. 单元测试：tests/unit/negotiation-engine.test.ts

关键：所有协商 API 必须返回 SSE 流（Content-Type: text/event-stream）。
```

```
# 协商引擎开发（前端）

参考 docs/module-design.md 第七章的前端设计：

1. src/api/sse-client.ts — SSE 消费封装
2. src/stores/session-store.ts — 完整的 SessionStore
   - 5 个 run* 方法
   - SSE 事件消费 → 实时更新 messages
   - thinkingRole 状态追踪

3. 组件：
   - SessionSidebar.tsx — 会话列表
   - NewSessionModal.tsx — 创建会话（议题+阶段+角色选择）
   - MessageBubble.tsx — 消息气泡（类型颜色 + 角色头像）
   - MessageList.tsx — 消息流 + 自动滚动
   - NegotiationFlow.tsx — 四步按钮 + 状态指示器
   - ModeratorInput.tsx — 引导问题输入
   - StructuredContent.tsx — 冲突分析/共识的结构化展示

4. SessionsPage.tsx — 完整协商页面

视觉要求：
- 消息类型左边框：立场蓝/回应金/分析紫/共识绿
- 阶段颜色：设计蓝/验收金/运营绿
- 角色思考中显示脉冲动画
```

### 2.5 文档引擎

```
# 文档引擎开发

参考 docs/module-design.md 第四章的文档引擎详细设计：

后端：
1. server/utils/markdown-parser.ts — MD 章节解析
   - parseMarkdownSections() + isCodeOnlySection() + extractSectionSummary()
2. server/services/document-engine.ts — 完整 DocumentEngine
3. server/llm/templates/screening.ts — 预筛 prompt
4. server/llm/templates/topic-extraction.ts — 议题提取 prompt
5. server/api/documents.ts — 文档 API
6. 单元测试 + 集成测试

前端：
1. PRDDecomposerPage.tsx — 三步流程页面
2. StepIndicator.tsx — 进度条
3. DocSelector.tsx — 文档选择
4. SectionScreener.tsx — 预筛结果（分数条+颜色）
5. TopicList.tsx — 议题确认（勾选+批量创建）

project-docs/ 目录放入 CityMatrix 的 PRD 文件作为测试数据。
```

### 2.6 演化仪表盘

```
# 演化仪表盘

参考 docs/module-design.md 第六章：

后端：
1. server/services/evolution-engine.ts — 统计聚合
2. server/api/evolution.ts — stats + timeline API

前端（使用 Recharts 做图表）：
1. EvolutionPage.tsx — 仪表盘页面
2. StatsCards.tsx — 4 个统计卡片
3. PhaseChart.tsx — 三阶段柱状图
4. RecentConsensus.tsx — 最近共识（可展开）
5. RoleTimeline.tsx — 角色版本时间线
```

---

## 三、Prompt 调优指导

### 3.1 Prompt 迭代工作流

```
# 当协商结果不够好时，使用此指令调优 prompt

请分析以下协商结果的质量问题：
[粘贴某次协商的完整消息记录]

问题是：
- 角色的发言太泛泛（不够具体到场景）
- 冲突分析没有找到真正的矛盾点
- 共识方案太空洞（没有可执行的设计决策）

请优化以下 prompt 模板：
1. server/llm/templates/role-system.ts — 角色引导部分
2. server/llm/templates/conflict-analysis.ts — 分析 prompt
3. server/llm/templates/consensus.ts — 共识 prompt

优化目标：
- 角色发言应引用具体的操作场景和数字
- 冲突分析应指出可度量的矛盾（如"操作步骤 3步 vs 5步"）
- 共识应包含可直接写入 PRD 的具体条目
```

### 3.2 角色表现评估

```
# 评估角色 prompt 质量

请用以下议题测试 3 个预置角色的表现：
议题："视频追踪功能中，用户确认追踪目标后是否需要二次确认？"

分别调用每个角色的 system prompt + 上述议题，评估：
1. 角色是否体现了独特的关切视角？
2. 发言是否具体到操作场景？
3. 是否在 200 字以内？
4. 是否避免了泛泛而谈？

根据评估结果，调整 prompt-builder.ts 的区块模板。
```

---

## 四、常见开发任务速查

### 4.1 新增一个协商 Prompt 模板

```
# 任务：新增一个 [验收期] 的专用 prompt 模板

1. 在 server/llm/templates/ 创建新模板文件
2. 在 prompt-builder.ts 的阶段引导区块中引用
3. 在 CONSENSUS_TEMPLATES 中添加对应的输出格式
4. 写一个单元测试验证模板生成正确
```

### 4.2 新增一种角色字段

```
# 任务：给角色添加 "riskTolerance" 字段（风险偏好）

需要修改：
1. server/db/schema.ts — ALTER TABLE 或重建
2. types/role.ts — 接口定义
3. server/services/role-engine.ts — CRUD + 版本管理
4. server/llm/prompt-builder.ts — 新区块
5. src/components/role/RoleEditor.tsx — 表单字段
6. src/components/role/RoleCard.tsx — 展示
7. 更新 preset-roles.ts
8. 更新单元测试
```

### 4.3 调试 LLM 调用

```
# 任务：某个 LLM 调用总是返回格式错误

请帮我：
1. 在 claude-client.ts 的 complete 方法中加入调试日志
   - 记录完整的 system prompt 和 user message
   - 记录原始返回文本
   - 记录 JSON 解析的每一步尝试和结果
2. 检查对应的 prompt 模板是否有清晰的 JSON 格式要求
3. 检查 json-parser.ts 的容错逻辑是否覆盖了这种错误模式
```

---

## 五、Claude Code 最佳实践

### 5.1 上下文管理

- **长对话拆分**：超过 15 轮对话时新建会话，在新会话开头说"请先阅读 CLAUDE.md 和 docs/module-design.md 的第 X 章"
- **明确范围**：每次对话开头说清楚要做什么模块、哪些文件
- **引用现有代码**：如果要修改已有文件，先让 Claude Code 读取该文件

### 5.2 代码质量

```
# 在每个模块完成后运行

请检查以下代码质量：
1. TypeScript strict 模式无报错
2. 所有导出函数有 JSDoc 注释
3. 错误处理完整（try/catch + 有意义的错误消息）
4. 无硬编码的 magic number/string
5. 测试覆盖率 > 80%

如果有问题，请逐一修复。
```

### 5.3 重构指令

```
# 当代码变得混乱时

请对 [文件名] 进行重构：
1. 提取过长的函数（>50行）为子函数
2. 将重复代码提取为工具函数
3. 确保类型定义在 types/ 目录而非内联
4. 确保导入路径使用 alias（@/ 前缀）
5. 不要改变任何外部接口行为
6. 重构后运行测试确保无回归
```

---

## 六、Git 提交规范

### 6.1 Commit Message 格式

```
<type>(<scope>): <description>

type: feat | fix | refactor | test | docs | chore
scope: role-engine | negotiation | document | evolution | ui | llm | db

示例：
feat(role-engine): 实现角色版本自动升级
feat(negotiation): 完成四步协商流程 SSE 推送
fix(llm): 修复 JSON 解析器对嵌套数组的处理
test(role-engine): 新增版本管理单元测试
docs: 更新 CLAUDE.md 进度
```

### 6.2 分支策略

```
main ← 稳定发布
  └── dev ← 日常开发
        ├── feat/role-engine
        ├── feat/negotiation
        ├── feat/document-engine
        └── fix/json-parser
```

---

## 七、调试与排障

### 7.1 常见问题

| 问题 | 排查步骤 |
|------|---------|
| LLM 返回空内容 | 检查 API Key → 检查 model 名称 → 检查 maxTokens |
| JSON 解析失败 | 查看 json-parser 调试日志 → 检查 prompt 中的格式要求 → 添加更多容错层 |
| SSE 事件丢失 | 检查 Express 是否设置 `Cache-Control: no-cache` → 检查代理配置 |
| 角色发言太长 | 检查 prompt 中的字数限制 → 减小 maxTokens → 加强约束语言 |
| 预筛评分不准 | 检查 screening.ts 模板 → 确认角色信息已注入 → 调整评分标准 |
| 数据库表不存在 | 检查 schema.ts → 确认 init() 被调用 → 检查迁移逻辑 |
| 前端 API 404 | 检查 Vite proxy 配置 → 确认后端路由注册 → 检查端口 |

### 7.2 日志级别

```typescript
// server/config.ts
export const LOG_LEVELS = {
  llm: process.env.LOG_LLM === 'true',      // 记录完整 prompt 和响应
  db: process.env.LOG_DB === 'true',         // 记录 SQL 查询
  sse: process.env.LOG_SSE === 'true',       // 记录 SSE 事件
  api: process.env.LOG_API === 'true',       // 记录 API 请求
};
```
