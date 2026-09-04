/**
 * ProofSnap Backend API Server
 * 
 * Provides:
 * - POST /api/detect       → AI deepfake detection proxy (SightEngine)
 * - POST /api/plagiarism   → Plagiarism / reverse image check
 * - POST /api/verify       → Verify a proof
 * - GET  /api/verify/:hash → Look up proof by file hash (Supabase)
 * - GET  /api/proofs       → Recent proofs feed (Supabase)
 * - POST /api/upload-image → Upload image to Supabase storage
 * - GET  /api/health       → Health check
 * - GET  /admin            → Admin monitoring dashboard (login: admin/admin123)
 * 
 * Storage: Supabase (PostgreSQL + Object Storage)
 * Blockchain: DataHaven Testnet (EVM-compatible, Chain ID 55931)
 * 
 * Deploy free on Render.com / Railway.app
 * Set env vars: SIGHTENGINE_USER, SIGHTENGINE_SECRET, SUPABASE_URL, SUPABASE_KEY, PORT
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Supabase (optional - gracefully degrades)
let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  }
} catch (e) {
  console.warn('Supabase not available:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3001;

// ──────────────── Admin Monitoring: Request/Response Log Store ────────────────
const MAX_LOG_ENTRIES = 500;
const apiLogs = [];

function addLog(entry) {
  apiLogs.unshift(entry);
  if (apiLogs.length > MAX_LOG_ENTRIES) apiLogs.length = MAX_LOG_ENTRIES;
}

// Admin session tokens (simple in-memory)
const adminSessions = new Set();
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

// Multer for file uploads — use memory storage (works on Vercel/serverless)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ──────────────── Request/Response Logging Middleware ────────────────
app.use((req, res, next) => {
  // Skip logging for admin UI static assets
  if (req.path === '/admin' || req.path === '/admin/login' || req.path === '/admin/logs') {
    return next();
  }

  const startTime = Date.now();
  const logEntry = {
    id: crypto.randomBytes(6).toString('hex'),
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'origin': req.headers['origin'],
    },
    body: req.body && Object.keys(req.body).length > 0
      ? sanitizeBody(req.body)
      : null,
    ip: req.ip || req.connection?.remoteAddress || 'unknown',
    fileInfo: req.file ? { name: req.file.originalname, size: req.file.size, type: req.file.mimetype } : null,
    response: null,
    duration: null,
    status: null,
  };

  // Intercept response
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    logEntry.response = sanitizeResponse(body);
    logEntry.duration = Date.now() - startTime;
    logEntry.status = res.statusCode;
    addLog(logEntry);
    return originalJson(body);
  };

  // Also catch non-json responses
  const originalEnd = res.end.bind(res);
  res.end = (...args) => {
    if (!logEntry.status) {
      logEntry.duration = Date.now() - startTime;
      logEntry.status = res.statusCode;
      logEntry.response = logEntry.response || { _note: 'non-JSON response' };
      addLog(logEntry);
    }
    return originalEnd(...args);
  };

  next();
});

function sanitizeBody(body) {
  const sanitized = { ...body };
  // Truncate very long fields (like base64 data)
  for (const key of Object.keys(sanitized)) {
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 200) {
      sanitized[key] = sanitized[key].substring(0, 200) + `... (${sanitized[key].length} chars)`;
    }
  }
  return sanitized;
}

function sanitizeResponse(body) {
  if (!body) return null;
  const sanitized = { ...body };
  // Truncate raw API responses
  if (sanitized.raw && typeof sanitized.raw === 'object') {
    sanitized.raw = { _note: 'raw data truncated', keys: Object.keys(sanitized.raw) };
  }
  return sanitized;
}

// ──────────────── Health Check ────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ProofSnap API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ──────────────── AI Deepfake Detection ────────────────
app.post('/api/detect', upload.single('media'), async (req, res) => {
  const SIGHTENGINE_USER = process.env.SIGHTENGINE_USER;
  const SIGHTENGINE_SECRET = process.env.SIGHTENGINE_SECRET;

  try {
    // If no SightEngine credentials, return simulated result with flag
    if (!SIGHTENGINE_USER || !SIGHTENGINE_SECRET) {
      console.log('[detect] No SightEngine credentials. Returning simulated result.');

      return res.json({
        simulated: true,
        deepfake: {
          score: Math.random() * 0.15,
          isDeepfake: false,
        },
        aiGenerated: {
          score: Math.random() * 0.1,
          isAIGenerated: false,
        },
        quality: {
          score: 0.85 + Math.random() * 0.15,
        },
        raw: null,
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No media file provided' });
    }

    // Call SightEngine API — send buffer from memory storage
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('media', req.file.buffer, {
      filename: req.file.originalname || 'upload.jpg',
      contentType: req.file.mimetype || 'image/jpeg',
    });
    form.append('models', 'deepfake,genai');
    form.append('api_user', SIGHTENGINE_USER);
    form.append('api_secret', SIGHTENGINE_SECRET);

    const response = await fetch('https://api.sightengine.com/1.0/check.json', {
      method: 'POST',
      body: form,
    });

    const data = await response.json();

    if (data.status === 'failure') {
      console.error('[detect] SightEngine error:', data.error);
      return res.status(500).json({ error: 'Detection service error', details: data.error });
    }

    // Parse SightEngine response
    const deepfakeScore = data.deepfake?.score ?? 0;
    const aiGeneratedScore = data.type?.ai_generated ?? 0;

    res.json({
      simulated: false,
      deepfake: {
        score: deepfakeScore,
        isDeepfake: deepfakeScore > 0.5,
      },
      aiGenerated: {
        score: aiGeneratedScore,
        isAIGenerated: aiGeneratedScore > 0.5,
      },
      quality: {
        score: data.quality?.score ?? 0.9,
      },
      raw: data,
    });
  } catch (err) {
    console.error('[detect] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────── Plagiarism / Reverse Image Check ────────────────
app.post('/api/plagiarism', upload.single('media'), async (req, res) => {
  try {
    // Simulate plagiarism check (real implementation would use
    // TinEye API, Google Vision, or Bing Visual Search)

    const similarityScore = Math.random() * 15; // 0-15% = mostly original
    const hash = crypto.randomBytes(16).toString('hex');

    res.json({
      simulated: true,
      plagiarismScore: Math.round(similarityScore),
      isOriginal: similarityScore < 20,
      matches: similarityScore > 10 ? [{
        source: 'stock-photos.example.com',
        similarity: Math.round(similarityScore),
        url: `https://example.com/image/${hash}`,
      }] : [],
      checkId: hash,
    });
  } catch (err) {
    console.error('[plagiarism] Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────── Verify Proof Endpoint ────────────────
app.post('/api/verify', express.json(), async (req, res) => {
  const { fileHash, signature, publicKey } = req.body;

  if (!fileHash || !signature || !publicKey) {
    return res.status(400).json({ error: 'Missing required fields: fileHash, signature, publicKey' });
  }

  // Check Supabase if configured
  let supabaseMatch = null;
  if (supabase) {
    try {
      const { data } = await supabase
        .from('proofs')
        .select('*')
        .eq('file_hash', fileHash)
        .single();
      supabaseMatch = data;
    } catch { }
  }

  res.json({
    fileHash,
    publicKeyPrefix: publicKey.substring(0, 16) + '...',
    timestamp: new Date().toISOString(),
    status: supabaseMatch ? 'verified' : 'signature_present',
    supabaseRecord: supabaseMatch,
    blockchain: 'DataHaven Testnet (Chain ID: 55931)',
    note: 'Full cryptographic verification is performed client-side using Ed25519',
  });
});

// ──────────────── Lookup Proof by Hash (Supabase) ────────────────
app.get('/api/verify/:hash', async (req, res) => {
  const { hash } = req.params;

  if (!supabase) {
    return res.json({
      found: false,
      message: 'Supabase not configured. Proof lookup unavailable.',
    });
  }

  try {
    const { data, error } = await supabase
      .from('proofs')
      .select('*')
      .eq('file_hash', hash)
      .single();

    if (error || !data) {
      return res.json({ found: false, hash });
    }

    res.json({ found: true, proof: data });
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

// ──────────────── Recent Proofs Feed (Supabase) ────────────────
app.get('/api/proofs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

  if (!supabase) {
    return res.json({ proofs: [], message: 'Supabase not configured.' });
  }

  try {
    const { data, error } = await supabase
      .from('proofs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch proofs' });
    }

    res.json({ proofs: data, count: data.length });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────── Upload Image to Supabase Storage ────────────────
app.post('/api/upload-image', upload.single('media'), async (req, res) => {
  try {
    if (!supabase) {
      return res.status(503).json({ error: 'Supabase not configured', imageUrl: null });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No media file provided', imageUrl: null });
    }

    const recordId = req.body.recordId || crypto.randomBytes(8).toString('hex');
    const ext = req.file.originalname?.split('.').pop() || 'jpg';
    const fileName = `proofs/${recordId}.${ext}`;

    const { error } = await supabase.storage
      .from('media')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype || 'image/jpeg',
        upsert: true,
      });

    if (error) {
      console.error('[upload-image] Storage error:', error.message);
      return res.status(500).json({ error: 'Storage upload failed', details: error.message, imageUrl: null });
    }

    const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
    const imageUrl = urlData?.publicUrl || null;

    console.log('[upload-image] Uploaded:', imageUrl);
    res.json({ imageUrl, fileName, recordId });
  } catch (err) {
    console.error('[upload-image] Error:', err);
    res.status(500).json({ error: 'Internal server error', imageUrl: null });
  }
});

// ──────────────── Admin Authentication ────────────────
app.post('/admin/login', express.json(), (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.add(token);
    // Auto-expire after 24h
    setTimeout(() => adminSessions.delete(token), 24 * 60 * 60 * 1000);
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

// ──────────────── Admin API Logs Endpoint ────────────────
app.get('/admin/logs', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, MAX_LOG_ENTRIES);
  const method = req.query.method?.toUpperCase();
  const path = req.query.path;

  let filtered = apiLogs;
  if (method) filtered = filtered.filter(l => l.method === method);
  if (path) filtered = filtered.filter(l => l.path.includes(path));

  res.json({
    logs: filtered.slice(0, limit),
    total: filtered.length,
    maxStored: MAX_LOG_ENTRIES,
  });
});

// ──────────────── Admin Stats Endpoint ────────────────
app.get('/admin/stats', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = Date.now();
  const last5min = apiLogs.filter(l => now - new Date(l.timestamp).getTime() < 5 * 60 * 1000);
  const last1hr = apiLogs.filter(l => now - new Date(l.timestamp).getTime() < 60 * 60 * 1000);

  const byEndpoint = {};
  const byStatus = {};
  const avgDuration = {};

  for (const log of apiLogs) {
    const ep = `${log.method} ${log.path}`;
    byEndpoint[ep] = (byEndpoint[ep] || 0) + 1;
    byStatus[log.status] = (byStatus[log.status] || 0) + 1;
    if (log.duration) {
      if (!avgDuration[ep]) avgDuration[ep] = { total: 0, count: 0 };
      avgDuration[ep].total += log.duration;
      avgDuration[ep].count += 1;
    }
  }

  // Compute averages
  const avgDurationResult = {};
  for (const [ep, data] of Object.entries(avgDuration)) {
    avgDurationResult[ep] = Math.round(data.total / data.count);
  }

  res.json({
    totalRequests: apiLogs.length,
    last5min: last5min.length,
    last1hr: last1hr.length,
    byEndpoint,
    byStatus,
    avgDuration: avgDurationResult,
    supabaseConnected: !!supabase,
    sightEngineConfigured: !!(process.env.SIGHTENGINE_USER && process.env.SIGHTENGINE_SECRET),
  });
});

// ──────────────── Admin Dashboard HTML ────────────────
app.get('/admin', (req, res) => {
  res.send(getAdminDashboardHTML());
});

function getAdminDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ProofSnap Admin Dashboard</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }

  /* Login */
  .login-overlay { position: fixed; inset: 0; background: #0f172a; display: flex; align-items: center; justify-content: center; z-index: 1000; }
  .login-box { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 40px; width: 360px; text-align: center; }
  .login-box h1 { font-size: 24px; margin-bottom: 8px; color: #f1f5f9; }
  .login-box p { color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
  .login-box input { width: 100%; padding: 12px 16px; border: 1px solid #334155; border-radius: 10px; background: #0f172a; color: #f1f5f9; font-size: 14px; margin-bottom: 12px; outline: none; }
  .login-box input:focus { border-color: #3b82f6; }
  .login-box button { width: 100%; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; }
  .login-box button:hover { background: #2563eb; }
  .login-error { color: #ef4444; font-size: 13px; margin-top: 8px; display: none; }

  /* Dashboard */
  .dashboard { display: none; }
  .header { background: #1e293b; border-bottom: 1px solid #334155; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 20px; font-weight: 700; }
  .header h1 span { color: #3b82f6; }
  .header-actions { display: flex; gap: 12px; align-items: center; }
  .header-actions button { padding: 8px 16px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #e2e8f0; cursor: pointer; font-size: 13px; }
  .header-actions button:hover { border-color: #3b82f6; }
  .btn-danger { background: #7f1d1d !important; border-color: #ef4444 !important; }

  /* Stats */
  .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; padding: 20px 24px; }
  .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px; }
  .stat-card .label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-card .value { font-size: 28px; font-weight: 800; margin-top: 4px; }
  .stat-card .value.blue { color: #3b82f6; }
  .stat-card .value.green { color: #10b981; }
  .stat-card .value.yellow { color: #f59e0b; }
  .stat-card .value.purple { color: #8b5cf6; }

  /* Filters */
  .filters { padding: 0 24px 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .filters select, .filters input { padding: 8px 12px; border: 1px solid #334155; border-radius: 8px; background: #0f172a; color: #e2e8f0; font-size: 13px; outline: none; }
  .filters select:focus, .filters input:focus { border-color: #3b82f6; }
  .filters label { font-size: 13px; color: #94a3b8; }

  /* Logs table */
  .logs-container { padding: 0 24px 24px; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th { background: #1e293b; position: sticky; top: 0; padding: 10px 12px; text-align: left; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #334155; white-space: nowrap; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #1e293b; vertical-align: top; }
  tbody tr:hover { background: #1e293b; }
  .method { font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 11px; display: inline-block; }
  .method.GET { background: #065f46; color: #6ee7b7; }
  .method.POST { background: #1e3a8a; color: #93c5fd; }
  .method.PUT { background: #78350f; color: #fcd34d; }
  .method.DELETE { background: #7f1d1d; color: #fca5a5; }
  .status { font-weight: 700; }
  .status.s2xx { color: #10b981; }
  .status.s4xx { color: #f59e0b; }
  .status.s5xx { color: #ef4444; }
  .duration { color: #94a3b8; }
  .expand-btn { background: none; border: 1px solid #334155; color: #94a3b8; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
  .expand-btn:hover { border-color: #3b82f6; color: #3b82f6; }
  .detail-row { display: none; }
  .detail-row td { background: #0f172a; }
  .detail-content { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .detail-panel { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; }
  .detail-panel h4 { font-size: 12px; color: #94a3b8; margin-bottom: 8px; text-transform: uppercase; }
  .detail-panel pre { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; color: #e2e8f0; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }
  .badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
  .badge-green { background: #065f46; color: #6ee7b7; }
  .badge-red { background: #7f1d1d; color: #fca5a5; }
  .no-data { text-align: center; padding: 40px; color: #64748b; }

  .auto-refresh-indicator { font-size: 12px; color: #64748b; }
  .auto-refresh-indicator.active { color: #10b981; }
</style>
</head>
<body>

<!-- Login Overlay -->
<div class="login-overlay" id="loginOverlay">
  <div class="login-box">
    <h1>🛡️ ProofSnap</h1>
    <p>Admin Dashboard Login</p>
    <input type="text" id="username" placeholder="Username" autocomplete="off" />
    <input type="password" id="password" placeholder="Password" autocomplete="off" />
    <button onclick="handleLogin()">Sign In</button>
    <div class="login-error" id="loginError">Invalid username or password</div>
  </div>
</div>

<!-- Dashboard -->
<div class="dashboard" id="dashboard">
  <div class="header">
    <h1>🛡️ <span>ProofSnap</span> Admin</h1>
    <div class="header-actions">
      <span class="auto-refresh-indicator" id="autoRefreshLabel">Auto-refresh: OFF</span>
      <button onclick="toggleAutoRefresh()" id="autoRefreshBtn">Enable Auto-Refresh</button>
      <button onclick="refreshData()">↻ Refresh</button>
      <button class="btn-danger" onclick="handleLogout()">Logout</button>
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-grid" id="statsGrid">
    <div class="stat-card"><div class="label">Total Requests</div><div class="value blue" id="statTotal">-</div></div>
    <div class="stat-card"><div class="label">Last 5 min</div><div class="value green" id="stat5min">-</div></div>
    <div class="stat-card"><div class="label">Last 1 hour</div><div class="value yellow" id="stat1hr">-</div></div>
    <div class="stat-card"><div class="label">Supabase</div><div class="value" id="statSupabase">-</div></div>
    <div class="stat-card"><div class="label">SightEngine</div><div class="value" id="statSight">-</div></div>
  </div>

  <!-- Filters -->
  <div class="filters">
    <label>Method:</label>
    <select id="filterMethod" onchange="refreshLogs()">
      <option value="">All</option>
      <option value="GET">GET</option>
      <option value="POST">POST</option>
    </select>
    <label>Path contains:</label>
    <input type="text" id="filterPath" placeholder="/api/detect" oninput="debounceRefresh()" />
    <label>Limit:</label>
    <select id="filterLimit" onchange="refreshLogs()">
      <option value="50">50</option>
      <option value="100" selected>100</option>
      <option value="200">200</option>
      <option value="500">500</option>
    </select>
  </div>

  <!-- Logs Table -->
  <div class="logs-container">
    <table>
      <thead>
        <tr>
          <th>Time</th>
          <th>Method</th>
          <th>Path</th>
          <th>Status</th>
          <th>Duration</th>
          <th>IP</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody id="logsBody">
        <tr><td colspan="7" class="no-data">Loading...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<script>
let authToken = localStorage.getItem('proofsnap_admin_token');
let autoRefreshInterval = null;
let debounceTimer = null;

// Check existing session
if (authToken) {
  showDashboard();
}

async function handleLogin() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('loginError');

  try {
    const res = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (data.success) {
      authToken = data.token;
      localStorage.setItem('proofsnap_admin_token', authToken);
      errorEl.style.display = 'none';
      showDashboard();
    } else {
      errorEl.style.display = 'block';
    }
  } catch {
    errorEl.textContent = 'Connection failed';
    errorEl.style.display = 'block';
  }
}

function handleLogout() {
  authToken = null;
  localStorage.removeItem('proofsnap_admin_token');
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  document.getElementById('loginOverlay').style.display = 'flex';
  document.getElementById('dashboard').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  refreshData();
}

async function refreshData() {
  await Promise.all([refreshStats(), refreshLogs()]);
}

async function refreshStats() {
  try {
    const res = await fetch('/admin/stats', {
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    if (res.status === 401) { handleLogout(); return; }
    const data = await res.json();

    document.getElementById('statTotal').textContent = data.totalRequests;
    document.getElementById('stat5min').textContent = data.last5min;
    document.getElementById('stat1hr').textContent = data.last1hr;

    const supaEl = document.getElementById('statSupabase');
    supaEl.textContent = data.supabaseConnected ? 'Connected' : 'Offline';
    supaEl.className = 'value ' + (data.supabaseConnected ? 'green' : 'yellow');

    const sightEl = document.getElementById('statSight');
    sightEl.textContent = data.sightEngineConfigured ? 'Active' : 'Simulated';
    sightEl.className = 'value ' + (data.sightEngineConfigured ? 'green' : 'yellow');
  } catch (e) {
    console.error('Stats fetch failed:', e);
  }
}

async function refreshLogs() {
  try {
    const method = document.getElementById('filterMethod').value;
    const pathFilter = document.getElementById('filterPath').value;
    const limit = document.getElementById('filterLimit').value;

    let url = '/admin/logs?limit=' + limit;
    if (method) url += '&method=' + method;
    if (pathFilter) url += '&path=' + encodeURIComponent(pathFilter);

    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + authToken },
    });
    if (res.status === 401) { handleLogout(); return; }
    const data = await res.json();

    const tbody = document.getElementById('logsBody');
    if (!data.logs || data.logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="no-data">No API requests logged yet. Requests will appear here in real-time.</td></tr>';
      return;
    }

    tbody.innerHTML = data.logs.map((log, i) => {
      const statusClass = log.status >= 500 ? 's5xx' : log.status >= 400 ? 's4xx' : 's2xx';
      const time = new Date(log.timestamp).toLocaleTimeString();
      const date = new Date(log.timestamp).toLocaleDateString();

      return \`
        <tr>
          <td title="\${date}"><span style="color:#64748b">\${date}</span><br/>\${time}</td>
          <td><span class="method \${log.method}">\${log.method}</span></td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">\${escapeHtml(log.path)}</td>
          <td><span class="status \${statusClass}">\${log.status || '-'}</span></td>
          <td class="duration">\${log.duration ? log.duration + 'ms' : '-'}</td>
          <td style="color:#64748b;font-size:11px">\${escapeHtml(log.ip || '')}</td>
          <td><button class="expand-btn" onclick="toggleDetail(\${i})">▼ Details</button></td>
        </tr>
        <tr class="detail-row" id="detail-\${i}">
          <td colspan="7">
            <div class="detail-content">
              <div class="detail-panel">
                <h4>Request</h4>
                <pre>\${formatJson({
                  method: log.method,
                  path: log.path,
                  query: log.query,
                  headers: log.headers,
                  body: log.body,
                  fileInfo: log.fileInfo,
                })}</pre>
              </div>
              <div class="detail-panel">
                <h4>Response (\${log.status} · \${log.duration}ms)</h4>
                <pre>\${formatJson(log.response)}</pre>
              </div>
            </div>
          </td>
        </tr>
      \`;
    }).join('');
  } catch (e) {
    console.error('Logs fetch failed:', e);
  }
}

function toggleDetail(index) {
  const el = document.getElementById('detail-' + index);
  el.style.display = el.style.display === 'table-row' ? 'none' : 'table-row';
}

function toggleAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    document.getElementById('autoRefreshBtn').textContent = 'Enable Auto-Refresh';
    document.getElementById('autoRefreshLabel').textContent = 'Auto-refresh: OFF';
    document.getElementById('autoRefreshLabel').className = 'auto-refresh-indicator';
  } else {
    autoRefreshInterval = setInterval(refreshData, 5000);
    document.getElementById('autoRefreshBtn').textContent = 'Disable Auto-Refresh';
    document.getElementById('autoRefreshLabel').textContent = 'Auto-refresh: 5s';
    document.getElementById('autoRefreshLabel').className = 'auto-refresh-indicator active';
  }
}

function debounceRefresh() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refreshLogs, 400);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatJson(obj) {
  try {
    return escapeHtml(JSON.stringify(obj, null, 2));
  } catch {
    return escapeHtml(String(obj));
  }
}

// Enter key on login
document.getElementById('password').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleLogin();
});
document.getElementById('username').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('password').focus();
});
</script>
</body>
</html>`;
}

// ──────────────── Start Server (local dev) ────────────────
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n  🛡️  ProofSnap API running on port ${PORT}`);
    console.log(`  📍 Health: http://localhost:${PORT}/api/health`);
    console.log(`  🔍 Detect: POST http://localhost:${PORT}/api/detect`);
    console.log(`  🔎 Plagiarism: POST http://localhost:${PORT}/api/plagiarism`);
    console.log(`  📤 Upload: POST http://localhost:${PORT}/api/upload-image`);
    console.log(`  ⛓️  Blockchain: DataHaven Testnet (Chain ID: 55931)`);
    console.log(`  🖥️  Admin Dashboard: http://localhost:${PORT}/admin\n`);

    if (!process.env.SIGHTENGINE_USER) {
      console.log('  ⚠️  SIGHTENGINE_USER not set — using simulated detection');
    }
    if (!supabase) {
      console.log('  ⚠️  SUPABASE_URL/SUPABASE_KEY not set — cloud storage disabled');
    }
    console.log('');
  });
}

// Export for Vercel serverless
module.exports = app;
