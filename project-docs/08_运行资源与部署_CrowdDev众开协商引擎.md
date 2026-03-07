# CrowdDev 众开协商引擎 — 运行资源与部署方案

**版本：** v1.0  
**日期：** 2026年3月  
**原则：** Railway 优先 + 开源组件 + Claude / 火山引擎双通道 + Telegram Bot 通知

---

## 一、资源架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Railway Platform                              │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │  CrowdDev Web    │  │  CrowdDev API    │  │  Persistent      │   │
│  │  (React SPA)     │  │  (Express.js)    │  │  Volume          │   │
│  │                  │  │                  │  │  (SQLite DB)     │   │
│  │  静态资源托管      │  │  协商引擎 + LLM   │  │                  │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘   │
│           │                     │                      │             │
│           └─────────────────────┼──────────────────────┘             │
│                                 │                                    │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
            ┌───────▼──────┐ ┌───▼────┐ ┌──────▼─────┐
            │ Anthropic    │ │ 火山引擎 │ │ Telegram   │
            │ Claude API   │ │ 豆包API  │ │ Bot API    │
            │ (主力 LLM)   │ │(预筛降级)│ │ (通知/交互) │
            └──────────────┘ └────────┘ └────────────┘
```

---

## 二、计算资源：Railway

### 2.1 为什么选 Railway

| 对比项 | Railway | Vercel | Fly.io | 自建 VPS |
|--------|---------|--------|--------|---------|
| 后端支持 | 原生支持 | 仅 Serverless | 原生 | 完全自主 |
| SQLite 持久存储 | ✅ Volume | ❌ | ✅ Volume | ✅ |
| SSE 长连接 | ✅ | 30s 超时 | ✅ | ✅ |
| 部署复杂度 | 极低 (Git Push) | 低 | 中 | 高 |
| 免费额度 | $5/月 Trial | 有限 | 有限 | 无 |
| 中国访问 | 可用 | 可用 | 一般 | 取决于位置 |

Railway 最适合 CrowdDev 的原因：支持持久化 Volume（SQLite）、SSE 长连接无超时限制、Git Push 部署极简。

### 2.2 Railway 项目配置

```toml
# railway.toml
[build]
builder = "NIXPACKS"
buildCommand = "npm run build"

[deploy]
startCommand = "npm run start"
healthcheckPath = "/api/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[service]
internalPort = 3000
```

### 2.3 Railway 服务规划

**服务 1: CrowdDev App（Web + API 合并部署）**

| 配置 | 值 | 说明 |
|------|---|------|
| 类型 | Web Service | HTTP 服务 |
| 内存 | 512MB（起步） | Express + SQLite 足够 |
| CPU | 0.5 vCPU | MVP 单用户足够 |
| 存储 | 1GB Volume | 挂载 /data，存 SQLite 数据库 |
| 域名 | crowddev-xxx.up.railway.app | 自动分配，可绑定自定义域 |
| 环境变量 | 见下文 | |

**Volume 挂载：**

```
Railway Volume → /data
  └── crowddev.db     (SQLite 数据库)
  └── backups/        (定期备份)
```

### 2.4 Railway 环境变量

```bash
# .env.example → Railway 环境变量面板配置

# === LLM 配置 ===
ANTHROPIC_API_KEY=sk-ant-xxx
VOLCENGINE_API_KEY=xxx
VOLCENGINE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_MODEL=doubao-pro-256k

# === 应用配置 ===
NODE_ENV=production
PORT=3000
DB_PATH=/data/crowddev.db
PROJECT_DOCS_PATH=/app/project-docs

# === Telegram Bot ===
TELEGRAM_BOT_TOKEN=xxx:yyy
TELEGRAM_CHAT_ID=-100xxx

# === 日志 ===
LOG_LEVEL=info
LOG_LLM=false
LOG_DB=false
```

### 2.5 部署流程

```bash
# 1. 安装 Railway CLI
npm install -g @railway/cli

# 2. 登录
railway login

# 3. 初始化项目（首次）
railway init

# 4. 创建 Volume
railway volume create crowddev-data

# 5. 关联 Volume
# 在 Railway Dashboard 中将 Volume 挂载到 /data

