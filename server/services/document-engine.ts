import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { llmCompleteJson } from '../llm/llm-router.js';
import { SCREENING_SYSTEM, buildScreeningUserMessage } from '../llm/templates/screening.js';
import { TOPIC_EXTRACTION_SYSTEM, buildTopicExtractionUserMessage } from '../llm/templates/topic-extraction.js';
import type { Section, ScreenedSection, Topic } from '../../src/types/document.js';

function parseMarkdownSections(content: string): Section[] {
  const lines = content.split('\n');
  const sections: Section[] = [];
  let currentTitle = '';
  let currentContent = '';
  let inCodeBlock = false;
  let sectionIndex = 0;

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentContent += line + '\n';
      continue;
    }
    if (!inCodeBlock && /^#{1,3}\s/.test(line)) {
      if (currentTitle || currentContent.trim()) {
        const text = currentContent.trim();
        if (text.length >= 30) {
          sections.push({
            index: sectionIndex++,
            title: currentTitle,
            content: text,
            charCount: text.length,
          });
        }
      }
      currentTitle = line.replace(/^#{1,3}\s+/, '').trim();
      currentContent = '';
    } else {
      currentContent += line + '\n';
    }
  }

  if (currentTitle && currentContent.trim().length >= 30) {
    sections.push({
      index: sectionIndex,
      title: currentTitle,
      content: currentContent.trim(),
      charCount: currentContent.trim().length,
    });
  }

  return sections;
}

function extractSummary(content: string, maxLen: number = 300): string {
  const textOnly = content.replace(/```[\s\S]*?```/g, '').replace(/[#*`|>-]/g, '').trim();
  return textOnly.length > maxLen ? textOnly.slice(0, maxLen) + '...' : textOnly;
}

export const documentEngine = {
  listDocuments(): Array<{ filename: string; path: string }> {
    const docsPath = config.projectDocsPath;
    if (!fs.existsSync(docsPath)) return [];
    return fs.readdirSync(docsPath)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ filename: f, path: path.join(docsPath, f) }));
  },

  parseDocument(filePath: string): Section[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseMarkdownSections(content);
  },

  async screenSections(sections: Section[], roleNames: string[]): Promise<ScreenedSection[]> {
    const summaries = sections.map(s => ({
      index: s.index,
      title: s.title,
      summary: extractSummary(s.content),
    }));

    const userMsg = buildScreeningUserMessage(summaries, roleNames);
    const results = await llmCompleteJson<Array<{ index: number; score: number; value: string; reason: string; conflictHint: string }>>(
      'screening',
      SCREENING_SYSTEM,
      [{ role: 'user', content: userMsg }]
    );

    return sections.map(section => {
      const result = results.find(r => r.index === section.index);
      return {
        ...section,
        score: result?.score ?? 5,
        value: (result?.value as 'high' | 'medium' | 'low') ?? 'medium',
        reason: result?.reason ?? '',
        conflictHint: result?.conflictHint ?? '',
      };
    });
  },

  async extractTopics(sections: Section[], roleNames: string[]): Promise<Topic[]> {
    const userMsg = buildTopicExtractionUserMessage(
      sections.map(s => ({ title: s.title, content: s.content })),
      roleNames
    );
    return llmCompleteJson<Topic[]>('topic_extraction', TOPIC_EXTRACTION_SYSTEM, [{ role: 'user', content: userMsg }]);
  },
};
