const express = require('express');
const { StudySession, Problem, QuizAttempt } = require('../database');

const router = express.Router();

// GET /api/quiz/:sessionId — return all problems for session (flattened from topics)
router.get('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  const session = await StudySession.findByPk(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });

  const problems = await Problem.findAll({ where: { sessionId } });
  return res.json(problems);
});

// POST /api/quiz/attempt — record a quiz attempt
router.post('/attempt', express.json(), async (req, res) => {
  const { sessionId, problemId, correct } = req.body;

  if (sessionId == null || problemId == null || correct == null) {
    return res.status(400).json({ error: 'sessionId, problemId, and correct are required.' });
  }

  await QuizAttempt.create({
    sessionId,
    problemId: String(problemId),
    correct: Boolean(correct),
  });

  return res.json({ ok: true });
});

// GET /api/quiz/:sessionId/stats
router.get('/:sessionId/stats', async (req, res) => {
  const { sessionId } = req.params;

  const attempts = await QuizAttempt.findAll({ where: { sessionId } });
  const problems = await Problem.findAll({ where: { sessionId } });

  const problemMap = {};
  for (const p of problems) {
    problemMap[String(p.id)] = p.topicName;
  }

  const total = attempts.length;
  const correct = attempts.filter(a => a.correct).length;

  const byTopicMap = {};
  for (const attempt of attempts) {
    const topic = problemMap[attempt.problemId] || 'Unknown';
    if (!byTopicMap[topic]) byTopicMap[topic] = { topic, total: 0, correct: 0 };
    byTopicMap[topic].total++;
    if (attempt.correct) byTopicMap[topic].correct++;
  }

  const byTopic = Object.values(byTopicMap);

  return res.json({ total, correct, byTopic });
});

module.exports = router;