# 6. 设置环境变量
railway variables set ANTHROPIC_API_KEY=sk-ant-xxx
railway variables set VOLCENGINE_API_KEY=xxx
# ... 其他变量

# 7. 部署
railway up

# 后续更新：推送到 GitHub 自动部署
git push origin main  # Railway 监听 GitHub 自动部署
```

### 2.6 Railway 成本估算

| 项目 | 月成本 | 说明 |
|------|--------|------|
| Compute | ~$5-10 | 0.5 vCPU + 512MB，低流量 |
| Volume (1GB) | ~$0.25 | 按存储量计费 |
| Egress | ~$0 | 5GB 免费 |
| **合计** | **~$5-10/月** | MVP 阶段足够 |

---

## 三、LLM 资源配置

### 3.1 双通道策略

```
┌──────────────────────────────────────────────────────┐
│                    LLM Router                         │
│                                                       │
│  任务类型        主通道          降级通道               │
│  ─────────      ──────         ──────               │
│  角色扮演        Claude         (无降级，必须 Claude)   │
│  冲突分析        Claude         火山引擎 豆包           │
│  共识生成        Claude         火山引擎 豆包           │
│  文档预筛        火山引擎 豆包    Claude                │
│  议题提取        Claude         火山引擎 豆包           │
│  PRD 回写        Claude         火山引擎 豆包           │
│  历史摘要        火山引擎 豆包    Claude                │
└──────────────────────────────────────────────────────┘
```

### 3.2 Anthropic Claude API

| 配置 | 值 |
|------|---|
| 模型 | claude-sonnet-4-20250514 |
| Max Tokens | 1500（角色发言）/ 2000（分析/共识）/ 3000（PRD回写） |
| 用途 | 角色扮演、冲突分析、共识生成、议题提取、PRD回写 |

**成本估算（每次完整协商 3 角色）：**

| 步骤 | 调用次数 | 输入 tokens | 输出 tokens | 估算费用 |
|------|---------|------------|------------|---------|
| 表态 | 3 | ~2000×3 | ~400×3 | ~$0.02 |
| 分析 | 1 | ~3000 | ~800 | ~$0.01 |
| 辩论 | 3 | ~4000×3 | ~400×3 | ~$0.04 |
| 共识 | 1 | ~5000 | ~1000 | ~$0.02 |
| PRD更新 | 1 | ~3000 | ~1000 | ~$0.01 |
| **单次协商合计** | **9次** | | | **~$0.10** |

按 MVP 阶段 50 次协商估算：**~$5/月 Claude API 费用**。

### 3.3 火山引擎（豆包）

| 配置 | 值 |
|------|---|
| 平台 | 火山引擎 ARK |
| 模型 | doubao-pro-256k（主力）/ doubao-lite-128k（轻量） |
| 接入方式 | OpenAI 兼容 API |
| Endpoint | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |
| 用途 | 文档预筛、历史摘要、降级通道 |

**火山引擎配置步骤：**

```
1. 注册火山引擎账号 → console.volcengine.com
2. 开通"模型广场" → 选择豆包模型
3. 创建"推理接入点"（Endpoint）
4. 获取 API Key 和 Endpoint ID
5. 配置到环境变量 VOLCENGINE_API_KEY 和 VOLCENGINE_MODEL
```

**成本估算：**

| 模型 | 输入价格 | 输出价格 |
|------|---------|---------|
| doubao-pro-256k | ¥0.0008/千tokens | ¥0.002/千tokens |
| doubao-lite-128k | ¥0.0003/千tokens | ¥0.0006/千tokens |

按预筛 50 次（每次约 5000 tokens）：**~¥1-2/月**（几乎可忽略）。

### 3.4 LLM 配置文件

```typescript
// server/config.ts

