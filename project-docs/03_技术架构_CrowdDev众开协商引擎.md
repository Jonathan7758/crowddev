# CrowdDev 众开协商引擎 — 技术架构设计文档

**版本：** v1.0  
**日期：** 2026年3月  
**范围：** MVP Phase 1 架构

---

## 一、技术栈选型

### 1.1 总览

| 层次 | 技术 | 理由 |
|------|------|------|
| 前端框架 | React 18 + TypeScript | 生态成熟，组件化开发，类型安全 |
| 构建工具 | Vite | 快速热更新，开箱即用的 TS 支持 |
| 样式 | Tailwind CSS | 原子化样式，快速迭代，统一设计语言 |
| 状态管理 | Zustand | 轻量、直觉，适合中等规模应用 |
| 后端 | Node.js + Express（或 Fastify） | 前后端同语言，降低开发复杂度 |
| 数据库 | SQLite（better-sqlite3） | 零配置，单文件部署，MVP 足够 |
| LLM API | Anthropic Claude API | 角色扮演能力强，JSON 输出稳定 |
| 文档解析 | markdown-it + js-yaml | 轻量、可靠的 MD 和 YAML 解析 |
| 测试 | Vitest + Playwright | 单元测试 + E2E 测试 |

### 1.2 为什么前后端分离

尽管 MVP 可以做成纯前端应用（如之前的 artifact 原型），但考虑到后续迭代需要：

- 文件系统访问（读取项目文档、写回 PRD 修改）
- API Key 安全管理（不暴露在前端）
- 数据持久化（SQLite 或后续升级 PostgreSQL）
- 后台任务（批量协商、定时预筛）

因此 MVP 即采用前后端分离架构，为后续演进留好基础。

---

## 二、系统架构

### 2.1 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React + TS)                    │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │  角色管理  │  │  协商会话  │  │ PRD拆解  │  │  演化仪表盘   │    │
│  │  页面     │  │  页面     │  │  页面    │  │  页面         │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘    │
│       │              │              │               │            │
│  ┌────▼──────────────▼──────────────▼───────────────▼────────┐  │
│  │                    Zustand Store                            │  │
│  │  roles[] │ sessions[] │ activeSession │ ui state            │  │
│  └────────────────────────┬──────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼──────────────────────────────────┐  │
│  │                    API Client Layer                         │  │
│  │  rolesApi │ sessionsApi │ negotiationApi │ documentsApi     │  │
│  └────────────────────────┬──────────────────────────────────┘  │
└───────────────────────────┼──────────────────────────────────────┘
                            │  HTTP/REST
