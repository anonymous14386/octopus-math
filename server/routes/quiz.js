const express = require('express');
const { Op } = require('sequelize');
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

// PATCH /api/quiz/problems/:problemId/review — toggle review flag
router.patch('/problems/:problemId/review', express.json(), async (req, res) => {
  const { problemId } = req.params;
  const problem = await Problem.findByPk(problemId);
  if (!problem) return res.status(404).json({ error: 'Problem not found.' });
  const reviewFlag = req.body.reviewFlag != null ? Boolean(req.body.reviewFlag) : !problem.reviewFlag;
  await problem.update({ reviewFlag });
  return res.json({ ok: true, reviewFlag });
});

// GET /api/quiz/:sessionId/review-counts — problems flagged for review by topic
router.get('/:sessionId/review-counts', async (req, res) => {
  const { sessionId } = req.params;
  const problems = await Problem.findAll({ where: { sessionId, reviewFlag: true } });
  const byTopic = {};
  for (const p of problems) {
    byTopic[p.topicName] = (byTopic[p.topicName] || 0) + 1;
  }
  return res.json({ total: problems.length, byTopic });
});

module.exports = router;