export const LLM_CONFIG = {
  claude: {
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-sonnet-4-20250514',
    defaults: {
      rolePlay: { maxTokens: 1500 },
      analysis: { maxTokens: 2000 },
      consensus: { maxTokens: 2000 },
      prdUpdate: { maxTokens: 3000 },
    },
    maxRetries: 2,
    retryDelayMs: 1000,
  },
  volcengine: {
    apiKey: process.env.VOLCENGINE_API_KEY!,
    baseUrl: process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    model: process.env.VOLCENGINE_MODEL || 'doubao-pro-256k',
    defaults: {
      screening: { maxTokens: 2000 },
      summarize: { maxTokens: 1000 },
    },
    maxRetries: 2,
  },
  routing: {
    // 任务 → 优先 provider
    role_opinion: 'claude',
    role_debate: 'claude',
    conflict_analysis: 'claude',
    consensus: 'claude',
    screening: 'volcengine',
    topic_extraction: 'claude',
    prd_update: 'claude',
    summarize: 'volcengine',
  },
};
```

---

## 四、Telegram Bot（通知 + 轻交互）

### 4.1 用途

| 场景 | 功能 |
|------|------|
| 协商完成通知 | 共识达成后推送摘要到 Telegram |
| 每日统计 | 定时推送当日协商统计 |
| 快速查看 | 在 Telegram 中查看最近共识列表 |
| 远程触发 | 通过 Telegram 命令触发预筛或协商 |
| 错误告警 | LLM 调用失败、数据库异常等告警 |

### 4.2 技术方案

```typescript
// server/services/telegram-bot.ts

import TelegramBot from 'node-telegram-bot-api';

export class CrowdDevBot {
  private bot: TelegramBot;
  private chatId: string;

  constructor(token: string, chatId: string) {
    this.bot = new TelegramBot(token, { polling: true });
    this.chatId = chatId;
    this.registerCommands();
  }

  /** 注册命令 */
  private registerCommands() {
    this.bot.onText(/\/status/, () => this.handleStatus());
    this.bot.onText(/\/recent/, () => this.handleRecent());
    this.bot.onText(/\/roles/, () => this.handleRoles());
    this.bot.onText(/\/help/, () => this.handleHelp());
  }

  /** 推送协商完成通知 */
  async notifyConsensus(session: Session, consensus: ConsensusResult) {
    const message = `
🤝 *协商达成共识*

📋 议题: ${escapeMarkdown(session.topic)}
🏷 阶段: ${phaseLabel(session.phase)}
👥 参与: ${session.participantIds.length} 个角色

✅ 结论: ${escapeMarkdown(consensus.conclusion)}

${consensus.unresolvedIssues?.length
  ? `⚠️ 遗留问题: ${consensus.unresolvedIssues.length} 个`
  : ''}

🔗 [查看详情](${process.env.APP_URL}/sessions/${session.id})
`;
    await this.bot.sendMessage(this.chatId, message, { parse_mode: 'MarkdownV2' });
  }

  /** 推送错误告警 */
  async notifyError(context: string, error: Error) {
    const message = `
🚨 *CrowdDev 错误告警*

📍 上下文: ${escapeMarkdown(context)}
❌ 错误: ${escapeMarkdown(error.message)}
⏰ 时间: ${new Date().toISOString()}
`;
    await this.bot.sendMessage(this.chatId, message, { parse_mode: 'MarkdownV2' });
  }

  /** /status 命令处理 */
  private async handleStatus() {
    const stats = await this.evolutionEngine.getStats();
    const message = `
📊 *CrowdDev 状态*

👤 角色: ${stats.totalRoles} 个
💬 会话: ${stats.totalSessions} 个
📝 发言: ${stats.totalMessages} 条
🤝 共识: ${stats.totalConsensus} 个

按阶段:
🔵 设计期: ${stats.sessionsByPhase.design} 个会话
🟡 验收期: ${stats.sessionsByPhase.acceptance} 个会话
🟢 运营期: ${stats.sessionsByPhase.operations} 个会话
`;
    await this.bot.sendMessage(this.chatId, message, { parse_mode: 'MarkdownV2' });
  }

  /** /recent 命令处理 */
  private async handleRecent() {
    const recent = await this.evolutionEngine.getRecentConsensus(5);
    const lines = recent.map((c, i) =>
      `${i + 1}\\. ${escapeMarkdown(c.topic)} \\(${phaseLabel(c.phase)}\\)`
    );
    const message = `
📋 *最近 5 个共识*

${lines.join('\n')}
`;
    await this.bot.sendMessage(this.chatId, message, { parse_mode: 'MarkdownV2' });
  }

