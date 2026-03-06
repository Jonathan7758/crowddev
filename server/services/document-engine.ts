import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { getDb } from '../db/database.js';
import { llmCompleteJson } from '../llm/llm-router.js';
import { SCREENING_SYSTEM, buildScreeningUserMessage } from '../llm/templates/screening.js';
import { TOPIC_EXTRACTION_SYSTEM, buildTopicExtractionUserMessage } from '../llm/templates/topic-extraction.js';
import type { Section, ScreenedSection, Topic } from '../../src/types/document.js';

export function parseMarkdownSections(content: string): Section[] {
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

function computeFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export const documentEngine = {
  listDocuments(): Array<{ filename: string; path: string; size: number }> {
    const docsPath = config.projectDocsPath;
    if (!fs.existsSync(docsPath)) {
      logger.warn(`Project docs path not found: ${docsPath}`);
      return [];
    }
    return fs.readdirSync(docsPath)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => {
        const fullPath = path.join(docsPath, f);
        const stat = fs.statSync(fullPath);
        return { filename: f, path: fullPath, size: stat.size };
      });
  },

  parseDocument(filePath: string): Section[] {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Document not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseMarkdownSections(content);
  },

  /**
   * Get cached screening results or return null
   */
  getCachedScreening(filePath: string): ScreenedSection[] | null {
    try {
      const hash = computeFileHash(filePath);
      const db = getDb();
      const row = db.prepare(
        'SELECT screened_sections FROM document_cache WHERE file_path = ? AND file_hash = ?'
      ).get(filePath, hash) as any;
      if (row) {
        logger.info(`Cache hit for screening: ${filePath}`);
        return JSON.parse(row.screened_sections);
      }
    } catch (error: any) {
      logger.warn(`Cache read error: ${error.message}`);
    }
    return null;
  },

  /**
   * Save screening results to cache
   */
  cacheScreening(filePath: string, results: ScreenedSection[]): void {
    try {
      const hash = computeFileHash(filePath);
      const db = getDb();
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      // Delete old cache entries for this file
      db.prepare('DELETE FROM document_cache WHERE file_path = ?').run(filePath);
      db.prepare(
        'INSERT INTO document_cache (id, file_path, file_hash, screened_sections, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, filePath, hash, JSON.stringify(results), now);
      logger.info(`Cached screening results for: ${filePath}`);
    } catch (error: any) {
      logger.warn(`Cache write error: ${error.message}`);
    }
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
