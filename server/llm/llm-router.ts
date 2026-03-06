import { claudeClient } from './claude-client.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

type LLMTask =
  | 'role_opinion'
  | 'role_debate'
  | 'conflict_analysis'
  | 'consensus'
  | 'screening'
  | 'topic_extraction'
  | 'prd_update'
  | 'summarize';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const TASK_CONFIG: Record<LLMTask, { provider: 'claude' | 'volcengine'; maxTokens: number }> = {
  role_opinion: { provider: 'claude', maxTokens: 1500 },
  role_debate: { provider: 'claude', maxTokens: 1500 },
  conflict_analysis: { provider: 'claude', maxTokens: 2000 },
  consensus: { provider: 'claude', maxTokens: 2000 },
  screening: { provider: 'claude', maxTokens: 2000 },
  topic_extraction: { provider: 'claude', maxTokens: 2000 },
  prd_update: { provider: 'claude', maxTokens: 3000 },
  summarize: { provider: 'claude', maxTokens: 1000 },
};

export async function llmComplete(task: LLMTask, systemPrompt: string, messages: ChatMessage[]): Promise<string> {
  const taskConfig = TASK_CONFIG[task];
  logger.info(`LLM routing: ${task} → claude`);
  return claudeClient.complete(systemPrompt, messages, taskConfig.maxTokens);
}

export async function llmCompleteJson<T>(task: LLMTask, systemPrompt: string, messages: ChatMessage[]): Promise<T> {
  const taskConfig = TASK_CONFIG[task];
  logger.info(`LLM routing (JSON): ${task} → claude`);
  return claudeClient.completeJson<T>(systemPrompt, messages, taskConfig.maxTokens);
}
