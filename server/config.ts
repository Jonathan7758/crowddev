import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/crowddev.db',
  projectDocsPath: process.env.PROJECT_DOCS_PATH || './project-docs',
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
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
    apiKey: process.env.VOLCENGINE_API_KEY || '',
    baseUrl: process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
    model: process.env.VOLCENGINE_MODEL || 'doubao-pro-256k',
    defaults: {
      screening: { maxTokens: 2000 },
      summarize: { maxTokens: 1000 },
    },
    maxRetries: 2,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
    llm: process.env.LOG_LLM === 'true',
    db: process.env.LOG_DB === 'true',
    sse: process.env.LOG_SSE === 'true',
    api: process.env.LOG_API === 'true',
  },
};
