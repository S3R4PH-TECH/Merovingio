# TEST_REPORT — Request Tracker (Estado RED)

> Artefato do **Frontend Tester** (Dev-Team / Squad-Frontend).
> Entrada: [`PRD.md`](PRD.md) + [`ARCHITECTURE.md`](ARCHITECTURE.md) · Saída para: **Frontend Coder** (fase GREEN)
> Data: 2026-08-07

---

## 1. Toolchain instalado

O `frontend/` do Merovíngio não tinha runner de testes. Adicionado **apenas em `devDependencies`** — nada entra no bundle de produção:

| Pacote | Versão | Papel |
| :--- | :--- | :--- |
| `vitest` | ^3.2.7 | Runner |
| `jsdom` | **^25.0.1** | DOM |
| `@testing-library/react` | ^16.3.2 | Render de componentes |
| `@testing-library/dom` | ^10.4.1 | Queries |
| `@testing-library/user-event` | ^14.6.3 | Interação realista |
| `@testing-library/jest-dom` | ^7.0.0 | Matchers de DOM |

### ⚠️ jsdom fixado em 25.x — decisão, não acaso

A instalação inicial trouxe o jsdom mais recente, e **toda a suíte quebrou antes de coletar um único teste**:

```
TypeError: webidl.util.markAsUncloneable is not a function
 ❯ new CacheStorage node_modules/undici/lib/web/cache/cachestorage.js:20:17
 ❯ Object.<anonymous> node_modules/jsdom/lib/api.js:12:33
```

**Causa:** o jsdom ≥26 empacota `undici` 7, que chama `webidl.util.markAsUncloneable` — API disponível apenas no **Node ≥22**. Este ambiente roda **Node v20.19.2**.

**Correção:** `jsdom@^25.0.1`, cujo `undici` 6 é compatível com Node 20.

Não é falha do código sob teste — é incompatibilidade de ambiente, e teria mascarado o RED legítimo por trás de um erro de infraestrutura. Registrado aqui para não ser redescoberto: **se o Node do projeto subir para 22+, o jsdom pode ser destravado.**

### Configuração

- [`vitest.config.ts`](../../frontend/vitest.config.ts) — `environment: 'jsdom'`, `globals: true`, setup dedicado.
- [`src/test/setup.ts`](../../frontend/src/test/setup.ts) — stub de `matchMedia` (jsdom não implementa, e `useTheme` depende dele), `cleanup`, limpeza de `localStorage` e do hash entre testes.
- Scripts: `npm test` · `npm run test:watch` · `npm run check:contrast`.

---

## 2. Suíte criada

**12 arquivos**, cobrindo todos os 7 épicos BDD do PRD.

| Arquivo | Alvo | Seam |
| :--- | :--- | :--- |
| `selectors.test.ts` | Regra de derivação (filtros, KPIs, séries, ticks, tendência) | SEAM 2 |
| `useHashRoute.test.ts` | Parsing e navegação por hash | SEAM 3 |
| `dataSource.test.ts` | Contrato da fonte de dados + fidelidade do dataset | SEAM 1 |
| `Sidebar.test.tsx` | Navegação, `aria-current`, colapso | SEAM 4 |
| `Header.test.tsx` | Colapso, tema, dropdowns de Role/Use case | SEAM 4 |
| `KpiCard.test.tsx` | Métrica, variantes, `aria-live`, loading | SEAM 4 |
| `FilterBar.test.tsx` | Tabs com teclado, dropdowns, CTA | SEAM 4 |
| `charts.test.tsx` | Três gráficos SVG, eixos, legendas, `role="img"` | SEAM 4 |
| `NewRequestModal.test.tsx` | Dialog, validação, focus trap | SEAM 4 |
| `DemoModeToast.test.tsx` | `role="status"`, dispensa | SEAM 4 |
| `RequestTracker.test.tsx` | **Integração** — fluxos BDD ponta a ponta | todos |
| `Root.test.tsx` | **Isolamento** do dashboard de recon | SEAM 3 |

### Rastreabilidade BDD → teste

