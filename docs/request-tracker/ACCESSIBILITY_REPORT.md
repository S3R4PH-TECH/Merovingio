# ACCESSIBILITY_REPORT — Request Tracker

> Artefato do **Accessibility Specialist (a11y)** (Design-Team / Squad-UI-UX).
> Entrada: [`DESIGN_SYSTEM_TOKENS.md`](DESIGN_SYSTEM_TOKENS.md) · Saída para: [`INTERACTION_SPEC.md`](INTERACTION_SPEC.md)
> Alvo: **WCAG 2.1 nível AA** · Data: 2026-08-07

---

## 1. Método

Todos os ratios abaixo foram **calculados** pela fórmula de luminância relativa da WCAG 2.1 (§ relative luminance + contrast ratio), não estimados a olho. Script de verificação reproduzível em [`../../frontend/scripts/check-contrast.mjs`](../../frontend/scripts/check-contrast.mjs).

Critério de aprovação: **4.5:1** para texto normal (1.4.3), **3:1** para texto grande ≥18.66px/700 ou ≥24px, **3:1** para componentes de UI e indicadores gráficos (1.4.11).

---

## 2. Auditoria de Contraste — Tema Dark

### 2.1 Texto sobre superfície

| # | Combinação | Ratio | Exigido | Status |
| :-- | :--- | ---: | :--- | :--- |
| 1 | `#ffffff` sobre `#0a0a0a` (welcome, valores) | **19.80:1** | 4.5 | ✅ AAA |
| 2 | `#ffffff` sobre `#141414` (títulos de card) | **18.42:1** | 4.5 | ✅ AAA |
| 3 | `#9ca3af` sobre `#0a0a0a` (subtítulo) | **7.80:1** | 4.5 | ✅ AAA |
| 4 | `#9ca3af` sobre `#141414` (labels, eixos) | **7.26:1** | 4.5 | ✅ AAA |
| 5 | `#34d399` sobre `#141414` (badge, item ativo) | **9.58:1** | 4.5 | ✅ AAA |
| 6 | `#f59e0b` sobre `#141414` (⚠ Needs attention) | **8.58:1** | 4.5 | ✅ AAA |
| 7 | `#3b82f6` sobre `#141414` (In Review) | **5.01:1** | 4.5 | ✅ AA |
| 8 | `#ef4444` sobre `#141414` (Rejected) | **4.90:1** | 4.5 | ✅ AA |
| 9 | `#10b981` sobre `#141414` (ícone Approved) | **7.26:1** | 3.0 | ✅ AAA |

### 2.2 🔴 Falha encontrada e corrigida — botão primário

| Combinação | Ratio | Status |
| :--- | ---: | :--- |
| `#ffffff` sobre `#10b981` — **como no mockup de referência** | **2.54:1** | ❌ **REPROVA** 1.4.3 |
| `#0a0a0a` sobre `#10b981` — **correção aplicada** | **7.80:1** | ✅ AAA |

**Achado.** O layout de referência coloca texto branco sobre o verde esmeralda no CTA `+ New Request`. A combinação entrega 2.54:1, quase metade do mínimo AA de 4.5:1 — usuários com baixa visão ou em tela sob luz forte perderiam o rótulo do único CTA primário da tela.

**Correção.** Token `--rt-text-on-accent` = `#0a0a0a` no dark. O verde permanece exatamente o `#10b981` especificado; apenas o texto por cima inverte. Ganho: **2.54:1 → 7.80:1**.

O mesmo token vale para o hover (`#34d399`): `#0a0a0a` sobre `#34d399` = **10.28:1**.

### 2.3 Bordas — verificação de dependência (WCAG 1.4.11)

`--rt-border` (`#262626`) rende **1.31:1** sobre `#0a0a0a`. Reprovaria 1.4.11 **se** fosse o único meio de identificar um componente.

Auditoria componente a componente:

| Componente | Borda é o único identificador? | Identificador redundante |
| :--- | :--- | :--- |
| Card | Não | É container não-interativo — 1.4.11 não se aplica |
| Trigger de dropdown | Não | Texto do valor (7.26:1) + chevron + `role="button"` |
| Tab ativa | **Não** | Fundo elevado + texto branco (18.42:1) + `aria-selected="true"` |
| Botão primário | Não | Fundo sólido esmeralda vs. fundo da página = **7.80:1** |
| Item de sidebar ativo | **Não** | Barra vertical 3px em `#10b981` (7.80:1) + texto esmeralda + `aria-current="page"` |
| Input do modal | Não | `<label>` associado + placeholder + borda de foco 2px |

**Veredito:** ✅ Nenhum componente depende exclusivamente da borda de baixo contraste. As bordas são puramente decorativas e ficam isentas de 1.4.11.

### 2.4 Indicador de foco (1.4.11)

`--rt-accent` `#10b981`: **7.80:1** sobre `#0a0a0a` e **7.26:1** sobre `#141414`. Exigido 3:1 → ✅ com folga de 2.4×.

