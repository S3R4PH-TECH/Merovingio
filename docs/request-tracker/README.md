# Request Tracker — índice de artefatos

Dashboard de aprovações e workflow embarcado no `frontend/` do Merovíngio, entregue pelas cadeias **Design-Team → Squad-UI-UX** e **Dev-Team → Squad-Frontend**.

## Como abrir

```bash
cd frontend
npm run dev
```

O Request Tracker **é** a aplicação: abrir em qualquer URL comum cai nele. O dashboard de recon foi preservado, mas só é alcançado de propósito, em `#/recon`.

| URL | Tela |
| :--- | :--- |
| `http://localhost:5173/` | **Request Tracker** (padrão) |
| `#/request-tracker/requests` · `/approvals` · `/users` · `/settings` | Telas nomeadas de placeholder |
| `#/recon` | Dashboard de recon legado (`App.tsx`, intacto) |

### Servido pela stack Docker

```bash
docker compose up -d frontend      # http://localhost:15173
docker compose build frontend && docker compose up -d frontend   # após mudar código
```

## Comandos

```bash
npm test              # 164 testes, 12 arquivos
npm run lint          # oxlint
npm run build         # tsc -b && vite build
npm run check:contrast # verificador WCAG com guarda de regressão
```

## Artefatos

### Design-Team · Squad-UI-UX

| # | Documento | Agente |
| :-- | :--- | :--- |
| 1 | [UX_SPEC.md](UX_SPEC.md) | UX Researcher — jornadas, IA, fluxos |
| 2 | [UI_SPEC.md](UI_SPEC.md) | UI Designer — tipografia, paleta, anatomia |
| 3 | [DESIGN_SYSTEM_TOKENS.md](DESIGN_SYSTEM_TOKENS.md) | Design System — tokens `--rt-*` |
| 4 | [ACCESSIBILITY_REPORT.md](ACCESSIBILITY_REPORT.md) | a11y — WCAG 2.1 AA medido |
| 5 | [INTERACTION_SPEC.md](INTERACTION_SPEC.md) | Interaction Prototyper — estados e timings |

### Dev-Team · Squad-Frontend

| # | Documento | Agente |
| :-- | :--- | :--- |
| 6 | [PRD.md](PRD.md) | Frontend PM — escopo e 7 épicos BDD |
| 7 | [ARCHITECTURE.md](ARCHITECTURE.md) | Frontend Tech Lead — 4 Seams de teste |
| 8 | [TEST_REPORT.md](TEST_REPORT.md) | Frontend Tester — comprovação do estado RED |
| 9 | [REVIEW.md](REVIEW.md) | Frontend Reviewer — **APPROVED** |

## Código

```
frontend/src/
├── Root.tsx                          # escolhe recon ou Request Tracker pelo hash
├── App.tsx                           # recon — NÃO alterado por este trabalho
└── features/request-tracker/
    ├── RequestTracker.tsx            # shell
    ├── request-tracker.css           # tokens e estilos, escopados em .rt-root
    ├── types.ts
    ├── data/       mockRequests.ts · dataSource.ts   ← SEAM 1
    ├── lib/        selectors.ts · useHashRoute.ts    ← SEAMs 2 e 3
    ├── hooks/      useTheme.ts · useDashboardData.ts
    ├── components/ 11 componentes
    └── __tests__/  11 suítes
```

## Como plugar dados reais

O toast "Demo Mode" é governado por `dataSource.isDemo`. Implemente a interface e o toast some sozinho — nenhum componente de UI muda:

```ts
export function createHttpDataSource(baseUrl: string): RequestDataSource {
  return {
    isDemo: false,
    async listRequests() { /* GET  ${baseUrl}/requests */ },
    async createRequest(input) { /* POST ${baseUrl}/requests */ },
  };
}
```

E injete: `<RequestTracker dataSource={createHttpDataSource('/api')} />`.
