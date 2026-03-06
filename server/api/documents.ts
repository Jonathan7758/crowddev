import { Router } from 'express';
import path from 'path';
import { config } from '../config.js';
import { documentEngine } from '../services/document-engine.js';
import { roleEngine } from '../services/role-engine.js';
import { logger } from '../logger.js';

const router = Router();

// List all documents
router.get('/', (_req, res) => {
  const docs = documentEngine.listDocuments();
  res.json(docs);
});

// Get document sections
router.get('/:filename/sections', (req, res) => {
  const filePath = path.join(config.projectDocsPath, req.params.filename);
  try {
    const sections = documentEngine.parseDocument(filePath);
    res.json(sections);
  } catch (error: any) {
    logger.error(`Failed to parse document: ${req.params.filename}`, { error: error.message });
    res.status(404).json({ error: 'Document not found' });
  }
});

// Screen document sections with AI (with caching)
router.post('/:filename/screen', async (req, res) => {
  const filePath = path.join(config.projectDocsPath, req.params.filename);
  const useCache = req.query.cache !== 'false';

  try {
    // Check cache first
    if (useCache) {
      const cached = documentEngine.getCachedScreening(filePath);
      if (cached) {
        return res.json(cached);
      }
    }

    const sections = documentEngine.parseDocument(filePath);
    const roles = roleEngine.list();
    const roleNames = roles.map(r => r.name);

    if (roleNames.length === 0) {
      return res.status(400).json({ error: '请先创建角色后再进行预筛' });
    }

    const screened = await documentEngine.screenSections(sections, roleNames);

    // Cache the results
    documentEngine.cacheScreening(filePath, screened);

    res.json(screened);
  } catch (error: any) {
    logger.error(`Screening failed: ${req.params.filename}`, { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Extract topics from selected sections
router.post('/extract-topics', async (req, res) => {
  const { filename, sectionIndices } = req.body;

  if (!filename || !Array.isArray(sectionIndices) || sectionIndices.length === 0) {
    return res.status(400).json({ error: '请提供文件名和章节索引' });
  }

  const filePath = path.join(config.projectDocsPath, filename);
  try {
    const allSections = documentEngine.parseDocument(filePath);
    const selected = allSections.filter(s => sectionIndices.includes(s.index));

    if (selected.length === 0) {
      return res.status(400).json({ error: '未找到匹配的章节' });
    }

    const roles = roleEngine.list();
    const roleNames = roles.map(r => r.name);

    if (roleNames.length === 0) {
      return res.status(400).json({ error: '请先创建角色后再提取议题' });
    }

    const topics = await documentEngine.extractTopics(selected, roleNames);
    res.json(topics);
  } catch (error: any) {
    logger.error(`Topic extraction failed`, { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router;