| Épico do PRD | Onde é verificado |
| :--- | :--- |
| 1 — Filtragem | `selectors.test.ts` + `FilterBar.test.tsx` + `RequestTracker.test.tsx` |
| 2 — KPIs | `KpiCard.test.tsx` + `RequestTracker.test.tsx` |
| 3 — Gráficos | `charts.test.tsx` + `RequestTracker.test.tsx` |
| 4 — Criação | `NewRequestModal.test.tsx` + `RequestTracker.test.tsx` |
| 5 — Navegação e shell | `Sidebar.test.tsx` + `Header.test.tsx` + `RequestTracker.test.tsx` |
| 6 — Demo Mode | `DemoModeToast.test.tsx` + `RequestTracker.test.tsx` |
| 7 — Isolamento do recon | `Root.test.tsx` + `RequestTracker.test.tsx` |

### Princípios aplicados

1. **Queries por papel e nome acessível**, jamais por classe CSS ou estrutura interna — refatorar markup não quebra teste; quebrar acessibilidade, sim.
2. **`now` injetado** em toda função sensível a tempo. A suíte produz o mesmo resultado hoje e em 2030.
3. **Fonte de dados injetada** por props. Sem MSW, sem interceptar `fetch`, sem mock de rede.
4. **Casos de borda como cidadãos de primeira classe**: divisão por zero no donut, série vazia, `Infinity` na tendência, filtro sem resultado, falha de carregamento.

---

## 3. Execução — comprovação do estado RED

```
$ npm test

 Test Files  12 failed (12)
      Tests  no tests
   Duration  2.61s
```

Motivo de falha em **todos** os 12 arquivos:

```
Error: Failed to resolve import "../lib/selectors" from
"src/features/request-tracker/__tests__/selectors.test.ts". Does the file exist?
```

Módulos ainda inexistentes, exatamente como exige o RED:

```
../lib/selectors              <-  selectors.test.ts
../lib/useHashRoute           <-  useHashRoute.test.ts
../data/dataSource            <-  dataSource.test.ts
../components/Sidebar         <-  Sidebar.test.tsx
../components/Header          <-  Header.test.tsx
../components/KpiCard         <-  KpiCard.test.tsx
../components/FilterBar       <-  FilterBar.test.tsx
../components/RequestVolumeChart <- charts.test.tsx
../components/NewRequestModal <-  NewRequestModal.test.tsx
../components/DemoModeToast   <-  DemoModeToast.test.tsx
../RequestTracker             <-  RequestTracker.test.tsx
../Root                       <-  Root.test.tsx
```

### ✅ Estado RED validado

| Verificação | Resultado |
| :--- | :--- |
| A suíte falha? | ✅ Sim — 12/12 arquivos |
| Falha pelo motivo **certo**? | ✅ Módulo de produção inexistente |
| Falha por erro de sintaxe no teste? | ❌ Não — os testes são transformados sem erro |
| Falha por problema de ambiente? | ❌ Não — corrigido e documentado na §1 |
| Existe código de produção da feature? | ❌ Nenhuma linha escrita |

---

## 4. Handoff

Próximo agente: **Frontend Coder** (fase GREEN), na ordem definida em [`ARCHITECTURE.md`](ARCHITECTURE.md) §9:

```
types.ts → selectors.ts → useHashRoute.ts → dataSource.ts
        → request-tracker.css → componentes folha
        → RequestTracker.tsx → Root.tsx
```

Contratos que a implementação **precisa** honrar para a suíte virar verde:

| Contrato | Exigência |
| :--- | :--- |
| `data-testid` | `kpi-value`, `volume-bar`, `donut-arc`, `donut-legend-item`, `donut-total`, `type-bar`, `type-tick-{valor}` |
| Nomes acessíveis | "Collapse/Expand sidebar", "Switch to light/dark theme", "Role: {x}", "Use case: {x}", "Dismiss", "Close dialog", "Create request" |
| Papéis | `navigation` (Main navigation), `banner`, `main`, `tablist` (Time period), `img` nos gráficos, `dialog`, `status`, `alert` |
| Datas em UTC | `selectVolumeSeries` deve bucketizar por partes **UTC**, não locais — senão o resultado varia com o fuso da máquina |
| Erro | Falha de carregamento renderiza `role="alert"` com "Unable to load requests" |