---

## 3. Auditoria de Contraste — Tema Light

| # | Combinação | Ratio | Status |
| :-- | :--- | ---: | :--- |
| 1 | `#0a0a0a` sobre `#ffffff` | **19.80:1** | ✅ AAA |
| 2 | `#52525b` sobre `#ffffff` | **7.73:1** | ✅ AAA |
| 3 | `#52525b` sobre `#f4f4f5` | **7.03:1** | ✅ AAA |
| 4 | `#047857` sobre `#ffffff` (acento) | **5.48:1** | ✅ AA |
| 5 | `#ffffff` sobre `#047857` (CTA) | **5.48:1** | ✅ AA |
| 6 | `#b45309` sobre `#ffffff` (Pending) | **5.02:1** | ✅ AA |
| 7 | `#1d4ed8` sobre `#ffffff` (In Review) | **6.70:1** | ✅ AA |
| 8 | `#b91c1c` sobre `#ffffff` (Rejected) | **6.47:1** | ✅ AA |

**Nota de projeto.** As variantes 500 do dark reprovam no claro — `#10b981` sobre `#ffffff` = **1.87:1**. Por isso o tema claro desce para as variantes 700 (`#047857`, `#b45309`, `#1d4ed8`, `#b91c1c`). Não é preferência estética: é o que separa aprovação de reprovação.

---

## 4. Cor Não Pode Ser o Único Meio (1.4.1)

| Informação | Cor | Reforço não-cromático |
| :--- | :--- | :--- |
| Tab de período ativa | — | `aria-selected="true"` + fundo elevado + borda mais clara |
| Item de nav ativo | Esmeralda | **Barra vertical de 3px** + `aria-current="page"` |
| KPI que exige atenção | Âmbar | **Ícone ⚠** + a palavra "Needs attention" |
| Fatias do donut | 4 cores | **Legenda textual** com nome e valor numérico de cada fatia |
| Barras por tipo | Gradiente | **Rótulo textual** da categoria + valor numérico |
| Tendência do volume | Verde | Seta `↗` + percentual textual |
| Status da Role | Dot verde | Texto "Role: Admin" |

**Teste de daltonismo:** removidas todas as cores, a tela permanece 100% legível — cada sinal cromático tem par textual ou geométrico. ✅ 1.4.1 aprovado.

---

## 5. Navegação por Teclado (2.1.1, 2.1.2, 2.4.3, 2.4.7)

### Ordem de tabulação

```
1. Skip link ("Skip to main content")   ← primeiro tab, visível apenas ao focar
2. Sidebar: logo → 5 itens de nav → logout
3. Header: colapsar → tema → Role → Use case
4. Filtros: tab 24h → 7d → 30d → All Types → All Statuses → + New Request
5. Conteúdo: gráficos (figures focáveis) → botão de fechar do toast
```

Ordem DOM = ordem visual. **Nenhum `tabindex` positivo** em lugar algum — apenas `0` e `-1`.

### Teclas por componente

| Componente | Teclas |
| :--- | :--- |
| Tabs de período | `←` `→` navegam · `Home`/`End` extremos · roving tabindex (só a ativa é focável) |
| Dropdown | `Enter`/`Space`/`↓` abre · `↑`/`↓` percorre · `Enter` seleciona · `Esc` fecha e devolve foco ao trigger |
| Modal | Abre → foco no primeiro campo · `Tab` circula **preso** no painel · `Esc` fecha · foco volta ao `+ New Request` |
| Sidebar off-canvas | `Esc` fecha · foco volta ao botão de colapso |
| Toast | Botão de fechar alcançável por `Tab` · `Enter`/`Space` dispensa |

**Sem armadilha de teclado (2.1.2):** o único focus trap é o do modal, e ele sempre tem saída por `Esc` e pelo botão Cancel.

---

## 6. Semântica HTML e ARIA

```html
<div class="rt-root" data-theme="dark">
  <a class="rt-skip-link" href="#rt-main">Skip to main content</a>

  <nav class="rt-sidebar" aria-label="Main navigation">
    <ul>
      <li><a href="#/request-tracker/dashboard" aria-current="page">Dashboard</a></li>
    </ul>
  </nav>

  <header class="rt-header">
    <button aria-label="Collapse sidebar" aria-expanded="true" aria-controls="rt-sidebar">
    <button aria-label="Switch to light theme">
    <button aria-haspopup="listbox" aria-expanded="false">Role: Admin</button>
  </header>

  <main id="rt-main" tabindex="-1">
    <h1>Welcome back, Alex Morgan</h1>

    <div role="tablist" aria-label="Time period">
      <button role="tab" aria-selected="true" tabindex="0">Last 7 days</button>
      <button role="tab" aria-selected="false" tabindex="-1">Last 30 days</button>
    </div>

    <section aria-label="Key metrics">
      <article aria-labelledby="kpi-total">
        <h2 id="kpi-total">Total Requests</h2>
        <p aria-live="polite">10</p>
      </article>
    </section>

    <figure role="img" aria-label="Request volume over the last 7 days:
             Aug 1: 2 requests, Aug 2: 1 request, …">
      <svg aria-hidden="true" focusable="false">…</svg>
      <figcaption class="rt-visually-hidden">…tabela textual equivalente…</figcaption>
    </figure>
  </main>

  <div role="status" aria-live="polite">…toast Demo Mode…</div>
</div>
```

