# DESIGN_SYSTEM_TOKENS — Request Tracker

> Artefato do **Design System Specialist** (Design-Team / Squad-UI-UX).
> Entrada: [`UI_SPEC.md`](UI_SPEC.md) · Saída para: [`ACCESSIBILITY_REPORT.md`](ACCESSIBILITY_REPORT.md)
> Data: 2026-08-07

---

## 1. Estratégia de Namespacing (restrição do projeto)

O `frontend/src/index.css` do Merovíngio já ocupa `:root` com os tokens do dashboard de recon (`--bg-dark`, `--primary`, `--text-main`, `--radius-md`, …). Redefinir qualquer um deles quebraria aquele dashboard.

**Contrato:**

1. Todo token do Request Tracker é prefixado **`--rt-`**.
2. Os tokens são declarados na classe **`.rt-root`**, nunca em `:root`.
3. O tema é trocado por `data-theme="light" | "dark"` **no mesmo elemento** `.rt-root` — nada de classe no `<html>`, que vazaria para o recon.
4. Toda regra de CSS da feature é prefixada `.rt-` — sem seletores de elemento nu (`button`, `h1`) que escapariam o escopo.

```
.rt-root[data-theme="dark"]   → paleta escura (padrão)
.rt-root[data-theme="light"]  → paleta clara
```

---

## 2. Tokens — Cor

### 2.1 Superfícies e bordas

| Token | Dark | Light |
| :--- | :--- | :--- |
| `--rt-bg` | `#0a0a0a` | `#fafafa` |
| `--rt-surface` | `#141414` | `#ffffff` |
| `--rt-surface-2` | `#1a1a1a` | `#ffffff` |
| `--rt-surface-3` | `#1f1f1f` | `#f4f4f5` |
| `--rt-surface-4` | `#242424` | `#e4e4e7` |
| `--rt-border` | `#262626` | `#e4e4e7` |
| `--rt-border-strong` | `#3f3f46` | `#d4d4d8` |
| `--rt-overlay` | `rgba(0,0,0,.72)` | `rgba(0,0,0,.45)` |

### 2.2 Texto

| Token | Dark | Light |
| :--- | :--- | :--- |
| `--rt-text` | `#ffffff` | `#0a0a0a` |
| `--rt-text-muted` | `#9ca3af` | `#52525b` |
| `--rt-text-dim` | `#6b7280` | `#71717a` |
| `--rt-text-on-accent` | `#0a0a0a` | `#ffffff` |

`--rt-text-on-accent` inverte entre temas: no dark o acento é claro (`#10b981`) e pede texto escuro; no light o acento é escuro (`#047857`) e pede texto branco. É esse token que resolve a falha de 2.54:1 apontada no `UI_SPEC.md`.

### 2.3 Acento e semântica de status

| Token | Dark | Light |
| :--- | :--- | :--- |
| `--rt-accent` | `#10b981` | `#047857` |
| `--rt-accent-hover` | `#34d399` | `#059669` |
| `--rt-accent-text` | `#34d399` | `#047857` |
| `--rt-accent-soft` | `rgba(16,185,129,.10)` | `rgba(4,120,87,.10)` |
| `--rt-accent-ring` | `rgba(16,185,129,.45)` | `rgba(4,120,87,.45)` |
| `--rt-status-approved` | `#10b981` | `#047857` |
| `--rt-status-pending` | `#f59e0b` | `#b45309` |
| `--rt-status-review` | `#3b82f6` | `#1d4ed8` |
| `--rt-status-rejected` | `#ef4444` | `#b91c1c` |

### 2.4 Gradientes de gráfico

| Token | Dark | Light |
| :--- | :--- | :--- |
| `--rt-chart-from` | `#34d399` | `#34d399` |
| `--rt-chart-to` | `#059669` | `#047857` |
| `--rt-chart-track` | `#1f1f1f` | `#f4f4f5` |
| `--rt-chart-grid` | `#262626` | `#e4e4e7` |

---

## 3. Tokens — Espaçamento, Raio, Sombra, Tipografia

