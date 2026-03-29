const express = require('express');
const session = require('express-session');
const axios = require('axios');
const path = require('path');
const { initDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3011;
const AUTH_URL = process.env.AUTH_SERVICE_URL || 'http://octopus-auth:3002';
const CORTEX_URL = process.env.CORTEX_URL || 'http://octopus-cortex:3010';

app.set('trust proxy', true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'math-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 },
}));

async function tailscaleOnly(req, res, next) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? forwarded.split(',')[0].trim() : req.ip || '').replace('::ffff:', '');
  try {
    const r = await axios.get(`${CORTEX_URL}/api/check-ip`, {
      headers: { 'x-forwarded-for': ip },
      timeout: 2000,
    });
    if (!r.data.allowed) return res.status(403).json({ error: 'Access denied. Request access via Discord.' });
    next();
  } catch {
    return res.status(403).json({ error: 'IP check unavailable.' });
  }
}

function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login');
}

// Health endpoint — no auth
app.get('/health', (_req, res) => res.json({ ok: true, service: 'octopus-math' }));

// Login page
app.get('/login', tailscaleOnly, (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', tailscaleOnly, async (req, res) => {
  const { username, password } = req.body;
  try {
    const r = await axios.post(`${AUTH_URL}/api/auth/login`, { username, password }, { timeout: 3000 });
    if (r.data.success) {
      req.session.user = { username };
      return res.json({ ok: true });
    }
    res.status(401).json({ error: r.data.error || 'Invalid credentials.' });
  } catch {
    res.status(503).json({ error: 'Auth service unavailable.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// API: current user info (used by client to check auth)
app.get('/api/me', tailscaleOnly, requireLogin, (req, res) => {
  res.json({ username: req.session.user.username });
});

// Protected API routes
const uploadRouter = require('./routes/upload');
const studyRouter = require('./routes/study');
const quizRouter = require('./routes/quiz');

app.use('/api/upload', tailscaleOnly, requireLogin, uploadRouter);
app.use('/api/study', tailscaleOnly, requireLogin, studyRouter);
app.use('/api/quiz', tailscaleOnly, requireLogin, quizRouter);

// Serve React client in production
const clientDist = path.join(__dirname, '../client/dist');
app.use(tailscaleOnly, express.static(clientDist));

// SPA fallback — serve index.html for any non-API route
app.get('*', tailscaleOnly, requireLogin, (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Octopus Math running on port ${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
