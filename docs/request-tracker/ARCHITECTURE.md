# ARCHITECTURE — Request Tracker

> Artefato do **Frontend Tech Lead** (Dev-Team / Squad-Frontend).
> Entrada: [`PRD.md`](PRD.md) · Saída para: **Frontend Tester** (fase RED)
> Data: 2026-08-07

---

## 1. Framework e Bundler

**Sem `init_project`.** O template MCP `vite-react` criaria um projeto novo; a decisão do dono é embarcar a feature no `frontend/` **existente** do Merovíngio. Stack herdada:

| Camada | Escolha | Origem |
| :--- | :--- | :--- |
| Bundler | Vite 8 | já no projeto |
| UI | React 19 + TypeScript 6 | já no projeto |
| Ícones | `lucide-react` | já no projeto |
| Estilo | **CSS puro + custom properties** | convenção do projeto |
| Gráficos | **SVG nativo** | decisão do dono |
| Testes | **Vitest + Testing Library + jsdom** | ⬅ *única adição* — `devDependencies` |
| Lint | `oxlint` | já no projeto |

### Por que nenhuma dependência de runtime

1. **Tailwind** colidiria com o `index.css` global do recon — o preflight resetaria estilos daquele dashboard.
2. **shadcn/ui** arrastaria Radix + CVA + tailwind-merge, ampliando a superfície do monorepo para uma feature.
3. **Recharts** entrega o que 3 gráficos estáticos resolvem com `<svg>` — e um SVG com `fill="var(--rt-*)"` troca de tema **sem re-render do React**, coisa que Recharts não faz de graça.
4. **react-router** é desnecessário para 5 rotas; um hook de hash de ~30 linhas cobre e ainda é testável sem provider.

Vitest e Testing Library entram apenas como `devDependencies` — não vão para o bundle e o TDD do Dev-Team é inegociável.

---

## 2. Estrutura de Diretórios (feature-based)

```
frontend/
├── scripts/
│   └── check-contrast.mjs               ← verificador WCAG do ACCESSIBILITY_REPORT
├── vitest.config.ts                     ← NOVO
├── src/
│   ├── App.tsx                          ← INTOCADO (recon)
│   ├── App.css, index.css               ← INTOCADOS
│   ├── main.tsx                         ← alterado: monta <Root/>
│   ├── Root.tsx                         ← NOVO: switch por hash
│   ├── test/setup.ts                    ← NOVO
│   └── features/request-tracker/
│       ├── RequestTracker.tsx           ← shell da feature
│       ├── request-tracker.css          ← todo o CSS, escopado em .rt-root
│       ├── types.ts
│       ├── data/
│       │   ├── mockRequests.ts
│       │   └── dataSource.ts            ← SEAM 1
│       ├── lib/
│       │   ├── selectors.ts             ← SEAM 2 (funções puras)
│       │   ├── format.ts
│       │   └── useHashRoute.ts          ← SEAM 3
│       ├── hooks/
│       │   ├── useTheme.ts
│       │   └── useDashboardData.ts
│       ├── components/
│       │   ├── Sidebar.tsx
│       │   ├── Header.tsx
│       │   ├── FilterBar.tsx
│       │   ├── KpiCard.tsx
│       │   ├── RequestVolumeChart.tsx
│       │   ├── StatusDonutChart.tsx
│       │   ├── RequestsByTypeChart.tsx
│       │   ├── NewRequestModal.tsx
│       │   ├── DemoModeToast.tsx
│       │   ├── Dropdown.tsx
│       │   └── PeriodTabs.tsx
│       └── __tests__/
│           ├── selectors.test.ts
│           ├── useHashRoute.test.ts
│           ├── Sidebar.test.tsx
│           ├── Header.test.tsx
│           ├── KpiCard.test.tsx
│           ├── FilterBar.test.tsx
│           ├── charts.test.tsx
│           ├── NewRequestModal.test.tsx
│           ├── DemoModeToast.test.tsx
│           └── RequestTracker.test.tsx
```

---

## 3. Modelo de Domínio

