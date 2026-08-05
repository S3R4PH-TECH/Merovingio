import React, { useState } from 'react';
import { 
  Shield, 
  Play, 
  Activity, 
  Crosshair, 
  Server, 
  Clock, 
  RefreshCw, 
  Plus, 
  Database,
  Radio
} from 'lucide-react';

interface RunItem {
  id: string;
  workflowName: string;
  targetName: string;
  status: 'running' | 'success' | 'completed_with_warnings' | 'failed' | 'queued';
  startedAt: string;
  finishedAt?: string;
  assetCount: number;
  n8nExecutionId?: string;
}

interface TargetItem {
  id: string;
  name: string;
  rootDomains: string[];
  cidrs: string[];
  outOfScope: string[];
}

interface TesEntry {
  id: string;
  toolName: string;
  baseUrl: string;
  healthStatus: 'healthy' | 'unknown' | 'unhealthy';
  maxConcurrency: number;
  timeoutSeconds: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'launcher' | 'targets' | 'tes'>('dashboard');
  const [sseConnected] = useState<boolean>(true);
  
  // Mock / State data for UI
  const [runs, setRuns] = useState<RunItem[]>([
    {
      id: 'run-8f92a101',
      workflowName: 'recon-baseline-v2',
      targetName: 'HackThisSite Program',
      status: 'success',
      startedAt: new Date(Date.now() - 3600000).toLocaleTimeString(),
      finishedAt: new Date(Date.now() - 3300000).toLocaleTimeString(),
      assetCount: 83,
      n8nExecutionId: 'n8n-exec-10492'
    },
    {
      id: 'run-3c441b80',
      workflowName: 'pd-recon-subfinder',
      targetName: 'Primary Perimeter',
      status: 'running',
      startedAt: new Date(Date.now() - 120000).toLocaleTimeString(),
      assetCount: 14,
      n8nExecutionId: 'n8n-exec-10495'
    }
  ]);

  const [targets, setTargets] = useState<TargetItem[]>([
    {
      id: 'target-1',
      name: 'HackThisSite Program',
      rootDomains: ['hackthissite.org'],
      cidrs: ['192.168.1.0/24'],
      outOfScope: ['admin.hackthissite.org']
    },
    {
      id: 'target-2',
      name: 'Primary Perimeter',
      rootDomains: ['example.com'],
      cidrs: [],
      outOfScope: []
    }
  ]);

  const [tesList] = useState<TesEntry[]>([
    {
      id: 'tes-1',
      toolName: 'theharvester',
      baseUrl: 'http://recon-runner:8000',
      healthStatus: 'healthy',
      maxConcurrency: 3,
      timeoutSeconds: 200
    },
    {
      id: 'tes-2',
      toolName: 'pd-recon',
      baseUrl: 'http://pd-recon:8000',
      healthStatus: 'healthy',
      maxConcurrency: 5,
      timeoutSeconds: 300
    }
  ]);

