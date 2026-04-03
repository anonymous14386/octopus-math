const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { StudySession, Problem } = require('../database');

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.MATH_MODEL || 'claude-sonnet-4-6';

const LESSON_PROMPT = `You are an expert math tutor. Given the following course material from a math class, analyze and generate structured study content.

Return a JSON object with this exact structure (no practice problems — those are generated separately):
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
      }
    }
  ]
}

Use LaTeX notation for all math (e.g., $x^2 + 1$, \\\\frac{a}{b}).
Course material:
`;

function makeProblemPrompt(topicName, explanation, keyFormulas, existing, targets) {
  const existingList = existing.length > 0
    ? 'EXISTING QUESTIONS (do not duplicate these):\n' + existing.map((q, i) => `${i + 1}. ${q}`).join('\n') + '\n\n'
    : '';

  return `You are an expert math tutor. Generate practice problems for the following topic.

Topic: ${topicName}
Explanation: ${explanation || ''}
Key formulas: ${(keyFormulas || []).join(', ')}

${existingList}Generate exactly the following problems:
- ${targets.easy} easy problems
- ${targets.medium} medium problems
- ${targets.hard} hard problems

Return ONLY a JSON object, no other text:
{
  "easy": [{"question": "...", "hint": "...", "solution": "step-by-step..."}],
  "medium": [{"question": "...", "hint": "...", "solution": "step-by-step..."}],
  "hard": [{"question": "...", "hint": "...", "solution": "step-by-step..."}]
}

All math in LaTeX $...$ notation. Solutions must show each step on a new line.`;
}

// POST /api/study/:sessionId/generate
router.post('/:sessionId/generate', async (req, res) => {
  const { sessionId } = req.params;

  const session = await StudySession.findByPk(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!session.rawText) return res.status(400).json({ error: 'Session has no content to process.' });

  try {
    await session.update({ status: 'processing' });

    // Trim input to ~12k chars to stay well within context limits
    const inputText = session.rawText.length > 12000
      ? session.rawText.slice(0, 12000) + '\n...[truncated]'
      : session.rawText;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: LESSON_PROMPT + inputText }],
    });

    const raw = message.content[0].text;
    // Handle markdown code block or bare JSON
    let jsonStr = raw;
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlock) {
      jsonStr = codeBlock[1].trim();
    } else {
      const objMatch = raw.match(/\{[\s\S]*\}/);
      if (!objMatch) throw new Error('No JSON found in model response');
      jsonStr = objMatch[0];
    }
    const parsed = JSON.parse(jsonStr);

    const topics = parsed.topics || [];
    const subject = parsed.subject || 'Precalculus';

    await session.update({
      topics: JSON.stringify(topics),
      subject,
      status: 'ready',
    });

    return res.json({ topics });
  } catch (err) {
    console.error('Study generation error:', err);
    await session.update({ status: 'failed' });
    return res.status(500).json({ error: 'Failed to generate study guide.' });
  }
});

// POST /api/study/:sessionId/topics/:topicName/problems
// Generate problems for a topic up to target counts per difficulty.
// Body: { targets: { easy: 10, medium: 10, hard: 10 } }  (defaults to 10 each)
router.post('/:sessionId/topics/:topicName/problems', express.json(), async (req, res) => {
  const { sessionId, topicName } = req.params;
  const targets = { easy: 10, medium: 10, hard: 10, ...(req.body.targets || {}) };

  const session = await StudySession.findByPk(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status !== 'ready') return res.status(400).json({ error: 'Session not ready.' });

  // Find topic details for context
  let topicData = {};
  try {
    const allTopics = JSON.parse(session.topics || '[]');
    topicData = allTopics.find(t => t.name === topicName) || {};
  } catch { /* ignore */ }

  // Check existing counts per difficulty
  const existing = await Problem.findAll({ where: { sessionId, topicName } });
  const counts = { easy: 0, medium: 0, hard: 0 };
  const existingQuestions = [];
  for (const p of existing) {
    counts[p.difficulty] = (counts[p.difficulty] || 0) + 1;
    existingQuestions.push(p.question);
  }

  const needed = {
    easy: Math.max(0, targets.easy - counts.easy),
    medium: Math.max(0, targets.medium - counts.medium),
    hard: Math.max(0, targets.hard - counts.hard),
  };

  if (needed.easy + needed.medium + needed.hard === 0) {
    return res.json({ created: 0, message: 'Already at target counts.' });
  }

  try {
    const prompt = makeProblemPrompt(
      topicName,
      topicData.explanation || '',
      topicData.keyFormulas || [],
      existingQuestions,
      needed,
    );

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
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
    const parsed = JSON.parse(jsonStr);

    let created = 0;
    for (const diff of ['easy', 'medium', 'hard']) {
      const probs = parsed[diff] || [];
      for (const prob of probs) {
        if (!prob.question) continue;
        await Problem.create({
          sessionId,
          topicName,
          question: prob.question,
          hint: prob.hint || '',
          solution: prob.solution || '',
          difficulty: diff,
          reviewFlag: false,
        });
        created++;
      }
    }

    return res.json({ created });
  } catch (err) {
    console.error('Problem generation error:', err);
    return res.status(500).json({ error: 'Failed to generate problems.' });
  }
});

// GET /api/study/:sessionId/topics/:topicName/problems/counts
router.get('/:sessionId/topics/:topicName/problems/counts', async (req, res) => {
  const { sessionId, topicName } = req.params;
  const problems = await Problem.findAll({ where: { sessionId, topicName } });
  const counts = { easy: 0, medium: 0, hard: 0, total: problems.length };
  for (const p of problems) counts[p.difficulty]++;
  return res.json(counts);
});

// GET /api/study/:sessionId
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = await StudySession.findByPk(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const data = session.toJSON();
  if (data.topics) {
    try { data.topics = JSON.parse(data.topics); } catch { data.topics = []; }
  } else {
    data.topics = [];
  }

  return res.json(data);
});

// GET /api/study?classId=X
router.get('/', async (req, res) => {
  const where = {};
  if (req.query.classId) where.classId = parseInt(req.query.classId);
  const sessions = await StudySession.findAll({ where, order: [['createdAt', 'DESC']] });
  const result = sessions.map(s => {
    const data = s.toJSON();
    if (data.topics) {
      try { data.topics = JSON.parse(data.topics); } catch { data.topics = []; }
    } else {
      data.topics = [];
    }
    return data;
  });
  return res.json(result);
});

// DELETE /api/study/:sessionId
router.delete('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = await StudySession.findByPk(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  await Problem.destroy({ where: { sessionId } });
  await session.destroy();

  return res.json({ ok: true });
});

module.exports = router;
