import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { robustJsonParse } from './json-parser.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class ClaudeClient {
  private client: Anthropic;
  private model: string;

  constructor() {
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
      timeout: 60_000, // 60 second timeout per request
    });
    this.model = config.anthropic.model;
  }

  async complete(systemPrompt: string, messages: ChatMessage[], maxTokens?: number): Promise<string> {
    const tokens = maxTokens || config.anthropic.defaults.rolePlay.maxTokens;

    if (!config.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    for (let attempt = 0; attempt <= config.anthropic.maxRetries; attempt++) {
      try {
        logger.info(`Claude API call (attempt ${attempt + 1}/${config.anthropic.maxRetries + 1})`, {
          model: this.model,
          maxTokens: tokens,
          systemLen: systemPrompt.length,
        });

        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: tokens,
          system: systemPrompt,
          messages: messages.map(m => ({ role: m.role, content: m.content })),
        });

        const text = response.content
          .filter(block => block.type === 'text')
          .map(block => (block as any).text)
          .join('');

        logger.info('Claude API success', {
          textLen: text.length,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
        });

        return text;
      } catch (error: any) {
        const errMsg = error.message || String(error);
        const statusCode = error.status || error.statusCode;
        logger.error(`Claude API error (attempt ${attempt + 1}/${config.anthropic.maxRetries + 1})`, {
          error: errMsg,
          status: statusCode,
          type: error.constructor?.name,
        });

        // Don't retry on auth errors or invalid request
        if (statusCode === 401 || statusCode === 403 || statusCode === 400) {
          throw new Error(`Claude API 认证失败 (${statusCode}): ${errMsg}`);
        }

        if (attempt < config.anthropic.maxRetries) {
          const delayMs = config.anthropic.retryDelayMs * (attempt + 1);
          logger.info(`Retrying in ${delayMs}ms...`);
          await this.delay(delayMs);
        } else {
          throw new Error(`Claude API 调用失败 (${config.anthropic.maxRetries + 1} 次重试后): ${errMsg}`);
        }
      }
    }

    throw new Error('Claude API: all retries exhausted');
  }

  async completeJson<T>(systemPrompt: string, messages: ChatMessage[], maxTokens?: number): Promise<T> {
    const text = await this.complete(systemPrompt, messages, maxTokens);
    return robustJsonParse<T>(text);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const claudeClient = new ClaudeClient();
