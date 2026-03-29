const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const { StudySession } = require('../database');

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

async function ocrImage(buffer) {
  const worker = await createWorker('eng', 1, { logger: () => {} });
  try {
    const { data: { text } } = await worker.recognize(buffer);
    return text;
  } finally {
    await worker.terminate();
  }
}

async function extractText(file) {
  const mimetype = file.mimetype;
  const ext = file.originalname.split('.').pop().toLowerCase();

  if (mimetype === 'application/pdf' || ext === 'pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  }

  if (mimetype === 'text/plain' || ext === 'txt') {
    return file.buffer.toString('utf-8');
  }

  if (['image/jpeg', 'image/png', 'image/jpg'].includes(mimetype) || ['jpg', 'jpeg', 'png'].includes(ext)) {
    console.log(`[ocr] processing ${file.originalname}...`);
    const text = await ocrImage(file.buffer);
    console.log(`[ocr] extracted ${text.length} chars from ${file.originalname}`);
    return text;
  }

  return file.buffer.toString('utf-8');
}

// POST /api/upload — multipart file upload
router.post('/', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const textParts = [];
    for (const file of req.files) {
      const text = await extractText(file);
      textParts.push(text);
    }

    const extractedText = textParts.join('\n\n---\n\n');

    const firstFile = req.files[0];
    const title = req.body.title || firstFile.originalname.replace(/\.[^.]+$/, '');

    const session = await StudySession.create({
      title,
      rawText: extractedText,
      status: 'pending',
    });

    return res.json({ sessionId: session.id, extractedText });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Failed to process upload.' });
  }
});

// POST /api/upload/text — paste text directly
router.post('/text', express.json(), async (req, res) => {
  try {
    const { text, title } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided.' });
    }

    const session = await StudySession.create({
      title: title || 'Pasted Material',
      rawText: text.trim(),
      status: 'pending',
    });

    return res.json({ sessionId: session.id });
  } catch (err) {
    console.error('Text upload error:', err);
    return res.status(500).json({ error: 'Failed to create session.' });
  }
});

module.exports = router;