  // Form State
  const [selectedTarget, setSelectedTarget] = useState<string>('target-1');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('recon-baseline-v2');
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetDomain, setNewTargetDomain] = useState('');

  const handleLaunchRun = (e: React.FormEvent) => {
    e.preventDefault();
    const targetObj = targets.find(t => t.id === selectedTarget);
    const newRun: RunItem = {
      id: `run-${Math.random().toString(16).substring(2, 10)}`,
      workflowName: selectedWorkflow,
      targetName: targetObj ? targetObj.name : 'Unknown Target',
      status: 'queued',
      startedAt: new Date().toLocaleTimeString(),
      assetCount: 0,
      n8nExecutionId: `n8n-exec-${Math.floor(Math.random() * 90000 + 10000)}`
    };
    setRuns([newRun, ...runs]);
    setActiveTab('dashboard');

    // Simulate async transition to running
    setTimeout(() => {
      setRuns(prev => prev.map(r => r.id === newRun.id ? { ...r, status: 'running' } : r));
    }, 1500);

    // Simulate completion with callback
    setTimeout(() => {
      setRuns(prev => prev.map(r => r.id === newRun.id ? { 
        ...r, 
        status: 'success', 
        assetCount: Math.floor(Math.random() * 40 + 20),
        finishedAt: new Date().toLocaleTimeString() 
      } : r));
    }, 6000);
  };

  const handleAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetName || !newTargetDomain) return;
    const newT: TargetItem = {
      id: `target-${targets.length + 1}`,
      name: newTargetName,
      rootDomains: [newTargetDomain],
      cidrs: [],
      outOfScope: []
    };
    setTargets([...targets, newT]);
    setNewTargetName('');
    setNewTargetDomain('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Bar */}
      <header className="glass-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, var(--primary) 0%, var(--accent-cyan) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px var(--primary-glow)' }}>
              <Shield size={24} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #fff, #9ca3af)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MEROVÍNGIO</h1>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Plataforma de Automação de Segurança Ofensiva</p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }}>
          <button 
            id="nav-dashboard"
            onClick={() => setActiveTab('dashboard')}
            className={activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Activity size={16} /> Dashboard
          </button>
          <button 
            id="nav-launcher"
            onClick={() => setActiveTab('launcher')}
            className={activeTab === 'launcher' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Play size={16} /> Workflow Launcher
          </button>
          <button 
            id="nav-targets"
            onClick={() => setActiveTab('targets')}
            className={activeTab === 'targets' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Crosshair size={16} /> Escopo & Targets
          </button>
          <button 
            id="nav-tes"
            onClick={() => setActiveTab('tes')}
            className={activeTab === 'tes' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            <Server size={16} /> TES Registry
          </button>
        </nav>

        {/* Realtime Stream Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <Radio size={16} color={sseConnected ? 'var(--accent-green)' : 'var(--accent-red)'} />
          <span>Canal SSE: <strong style={{ color: sseConnected ? 'var(--accent-green)' : 'var(--accent-red)' }}>{sseConnected ? 'Conectado' : 'Desconectado'}</strong></span>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '32px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Top Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Execuções Totais</span>
                  <Activity size={20} color="var(--primary-light)" />
                </div>
                <h3 style={{ fontSize: '2rem', marginTop: '10px', fontWeight: 700 }}>{runs.length}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--accent-green)', marginTop: '4px' }}>Orquestradas via n8n Queue Mode</p>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Execuções Em Andamento</span>
                  <Clock size={20} color="var(--accent-cyan)" />
                </div>
                <h3 style={{ fontSize: '2rem', marginTop: '10px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
                  {runs.filter(r => r.status === 'running').length}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Callback assíncrono ativo</p>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Assets Descobertos</span>
                  <Database size={20} color="var(--accent-green)" />
                </div>
                <h3 style={{ fontSize: '2rem', marginTop: '10px', fontWeight: 700 }}>
                  {runs.reduce((acc, r) => acc + r.assetCount, 0)}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>Persistidos em Postgres Platform</p>
              </div>

              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>TES Ativos</span>
                  <Server size={20} color="var(--accent-amber)" />
                </div>
                <h3 style={{ fontSize: '2rem', marginTop: '10px', fontWeight: 700 }}>{tesList.length}</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--accent-green)', marginTop: '4px' }}>recon-runner & pd-recon</p>
              </div>
            </div>

            {/* Runs Table */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Monitor de Execuções (Runs)</h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status em tempo real reportado pelo Gateway & Callback</p>
                </div>
                <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setRuns([...runs])}>
                  <RefreshCw size={14} /> Atualizar
                </button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '12px 16px' }}>Run ID</th>
                    <th style={{ padding: '12px 16px' }}>Workflow</th>
                    <th style={{ padding: '12px 16px' }}>Alvo (Target)</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Início</th>
                    <th style={{ padding: '12px 16px' }}>Assets</th>
                    <th style={{ padding: '12px 16px' }}>n8n Execution</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                      <td style={{ padding: '16px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary-light)' }}>{r.id}</td>
                      <td style={{ padding: '16px', fontWeight: 500 }}>{r.workflowName}</td>
                      <td style={{ padding: '16px' }}>{r.targetName}</td>
                      <td style={{ padding: '16px' }}>
                        <span className={`status-badge status-${r.status}`}>
                          {r.status === 'running' && <span className="pulse-dot"></span>}
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{r.startedAt}</td>
                      <td style={{ padding: '16px', fontWeight: 600, color: 'var(--accent-cyan)' }}>{r.assetCount} subdomínios</td>
                      <td style={{ padding: '16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-dim)' }}>{r.n8nExecutionId || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'launcher' && (
          <div className="glass-panel" style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '8px' }}>Iniciar Nova Execução (Workflow Launcher)</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Selecione o programa e o workflow homologado. O Gateway validará as regras do <code>scope_guard</code> antes de arrendar o TES.
            </p>

            <form onSubmit={handleLaunchRun} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>Alvo Autorizado (Target / Escopo)</label>
                <select 
                  className="custom-input"
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                >
                  {targets.map(t => (
                    <option key={t.id} value={t.id} style={{ background: '#121828', color: '#fff' }}>
                      {t.name} ({t.rootDomains.join(', ')})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>Workflow n8n Versionado</label>
                <select 
                  className="custom-input"
                  value={selectedWorkflow}
                  onChange={(e) => setSelectedWorkflow(e.target.value)}
                >
                  <option value="recon-baseline-v2" style={{ background: '#121828', color: '#fff' }}>
                    recon-baseline-v2 (theHarvester + Wait Webhook Assíncrono)
                  </option>
                  <option value="pd-recon-subfinder" style={{ background: '#121828', color: '#fff' }}>
                    pd-recon-subfinder (ProjectDiscovery Subfinder + httpx TES)
                  </option>
                </select>
              </div>

              <div style={{ background: 'rgba(110, 86, 207, 0.1)', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(110, 86, 207, 0.3)', fontSize: '0.85rem', color: 'var(--text-main)' }}>
                <p style={{ fontWeight: 600, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={16} color="var(--primary-light)" /> Garantia de Custódia & Escopo
                </p>
                <p style={{ color: 'var(--text-muted)' }}>
                  A execução do scan rodará via <strong>Tool Execution Service (TES)</strong> isolado. Nenhum comando shell direto é executado no orquestrador n8n.
                </p>
              </div>

              <button type="submit" className="btn-primary" style={{ padding: '12px 24px', justifyContent: 'center', marginTop: '12px' }}>
                <Play size={18} /> Disparar Workflow via Webhook (POST 202)
              </button>
            </form>
          </div>
        )}

        {activeTab === 'targets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Cadastrar Novo Target no Programa</h2>
              <form onSubmit={handleAddTarget} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Nome do Programa / Alvo</label>
                  <input 
                    type="text" 
                    className="custom-input" 
                    placeholder="Ex: Security Engagement X"
                    value={newTargetName}
                    onChange={(e) => setNewTargetName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Domínio Raiz Autorizado</label>
                  <input 
                    type="text" 
                    className="custom-input" 
                    placeholder="Ex: target.org"
                    value={newTargetDomain}
                    onChange={(e) => setNewTargetDomain(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }}>
                  <Plus size={16} /> Adicionar
                </button>
              </form>
            </div>

            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>Alvos & Escopos Cadastrados (Target CRUD)</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '20px' }}>
                {targets.map(t => (
                  <div key={t.id} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '20px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary-light)', marginBottom: '12px' }}>{t.name}</h3>
                    
                    <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div>
                        <strong style={{ color: 'var(--text-muted)' }}>Domínios Autorizados:</strong>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {t.rootDomains.map(d => (
                            <span key={d} style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-green)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>{d}</span>
                          ))}
                        </div>
                      </div>

                      {t.cidrs.length > 0 && (
                        <div>
                          <strong style={{ color: 'var(--text-muted)' }}>Blocos CIDR:</strong>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {t.cidrs.map(c => (
                              <span key={c} style={{ background: 'rgba(0, 242, 254, 0.15)', color: 'var(--accent-cyan)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>{c}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {t.outOfScope.length > 0 && (
                        <div>
                          <strong style={{ color: 'var(--text-muted)' }}>Fora do Escopo (Veto):</strong>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                            {t.outOfScope.map(o => (
                              <span key={o} style={{ background: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>{o}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tes' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Tool Execution Services (TES Registry)</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Microsserviços HTTP registrados no Gateway (Endpoint /admin/tes)</p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px' }}>
              {tesList.map(tes => (
                <div key={tes.id} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{tes.toolName}</h3>
                    <span className="status-badge status-success">
                      <span className="pulse-dot"></span> {tes.healthStatus}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-muted)' }}>
                    <p>Base URL: <strong style={{ color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{tes.baseUrl}</strong></p>
                    <p>Concorrência Máxima: <strong style={{ color: 'var(--text-main)' }}>{tes.maxConcurrency} jobs simultâneos</strong></p>
                    <p>Timeout Padrão: <strong style={{ color: 'var(--text-main)' }}>{tes.timeoutSeconds}s</strong></p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
