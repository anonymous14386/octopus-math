#!/usr/bin/env node
/**
 * Bulk import PDFs into octopus-math study sessions.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node server/scripts/import-pdfs.js [/path/to/pdfs]
 *
 * - Skips PDFs that already have a session with the same title.
 * - Generates study content for each new session via Claude.
 * - Runs from the octopus-math/ directory (needs node_modules present).
 *
 * Set MATH_PDFS_DIR env var as an alternative to the CLI argument.
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Load .env from octopus-math root if present (local dev)
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const pdfParse = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');
const { sequelize, StudySession, Problem, initDb } = require('../database');

const MODEL = process.env.MATH_MODEL || 'claude-sonnet-4-6';
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const LESSON_PROMPT = `You are an expert math tutor. Given the following course material from a math class, analyze and generate structured study content.

Return a JSON object with this exact structure:
{
  "subject": "detected subject name",
  "topics": [
    {
      "name": "Topic Name",
      "explanation": "Clear, student-friendly explanation of the concept (2-3 paragraphs)",
      "keyFormulas": ["formula1 in LaTeX", "formula2 in LaTeX"],
      "workedExample": {
        "problem": "Example problem statement",
        "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
        "answer": "Final answer"
      },
      "practiceProblems": [
        {
          "difficulty": "easy|medium|hard",
          "question": "Problem statement",
          "hint": "A helpful hint without giving away the answer",
          "solution": "Complete step-by-step solution"
        }
      ]
    }
  ]
}

Use LaTeX notation for all math (e.g., $x^2 + 1$, \\\\frac{a}{b}).
Generate 2-3 practice problems per topic (mix of difficulties).
Course material:
`;

async function generateStudy(session) {
  const inputText = session.rawText.length > 12000
    ? session.rawText.slice(0, 12000) + '\n...[truncated]'
    : session.rawText;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: 'user', content: LESSON_PROMPT + inputText }],
  });

  const raw = message.content[0].text;
  let jsonStr = raw;
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    jsonStr = codeBlock[1].trim();
  } else {
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (!objMatch) throw new Error('No JSON in model response');
    jsonStr = objMatch[0];
  }
  return JSON.parse(jsonStr);
}

async function importPdf(filePath) {
  const filename = path.basename(filePath);
  // Use filename minus extension as title, cleaned up
  const title = filename.replace(/\.pdf$/i, '').replace(/ - MATH.*$/, '').trim();

  // Check for existing session
  const existing = await StudySession.findOne({ where: { title } });
  if (existing) {
    console.log(`  SKIP  already imported: ${title}`);
    return;
  }

  console.log(`  PARSE ${filename}`);
  const buf = fs.readFileSync(filePath);
  let text;
  try {
    const data = await pdfParse(buf);
    text = data.text;
  } catch (e) {
    console.error(`  ERROR parsing PDF: ${e.message}`);
    return;
  }

  if (!text || text.trim().length < 50) {
    console.error(`  ERROR extracted text too short, skipping`);
    return;
  }

  const session = await StudySession.create({
    title,
    rawText: text,
    status: 'processing',
  });

  console.log(`  GEN   calling Claude for "${title}"...`);
  try {
    const parsed = await generateStudy(session);
    const topics = parsed.topics || [];
    const subject = parsed.subject || 'Precalculus';

    await Problem.destroy({ where: { sessionId: session.id } });
    for (const topic of topics) {
      if (topic.practiceProblems && Array.isArray(topic.practiceProblems)) {
        for (const prob of topic.practiceProblems) {
          await Problem.create({
            sessionId: session.id,
            topicName: topic.name,
            question: prob.question,
            hint: prob.hint || '',
            solution: prob.solution || '',
            difficulty: ['easy', 'medium', 'hard'].includes(prob.difficulty) ? prob.difficulty : 'medium',
          });
        }
      }
    }

    await session.update({ topics: JSON.stringify(topics), subject, status: 'ready' });
    console.log(`  DONE  ${topics.length} topic(s), session #${session.id}`);
  } catch (e) {
    console.error(`  ERROR generating study guide: ${e.message}`);
    await session.update({ status: 'failed' });
  }
}

async function main() {
  const dir = process.argv[2] || process.env.MATH_PDFS_DIR;
  if (!dir) {
    console.error('Usage: node server/scripts/import-pdfs.js /path/to/pdfs');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }

  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`ERROR: not a directory: ${dir}`);
    process.exit(1);
  }

  await initDb();

  const files = fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(f => path.join(dir, f))
    .sort();

  if (files.length === 0) {
    console.log('No PDF files found in', dir);
    process.exit(0);
  }

  console.log(`Found ${files.length} PDF(s) in ${dir}\n`);

  for (const file of files) {
    console.log(`[${files.indexOf(file) + 1}/${files.length}] ${path.basename(file)}`);
    await importPdf(file);
    console.log('');
  }

  console.log('Import complete.');
  await sequelize.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
