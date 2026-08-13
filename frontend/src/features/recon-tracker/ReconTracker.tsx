import { useCallback, useEffect, useMemo, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { RegisterScreen } from './components/RegisterScreen';
import { NewRunModal, type DispatchInput } from './components/NewRunModal';
import { ScopePanel } from './components/ScopePanel';
import { DemoModeToast } from './components/DemoModeToast';
import { OverviewScreen } from './screens/OverviewScreen';
import { RunsScreen } from './screens/RunsScreen';
import { RunDetailScreen } from './screens/RunDetailScreen';
import { TesScreen } from './screens/TesScreen';
import { DebugN8nScreen } from './screens/DebugN8nScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { useHashRoute } from './lib/useHashRoute';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { ApiError } from './api/client';
import { fetchRuns, fetchTargets, fetchWorkflows, triggerRun } from './api/gateway';
import { mapGatewayRun } from './data/dataSource';
import { mockRuns } from './data/mockRuns';
import {
  filterRuns,
  selectKpis,
  selectStatusDistribution,
  selectToolDistribution,
  selectTrendPercent,
  selectVolumeSeries,
} from './lib/selectors';
import {
  PERIOD_LABELS,
  type DashboardFilters,
  type RunRecord,
  type TargetItem,
  type WorkflowItem,
} from './types';
import './recon-tracker.css';

interface ReconTrackerProps {
  /** Injected so period filtering is deterministic in tests. */
  now?: Date;
}

export function ReconTracker({ now }: ReconTrackerProps) {
  const reference = useMemo(() => now ?? new Date(), [now]);

  const { route, navigate } = useHashRoute();
  const { theme, toggleTheme } = useTheme();
  const {
    state: authState,
    user,
    error: authError,
    signIn,
    signUp,
    signOut,
    updateProfile,
  } = useAuth();
  const [showRegister, setShowRegister] = useState(false);

  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [targets, setTargets] = useState<TargetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);

  const [collapsed, setCollapsed] = useState(false);
  const [role, setRole] = useState('Admin');
  const [modalOpen, setModalOpen] = useState(false);
  const [toastDismissed, setToastDismissed] = useState(false);
  const [filters, setFilters] = useState<DashboardFilters>({
    period: '7d',
    tool: 'all',
    status: 'all',
    // The header's program picker was removed; selectors still honour this
    // field, so it stays pinned open rather than silently hiding runs.
    program: 'all',
  });

  const authenticated = authState === 'authenticated';

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const gatewayRuns = await fetchRuns();
      const mapped = gatewayRuns.map(mapGatewayRun);

      // An empty dashboard is indistinguishable from a broken one, so sample
      // runs stand in — and the toast says so rather than letting the operator
      // mistake them for real recon results.
      setIsDemo(mapped.length === 0);
      setRuns(mapped.length > 0 ? mapped : mockRuns);
      setError(null);
    } catch (caught) {
      setIsDemo(true);
      setRuns(mockRuns);
      setError(caught instanceof ApiError ? caught.message : 'Unable to load runs');
    } finally {
      setLoading(false);
    }

    // Workflows and targets need a token; a 401 here is expected before login
    // and must not blank the page.
    if (authenticated) {
      await Promise.all([
        fetchWorkflows()
          .then(setWorkflows)
          .catch(() => setWorkflows([])),
        fetchTargets()
          .then(setTargets)
          .catch(() => setTargets([])),
      ]);
    }
  }, [authenticated]);

  useEffect(() => {
    if (authState === 'checking') return;
    void reload();
  }, [authState, reload]);

  const visible = useMemo(
    () => filterRuns(runs, filters, reference),
    [runs, filters, reference],
  );
  const kpis = useMemo(() => selectKpis(visible), [visible]);
  const volume = useMemo(
    () => selectVolumeSeries(visible, filters.period, reference),
    [visible, filters.period, reference],
  );
  const statuses = useMemo(() => selectStatusDistribution(visible), [visible]);
  const tools = useMemo(() => selectToolDistribution(visible), [visible]);
  const trend = useMemo(() => selectTrendPercent(volume), [volume]);

  const recentRuns = useMemo(
    () =>
      [...visible]
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
        .slice(0, 8),
    [visible],
  );
  const activeRuns = useMemo(
    () => visible.filter(run => run.status === 'running' || run.status === 'queued'),
    [visible],
  );

  const periodLabel = PERIOD_LABELS[filters.period];
  const isEmpty = !loading && visible.length === 0;

  const handleDispatch = async ({ workflowId, targetId }: DispatchInput) => {
    await triggerRun(workflowId, targetId);
    setModalOpen(false);
    await reload();
  };

  if (authState === 'checking') {
    return (
      <div className="rt-root" data-theme={theme}>
        <p className="rt-placeholder">Checking session…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="rt-root rt-root-plain" data-theme={theme}>
        {showRegister ? (
          <RegisterScreen
            onRegister={signUp}
            onShowLogin={() => setShowRegister(false)}
            error={authError}
          />
        ) : (
          <LoginScreen
            onSignIn={signIn}
            onShowRegister={() => setShowRegister(true)}
            error={authError}
          />
        )}
      </div>
    );
  }

  return (
    <div className="rt-root" data-theme={theme}>
      <a className="rt-skip-link" href="#rt-main">
        Skip to main content
      </a>

      <Sidebar
        route={route.key}
        collapsed={collapsed}
        onNavigate={navigate}
        onSignOut={signOut}
        userName={user?.name ?? 'Operator'}
        avatarUrl={user?.avatar_url ?? null}
      />

      <div className="rt-content">
        <Header
          sidebarCollapsed={collapsed}
          theme={theme}
          role={role}
          onToggleSidebar={() => setCollapsed(current => !current)}
          onToggleTheme={toggleTheme}
          onRoleChange={setRole}
        />

        <main className="rt-main" id="rt-main" tabIndex={-1}>
          {error && route.key === 'overview' && (
            <p className="rt-error" role="alert">
              <TriangleAlert size={16} aria-hidden="true" />
              {error}
            </p>
          )}

          {route.key === 'overview' && (
            <OverviewScreen
              userName={user?.name ?? 'Operator'}
              filters={filters}
              onFiltersChange={setFilters}
              onNewRun={() => setModalOpen(true)}
              kpis={kpis}
              volume={volume}
              statuses={statuses}
              tools={tools}
              trend={trend}
              periodLabel={periodLabel}
              loading={loading}
              isEmpty={isEmpty}
              workflows={workflows}
              recentRuns={recentRuns}
              onOpenRun={runId => navigate('runs', runId)}
              onRunWorkflow={() => setModalOpen(true)}
            />
          )}

          {route.key === 'runs' &&
            (route.runId ? (
              <RunDetailScreen runId={route.runId} onBack={() => navigate('runs')} />
            ) : (
              <RunsScreen
                title="All Runs"
                subtitle="Every execution the gateway has recorded, and the scope it may run against"
                runs={visible}
                loading={loading}
                error={error}
                onOpenRun={runId => navigate('runs', runId)}
                onNewRun={() => setModalOpen(true)}
                // reload() refetches targets alongside runs, so a target
                // created here immediately reaches the New Run modal too.
                aside={<ScopePanel targets={targets} onChanged={reload} />}
              />
            ))}

          {route.key === 'active' && (
            <RunsScreen
              title="Active Runs"
              subtitle="Queued and running right now"
              runs={activeRuns}
              loading={loading}
              error={error}
              onOpenRun={runId => navigate('runs', runId)}
              onNewRun={() => setModalOpen(true)}
            />
          )}

          {route.key === 'tes' && <TesScreen />}
          {route.key === 'debug' && <DebugN8nScreen />}

          {/* `user` is non-null for every authenticated render — the shell
              returns the login screen otherwise — but the route is reachable
              by hash, so the guard stays rather than a non-null assertion. */}
          {route.key === 'profile' && user && (
            <ProfileScreen user={user} onUpdateProfile={updateProfile} />
          )}
        </main>
      </div>

      <NewRunModal
        open={modalOpen}
        workflows={workflows}
        targets={targets}
        onClose={() => setModalOpen(false)}
        onDispatch={handleDispatch}
      />

      {isDemo && !toastDismissed && (
        <DemoModeToast onDismiss={() => setToastDismissed(true)} />
      )}
    </div>
  );
}