```
--rt-space-1: 4px     --rt-radius-sm: 6px      --rt-shadow-sm:  0 2px 8px rgba(0,0,0,.30)
--rt-space-2: 8px     --rt-radius-md: 8px      --rt-shadow-md:  0 6px 20px rgba(0,0,0,.45)
--rt-space-3: 12px    --rt-radius-lg: 12px     --rt-shadow-lg:  0 8px 24px rgba(0,0,0,.50)
--rt-space-4: 16px    --rt-radius-xl: 16px     --rt-shadow-xl:  0 20px 60px rgba(0,0,0,.60)
--rt-space-5: 20px    --rt-radius-full: 999px
--rt-space-6: 24px
--rt-space-8: 32px    --rt-sidebar-w: 255px    --rt-header-h: 64px
--rt-space-10: 40px   --rt-sidebar-w-collapsed: 72px
```

| Token tipográfico | Valor |
| :--- | :--- |
| `--rt-font` | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` |
| `--rt-fs-display` / `--rt-lh-display` | `30px` / `36px` |
| `--rt-fs-metric` | `30px` |
| `--rt-fs-title` | `15px` |
| `--rt-fs-body` | `14px` |
| `--rt-fs-label` | `13px` |
| `--rt-fs-caption` | `12px` |
| `--rt-fs-overline` | `11px` |

---

## 4. Implementação CSS (contrato de entrega)

```css
.rt-root {
  --rt-font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  --rt-space-1: 4px;  --rt-space-2: 8px;  --rt-space-3: 12px; --rt-space-4: 16px;
  --rt-space-5: 20px; --rt-space-6: 24px; --rt-space-8: 32px; --rt-space-10: 40px;

  --rt-radius-sm: 6px; --rt-radius-md: 8px; --rt-radius-lg: 12px;
  --rt-radius-xl: 16px; --rt-radius-full: 999px;

  --rt-sidebar-w: 255px; --rt-sidebar-w-collapsed: 72px; --rt-header-h: 64px;

  --rt-dur-fast: 120ms; --rt-dur-base: 180ms; --rt-dur-slow: 260ms;
  --rt-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --rt-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

.rt-root[data-theme='dark'] {
  --rt-bg: #0a0a0a;            --rt-surface: #141414;
  --rt-surface-2: #1a1a1a;     --rt-surface-3: #1f1f1f;   --rt-surface-4: #242424;
  --rt-border: #262626;        --rt-border-strong: #3f3f46;
  --rt-overlay: rgba(0, 0, 0, 0.72);

  --rt-text: #ffffff;          --rt-text-muted: #9ca3af;
  --rt-text-dim: #6b7280;      --rt-text-on-accent: #0a0a0a;

  --rt-accent: #10b981;        --rt-accent-hover: #34d399;  --rt-accent-text: #34d399;
  --rt-accent-soft: rgba(16, 185, 129, 0.1);
  --rt-accent-ring: rgba(16, 185, 129, 0.45);

  --rt-status-approved: #10b981; --rt-status-pending: #f59e0b;
  --rt-status-review: #3b82f6;   --rt-status-rejected: #ef4444;

  --rt-chart-from: #34d399;    --rt-chart-to: #059669;
  --rt-chart-track: #1f1f1f;   --rt-chart-grid: #262626;

  --rt-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.3);
  --rt-shadow-md: 0 6px 20px rgba(0, 0, 0, 0.45);
  --rt-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --rt-shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.6);
  --rt-dot-grid: rgba(255, 255, 255, 0.035);
}

