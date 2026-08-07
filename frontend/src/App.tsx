import React, { useMemo, useState } from 'react';
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
  Radio,
  Globe,
  Network,
  Ban,
  TriangleAlert,
  X,
  Eye,
  Download,
  FileText,
  Search,
  FileArchive
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
  hosts?: HostData[];
}

interface HostData {
  host: string;
  assetCount: number;
  tools: string[];
  outputTxt?: string;
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

type ScopeKind = 'domain' | 'cidr' | 'exclusion' | 'invalid';

interface ScopeEntry {
  raw: string;
  value: string;
  kind: ScopeKind;
  reason?: string;
}

interface ParsedScope {
  entries: ScopeEntry[];
  rootDomains: string[];
  cidrs: string[];
  outOfScope: string[];
  invalid: ScopeEntry[];
  duplicates: number;
}

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isIpv4(value: string): boolean {
  const match = IPV4_RE.exec(value);
  return match !== null && match.slice(1).every(o => Number(o) <= 255 && String(Number(o)) === o);
}

function isCidr(value: string): boolean {
  const slash = value.lastIndexOf('/');
  if (slash === -1) return false;
  const address = value.slice(0, slash);
  const prefix = value.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefix)) return false;
  const bits = Number(prefix);
  if (address.includes(':')) return bits <= 128 && /^[0-9a-f:]+$/.test(address);
  return isIpv4(address) && bits <= 32;
}

function normalizeScopeValue(raw: string): string {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.replace(/^\*\./, '');

  const slash = value.indexOf('/');
  if (slash !== -1 && !/^\d{1,3}$/.test(value.slice(slash + 1))) {
    value = value.slice(0, slash);
  }

  value = value.replace(/^([^:/]+):\d+$/, '$1');
  return value.replace(/\.+$/, '');
}

function classifyScopeToken(raw: string): ScopeEntry {
  const trimmed = raw.trim();
  const excluded = /^[!-]/.test(trimmed);
  const value = normalizeScopeValue(excluded ? trimmed.slice(1) : trimmed);

  if (!value) {
    return { raw: trimmed, value, kind: 'invalid', reason: 'entrada vazia' };
  }
  if (excluded) {
    if (isCidr(value)) {
      return { raw: trimmed, value, kind: 'invalid', reason: 'veto por CIDR não é avaliado pelo scope_guard' };
    }
    if (HOSTNAME_RE.test(value) || isIpv4(value)) {
      return { raw: trimmed, value, kind: 'exclusion' };
    }
    return { raw: trimmed, value, kind: 'invalid', reason: 'exclusão não é domínio/IP válido' };
  }
  if (isCidr(value)) {
    return { raw: trimmed, value, kind: 'cidr' };
  }
  if (isIpv4(value)) {
    return { raw: trimmed, value: `${value}/32`, kind: 'cidr' };
  }
  if (HOSTNAME_RE.test(value)) {
    return { raw: trimmed, value, kind: 'domain' };
  }
  return { raw: trimmed, value, kind: 'invalid', reason: 'não é domínio, IP ou CIDR válido' };
}

