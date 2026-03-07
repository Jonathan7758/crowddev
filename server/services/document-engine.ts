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

export interface DocumentInfo {
  id?: string;
  filename: string;
  path?: string;
  size: number;
  source: 'local' | 'uploaded';
}

export const documentEngine = {
  /** List documents from both server-side directory and uploaded docs in DB */
  listDocuments(): DocumentInfo[] {
    // Server-side docs from project-docs directory
    const localDocs: DocumentInfo[] = [];
    const docsPath = config.projectDocsPath;
    if (fs.existsSync(docsPath)) {
      const files = fs.readdirSync(docsPath)
        .filter(f => f.endsWith('.md'))
        .sort();
      for (const f of files) {
        const fullPath = path.join(docsPath, f);
        const stat = fs.statSync(fullPath);
        localDocs.push({ filename: f, path: fullPath, size: stat.size, source: 'local' });
      }
    }

    // Uploaded docs from database
    const uploadedDocs = this.listUploadedDocuments();

    return [...localDocs, ...uploadedDocs];
  },

  /** List uploaded documents from DB */
  listUploadedDocuments(): DocumentInfo[] {
    const db = getDb();
    const rows = db.prepare('SELECT id, filename, file_size, created_at FROM uploaded_documents ORDER BY created_at DESC').all();
    return rows.map((r: any) => ({
      id: r.id,
      filename: r.filename,
      size: r.file_size,
      source: 'uploaded' as const,
    }));
  },

  /** Save an uploaded document to DB */
  saveUploadedDocument(filename: string, content: string): DocumentInfo {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fileSize = Buffer.byteLength(content, 'utf-8');
    db.prepare(
      'INSERT INTO uploaded_documents (id, filename, content, file_size, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, filename, content, fileSize, now);
    logger.info(`Uploaded document saved: ${filename} (${id})`);
    return { id, filename, size: fileSize, source: 'uploaded' };
  },

  /** Delete an uploaded document from DB */
  deleteUploadedDocument(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM uploaded_documents WHERE id = ?').run(id);
    if (result.changes > 0) {
      // Also delete related cache entries
      db.prepare('DELETE FROM document_cache WHERE file_path = ?').run(`uploaded:${id}`);
      logger.info(`Uploaded document deleted: ${id}`);
      return true;
    }
    return false;
  },

  /** Get content of an uploaded document from DB */
  getUploadedContent(id: string): string | null {
    const db = getDb();
    const row = db.prepare('SELECT content FROM uploaded_documents WHERE id = ?').get(id) as any;
    return row ? row.content : null;
  },

  /** Parse document - supports both file path and uploaded doc ID */
  parseDocument(filePathOrId: string, isUploaded: boolean = false): Section[] {
    if (isUploaded) {
      const content = this.getUploadedContent(filePathOrId);
      if (!content) {
        throw new Error(`Uploaded document not found: ${filePathOrId}`);
      }
      return parseMarkdownSections(content);
    }
    if (!fs.existsSync(filePathOrId)) {
      throw new Error(`Document not found: ${filePathOrId}`);
    }
    const content = fs.readFileSync(filePathOrId, 'utf-8');
    return parseMarkdownSections(content);
  },

  /**
   * Compute hash for content string (for uploaded docs)
   */
  computeContentHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  },

  /**
   * Get cached screening results or return null
   */
  getCachedScreening(filePathOrId: string, isUploaded: boolean = false): ScreenedSection[] | null {
    try {
      const cacheKey = isUploaded ? `uploaded:${filePathOrId}` : filePathOrId;
      let hash: string;
      if (isUploaded) {
        const content = this.getUploadedContent(filePathOrId);
        if (!content) return null;
        hash = this.computeContentHash(content);
      } else {
        hash = computeFileHash(filePathOrId);
      }
      const db = getDb();
      const row = db.prepare(
        'SELECT screened_sections FROM document_cache WHERE file_path = ? AND file_hash = ?'
      ).get(cacheKey, hash) as any;
      if (row) {
        logger.info(`Cache hit for screening: ${cacheKey}`);
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
  cacheScreening(filePathOrId: string, results: ScreenedSection[], isUploaded: boolean = false): void {
    try {
      const cacheKey = isUploaded ? `uploaded:${filePathOrId}` : filePathOrId;
      let hash: string;
      if (isUploaded) {
        const content = this.getUploadedContent(filePathOrId);
        if (!content) return;
        hash = this.computeContentHash(content);
      } else {
        hash = computeFileHash(filePathOrId);
      }
      const db = getDb();
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      // Delete old cache entries for this file
      db.prepare('DELETE FROM document_cache WHERE file_path = ?').run(cacheKey);
      db.prepare(
        'INSERT INTO document_cache (id, file_path, file_hash, screened_sections, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, cacheKey, hash, JSON.stringify(results), now);
      logger.info(`Cached screening results for: ${cacheKey}`);
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
