import { useState, useEffect } from 'react';
import { Activity, DollarSign, Code, TrendingUp, Zap } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || '/api';

function App() {
  const [stats, setStats] = useState(null);
  const [projects, setProjects] = useState([]);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    // Fetch initial data
    fetchStats();
    fetchProjects();

    // Setup WebSocket
    const wsUrl = API_URL.replace('http', 'ws').replace('/api', '');
    const websocket = new WebSocket(wsUrl);
    
    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.type === 'project_updated' || message.type === 'project_created') {
        fetchProjects();
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    // Cleanup
    return () => {
      if (websocket) websocket.close();
    };
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${API_URL}/projects`);
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  if (!stats) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
          <Zap className="text-blue-500" size={40} />
          OpenClaw Dashboard
        </h1>
        <p className="text-slate-400">Monitoring en temps réel • Henry Assistant</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard
          icon={<DollarSign />}
          title="Coût Aujourd'hui"
          value={`$${stats.today.cost.toFixed(2)}`}
          subtitle={`${stats.today.requests} requêtes`}
          color="blue"
        />
        <StatCard
          icon={<Activity />}
          title="Tokens Utilisés"
          value={stats.today.tokens.toLocaleString()}
          subtitle="Aujourd'hui"
          color="green"
        />
        <StatCard
          icon={<TrendingUp />}
          title="Ce Mois"
          value={`$${stats.month.cost.toFixed(2)}`}
          subtitle={`${stats.month.requests} requêtes`}
          color="purple"
        />
        <StatCard
          icon={<Code />}
          title="Projets Actifs"
          value={projects.filter(p => p.status === 'active').length}
          subtitle="En développement"
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Cost by Model */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Coûts par Modèle</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.byModel}
                dataKey="cost"
                nameKey="model"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={(entry) => `${entry.model}: $${entry.cost.toFixed(2)}`}
              >
                {stats.byModel.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Usage Trend (Mock data) */}
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Tendance d'Utilisation</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={[
              { day: 'Lun', tokens: 85000, cost: 2.1 },
              { day: 'Mar', tokens: 95000, cost: 2.5 },
              { day: 'Mer', tokens: 78000, cost: 1.9 },
              { day: 'Jeu', tokens: 110000, cost: 3.2 },
              { day: 'Ven', tokens: 92000, cost: 2.4 },
              { day: 'Sam', tokens: 125430, cost: 3.45 },
            ]}>
              <XAxis dataKey="day" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none' }} />
              <Bar dataKey="cost" fill="#3b82f6" name="Coût ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Projects List */}
      <div className="bg-slate-800 rounded-lg p-6">
        <h3 className="text-2xl font-semibold text-white mb-6">Projets</h3>
        
        {projects.length === 0 ? (
          <p className="text-slate-400">Aucun projet pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {projects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-slate-500 text-sm">
        <p>OpenClaw Dashboard • Mis à jour en temps réel via WebSocket</p>
        <p className="mt-1">🔒 Accès réservé à @s0lverr</p>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, subtitle, color }) {
  const colors = {
    blue: 'text-blue-500 bg-blue-500/10',
    green: 'text-green-500 bg-green-500/10',
    purple: 'text-purple-500 bg-purple-500/10',
    orange: 'text-orange-500 bg-orange-500/10',
  };

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <div className={`inline-flex p-3 rounded-lg ${colors[color]} mb-3`}>
        {icon}
      </div>
      <div className="text-slate-400 text-sm mb-1">{title}</div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-slate-500 text-sm">{subtitle}</div>
    </div>
  );
}

function ProjectCard({ project }) {
  const statusColors = {
    active: 'bg-blue-500',
    completed: 'bg-green-500',
    paused: 'bg-yellow-500',
  };

  const statusLabels = {
    active: 'En cours',
    completed: 'Terminé',
    paused: 'En pause',
  };

  return (
    <div className="bg-slate-700 rounded-lg p-5 hover:bg-slate-600 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-lg font-semibold text-white">{project.name}</h4>
            <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${statusColors[project.status]}`}>
              {statusLabels[project.status]}
            </span>
          </div>
          {project.description && (
            <p className="text-slate-300 text-sm mb-3">{project.description}</p>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex justify-between text-sm text-slate-400 mb-1">
          <span>Progression</span>
          <span>{project.progress}%</span>
        </div>
        <div className="w-full bg-slate-600 rounded-full h-2">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </div>

      {/* Links */}
      <div className="flex gap-3 text-sm">
        {project.github_url && (
          <a href={project.github_url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            GitHub →
          </a>
        )}
        {project.railway_url && (
          <a href={project.railway_url} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
            Railway →
          </a>
        )}
      </div>

      <div className="mt-3 text-xs text-slate-500">
        Mise à jour : {new Date(project.updated_at).toLocaleString('fr-FR')}
      </div>
    </div>
  );
}

export default App;
