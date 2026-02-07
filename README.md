# OpenClaw Dashboard

Dashboard temps réel pour monitorer :
- 💰 Coûts d'utilisation d'OpenClaw (tokens, $)
- 🚀 Projets en cours (statut, progression)
- 📈 Graphiques d'utilisation
- 📝 Timeline des développements
- 🔴 Logs en temps réel

## Architecture

- **Backend:** Node.js + Express + WebSocket + SQLite
- **Frontend:** React + Vite + TailwindCSS
- **Bot Telegram:** Commandes pour accès rapide
- **Déploiement:** Railway (2 services)

## Sécurité

- Whitelist Telegram : Seul @s0lverr (7042516399) autorisé
- Dashboard protégé par token

## Commandes Telegram

- `/status` - Vue d'ensemble
- `/projects` - Liste des projets
- `/costs` - Détails des coûts
- `/logs [n]` - Derniers logs
- `/dashboard` - Lien vers le dashboard web

## Installation

```bash
# Backend
cd backend
npm install
npm start

# Frontend
cd frontend
npm install
npm run dev
```

## Deployment

Automatique via Railway (GitHub push)