  /** /help 命令 */
  private async handleHelp() {
    const message = `
🤖 *CrowdDev Bot 命令*

/status \\- 查看系统状态
/recent \\- 最近 5 个共识
/roles \\- 查看角色列表
/help \\- 帮助信息
`;
    await this.bot.sendMessage(this.chatId, message, { parse_mode: 'MarkdownV2' });
  }
}
```

### 4.3 Telegram Bot 创建步骤

```
1. 在 Telegram 中找到 @BotFather
2. 发送 /newbot
3. 设置名称：CrowdDev Negotiation Bot
4. 设置用户名：crowddev_bot（或其他可用名）
5. 获取 Bot Token → 配置到 TELEGRAM_BOT_TOKEN
6. 创建一个群组或频道，将 Bot 加入
7. 获取 Chat ID → 配置到 TELEGRAM_CHAT_ID

获取 Chat ID 的方法：
- 将 Bot 加入群组后发送一条消息
- 访问 https://api.telegram.org/bot<TOKEN>/getUpdates
- 找到 chat.id 字段
```

### 4.4 Bot 集成到主应用

```typescript
// server/index.ts

import { CrowdDevBot } from './services/telegram-bot';

// 初始化 Bot（生产环境且配置了 token 时才启动）
let bot: CrowdDevBot | null = null;
if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
  bot = new CrowdDevBot(
    process.env.TELEGRAM_BOT_TOKEN,
    process.env.TELEGRAM_CHAT_ID
  );
  console.log('Telegram Bot initialized');
}

// 在协商引擎中注入通知
negotiationEngine.on('consensus_reached', async (session, consensus) => {
  if (bot) await bot.notifyConsensus(session, consensus);
});

// 全局错误处理
process.on('unhandledRejection', (error: Error) => {
  if (bot) bot.notifyError('Unhandled Rejection', error);
});
```

---

## 五、开源组件清单

### 5.1 后端依赖

| 包名 | 版本 | 用途 | 许可证 |
|------|------|------|--------|
| express | ^4.18 | HTTP 框架 | MIT |
| better-sqlite3 | ^11.0 | SQLite 驱动 | MIT |
| @anthropic-ai/sdk | ^0.30 | Claude API | MIT |
| zod | ^3.23 | 输入校验 | MIT |
| dotenv | ^16.4 | 环境变量 | BSD-2 |
| uuid | ^9.0 | UUID 生成 | MIT |
| markdown-it | ^14.0 | Markdown 解析 | MIT |
| js-yaml | ^4.1 | YAML 解析 | MIT |
| node-telegram-bot-api | ^0.66 | Telegram Bot | MIT |
| cors | ^2.8 | CORS 中间件 | MIT |
| helmet | ^7.1 | 安全头 | MIT |
| winston | ^3.11 | 日志 | MIT |

### 5.2 前端依赖

| 包名 | 版本 | 用途 | 许可证 |
|------|------|------|--------|
| react | ^18.3 | UI 框架 | MIT |
| react-dom | ^18.3 | DOM 渲染 | MIT |
| react-router-dom | ^6.22 | 路由 | MIT |
| zustand | ^4.5 | 状态管理 | MIT |
| recharts | ^2.12 | 图表 | MIT |
| lucide-react | ^0.356 | 图标 | ISC |
| tailwindcss | ^3.4 | 样式 | MIT |
| clsx | ^2.1 | 类名合并 | MIT |
| date-fns | ^3.3 | 日期处理 | MIT |

### 5.3 开发依赖

| 包名 | 用途 |
|------|------|
| typescript ^5.4 | 类型系统 |
| vite ^5.1 | 构建工具 |
| vitest ^1.3 | 测试运行器 |
| playwright ^1.42 | E2E 测试 |
| supertest ^6.3 | API 测试 |
| eslint ^8.57 | 代码检查 |
| prettier ^3.2 | 代码格式 |
| tsx ^4.7 | TS 直接运行 |
| concurrently ^8.2 | 并行启动 |

---

## 六、本地开发环境

### 6.1 系统要求

| 要求 | 最低版本 |
|------|---------|
| Node.js | 20 LTS |
| npm | 10+ |
| Git | 2.40+ |
| 操作系统 | macOS / Linux / WSL2 |

### 6.2 快速启动

```bash
# 1. 克隆项目
git clone https://github.com/your-org/crowddev.git
cd crowddev

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY 和 VOLCENGINE_API_KEY