```ts
export type RequestStatus = 'approved' | 'pending' | 'in_review' | 'rejected';
export type RequestType =
  | 'Paid Time Off' | 'Remote Work' | 'Training Request' | 'Expense Report';
export type PeriodKey = '24h' | '7d' | '30d';

export interface RequestRecord {
  id: string;
  title: string;
  type: RequestType;
  status: RequestStatus;
  requester: string;
  createdAt: string;   // ISO 8601
  useCase: string;     // 'HR' | 'Finance' | ...
}

export interface DashboardFilters {
  period: PeriodKey;
  type: RequestType | 'all';
  status: RequestStatus | 'all';
  useCase: string | 'all';
}

export interface KpiSet    { total: number; pending: number; approved: number; rejected: number; }
export interface VolumePoint  { date: string; label: string; count: number; }
export interface StatusSlice  { status: RequestStatus; label: string; value: number; color: string; }
export interface TypeBar      { type: RequestType; value: number; }
```

`createdAt` é **string ISO**, não `Date`: serializa direto de uma API futura e mantém os testes determinísticos.

---

## 4. Seams de Teste

> Seam = fronteira onde o comportamento é observável e substituível sem tocar no que está dos dois lados. É o que permite testar regra de negócio sem DOM e trocar mock por API sem mexer em UI.

### SEAM 1 — `RequestDataSource` (fronteira de dados)

```ts
export interface RequestDataSource {
  readonly isDemo: boolean;
  listRequests(): Promise<RequestRecord[]>;
  createRequest(input: NewRequestInput): Promise<RequestRecord>;
}
```

Duas implementações previstas:

| Implementação | Situação |
| :--- | :--- |
| `createMockDataSource(seed)` | ✅ Entregue — `isDemo: true`, alimenta o toast Demo Mode |
| `createHttpDataSource(baseUrl)` | Futura — `isDemo: false`, o toast some sozinho |

**Contrato:** trocar a implementação não altera **nenhum** componente. O flag `isDemo` é o que governa o toast — daí "Remix this template to connect real data" ser verdade literal, não texto decorativo.

Injeção: `RequestTracker` aceita `dataSource?: RequestDataSource`, com default no mock. Testes passam a própria fonte, sem MSW nem interceptação de rede.

### SEAM 2 — `selectors.ts` (fronteira de derivação)

Funções **puras**, sem React, sem DOM, sem `Date.now()` implícito. Toda regra de negócio do dashboard vive aqui e é testável em milissegundos.

```ts
export function filterRequests(
  requests: RequestRecord[], filters: DashboardFilters, now: Date): RequestRecord[];

export function selectKpis(requests: RequestRecord[]): KpiSet;

export function selectVolumeSeries(
  requests: RequestRecord[], period: PeriodKey, now: Date): VolumePoint[];

export function selectStatusDistribution(requests: RequestRecord[]): StatusSlice[];

export function selectTypeDistribution(requests: RequestRecord[]): TypeBar[];

export function selectAxisTicks(max: number, steps?: number): number[];

export function selectTrendPercent(series: VolumePoint[]): number;
```

**`now` é sempre parâmetro explícito.** Nenhuma dessas funções lê o relógio por conta própria — é o que torna a filtragem por período determinística no teste em vez de dependente do dia em que a suíte roda.

`selectKpis` conta `pending + in_review` como "Pending Review", conforme PRD §3.3.

### SEAM 3 — `useHashRoute` (fronteira de navegação)

```ts
export function parseHashRoute(hash: string): RouteKey | null;
export function useHashRoute(): { route: RouteKey; navigate: (r: RouteKey) => void };
```

`parseHashRoute` é pura e testada isoladamente; o hook só a acopla ao `hashchange`. Retorno `null` = "não é rota do Request Tracker" → `Root` renderiza o recon.

### SEAM 4 — Interface pública dos componentes

Testes atacam **papel, nome acessível e texto visível** — nunca classe CSS, nunca estrutura interna:

```ts
screen.getByRole('tab', { name: /last 7 days/i })
screen.getByRole('img',  { name: /request volume/i })
screen.getByRole('dialog', { name: /new request/i })
```

Consequência direta: refatorar markup ou CSS não quebra teste. Quebrar contrato de acessibilidade, sim.

---

## 5. Gerenciamento de Estado

**Sem Zustand, sem Redux, sem Context.** O estado é raso e local; ferramenta de estado global aqui seria cerimônia.

| Estado | Onde vive | Persistência |
| :--- | :--- | :--- |
| `filters` | `useState` em `RequestTracker` | — |
| `requests` | `useState` + `useDashboardData` | via `RequestDataSource` |
| `theme` | `useTheme` | `localStorage['rt-theme']` |
| `sidebarCollapsed` | `useState` | — |
| `toastDismissed` | `useState` | sessão apenas (PRD §4.3) |
| `modalOpen` | `useState` | — |
| `route` | `useHashRoute` | `window.location.hash` |