┌───────────────────────────▼──────────────────────────────────────┐
│                         Backend (Node.js + Express)               │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐  │
│  │ Roles API  │  │ Sessions   │  │ Documents  │  │ Evolution │  │
│  │ /api/roles │  │ API        │  │ API        │  │ API       │  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬─────┘  │
│        │               │               │               │         │
│  ┌─────▼───────────────▼───────────────▼───────────────▼──────┐  │
│  │                    Service Layer                             │  │
│  │                                                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ Role Engine  │  │ Negotiation  │  │  Document Engine  │  │  │
│  │  │              │  │ Engine       │  │                   │  │  │
│  │  │ · CRUD       │  │ · 四步流程    │  │ · 文件读取        │  │  │
│  │  │ · 版本管理   │  │ · 阶段引导    │  │ · 章节解析        │  │  │
│  │  │ · Prompt生成 │  │ · 冲突分析    │  │ · 预筛/提取       │  │  │
│  │  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │  │
│  │         │                 │                    │              │  │
│  │  ┌──────▼─────────────────▼────────────────────▼───────────┐ │  │
│  │  │                   LLM Service                            │ │  │
│  │  │  · Anthropic Claude API 封装                              │ │  │
│  │  │  · Prompt 模板管理                                        │ │  │
│  │  │  · JSON 解析与容错                                        │ │  │
│  │  │  · 重试机制                                               │ │  │
│  │  └──────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
│                             │                                     │
│  ┌──────────────────────────▼───────────────────────────────────┐  │
│  │                    Data Layer (SQLite)                         │  │
│  │  roles │ sessions │ messages │ documents │ evolution_log       │  │
│  └───────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
crowddev/
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
│
├── docs/                          # 项目文档
│   ├── blueprint.md               # 蓝图方案
│   ├── prd.md                     # PRD
│   └── architecture.md            # 本文档
│
├── server/                        # 后端
│   ├── index.ts                   # 入口
│   ├── config.ts                  # 配置（API keys、端口等）
│   │
│   ├── api/                       # API 路由
│   │   ├── roles.ts
│   │   ├── sessions.ts
│   │   ├── negotiation.ts
│   │   └── documents.ts
│   │
│   ├── services/                  # 业务逻辑
│   │   ├── role-engine.ts         # 角色引擎
│   │   ├── negotiation-engine.ts  # 协商引擎
│   │   ├── document-engine.ts     # 文档引擎
│   │   └── evolution-engine.ts    # 演化引擎
│   │
│   ├── llm/                       # LLM 封装
│   │   ├── claude-client.ts       # API 调用
│   │   ├── prompt-builder.ts      # Prompt 构建
│   │   ├── json-parser.ts         # 鲁棒 JSON 解析
│   │   └── templates/             # Prompt 模板
│   │       ├── role-system.ts     # 角色 system prompt
│   │       ├── screening.ts       # 预筛 prompt
│   │       ├── topic-extraction.ts # 议题提取 prompt
│   │       ├── conflict-analysis.ts
│   │       ├── consensus.ts
│   │       └── prd-update.ts
│   │
│   ├── db/                        # 数据库
│   │   ├── schema.ts              # 表定义
│   │   ├── migrations/
│   │   └── repository.ts          # 数据访问
│   │
│   └── utils/
│       ├── markdown-parser.ts     # MD 章节解析
│       └── version.ts             # 语义化版本工具
│
├── src/                           # 前端
│   ├── main.tsx                   # 入口
│   ├── App.tsx                    # 路由
│   │
│   ├── stores/                    # Zustand stores
│   │   ├── role-store.ts
│   │   ├── session-store.ts
│   │   └── ui-store.ts
│   │
│   ├── api/                       # API 客户端
│   │   ├── client.ts              # 基础 HTTP 客户端
│   │   ├── roles.ts
│   │   ├── sessions.ts
│   │   ├── negotiation.ts
│   │   └── documents.ts
│   │
│   ├── pages/                     # 页面组件
│   │   ├── SessionsPage.tsx
│   │   ├── PRDDecomposerPage.tsx
│   │   ├── RolesPage.tsx
│   │   └── EvolutionPage.tsx
│   │
│   ├── components/                # 通用组件
│   │   ├── ui/                    # 基础 UI 组件
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Tag.tsx
│   │   │   └── ...
│   │   ├── role/
│   │   │   ├── RoleCard.tsx
│   │   │   └── RoleEditor.tsx
│   │   ├── session/
│   │   │   ├── SessionList.tsx
│   │   │   ├── SessionView.tsx
│   │   │   └── MessageBubble.tsx
│   │   ├── prd/
│   │   │   ├── DocSelector.tsx
│   │   │   ├── SectionScreener.tsx
│   │   │   └── TopicList.tsx
│   │   └── evolution/
│   │       └── Dashboard.tsx
│   │
│   └── types/                     # 类型定义
│       ├── role.ts
│       ├── session.ts
│       ├── message.ts
│       └── document.ts
│
├── project-docs/                  # 被分析的项目文档（可配置路径）
│   ├── MVP_PRD_v3.md
│   ├── 场景设计_v3.md
│   └── ...
│
└── tests/
    ├── unit/
    │   ├── role-engine.test.ts
    │   ├── negotiation-engine.test.ts
    │   ├── json-parser.test.ts
    │   └── markdown-parser.test.ts
    └── e2e/
        └── full-negotiation.test.ts
```

---

## 三、核心模块设计

### 3.1 角色引擎（Role Engine）

#### 数据模型

```typescript
interface Role {
  id: string;
  name: string;
  title: string;
  organization: string;
  avatar: string;           // emoji
  version: string;          // semver: "1.0.0"
  responsibilities: string[];
  decisionPowers: string[];
  expertise: string[];
  personality: string[];
  concerns: string[];
  history: VersionRecord[];
  createdAt: string;        // ISO datetime
  updatedAt: string;
}

interface VersionRecord {
  version: string;
  date: string;
  notes: string;
  changedFields?: string[]; // 哪些字段被修改
}
```

#### Prompt 构建

角色扮演的 system prompt 由以下部分动态组合：

```
[角色身份区块] — 基于 name/title/organization
[职能区块]     — 基于 responsibilities/decisionPowers
[认知区块]     — 基于 expertise
[人格区块]     — 基于 personality/concerns
[阶段引导区块] — 基于当前协商阶段（设计/验收/运营）
[行为约束区块] — 控制发言长度、风格、语言
```

阶段引导区块从 `server/llm/templates/` 中的模板加载，使模板可独立迭代。

### 3.2 协商引擎（Negotiation Engine）

#### 数据模型

```typescript
interface Session {
  id: string;
  topic: string;
  description: string;
  phase: 'design' | 'acceptance' | 'operations';
  participantIds: string[];   // 角色 ID 列表
  status: 'created' | 'in_progress' | 'consensus_reached';
  priority?: 'high' | 'medium' | 'low';
  prdSection?: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  sessionId: string;
  roleId: string | null;     // null = 协商引擎
  type: MessageType;
  content: string;
  phase: string;
  createdAt: string;
}