# 4. 初始化数据库（自动创建）
npm run db:init

# 5. 启动开发服务器（前端 + 后端同时启动）
npm run dev

# 前端: http://localhost:5173
# 后端: http://localhost:3000
# API:  http://localhost:3000/api
```

### 6.3 package.json scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:client": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "tsc -p tsconfig.server.json",
    "start": "node dist/server/index.js",
    "db:init": "tsx server/db/init.ts",
    "db:backup": "cp $DB_PATH $DB_PATH.bak.$(date +%Y%m%d)",
    "test": "vitest run",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint . --ext .ts,.tsx",
    "format": "prettier --write ."
  }
}
```

---

## 七、生产部署 Checklist

### 7.1 部署前

- [ ] 所有测试通过（`npm test`）
- [ ] 构建成功（`npm run build`）
- [ ] 环境变量已在 Railway 配置
- [ ] Volume 已创建并挂载到 /data
- [ ] API Key 有效（Claude + 火山引擎）
- [ ] Telegram Bot Token 有效（可选）

### 7.2 部署后验证

- [ ] 健康检查通过：`curl https://your-app.up.railway.app/api/health`
- [ ] 预置角色加载成功
- [ ] 创建协商会话成功
- [ ] LLM 调用正常（表态步骤可执行）
- [ ] SSE 推送正常
- [ ] 数据库持久化（重启后数据不丢失）
- [ ] Telegram Bot 响应（/status 命令）

### 7.3 监控

```typescript
// server/api/health.ts

app.get('/api/health', async (req, res) => {
  const checks = {
    server: 'ok',
    database: await checkDatabase(),
    claude: await checkClaudeAPI(),
    volcengine: await checkVolcEngine(),
    telegram: bot ? 'connected' : 'disabled',
  };

  const allOk = Object.values(checks).every(v => v === 'ok' || v === 'connected' || v === 'disabled');
  res.status(allOk ? 200 : 503).json(checks);
});
```

---

## 八、成本总览

### MVP 阶段月度成本估算

| 项目 | 服务商 | 月成本 | 说明 |
|------|--------|--------|------|
| 计算 + 存储 | Railway | ~$5-10 | Starter Plan |
| LLM (主力) | Anthropic Claude | ~$5-10 | 约 50 次协商 |
| LLM (预筛) | 火山引擎 豆包 | ~¥2 (~$0.3) | 低用量 |
| Telegram Bot | Telegram | $0 | 免费 |
| 域名（可选） | Cloudflare | $0-10/年 | 可用 Railway 子域名 |
| **月度合计** | | **~$10-20** | |

### 随使用量增长

| 阶段 | 协商次数/月 | Claude 费用 | 总费用 |
|------|-----------|------------|--------|
| MVP 验证 | 50 | ~$5 | ~$15 |
| 内部推广 | 200 | ~$20 | ~$35 |
| 客户接入 | 500 | ~$50 | ~$70 |

---

## 九、后续扩展路径

### Phase 2 资源升级

| 变化 | 方案 |
|------|------|
| 多用户并发 | Railway 扩容 → 1 vCPU + 1GB RAM |
| 数据量增长 | SQLite → PostgreSQL（Railway 原生支持） |
| 文件存储 | Railway Volume → Cloudflare R2（如需大量文档） |
| 多人协作 | 添加认证层（NextAuth / Clerk） |
| WebSocket | Express → Socket.io（SSE 升级） |

### Phase 3-4 资源规划

| 变化 | 方案 |
|------|------|
| 独立产品 | Railway 生产环境 + 自定义域名 |
| 多项目/多租户 | PostgreSQL + Row Level Security |
| 运营数据接入 | 消息队列（BullMQ + Redis on Railway） |
| 全球加速 | Cloudflare CDN + Railway 多 Region |