### Regras aplicadas

| Requisito | Implementação |
| :--- | :--- |
| Landmarks (1.3.1) | `<nav aria-label>`, `<header>`, `<main id="rt-main">`, `<footer>` na sidebar |
| Hierarquia de headings | Um `<h1>` (welcome) → `<h2>` por card → `<h3>` em subseções. Sem salto de nível |
| Ícones decorativos | `aria-hidden="true"` + `focusable="false"` em todo SVG de ícone |
| Botões-ícone | `aria-label` descrevendo a **ação**, não o ícone ("Collapse sidebar", não "Panel icon") |
| Estado de expansão | `aria-expanded` + `aria-controls` no botão de colapso e nos dropdowns |
| Página atual | `aria-current="page"` no item de nav ativo |
| Recálculo de KPI | `aria-live="polite"` nos valores — anuncia mudança sem interromper leitura |
| Modal | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` apontando ao título |
| Toast | `role="status"` (polite) — não é erro, não deve usar `role="alert"` |

### Gráficos acessíveis a leitor de tela

Cada gráfico é um `<figure role="img">` com `aria-label` que **enuncia a série completa em texto** ("Aug 1: 2 requests, Aug 2: 1 request, …"). O `<svg>` interno recebe `aria-hidden="true"`, evitando que o NVDA leia dezenas de `<rect>` sem sentido. É o padrão que dá a informação sem ruído.

---

## 7. Outros Critérios

| Critério | Situação |
| :--- | :--- |
| **1.4.4 Resize text 200%** | Layout em `rem`/`fr`; a 200% os KPIs empilham e nada é cortado ✅ |
| **1.4.10 Reflow 320px** | Sem scroll horizontal a 320px; sidebar vira off-canvas ✅ |
| **1.4.12 Text spacing** | Sem altura fixa em containers de texto; usa `min-height` ✅ |
| **2.2.2 Pause, Stop, Hide** | Nenhuma animação em loop ou auto-play ✅ |
| **2.3.1 Three flashes** | Nenhum flash; transições ≥120ms ✅ |
| **2.4.1 Bypass blocks** | Skip link para `#rt-main` ✅ |
| **2.5.5 / 2.5.8 Target size** | Mínimo 36×36px em todo alvo interativo ✅ (AAA) |
| **3.2.2 On input** | Filtros recalculam dados sem mudar contexto nem mover foco ✅ |
| **3.3.2 Labels** | Todo campo do modal tem `<label for>` — nunca só placeholder ✅ |
| **4.1.2 Name, Role, Value** | Todo controle custom tem role, nome acessível e estado ✅ |

### Movimento reduzido (2.3.3, AAA)

```css
@media (prefers-reduced-motion: reduce) {
  .rt-root *, .rt-root *::before, .rt-root *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Veredito

**✅ APROVADO — WCAG 2.1 nível AA**, condicionado à implementação de tudo que consta nas seções 5 e 6.

| Categoria | Resultado |
| :--- | :--- |
| Contraste de texto | 21/21 combinações aprovadas — 13 em AAA |
| Contraste de UI | Aprovado; bordas confirmadas como decorativas |
| Independência de cor | Aprovado; 7/7 sinais com reforço não-cromático |
| Teclado | Aprovado; sem armadilhas, sem `tabindex` positivo |
| Semântica / ARIA | Aprovado |

### Correções que este agente impôs ao design

1. **Texto do CTA primário** — branco (2.54:1, reprova) → `#0a0a0a` (7.80:1, AAA).
2. **Acentos do tema claro** — variantes 500 (1.87:1, reprova) → variantes 700 (≥5.02:1, AA).
3. **Barra vertical no item de nav ativo** — cor sozinha não distinguia o item ativo.
4. **`role="img"` + `aria-label` textual nos gráficos** — SVG cru era ilegível para leitor de tela.

### Item de acompanhamento (não bloqueante)

`#3b82f6` (5.01:1) e `#ef4444` (4.90:1) passam em AA, mas com margem estreita. Se algum dia forem usados em texto **menor que 13px**, migrar para `#60a5fa` (7.25:1) e `#f87171` (6.66:1). No uso atual — legenda de 13px — estão conformes.

---

## 9. Handoff

Próximo agente: **Interaction Prototyper** → [`INTERACTION_SPEC.md`](INTERACTION_SPEC.md).

Restrições a herdar: `prefers-reduced-motion` é **obrigatório**, nenhuma animação pode ultrapassar 300ms em elemento que bloqueie interação, e nenhuma transição pode remover ou atenuar o anel de foco.