type MessageType =
  | 'opinion'      // 各方表态
  | 'analysis'     // 冲突分析
  | 'rebuttal'     // 辩论回应
  | 'consensus'    // 共识方案
  | 'prd_update';  // PRD更新建议
```

#### 协商流程编排

协商引擎的核心是一个有限状态机：

```
                    ┌──────────────────────────┐
                    │        created            │
                    └────────────┬─────────────┘
                                │ runOpinions()
                    ┌───────────▼──────────────┐
                    │     opinions_done         │
                    └────────────┬─────────────┘
                                │ runAnalysis()
                    ┌───────────▼──────────────┐
                    │     analysis_done         │
                    └────────────┬─────────────┘
                          ┌──────┴──────┐
                          │             │
                 runDebate()    runConsensus()
                          │             │
                 ┌────────▼──┐  ┌───────▼──────────┐
                 │ debated   │  │ consensus_reached │
                 └────────┬──┘  └──────────────────┘
                          │             ▲
                          └─────────────┘
                          可多轮辩论后再求共识
```

每个步骤的 API 调用策略：

| 步骤 | 调用次数 | 模型 | 备注 |
|------|---------|------|------|
| 表态 | N 次（N=参与角色数） | Sonnet | 每个角色独立调用 |
| 分析 | 1 次 | Sonnet | 汇总所有表态 |
| 辩论 | N 次 | Sonnet | 每个角色基于完整历史回应 |
| 共识 | 1 次 | Sonnet | 汇总所有讨论 |
| PRD更新 | 1 次 | Sonnet | 基于共识生成 |

#### 上下文管理

随着讨论轮次增加，消息历史可能超出 context window。采用滑动窗口策略：

- 最近 2 轮的完整消息保留
- 更早的消息压缩为摘要（由 LLM 生成）
- 角色的表态和共识始终保留（不压缩）

### 3.3 文档引擎（Document Engine）

#### 文档解析流程

```
文件路径 → 读取文件 → 按格式解析 → 章节拆分 → 返回结构化数据
```

Markdown 解析规则：
- 按 `#`、`##`、`###` 标题分割章节
- 每个章节保留标题和正文内容
- 代码块内的 `#` 不作为分割符
- 过滤纯代码章节（代码占比 > 80% 且文字 < 50字 的章节标记为低价值）

```typescript
interface DocumentInfo {
  filename: string;
  path: string;
  sections: Section[];
  totalChars: number;
}

interface Section {
  index: number;
  title: string;
  content: string;
  charCount: number;
}

interface ScreenedSection extends Section {
  score: number;           // 1-10
  value: 'high' | 'medium' | 'low';
  reason: string;
  conflictHint: string;
}

interface Topic {
  topic: string;
  description: string;
  involvedRoles: string[];
  expectedConflict: string;
  priority: 'high' | 'medium' | 'low';
  prdSection: string;
}
```

#### 预筛策略

为控制 API 成本和提高准确率，预筛采用两阶段策略：

1. **本地预过滤**：纯代码章节、过短章节（<50字文本）直接标记为低价值，不发送给 LLM
2. **LLM 评估**：将剩余章节的标题+摘要（每章节限300字）批量发送给 LLM 评分

若文档章节数超过 30 个，分批发送（每批 15 个），合并结果。

### 3.4 LLM 服务层

#### Claude 客户端封装

```typescript
interface ClaudeClientConfig {
  apiKey: string;
  model: string;           // default: "claude-sonnet-4-20250514"
  maxTokens: number;       // default: 1500
  maxRetries: number;      // default: 2
  retryDelayMs: number;    // default: 1000
}

class ClaudeClient {
  async complete(systemPrompt: string, messages: ChatMessage[]): Promise<string>;
  async completeJson<T>(systemPrompt: string, messages: ChatMessage[]): Promise<T>;
}
```

#### 鲁棒 JSON 解析

LLM 返回的 JSON 经常有格式问题。解析器采用多层容错：

