import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import Database from 'better-sqlite3';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from parent directory if exists
const parentEnv = join(__dirname, '..', '..', '.env');
if (fs.existsSync(parentEnv)) {
  dotenv.config({ path: parentEnv });
}
dotenv.config();

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WHITELIST = process.env.TELEGRAM_WHITELIST?.split(',').map(id => parseInt(id.trim())) || [7042516399];

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

// Initialize WebSocket
const wss = new WebSocketServer({ server });

// Initialize Database
const db = new Database('dashboard.db');
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    github_url TEXT,
    railway_url TEXT
  );

  CREATE TABLE IF NOT EXISTS usage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    model TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    cost_usd REAL,
    session_key TEXT,
    project_id INTEGER,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    completed BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
`);

// Mock data for testing (to be replaced with real OpenClaw API calls)
function getUsageStats() {
  const today = new Date().toISOString().split('T')[0];
  
  return {
    today: {
      tokens: 125430,
      cost: 3.45,
      requests: 234
    },
    week: {
      tokens: 856200,
      cost: 21.30,
      requests: 1456
    },
    month: {
      tokens: 3245600,
      cost: 89.50,
      requests: 5678
    },
    byModel: [
      { model: 'claude-sonnet-4-5', tokens: 45000, cost: 1.35, percentage: 39 },
      { model: 'gpt-4o', tokens: 35000, cost: 0.88, percentage: 28 },
      { model: 'gemini-2-flash', tokens: 45430, cost: 0.27, percentage: 36 }
    ]
  };
}

// API Routes

// Get usage stats
app.get('/api/stats', (req, res) => {
  const stats = getUsageStats();
  res.json(stats);
});

// Get all projects
app.get('/api/projects', (req, res) => {
  const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  res.json(projects);
});

// Create project
app.post('/api/projects', (req, res) => {
  const { name, description, github_url, railway_url } = req.body;
  
  const result = db.prepare(`
    INSERT INTO projects (name, description, github_url, railway_url) 
    VALUES (?, ?, ?, ?)
  `).run(name, description, github_url, railway_url);
  
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  
  // Broadcast to WebSocket clients
  broadcast({ type: 'project_created', data: project });
  
  res.json(project);
});

// Update project
app.patch('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  const { status, progress, description } = req.body;
  
  const updates = [];
  const values = [];
  
  if (status !== undefined) {
    updates.push('status = ?');
    values.push(status);
  }
  if (progress !== undefined) {
    updates.push('progress = ?');
    values.push(progress);
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description);
  }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(id);
  
  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  
  broadcast({ type: 'project_updated', data: project });
  
  res.json(project);
});

// Get milestones for a project
app.get('/api/projects/:id/milestones', (req, res) => {
  const { id } = req.params;
  const milestones = db.prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at DESC').all(id);
  res.json(milestones);
});

// Add milestone
app.post('/api/projects/:id/milestones', (req, res) => {
  const { id } = req.params;
  const { title, description } = req.body;
  
  const result = db.prepare(`
    INSERT INTO milestones (project_id, title, description) 
    VALUES (?, ?, ?)
  `).run(id, title, description);
  
  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(result.lastInsertRowid);
  
  broadcast({ type: 'milestone_added', data: { project_id: id, milestone } });
  
  res.json(milestone);
});

// Complete milestone
app.patch('/api/milestones/:id', (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  
  db.prepare('UPDATE milestones SET completed = ? WHERE id = ?').run(completed ? 1 : 0, id);
  
  const milestone = db.prepare('SELECT * FROM milestones WHERE id = ?').get(id);
  
  broadcast({ type: 'milestone_updated', data: milestone });
  
  res.json(milestone);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    telegram_connected: !!bot
  });
});

// WebSocket broadcast
function broadcast(message) {
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify(message));
    }
  });
}

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Telegram Bot
let bot;

if (TELEGRAM_TOKEN) {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  
  // Middleware: check whitelist
  bot.use((msg, next) => {
    if (TELEGRAM_WHITELIST.includes(msg.from.id)) {
      return next();
    }
    bot.sendMessage(msg.chat.id, "❌ Accès refusé. Seul Le V (@s0lverr) peut utiliser ce bot.");
  });
  
  // Commands
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id,
      `🦞 *OpenClaw Dashboard Bot*\n\n` +
      `Commandes disponibles :\n` +
      `/status - Vue d'ensemble\n` +
      `/projects - Liste des projets\n` +
      `/costs - Détails des coûts\n` +
      `/dashboard - Lien vers le dashboard web\n` +
      `/help - Aide`,
      { parse_mode: 'Markdown' }
    );
  });
  
  bot.onText(/\/status/, async (msg) => {
    const stats = getUsageStats();
    const projects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").get();
    
    const message = 
      `📊 *Status OpenClaw*\n\n` +
      `💰 *Aujourd'hui*\n` +
      `• Coût : $${stats.today.cost.toFixed(2)}\n` +
      `• Tokens : ${stats.today.tokens.toLocaleString()}\n` +
      `• Requêtes : ${stats.today.requests}\n\n` +
      `🚀 *Projets actifs* : ${projects.count}\n\n` +
      `⏰ ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;
    
    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  });
  
  bot.onText(/\/projects/, (msg) => {
    const projects = db.prepare('SELECT * FROM projects WHERE status = "active" ORDER BY updated_at DESC LIMIT 5').all();
    
    if (projects.length === 0) {
      return bot.sendMessage(msg.chat.id, "Aucun projet actif pour le moment.");
    }
    
    let message = '🚀 *Projets actifs*\n\n';
    
    projects.forEach(p => {
      const emoji = p.progress === 100 ? '✅' : p.progress > 50 ? '🔨' : '🆕';
      message += `${emoji} *${p.name}*\n`;
      message += `   └ ${p.progress}% complété\n`;
      if (p.description) message += `   └ ${p.description}\n`;
      message += '\n';
    });
    
    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  });
  
  bot.onText(/\/costs/, (msg) => {
    const stats = getUsageStats();
    
    let message = 
      `💰 *Détails des coûts*\n\n` +
      `📅 *Aujourd'hui* : $${stats.today.cost.toFixed(2)}\n` +
      `📆 *Cette semaine* : $${stats.week.cost.toFixed(2)}\n` +
      `📊 *Ce mois* : $${stats.month.cost.toFixed(2)}\n\n` +
      `*Par modèle :*\n`;
    
    stats.byModel.forEach(m => {
      message += `• ${m.model} : $${m.cost.toFixed(2)} (${m.percentage}%)\n`;
    });
    
    bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  });
  
  bot.onText(/\/dashboard/, (msg) => {
    const url = process.env.DASHBOARD_URL || 'http://localhost:5173';
    bot.sendMessage(msg.chat.id, 
      `🌐 *Dashboard Web*\n\n${url}`,
      { parse_mode: 'Markdown' }
    );
  });
  
  console.log('✅ Telegram bot started (whitelist: ' + TELEGRAM_WHITELIST.join(', ') + ')');
}

// Start server
server.listen(PORT, () => {
  console.log(`✅ Backend API running on port ${PORT}`);
  console.log(`📊 Dashboard database: dashboard.db`);
  console.log(`🔌 WebSocket ready`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    db.close();
    if (bot) bot.stopPolling();
    process.exit(0);
  });
});
