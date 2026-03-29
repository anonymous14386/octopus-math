const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { createWorker } = require('tesseract.js');
const { StudySession } = require('../database');
const { spawn } = require('child_process');
const path = require('path');

const WEBASSIGN_PARSER = path.join(__dirname, '..', 'parse_webassign.py');

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

function parseWebAssign(buffer) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [WEBASSIGN_PARSER], { timeout: 30000 });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`WebAssign parser exited ${code}: ${stderr}`));
      }
      // Split study text from meta footer
      const metaIdx = stdout.lastIndexOf('\n__META__');
      const text = metaIdx >= 0 ? stdout.slice(0, metaIdx).trim() : stdout.trim();
      let meta = {};
      if (metaIdx >= 0) {
        try { meta = JSON.parse(stdout.slice(metaIdx + '\n__META__'.length).trim()); } catch { /* ignore */ }
      }
      resolve({ text, meta });
    });
    proc.stdin.write(buffer);
    proc.stdin.end();
  });
}

// Returns { text: string, suggestedTitle: string|null }
async function extractText(file) {
  const mimetype = file.mimetype;
  const ext = file.originalname.split('.').pop().toLowerCase();

  if (['text/html', 'application/xhtml+xml'].includes(mimetype) || ['html', 'htm'].includes(ext)) {
    console.log(`[webassign] parsing ${file.originalname}...`);
    const { text, meta } = await parseWebAssign(file.buffer);
    console.log(`[webassign] extracted ${meta.question_count ?? '?'} questions from ${file.originalname}`);
    return { text, suggestedTitle: meta.title || null };
  }

  if (mimetype === 'application/pdf' || ext === 'pdf') {
    const data = await pdfParse(file.buffer);
    return { text: data.text, suggestedTitle: null };
  }

  if (mimetype === 'text/plain' || ext === 'txt') {
    return { text: file.buffer.toString('utf-8'), suggestedTitle: null };
  }

  if (['image/jpeg', 'image/png', 'image/jpg'].includes(mimetype) || ['jpg', 'jpeg', 'png'].includes(ext)) {
    console.log(`[ocr] processing ${file.originalname}...`);
    const text = await ocrImage(file.buffer);
    console.log(`[ocr] extracted ${text.length} chars from ${file.originalname}`);
    return { text, suggestedTitle: null };
  }

  return { text: file.buffer.toString('utf-8'), suggestedTitle: null };
}

// POST /api/upload — multipart file upload
router.post('/', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const textParts = [];
    let suggestedTitle = null;
    for (const file of req.files) {
      const { text, suggestedTitle: st } = await extractText(file);
      textParts.push(text);
      if (st) suggestedTitle = st;
    }

    const extractedText = textParts.join('\n\n---\n\n');

    const firstFile = req.files[0];
    const title = req.body.title || suggestedTitle || firstFile.originalname.replace(/\.[^.]+$/, '');

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