```
原始文本
  │
  ├─ 1. 去除 markdown 代码块标记（```json ... ```）
  │
  ├─ 2. 直接 JSON.parse()
  │     成功 → 返回
  │
  ├─ 3. 正则提取 JSON 数组 (/\[[\s\S]*\]/)
  │     解析成功 → 返回
  │
  ├─ 4. 修复常见问题（尾逗号、未转义换行）后重试
  │     解析成功 → 返回
  │
  ├─ 5. 逐个提取 JSON 对象并拼装
  │     找到对象 → 返回数组
  │
  └─ 6. 全部失败 → 抛出错误，触发重试
```

### 3.5 数据层（SQLite）

#### 表结构

```sql
-- 角色表
CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '👤',
  version TEXT NOT NULL DEFAULT '1.0.0',
  responsibilities TEXT NOT NULL DEFAULT '[]',  -- JSON array
  decision_powers TEXT NOT NULL DEFAULT '[]',
  expertise TEXT NOT NULL DEFAULT '[]',
  personality TEXT NOT NULL DEFAULT '[]',
  concerns TEXT NOT NULL DEFAULT '[]',
  history TEXT NOT NULL DEFAULT '[]',           -- JSON array of VersionRecord
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 协商会话表
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  description TEXT DEFAULT '',
  phase TEXT NOT NULL DEFAULT 'design',        -- design/acceptance/operations
  participant_ids TEXT NOT NULL DEFAULT '[]',   -- JSON array of role IDs
  status TEXT NOT NULL DEFAULT 'created',
  priority TEXT DEFAULT 'medium',
  prd_section TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 消息表（独立存储，支持大量消息）
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role_id TEXT,                                 -- NULL = 协商引擎
  type TEXT NOT NULL,                           -- opinion/analysis/rebuttal/consensus/prd_update
  content TEXT NOT NULL,
  phase TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 文档索引表（缓存预筛结果）
CREATE TABLE document_cache (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,                     -- 文件内容 hash，变更时失效
  screened_sections TEXT NOT NULL DEFAULT '[]', -- JSON array of ScreenedSection
  created_at TEXT NOT NULL
);

-- 演化日志表
CREATE TABLE evolution_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,                    -- role_updated/consensus_reached/prd_updated
  entity_id TEXT NOT NULL,                     -- 关联的角色ID或会话ID
  details TEXT NOT NULL DEFAULT '{}',          -- JSON
  created_at TEXT NOT NULL
);

-- 索引
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_type ON messages(type);
CREATE INDEX idx_sessions_phase ON sessions(phase);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_evolution_type ON evolution_log(event_type);
```

---

## 四、API 设计

### 4.1 角色 API

```
GET    /api/roles              获取所有角色
POST   /api/roles              创建角色
PUT    /api/roles/:id          更新角色（自动升版）
DELETE /api/roles/:id          删除角色
```

### 4.2 会话 API

```
GET    /api/sessions           获取所有会话
POST   /api/sessions           创建会话
PUT    /api/sessions/:id       更新会话（阶段切换等）
DELETE /api/sessions/:id       删除会话
GET    /api/sessions/:id/messages  获取会话消息
```

### 4.3 协商 API

```
POST   /api/negotiation/:sessionId/opinions     启动表态
POST   /api/negotiation/:sessionId/analysis      分析冲突
POST   /api/negotiation/:sessionId/debate        辩论回应
  Body: { moderatorPrompt?: string }
POST   /api/negotiation/:sessionId/consensus     寻求共识
POST   /api/negotiation/:sessionId/prd-check     冲突检查 & PRD更新
```

所有协商 API 采用 **SSE（Server-Sent Events）** 返回，因为每个步骤涉及多次 LLM 调用，前端需要实时展示进度：

```
POST /api/negotiation/:sessionId/opinions

响应（SSE stream）:
data: {"event":"role_thinking","roleId":"role_1","roleName":"李Sir"}
data: {"event":"role_done","message":{...}}
data: {"event":"role_thinking","roleId":"role_2","roleName":"张警官"}
data: {"event":"role_done","message":{...}}
data: {"event":"complete","sessionStatus":"in_progress"}
```

### 4.4 文档 API

```
GET    /api/documents                  获取项目文档列表
GET    /api/documents/:filename/sections  获取文档章节
POST   /api/documents/:filename/screen    AI 预筛章节
  Body: { sectionIndices?: number[] }    可选：只筛指定章节
POST   /api/documents/extract-topics      提取协商议题
  Body: { filename: string, sectionIndices: number[] }
```

### 4.5 演化 API

```
GET    /api/evolution/stats            获取统计数据
GET    /api/evolution/timeline         获取演化时间线
```

---

## 五、关键设计决策

### 5.1 为什么用 SSE 而不是 WebSocket

