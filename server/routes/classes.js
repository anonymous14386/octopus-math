const express = require('express');
const { MathClass, StudySession } = require('../database');

const router = express.Router();

// GET /api/classes
router.get('/', async (_req, res) => {
  const classes = await MathClass.findAll({ order: [['createdAt', 'ASC']] });
  return res.json(classes);
});

// POST /api/classes
router.post('/', express.json(), async (req, res) => {
  const { name, subject, description } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required.' });
  const c = await MathClass.create({ name: name.trim(), subject: subject || 'Mathematics', description });
  return res.status(201).json(c);
});

// PUT /api/classes/:id
router.put('/:id', express.json(), async (req, res) => {
  const c = await MathClass.findByPk(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found.' });
  const { name, subject, description } = req.body;
  await c.update({ name: name ?? c.name, subject: subject ?? c.subject, description: description ?? c.description });
  return res.json(c);
});

// DELETE /api/classes/:id
router.delete('/:id', async (req, res) => {
  const c = await MathClass.findByPk(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found.' });
  // Unlink sessions rather than deleting them
  await StudySession.update({ classId: null }, { where: { classId: c.id } });
  await c.destroy();
  return res.json({ ok: true });
});

module.exports = router;