Todos os valores derivados passam por `useMemo` sobre os seletores puros — a árvore de gráficos só recalcula quando `requests` ou `filters` mudam de fato.

```
requests + filters
   → useMemo(filterRequests)
       → useMemo(selectKpis)              → KpiGrid
       → useMemo(selectVolumeSeries)      → RequestVolumeChart
       → useMemo(selectStatusDistribution)→ StatusDonutChart
       → useMemo(selectTypeDistribution)  → RequestsByTypeChart
```

---

## 6. Estratégia de Isolamento (crítica)

O requisito nº 2 do PRD — não afetar o recon — é garantido por **quatro barreiras independentes**:

| # | Barreira | Mecanismo |
| :--- | :--- | :--- |
| 1 | **CSS namespaced** | Todo token é `--rt-*`, declarado em `.rt-root`. `:root` não é tocado |
| 2 | **Seletores prefixados** | Toda regra começa em `.rt-`. Zero seletor de elemento nu |
| 3 | **Separação de rota** | `Root` monta `App` **ou** `RequestTracker`, nunca os dois |
| 4 | **Import isolado** | `request-tracker.css` é importado pela feature, não pelo `main.tsx` |

`App.tsx`, `App.css` e `index.css` **não recebem uma única alteração**. O único arquivo pré-existente tocado é o `main.tsx`, que passa de montar `<App/>` para montar `<Root/>`.

### Root.tsx

```tsx
export function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return parseHashRoute(hash) ? <RequestTracker /> : <App />;
}
```

---

## 7. Arquitetura dos Gráficos em SVG

Cada gráfico é uma função pura de props → SVG. Sem estado interno, sem medição de DOM.

| Gráfico | Técnica | Responsividade |
| :--- | :--- | :--- |
| Volume (barras verticais) | `<rect>` por ponto + `<linearGradient>` vertical | `viewBox` + `width:100%` |
| Status (donut) | `<circle>` com `stroke-dasharray`/`stroke-dashoffset` | `viewBox` quadrado |
| Tipos (barras horizontais) | `<rect>` + trilha de fundo + `<linearGradient>` horizontal | `viewBox` + `width:100%` |

**Donut sem `<path>` com arco.** Um `<circle>` de raio `r`, `stroke-width` = espessura, `stroke-dasharray = [fatia, circunferência − fatia]` e `stroke-dashoffset` acumulado resolve o mesmo com aritmética trivial — e o gap de 2px entre fatias vira uma subtração no dasharray, sem cálculo de arco.

Escala vertical: quando todos os valores são zero, o denominador cai para `1` em vez de dividir por zero — o gráfico desenha eixos e barras de altura nula, que é exatamente o estado "vazio" pedido no PRD §5.

---

## 8. Configuração de Testes

```ts
// vitest.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
```

DevDependencies adicionadas: `vitest`, `@vitest/coverage-v8`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `@testing-library/jest-dom`.

Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

### O que `setup.ts` precisa fazer

`jsdom` não implementa `matchMedia`. `useTheme` depende dele para ler `prefers-color-scheme`. Sem stub, **toda** suíte que monte a feature quebra por motivo não relacionado ao que se quer testar. O setup instala o stub e importa `@testing-library/jest-dom`.

---

## 9. Ordem de Implementação (TDD)

| Fase | Agente | Entregável |
| :--- | :--- | :--- |
| RED-1 | Frontend Tester | `selectors.test.ts`, `useHashRoute.test.ts` — regra pura primeiro |
| RED-2 | Frontend Tester | Testes de componente isolado |
| RED-3 | Frontend Tester | `RequestTracker.test.tsx` — integração dos fluxos BDD |
| RED-4 | Frontend Tester | `TEST_REPORT.md` comprovando falha |
| GREEN-1 | Frontend Coder | `types.ts` → `selectors.ts` → `useHashRoute.ts` |
| GREEN-2 | Frontend Coder | CSS + componentes folha |
| GREEN-3 | Frontend Coder | Shell + integração |
| REFACTOR | Frontend Coder | Lint, build, `check-contrast.mjs` |
| REVIEW | Frontend Reviewer | [`REVIEW.md`](REVIEW.md) |

---

## 10. Handoff

Próximo agente: **Frontend Tester** (fase RED).

Regra de ouro reafirmada: **nenhuma linha de produção antes de um teste que falhe.** A suíte deve falhar por *módulo inexistente* — que é a falha correta em RED —, nunca por erro de sintaxe no próprio teste.
