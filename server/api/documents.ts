import { Router } from 'express';
import path from 'path';
import { config } from '../config.js';
import { documentEngine } from '../services/document-engine.js';
import { roleEngine } from '../services/role-engine.js';

const router = Router();

router.get('/', (_req, res) => {
  const docs = documentEngine.listDocuments();
  res.json(docs);
});

router.get('/:filename/sections', (req, res) => {
  const filePath = path.join(config.projectDocsPath, req.params.filename);
  try {
    const sections = documentEngine.parseDocument(filePath);
    res.json(sections);
  } catch {
    res.status(404).json({ error: 'Document not found' });
  }
});

router.post('/:filename/screen', async (req, res) => {
  const filePath = path.join(config.projectDocsPath, req.params.filename);
  try {
    const sections = documentEngine.parseDocument(filePath);
    const roles = roleEngine.list();
    const roleNames = roles.map(r => r.name);
    const screened = await documentEngine.screenSections(sections, roleNames);
    res.json(screened);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/extract-topics', async (req, res) => {
  const { filename, sectionIndices } = req.body;
  const filePath = path.join(config.projectDocsPath, filename);
  try {
    const allSections = documentEngine.parseDocument(filePath);
    const selected = allSections.filter(s => sectionIndices.includes(s.index));
    const roles = roleEngine.list();
    const roleNames = roles.map(r => r.name);
    const topics = await documentEngine.extractTopics(selected, roleNames);
    res.json(topics);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