协商的每个步骤是一个"请求-响应"模式，只是响应分多次推送。SSE 比 WebSocket 更简单，不需要维护长连接状态，HTTP/2 下性能足够。如果后续需要真正的双向通信（如多人协作），再升级 WebSocket。

### 5.2 为什么用 SQLite 而不是 PostgreSQL

MVP 阶段数据量小（预计 <1000 条消息），SQLite 零配置、单文件、备份简单。后续升级 PostgreSQL 只需要替换数据访问层，不影响业务逻辑。

### 5.3 Prompt 模板外部化

所有 LLM 调用的 prompt 存储在 `server/llm/templates/` 目录，以 TypeScript 模块导出。这样做的好处：

- Prompt 迭代不需要修改业务代码
- 可以对 prompt 做版本管理
- 后续可以做 prompt A/B 测试
- 与 CityMatrix 的语义化策略层理念一致

### 5.4 文档预筛缓存

预筛结果按文件内容 hash 缓存在 `document_cache` 表中。文件未修改时直接返回缓存结果，避免重复调用 LLM。文件修改后 hash 变化，缓存自动失效。

---

## 六、前端状态管理

### 6.1 Store 设计

```typescript
// role-store.ts
interface RoleStore {
  roles: Role[];
  loading: boolean;
  fetchRoles: () => Promise<void>;
  createRole: (data: RoleInput) => Promise<Role>;
  updateRole: (id: string, data: RoleInput) => Promise<Role>;
  deleteRole: (id: string) => Promise<void>;
}

// session-store.ts
interface SessionStore {
  sessions: Session[];
  activeSessionId: string | null;
  loading: boolean;
  fetchSessions: () => Promise<void>;
  createSession: (data: SessionInput) => Promise<Session>;
  setActiveSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;

  // 协商流程
  runOpinions: (sessionId: string) => Promise<void>;
  runAnalysis: (sessionId: string) => Promise<void>;
  runDebate: (sessionId: string, moderatorPrompt?: string) => Promise<void>;
  runConsensus: (sessionId: string) => Promise<void>;
  runPrdCheck: (sessionId: string) => Promise<void>;

  // SSE 状态
  negotiationLoading: boolean;
  negotiationLabel: string;
}
```

### 6.2 SSE 消费

前端通过 `EventSource` 或 `fetch` + `ReadableStream` 消费 SSE：

```typescript
async function consumeNegotiationSSE(url: string, onEvent: (event: NegotiationEvent) => void) {
  const response = await fetch(url, { method: 'POST', ... });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    // 解析 SSE data: 行
    for (const line of text.split('\n')) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        onEvent(event);
      }
    }
  }
}
```

---

## 七、安全考虑

| 关注点 | 措施 |
|--------|------|
| API Key 保护 | 存储在服务端 `.env` 文件，不暴露给前端 |
| 输入校验 | 所有 API 入参经 zod schema 校验 |
| Prompt 注入 | 角色档案内容在拼入 prompt 前做基础清洗（去除可能的 system prompt 覆盖指令） |
| 数据备份 | SQLite 文件定期备份（后续自动化） |

---

## 八、开发计划

### Week 1-2：基础设施

- 项目初始化（Vite + React + Express + SQLite）
- 数据库 schema 和 CRUD API
- 基础 UI 组件库（Button、Input、Tag、Card 等）
- Claude API 客户端封装 + JSON 解析器
- 角色 CRUD 页面

### Week 3-4：协商核心

- 协商引擎四步流程实现
- SSE 推送机制
- 会话管理页面（列表+详情）
- 消息展示组件
- 三阶段引导策略模板

### Week 5-6：文档引擎

- Markdown 解析器 + 章节拆分
- 项目文档扫描和索引
- AI 预筛 + 议题提取
- PRD 拆解页面（三步流程）
- 共识回写功能

### Week 7-8：演化与打磨

- 演化仪表盘
- 数据持久化完善
- E2E 测试（用 CityMatrix PRD 跑完整流程）
- 性能优化
- Bug 修复和体验打磨

---

## 九、后续演进预留

| 后续需求 | 架构预留 |
|----------|----------|
| 多项目支持 | 数据模型加 project_id 字段 |
| Git 集成 | 文档引擎可扩展为文件写入 |
| 人类参与协商 | 消息模型已支持 roleId=null，扩展为 human 类型 |
| 运营数据接入 | 会话创建时可附加 context 数据 |
| WebSocket 升级 | SSE 接口可平滑切换 |
| 团队协作 | 加用户认证层 + 权限管理 |
| 角色跨会话记忆 | 扩展角色模型加 memory 字段 |
| 批量协商 | 协商 API 支持 batch 模式 |