.rt-root[data-theme='light'] {
  --rt-bg: #fafafa;            --rt-surface: #ffffff;
  --rt-surface-2: #ffffff;     --rt-surface-3: #f4f4f5;   --rt-surface-4: #e4e4e7;
  --rt-border: #e4e4e7;        --rt-border-strong: #d4d4d8;
  --rt-overlay: rgba(0, 0, 0, 0.45);

  --rt-text: #0a0a0a;          --rt-text-muted: #52525b;
  --rt-text-dim: #71717a;      --rt-text-on-accent: #ffffff;

  --rt-accent: #047857;        --rt-accent-hover: #059669;  --rt-accent-text: #047857;
  --rt-accent-soft: rgba(4, 120, 87, 0.1);
  --rt-accent-ring: rgba(4, 120, 87, 0.45);

  --rt-status-approved: #047857; --rt-status-pending: #b45309;
  --rt-status-review: #1d4ed8;   --rt-status-rejected: #b91c1c;

  --rt-chart-from: #34d399;    --rt-chart-to: #047857;
  --rt-chart-track: #f4f4f5;   --rt-chart-grid: #e4e4e7;

  --rt-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.06);
  --rt-shadow-md: 0 6px 20px rgba(0, 0, 0, 0.1);
  --rt-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);
  --rt-shadow-xl: 0 20px 60px rgba(0, 0, 0, 0.18);
  --rt-dot-grid: rgba(0, 0, 0, 0.05);
}
```

### Consumo dos tokens em SVG

Os três gráficos são SVG nativo. Cores entram por `fill="var(--rt-...)"`, e os gradientes por `<linearGradient>` cujos `stop-color` também são `var(--rt-chart-from|to)`. Consequência: **a troca de tema repinta os gráficos sem re-render do React** — o CSS resolve sozinho.

---

## 5. Biblioteca de Componentes

| Componente | Anatomia | Variantes | Estados |
| :--- | :--- | :--- | :--- |
| `RtButton` | ícone opcional + label | `primary` · `ghost` · `icon` | default · hover · active · focus · disabled |
| `RtCard` | header (título + slot) + body | `default` · `padded` | default · hover |
| `KpiCard` | label + caixa de ícone + valor + legenda | `neutral` · `warning` · `positive` | default · loading |
| `RtDropdown` | trigger + menu + itens | `default` · `com dot de status` | fechado · aberto · item selecionado |
| `RtTabs` | grupo + N tabs | — | ativa · inativa · focus |
| `RtModal` | overlay + painel + header + body + footer | — | aberto · fechando |
| `RtToast` | accent bar + título + corpo + close | `info` · `success` | visível · dispensado |
| `SidebarItem` | ícone + label + barra ativa | expandido · colapsado | default · hover · ativo · focus |

### Contrato de tamanhos

| Elemento | Altura | Padding-X | Radius |
| :--- | :--- | :--- | :--- |
| Botão primário | 36px | 14px | `--rt-radius-md` |
| Trigger de dropdown | 34px | 12px | `--rt-radius-md` |
| Tab | 28px | 12px | `--rt-radius-sm` |
| Item de sidebar | 38px | 12px | `--rt-radius-md` |
| Item de menu | 34px | 12px | `--rt-radius-sm` |
| Input do modal | 38px | 12px | `--rt-radius-md` |

**Alvo de toque:** todo elemento interativo tem no mínimo 36×36px de área clicável. Os botões-ícone de 34px recebem `padding` extra para chegar a 36px, satisfazendo WCAG 2.5.5 (AAA) e com folga o 2.5.8 (AA, 24px).

---

## 6. Regras de Foco (base para o a11y)

```css
.rt-root :focus-visible {
  outline: 2px solid var(--rt-accent);
  outline-offset: 2px;
  border-radius: var(--rt-radius-sm);
}
```

O anel usa `--rt-accent` — medido em **7.80:1** contra `#0a0a0a` e **7.26:1** contra `#141414`, muito acima do 3:1 exigido por WCAG 1.4.11 para indicadores não-textuais. `outline`, e não `box-shadow`, para que o anel sobreviva a `overflow: hidden` de containers pais.

---

## 7. Handoff

Próximo agente: **Accessibility Specialist** → [`ACCESSIBILITY_REPORT.md`](ACCESSIBILITY_REPORT.md).

Ponto que exige auditoria explícita: as bordas (`--rt-border` = `#262626` sobre `#0a0a0a` → **1.31:1**) são intencionalmente decorativas. É preciso confirmar que **nenhum componente depende exclusivamente da borda** para ser identificado como interativo — caso contrário viola WCAG 1.4.11.
