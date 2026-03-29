const express = require('express');
const OpenAI = require('openai');
const { StudySession, Problem } = require('../database');

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

// POST /api/study/:sessionId/generate
router.post('/:sessionId/generate', async (req, res) => {
  const { sessionId } = req.params;

  const session = await StudySession.findByPk(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (!session.rawText) return res.status(400).json({ error: 'Session has no content to process.' });

  try {
    await session.update({ status: 'processing' });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: LESSON_PROMPT + session.rawText,
        },
      ],
      max_tokens: 4096,
    });

    const content = completion.choices[0].message.content;
    const parsed = JSON.parse(content);

    const topics = parsed.topics || [];
    const subject = parsed.subject || 'Precalculus';

    // Persist practice problems to Problems table
    await Problem.destroy({ where: { sessionId } });
    for (const topic of topics) {
      if (topic.practiceProblems && Array.isArray(topic.practiceProblems)) {
        for (const prob of topic.practiceProblems) {
          await Problem.create({
            sessionId,
            topicName: topic.name,
            question: prob.question,
            hint: prob.hint || '',
            solution: prob.solution || '',
            difficulty: ['easy', 'medium', 'hard'].includes(prob.difficulty) ? prob.difficulty : 'medium',
          });
        }
      }
    }

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

// GET /api/study
router.get('/', async (req, res) => {
  const sessions = await StudySession.findAll({ order: [['createdAt', 'DESC']] });
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