function parseScopeInput(text: string): ParsedScope {
  const entries: ScopeEntry[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    if (/^[!-]+$/.test(token)) continue;

    const entry = classifyScopeToken(token);
    const key = `${entry.kind}:${entry.value}`;
    if (entry.kind !== 'invalid' && seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    entries.push(entry);
  }

  return {
    entries,
    rootDomains: entries.filter(e => e.kind === 'domain').map(e => e.value),
    cidrs: entries.filter(e => e.kind === 'cidr').map(e => e.value),
    outOfScope: entries.filter(e => e.kind === 'exclusion').map(e => e.value),
    invalid: entries.filter(e => e.kind === 'invalid'),
    duplicates
  };
}

const SCOPE_CHIP_STYLES: Record<ScopeKind, { bg: string; color: string; label: string }> = {
  domain: { bg: 'rgba(16, 185, 129, 0.15)', color: 'var(--accent-green)', label: 'Domínio raiz' },
  cidr: { bg: 'rgba(0, 242, 254, 0.15)', color: 'var(--accent-cyan)', label: 'Bloco CIDR' },
  exclusion: { bg: 'rgba(239, 68, 68, 0.15)', color: 'var(--accent-red)', label: 'Fora do escopo' },
  invalid: { bg: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-amber)', label: 'Inválido' }
};

const SCOPE_CHIP_ICONS: Record<ScopeKind, typeof Globe> = {
  domain: Globe,
  cidr: Network,
  exclusion: Ban,
  invalid: TriangleAlert
};

// Helper for generating sample host text output, optionally filtered by tool
function generateSampleHostTxt(host: string, _runId: string, _workflow: string, toolFilter: string = 'all'): string {
  let content = '';

  if (toolFilter === 'all' || toolFilter.includes('net-scan') || toolFilter.includes('nmap')) {
    content += `Nmap scan report for ${host} (137.74.187.100)
Host is up (0.23s latency).
Other addresses for ${host} (not scanned): 137.74.187.101 137.74.187.103 137.74.187.104
Not shown: 997 filtered tcp ports (no-response)
PORT    STATE  SERVICE        VERSION
22/tcp  closed ssh
80/tcp  open   http-proxy     HAProxy http proxy 1.3.1 - 1.9.0
|_http-open-proxy: Proxy might be redirecting requests
443/tcp open   ssl/http-proxy HAProxy http proxy 1.3.1 - 1.9.0
|_http-title: Hack This Site
| http-methods: 
|_  Supported Methods: GET POST
| ssl-cert: Subject: commonName=hackthisjogneh42n5o7gbzrewxee3vyu6ex37ukyvdw6jm66npakiyd.onion
| Subject Alternative Name: DNS:${host}, DNS:www.${host}
| Issuer: commonName=HARICA DV TLS RSA/organizationName=Hellenic Academic CA/countryName=GR
|_http-server-header: HackThisSite
Service Info: Device: load balancer
\n\n`;
  }

  if (toolFilter === 'all' || toolFilter.includes('fuzz-svc') || toolFilter.includes('ffuf')) {
    content += `        /'___\\  /'___\\           /'___\\
       /\\ \\__/ /\\ \\__/  __  __  /\\ \\__/
       \\ \\ ,__\\\\ \\ ,__\\/\\ \\/\\ \\ \\ \\ ,__\\
        \\ \\ \\_/ \\ \\ \\_/\\ \\ \\_\\ \\ \\ \\ \\_/
         \\ \\_\\   \\ \\_\\  \\ \\____/  \ \\_\\
          \\/_/    \\/_/   \\/___/    \\/_/

       v2.1.0-dev
________________________________________________

 :: Method           : GET
 :: URL              : https://${host}/FUZZ
 :: Extensions       : .php .html .js
 :: Follow redirects : true
________________________________________________
robots.txt              [Status: 200, Size: 66, Words: 4, Lines: 4]
login.php               [Status: 200, Size: 4120, Words: 350, Lines: 120]
admin/                  [Status: 403, Size: 280, Words: 20, Lines: 10]
\n\n`;
  }

  if (toolFilter === 'all' || toolFilter.includes('recon') || toolFilter.includes('theharvester') || toolFilter.includes('pd-recon')) {
    content += `*******************************************************************
* theHarvester 4.11.1                                             *
*******************************************************************
[*] Target: ${host}
[*] Hosts found: 5
---------------------
api.${host}:137.74.187.116
dev.${host}:137.74.187.119
mail.${host}:207.210.114.47
status.${host}:81.4.127.167
forum.${host}:137.74.187.100
\n\n`;
  }

  return content.trim();
}

// Download helper function for .txt file
function downloadTxtFile(filename: string, content: string) {
  const element = document.createElement('a');
  const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

// Download helper function for .zip file simulation (or backend call)
async function downloadZipFile(runId: string, run: RunItem) {
  try {
    // Attempt backend API call first
    const response = await fetch(`http://localhost:18000/runs/${runId}/download-zip`);
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `run_${runId}_outputs.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
  } catch (err) {
    console.log('Backend API offline, serving client-side fallback zip stream');
  }

  // Client-side text fallback zip representation if backend is offline/mock
  const hosts = run.hosts || [
    { host: 'hackthissite.org', assetCount: 52, tools: ['net-scan', 'pd-scan', 'fuzz-svc'] },
    { host: 'api.hackthissite.org', assetCount: 18, tools: ['net-scan', 'pd-recon'] },
    { host: 'dev.hackthissite.org', assetCount: 13, tools: ['fuzz-svc', 'pd-scan'] }
  ];

  let combinedTxt = `================================================================================\n`;
  combinedTxt += `MEROVINGIO CONSOLIDATED TEST OUTPUT ARCHIVE (ZIP BUNDLE)\n`;
  combinedTxt += `================================================================================\n`;
  combinedTxt += `Run ID: ${run.id}\nWorkflow: ${run.workflowName}\nTarget: ${run.targetName}\nDate: ${new Date().toISOString()}\n`;
  combinedTxt += `Total Hosts: ${hosts.length}\n\n`;

  hosts.forEach(h => {
    combinedTxt += generateSampleHostTxt(h.host, run.id, run.workflowName);
    combinedTxt += `\n\n`;
  });

  downloadTxtFile(`run_${runId}_outputs_consolidated.txt`, combinedTxt);
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'launcher' | 'targets' | 'tes'>('dashboard');
  const [sseConnected] = useState<boolean>(true);

  // Modal State for Outputs View
  const [selectedRunForOutputs, setSelectedRunForOutputs] = useState<RunItem | null>(null);
  const [selectedHostDetail, setSelectedHostDetail] = useState<{ host: HostData; run: RunItem } | null>(null);
  const [selectedToolFilter, setSelectedToolFilter] = useState<string>('all');
  const [hostSearchQuery, setHostSearchQuery] = useState<string>('');
  const [fetchedOutputText, setFetchedOutputText] = useState<string>('');
  const [loadingOutputText, setLoadingOutputText] = useState<boolean>(false);

  React.useEffect(() => {
    if (!selectedHostDetail) {
      setFetchedOutputText('');
      return;
    }

    setLoadingOutputText(true);
    const toolParam = selectedToolFilter !== 'all' ? `?tool_name=${encodeURIComponent(selectedToolFilter)}` : '';
    const url = `http://localhost:18000/runs/${selectedHostDetail.run.id}/hosts/${encodeURIComponent(selectedHostDetail.host.host)}/text${toolParam}`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        setFetchedOutputText(text);
      })
      .catch(() => {
        if (selectedHostDetail.host.outputTxt) {
          setFetchedOutputText(selectedHostDetail.host.outputTxt);
        } else {
          setFetchedOutputText(`[Nenhum output bruto gravado pelo Gateway para ${selectedHostDetail.host.host} (${selectedToolFilter})]`);
        }
      })
      .finally(() => setLoadingOutputText(false));
  }, [selectedHostDetail, selectedToolFilter]);

  // Sample runs with hosts populated
  const [runs, setRuns] = useState<RunItem[]>([
    {
      id: 'run-8f92a101',
      workflowName: 'nmap-ffuf-theharvester',
      targetName: 'HackThisSite Program',
      status: 'success',
      startedAt: new Date(Date.now() - 3600000).toLocaleTimeString(),
      finishedAt: new Date(Date.now() - 3300000).toLocaleTimeString(),
      assetCount: 83,
      n8nExecutionId: 'n8n-exec-10492',
      hosts: [
        { host: 'hackthissite.org', assetCount: 52, tools: ['net-scan', 'pd-scan', 'fuzz-svc', 'recon-runner'] },
        { host: 'api.hackthissite.org', assetCount: 18, tools: ['net-scan', 'fuzz-svc'] },
        { host: 'dev.hackthissite.org', assetCount: 13, tools: ['pd-recon', 'pd-scan'] }
      ]
    },
    {
      id: 'run-3c441b80',
      workflowName: 'recon-full-chain',
      targetName: 'Primary Perimeter',
      status: 'running',
      startedAt: new Date(Date.now() - 120000).toLocaleTimeString(),
      assetCount: 14,
      n8nExecutionId: 'n8n-exec-10495',
      hosts: [
        { host: 'example.com', assetCount: 10, tools: ['pd-recon', 'net-scan'] },
        { host: 'api.example.com', assetCount: 4, tools: ['pd-recon'] }
      ]
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
    },
    {
      id: 'tes-3',
      toolName: 'pd-scan',
      baseUrl: 'http://pd-scan:8000',
      healthStatus: 'healthy',
      maxConcurrency: 2,
      timeoutSeconds: 600
    },
    {
      id: 'tes-4',
      toolName: 'pd-crawler',
      baseUrl: 'http://pd-crawler:8000',
      healthStatus: 'healthy',
      maxConcurrency: 3,
      timeoutSeconds: 600
    },
    {
      id: 'tes-5',
      toolName: 'fuzz-svc',
      baseUrl: 'http://fuzz-svc:8000',
      healthStatus: 'healthy',
      maxConcurrency: 2,
      timeoutSeconds: 900
    },
    {
      id: 'tes-6',
      toolName: 'net-scan',
      baseUrl: 'http://net-scan:8000',
      healthStatus: 'healthy',
      maxConcurrency: 3,
      timeoutSeconds: 300
    }
  ]);

  // Form State
  const [selectedTarget, setSelectedTarget] = useState<string>('target-1');
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('nmap-ffuf-theharvester');
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetScope, setNewTargetScope] = useState('');

  const parsedScope = useMemo(() => parseScopeInput(newTargetScope), [newTargetScope]);
  const inScopeCount = parsedScope.rootDomains.length + parsedScope.cidrs.length;
  const canAddTarget = newTargetName.trim().length > 0 && inScopeCount > 0;

  const fetchRunsFromBackend = React.useCallback(() => {
    fetch('http://localhost:18000/runs')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const mappedRuns: RunItem[] = data.map((r: any) => ({
            id: r.id,
            workflowName: r.params?.workflow || 'nmap-ffuf-theharvester',
            targetName: r.params?.target_name || 'Target Scan',
            status: r.status,
            startedAt: r.started_at ? new Date(r.started_at).toLocaleTimeString() : 'N/A',
            finishedAt: r.finished_at ? new Date(r.finished_at).toLocaleTimeString() : undefined,
            assetCount: r.assets ? r.assets.length : 0,
            n8nExecutionId: r.n8n_execution_id || 'n8n-exec',
            hosts: Array.from(new Set((r.assets || []).map((a: any) => {
              const val = a.value || '';
              return val.replace('http://', '').replace('https://', '').split('/')[0].split(':')[0];
            }))).filter(Boolean).map((h: any) => {
              const hostAssets = (r.assets || []).filter((a: any) => (a.value || '').includes(h));
              const tools = Array.from(new Set(hostAssets.map((a: any) => a.source_tool)));
              return {
                host: h,
                assetCount: hostAssets.length,
                tools: tools.length > 0 ? (tools as string[]) : ['net-scan']
              };
            })
          }));
          setRuns(mappedRuns);
        }
      })
      .catch(err => console.log('Backend sync offline/polling error:', err));
  }, []);

  React.useEffect(() => {
    fetchRunsFromBackend();
    const interval = setInterval(fetchRunsFromBackend, 4000);
    return () => clearInterval(interval);
  }, [fetchRunsFromBackend]);

  const handleLaunchRun = (e: React.FormEvent) => {
    e.preventDefault();
    const targetObj = targets.find(t => t.id === selectedTarget);
    const domainName = targetObj && targetObj.rootDomains.length > 0 ? targetObj.rootDomains[0] : 'target.org';

    const newRun: RunItem = {
      id: `run-${Math.random().toString(16).substring(2, 10)}`,
      workflowName: selectedWorkflow,
      targetName: targetObj ? targetObj.name : domainName,
      status: 'queued',
      startedAt: new Date().toLocaleTimeString(),
      assetCount: 0,
      n8nExecutionId: `n8n-pending`,
      hosts: [
        { host: domainName, assetCount: 0, tools: ['net-scan', 'fuzz-svc', 'pd-recon'] }
      ]
    };

    setRuns(prev => [newRun, ...prev]);
    setActiveTab('dashboard');

    fetch('http://localhost:15678/webhook/nmap-ffuf-theharvester', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: newRun.id,
        target: domainName,
        allowed_domains: [domainName]
      })
    })
    .then(() => fetchRunsFromBackend())
    .catch(err => console.log('Webhook trigger error:', err));
  };

  const fetchTargetsFromBackend = React.useCallback(() => {
    fetch('http://localhost:18000/targets')
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const mappedTargets: TargetItem[] = data.map((t: any) => ({
            id: t.id,
            name: t.name,
            rootDomains: t.root_domains || [],
            cidrs: t.cidrs || [],
            outOfScope: t.out_of_scope || []
          }));
          setTargets(mappedTargets);
        }
      })
      .catch(err => console.log('Targets fetch error:', err));
  }, []);

  React.useEffect(() => {
    fetchTargetsFromBackend();
  }, [fetchTargetsFromBackend]);

  const handleAddTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAddTarget) return;

    const payload = {
      name: newTargetName.trim(),
      root_domains: parsedScope.rootDomains,
      cidrs: parsedScope.cidrs,
      out_of_scope: parsedScope.outOfScope
    };

    fetch('http://localhost:18000/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(() => {
      fetchTargetsFromBackend();
      setNewTargetName('');
      setNewTargetScope('');
    })
    .catch(err => console.log('Error creating target on backend:', err));
  };

  const removeScopeEntry = (index: number) => {
    setNewTargetScope(
      parsedScope.entries.filter((_, i) => i !== index).map(entry => entry.raw).join('\n')
    );
  };

  // Filtered hosts in modal
  const filteredHosts = useMemo(() => {
    if (!selectedRunForOutputs || !selectedRunForOutputs.hosts) return [];
    if (!hostSearchQuery.trim()) return selectedRunForOutputs.hosts;
    const q = hostSearchQuery.toLowerCase().trim();
    return selectedRunForOutputs.hosts.filter(h => h.host.toLowerCase().includes(q) || h.tools.some(t => t.toLowerCase().includes(q)));
  }, [selectedRunForOutputs, hostSearchQuery]);

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
                <p style={{ fontSize: '0.75rem', color: 'var(--accent-green)', marginTop: '4px' }}>pd-scan, pd-crawler, net-scan, fuzz-svc</p>
              </div>
            </div>

            {/* Runs Table */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Monitor de Execuções (Runs)</h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status em tempo real com visualização e download de outputs por host</p>
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
                    <th style={{ padding: '12px 16px' }}>Outputs por Host</th>
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
                      <td style={{ padding: '16px', fontWeight: 600, color: 'var(--accent-cyan)' }}>{r.assetCount} itens</td>
                      <td style={{ padding: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn-primary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}
                            onClick={() => {
                              setSelectedRunForOutputs(r);
                              setHostSearchQuery('');
                            }}
                          >
                            <Eye size={14} /> Visualizar
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ padding: '6px 10px', fontSize: '0.8rem', gap: '4px' }}
                            title="Baixar todos os resultados em arquivo ZIP"
                            onClick={() => downloadZipFile(r.id, r)}
                          >
                            <FileArchive size={14} color="var(--accent-cyan)" /> ZIP
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Launcher Tab */}
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
                  <option value="nmap-ffuf-theharvester" style={{ background: '#121828', color: '#fff' }}>
                    nmap-ffuf-theharvester (Portscan Nmap → Fuzz ffuf → OSINT theHarvester)
                  </option>
                  <option value="recon-full-chain" style={{ background: '#121828', color: '#fff' }}>
                    recon-full-chain (Subfinder → Naabu → Nuclei Vuln Scan)
                  </option>
                  <option value="recon-baseline-v2" style={{ background: '#121828', color: '#fff' }}>
                    recon-baseline-v2 (theHarvester + Wait Webhook Assíncrono)
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

        {/* Targets Tab */}
        {activeTab === 'targets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>Cadastrar Novo Target no Programa</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Cole a lista completa de alvos de uma vez — um por linha, ou separados por vírgula, ponto-e-vírgula ou espaço.
                Domínios, IPs e blocos CIDR são classificados automaticamente; prefixe com <code>!</code> para marcar como <strong>fora do escopo (veto)</strong>.
              </p>

              <form onSubmit={handleAddTarget} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    Alvos Autorizados (múltiplos)
                  </label>
                  <textarea
                    className="custom-input"
                    rows={5}
                    spellCheck={false}
                    style={{ fontFamily: 'var(--font-mono)', resize: 'vertical', lineHeight: 1.6 }}
                    placeholder={'target.org\napi.target.org\n192.168.1.0/24\n10.0.0.7\n!admin.target.org'}
                    value={newTargetScope}
                    onChange={(e) => setNewTargetScope(e.target.value)}
                  />
                </div>

                {parsedScope.entries.length > 0 && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                      <strong style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Pré-visualização do Escopo
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: 'var(--accent-green)' }}>{parsedScope.rootDomains.length}</strong> domínios ·{' '}
                        <strong style={{ color: 'var(--accent-cyan)' }}>{parsedScope.cidrs.length}</strong> CIDRs ·{' '}
                        <strong style={{ color: 'var(--accent-red)' }}>{parsedScope.outOfScope.length}</strong> vetos
                        {parsedScope.duplicates > 0 && <> · {parsedScope.duplicates} duplicados removidos</>}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {parsedScope.entries.map((entry, index) => {
                        const chip = SCOPE_CHIP_STYLES[entry.kind];
                        const ChipIcon = SCOPE_CHIP_ICONS[entry.kind];
                        return (
                          <span
                            key={`${entry.kind}-${entry.value}-${index}`}
                            title={entry.reason ? `${chip.label}: ${entry.reason}` : chip.label}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: chip.bg, color: chip.color, border: `1px solid ${chip.color}33`, padding: '4px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}
                          >
                            <ChipIcon size={12} />
                            {entry.kind === 'invalid' ? entry.raw : entry.value}
                            <button
                              type="button"
                              aria-label={`Remover ${entry.value || entry.raw}`}
                              onClick={() => removeScopeEntry(index)}
                              style={{ display: 'inline-flex', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, opacity: 0.7 }}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        );
                      })}
                    </div>

                    {parsedScope.invalid.length > 0 && (
                      <p style={{ marginTop: '12px', fontSize: '0.8rem', color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <TriangleAlert size={14} />
                        {parsedScope.invalid.length} entrada(s) não reconhecida(s) — serão ignoradas no cadastro.
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {inScopeCount === 0
                      ? 'Informe ao menos um domínio, IP ou CIDR autorizado.'
                      : `${inScopeCount} alvo(s) serão autorizados neste programa.`}
                  </span>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={!canAddTarget}
                    style={{ padding: '10px 20px', opacity: canAddTarget ? 1 : 0.5, cursor: canAddTarget ? 'pointer' : 'not-allowed' }}
                  >
                    <Plus size={16} /> Adicionar {inScopeCount > 0 ? `(${inScopeCount})` : ''}
                  </button>
                </div>
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

        {/* TES Tab */}
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

      {/* POP-UP MODAL 1: LISTA DE HOSTS TESTADOS NO RUN */}
      {selectedRunForOutputs && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--primary-light)' }}>
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20, 24, 40, 0.9)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>Alvos Testados (Hosts)</h2>
                  <span className={`status-badge status-${selectedRunForOutputs.status}`}>{selectedRunForOutputs.status}</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Run ID: <code style={{ color: 'var(--primary-light)' }}>{selectedRunForOutputs.id}</code> | Workflow: <strong>{selectedRunForOutputs.workflowName}</strong>
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  className="btn-primary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem', gap: '6px' }}
                  onClick={() => downloadZipFile(selectedRunForOutputs.id, selectedRunForOutputs)}
                >
                  <FileArchive size={16} /> Baixar Tudo (ZIP)
                </button>
                <button
                  onClick={() => setSelectedRunForOutputs(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Modal Search Bar */}
            <div style={{ padding: '12px 24px', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Search size={16} color="var(--text-muted)" />
              <input
                type="text"
                className="custom-input"
                placeholder="Filtrar por nome de host ou ferramenta..."
                value={hostSearchQuery}
                onChange={(e) => setHostSearchQuery(e.target.value)}
                style={{ padding: '8px 12px', fontSize: '0.85rem', width: '100%' }}
              />
            </div>

            {/* Hosts List Area */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredHosts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <Globe size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                  <p>Nenhum host encontrado para os critérios informados.</p>
                </div>
              ) : (
                filteredHosts.map((h, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(0, 242, 254, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Globe size={20} color="var(--accent-cyan)" />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', fontFamily: 'var(--font-mono)' }}>{h.host}</h4>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {h.tools.map(tool => (
                            <span key={tool} style={{ background: 'rgba(110, 86, 207, 0.2)', color: 'var(--primary-light)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                              {tool}
                            </span>
                          ))}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: '4px' }}>
                            • {h.assetCount} assets encontrados
                          </span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: '8px 12px', fontSize: '0.8rem', gap: '6px' }}
                        title="Baixar arquivo TXT individual do host"
                        onClick={() => {
                          const txt = generateSampleHostTxt(h.host, selectedRunForOutputs.id, selectedRunForOutputs.workflowName);
                          downloadTxtFile(`${h.host}_output.txt`, txt);
                        }}
                      >
                        <Download size={14} /> TXT
                      </button>
                      <button
                        className="btn-primary"
                        style={{ padding: '8px 14px', fontSize: '0.8rem', gap: '6px' }}
                        onClick={() => setSelectedHostDetail({ host: h, run: selectedRunForOutputs })}
                      >
                        <FileText size={14} /> Ver Resultado
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL 2: DETALHES DO RESULTADO DO HOST INDIVIDUAL */}
      {selectedHostDetail && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '950px', height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--accent-cyan)' }}>
            {/* Host Detail Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.95)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Globe size={20} color="var(--accent-cyan)" />
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)' }}>{selectedHostDetail.host.host}</h2>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Resultado do teste | Run ID: <code>{selectedHostDetail.run.id}</code>
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  className="btn-primary"
                  style={{ padding: '8px 16px', fontSize: '0.85rem', gap: '6px' }}
                  onClick={() => {
                    const txt = fetchedOutputText || generateSampleHostTxt(selectedHostDetail.host.host, selectedHostDetail.run.id, selectedHostDetail.run.workflowName, selectedToolFilter);
                    const suffix = selectedToolFilter !== 'all' ? `_${selectedToolFilter}` : '_consolidated';
                    downloadTxtFile(`${selectedHostDetail.host.host}${suffix}_output.txt`, txt);
                  }}
                >
                  <Download size={16} /> Baixar {selectedToolFilter !== 'all' ? selectedToolFilter : 'Consolidado'} (.txt)
                </button>
                <button
                  onClick={() => {
                    setSelectedHostDetail(null);
                    setSelectedToolFilter('all');
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Tool Filter Tabs Bar */}
            <div style={{ padding: '10px 24px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Visualizar Ferramenta:</span>
              <button
                onClick={() => setSelectedToolFilter('all')}
                className={selectedToolFilter === 'all' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '4px 12px', fontSize: '0.8rem' }}
              >
                Todos (Consolidado)
              </button>
              {selectedHostDetail.host.tools.map(t => (
                <button
                  key={t}
                  onClick={() => setSelectedToolFilter(t)}
                  className={selectedToolFilter === t ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '4px 12px', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Terminal View Body */}
            <div style={{ flex: 1, padding: '20px', background: '#090d16', overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#38bdf8', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {loadingOutputText ? '[Carregando resultado bruto do Gateway API...]' : (fetchedOutputText || generateSampleHostTxt(selectedHostDetail.host.host, selectedHostDetail.run.id, selectedHostDetail.run.workflowName, selectedToolFilter))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
