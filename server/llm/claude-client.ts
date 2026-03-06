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
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.model = config.anthropic.model;
  }

  async complete(systemPrompt: string, messages: ChatMessage[], maxTokens?: number): Promise<string> {
    const tokens = maxTokens || config.anthropic.defaults.rolePlay.maxTokens;

    for (let attempt = 0; attempt <= config.anthropic.maxRetries; attempt++) {
      try {
        if (config.log.llm) {
          logger.debug('Claude API call', { system: systemPrompt.slice(0, 200), messageCount: messages.length });
        }

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

        if (config.log.llm) {
          logger.debug('Claude response', { text: text.slice(0, 200), tokens: response.usage });
        }

        return text;
      } catch (error: any) {
        logger.error(`Claude API error (attempt ${attempt + 1})`, { error: error.message });
        if (attempt < config.anthropic.maxRetries) {
          await this.delay(config.anthropic.retryDelayMs * (attempt + 1));
        } else {
          throw error;
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
