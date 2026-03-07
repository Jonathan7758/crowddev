import { Router } from 'express';
import path from 'path';
import { config } from '../config.js';
import { documentEngine } from '../services/document-engine.js';
import { roleEngine } from '../services/role-engine.js';
import { logger } from '../logger.js';

const router = Router();

// List all documents (server-side + uploaded)
router.get('/', (_req, res) => {
  const docs = documentEngine.listDocuments();
  res.json(docs);
});

// Upload a document (receive content as JSON)
router.post('/upload', (req, res) => {
  const { filename, content } = req.body;

  if (!filename || typeof filename !== 'string') {
    return res.status(400).json({ error: '请提供文件名' });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: '请提供文件内容' });
  }
  if (!filename.endsWith('.md')) {
    return res.status(400).json({ error: '仅支持 .md 格式的文件' });
  }

  try {
    const doc = documentEngine.saveUploadedDocument(filename, content);
    res.status(201).json(doc);
  } catch (error: any) {
    logger.error('Upload failed', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Delete an uploaded document
router.delete('/uploaded/:id', (req, res) => {
  const deleted = documentEngine.deleteUploadedDocument(req.params.id);
  if (deleted) {
    res.status(204).end();
  } else {
    res.status(404).json({ error: '文档未找到' });
  }
});

// Get document sections (supports both local and uploaded)
router.get('/:filename/sections', (req, res) => {
  const { source, id } = req.query;
  const isUploaded = source === 'uploaded';

  try {
    let sections;
    if (isUploaded && id) {
      sections = documentEngine.parseDocument(id as string, true);
    } else {
      const filePath = path.join(config.projectDocsPath, req.params.filename);
      sections = documentEngine.parseDocument(filePath);
    }
    res.json(sections);
  } catch (error: any) {
    logger.error(`Failed to parse document: ${req.params.filename}`, { error: error.message });
    res.status(404).json({ error: 'Document not found' });
  }
});

// Screen document sections with AI (with caching, supports uploaded docs)
router.post('/:filename/screen', async (req, res) => {
  const { source, id } = req.query;
  const isUploaded = source === 'uploaded';
  const useCache = req.query.cache !== 'false';

  try {
    const docKey = isUploaded && id ? (id as string) : path.join(config.projectDocsPath, req.params.filename);

    // Check cache first
    if (useCache) {
      const cached = documentEngine.getCachedScreening(docKey, isUploaded);
      if (cached) {
        return res.json(cached);
      }
    }

    const sections = documentEngine.parseDocument(docKey, isUploaded);
    const roles = roleEngine.list();
    const roleNames = roles.map(r => r.name);

    if (roleNames.length === 0) {
      return res.status(400).json({ error: '请先创建角色后再进行预筛' });
    }

    const screened = await documentEngine.screenSections(sections, roleNames);

    // Cache the results
    documentEngine.cacheScreening(docKey, screened, isUploaded);

    res.json(screened);
  } catch (error: any) {
    logger.error(`Screening failed: ${req.params.filename}`, { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Extract topics from selected sections (supports uploaded docs)
router.post('/extract-topics', async (req, res) => {
  const { filename, sectionIndices, source, id } = req.body;

  if (!filename || !Array.isArray(sectionIndices) || sectionIndices.length === 0) {
    return res.status(400).json({ error: '请提供文件名和章节索引' });
  }

  const isUploaded = source === 'uploaded';

  try {
    const docKey = isUploaded && id ? id : path.join(config.projectDocsPath, filename);
    const allSections = documentEngine.parseDocument(docKey, isUploaded);
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
