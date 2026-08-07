# UI_SPEC — Request Tracker

> Artefato do **UI Designer** (Design-Team / Squad-UI-UX).
> Entrada: [`UX_SPEC.md`](UX_SPEC.md) · Saída para: [`DESIGN_SYSTEM_TOKENS.md`](DESIGN_SYSTEM_TOKENS.md)
> Data: 2026-08-07

---

## 1. Direção Estética

**Estilo:** *Dark Mode Refinado* — superfícies opacas em escala de cinza quase-neutra, um único acento cromático (esmeralda) e profundidade construída por **elevação de superfície**, não por sombra pesada.

Três regras que governam toda a tela:

1. **Um acento só.** Esmeralda marca marca, item ativo e CTA. Âmbar, azul e vermelho existem *exclusivamente* como semântica de status — nunca como decoração.
2. **Profundidade por superfície, não por sombra.** A hierarquia sobe de `#0a0a0a` → `#141414` → `#1a1a1a`. Sombra é reservada ao modal e ao toast, que flutuam de fato.
3. **Textura discreta.** Dot grid de 1px a 24px de passo, com 3.5% de opacidade, apenas na área de conteúdo. A sidebar permanece lisa para separar as duas regiões sem precisar de borda pesada.

---

## 2. Tipografia

**Família:** `Inter`, com fallback para a stack do sistema. Já usada pelo Merovíngio (`--font-sans` no `index.css` global), portanto sem carga adicional de fonte.

```
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

| Token | Uso | Size / Line-height | Weight | Letter-spacing |
| :--- | :--- | :--- | :--- | :--- |
| `display` | "Welcome back, {nome}" | 30px / 36px | 700 | −0.02em |
| `metric` | Valor numérico dos KPIs | 30px / 34px | 700 | −0.02em |
| `title` | Título de card ("Request Volume") | 15px / 20px | 600 | −0.01em |
| `body` | Texto corrente, itens de nav | 14px / 20px | 500 | 0 |
| `label` | Rótulo de KPI, legendas | 13px / 18px | 500 | 0 |
| `caption` | Subtítulos de card, eixos | 12px / 16px | 500 | 0 |
| `overline` | "Main", "Administration" | 11px / 14px | 600 | **0.08em**, uppercase |
| `numeric` | Eixos e valores de legenda | 12px / 16px | 600 | 0, `tabular-nums` |

`font-variant-numeric: tabular-nums` é obrigatório em KPIs, eixos e legendas — impede que os números "dancem" quando os filtros recalculam os valores.

---

## 3. Paleta (com contraste medido)

Todos os valores abaixo foram **medidos**, não estimados. Ratio WCAG 2.1 contra a superfície indicada.

### Dark (padrão)

| Papel | Hex | HSL | Sobre | Ratio |
| :--- | :--- | :--- | :--- | :--- |
| Fundo da aplicação | `#0a0a0a` | `hsl(0 0% 4%)` | — | — |
| Superfície de card | `#141414` | `hsl(0 0% 8%)` | — | — |
| Superfície elevada | `#1a1a1a` | `hsl(0 0% 10%)` | — | — |
| Borda sutil | `#262626` | `hsl(0 0% 15%)` | — | decorativa |
| Borda de destaque | `#3f3f46` | `hsl(240 4% 26%)` | — | decorativa |
| Texto principal | `#ffffff` | `hsl(0 0% 100%)` | `#141414` | **18.42:1** AAA |
| Texto secundário | `#9ca3af` | `hsl(218 11% 65%)` | `#141414` | **7.26:1** AAA |
| Acento — Esmeralda 500 | `#10b981` | `hsl(160 84% 39%)` | `#141414` | **7.26:1** AAA |
| Acento — Esmeralda 400 | `#34d399` | `hsl(160 64% 52%)` | `#141414` | **9.58:1** AAA |
| Status — Pending (âmbar) | `#f59e0b` | `hsl(38 92% 50%)` | `#141414` | **8.58:1** AAA |
| Status — In Review (azul) | `#3b82f6` | `hsl(217 91% 60%)` | `#141414` | **5.01:1** AA |
| Status — Rejected (vermelho) | `#ef4444` | `hsl(0 84% 60%)` | `#141414` | **4.90:1** AA |

### ⚠️ Desvio deliberado do mockup — texto do botão primário

O layout de referência sugere **texto branco sobre o verde esmeralda**. Essa combinação foi medida em **2.54:1 — reprova WCAG AA por larga margem** (mínimo 4.5:1).

**Decisão:** o botão `+ New Request` usa texto **`#0a0a0a` sobre `#10b981`** → **7.80:1 (AAA)**.

Isso mantém o verde exato pedido no spec, preserva o peso visual do CTA e resolve a falha de contraste. É o único ponto em que a implementação diverge conscientemente da imagem de referência.

### Light (via toggle sol/lua)

| Papel | Hex | Sobre | Ratio |
| :--- | :--- | :--- | :--- |
| Fundo da aplicação | `#fafafa` | — | — |
| Superfície de card | `#ffffff` | — | — |
| Borda | `#e4e4e7` | — | decorativa |
| Texto principal | `#0a0a0a` | `#ffffff` | **19.80:1** AAA |
| Texto secundário | `#52525b` | `#ffffff` | **7.73:1** AAA |
| Acento (texto/ícone) | `#047857` | `#ffffff` | **5.48:1** AA |
| CTA primário | `#ffffff` sobre `#047857` | — | **5.48:1** AA |
| Pending | `#b45309` | `#ffffff` | **5.02:1** AA |
| In Review | `#1d4ed8` | `#ffffff` | **6.70:1** AA |
| Rejected | `#b91c1c` | `#ffffff` | **6.47:1** AA |

No tema claro os acentos descem para as variantes 700, porque as 500 do dark (`#10b981` = 1.87:1 sobre branco) reprovariam.

---

## 4. Grid e Espaçamento

Sistema **base 4px**. Escala usada: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`.

```
┌──────────────┬──────────────────────────────────────────────────────┐
│              │  HEADER            h=64px · px=24px · border-bottom   │
│  SIDEBAR     ├──────────────────────────────────────────────────────┤
│  w=255px     │                                                      │
│  (72px       │  CONTENT   px=32px · py=28px · max-w=1440px          │
│   colapsada) │  gap vertical entre blocos = 24px                    │
│              │                                                      │
│  border-     │  ┌────────┬────────┬────────┬────────┐  gap=16px     │
│  right 1px   │  │  KPI   │  KPI   │  KPI   │  KPI   │  h=118px      │
│              │  └────────┴────────┴────────┴────────┘               │
│              │  ┌──────────────────────────────────┐                │
│              │  │  REQUEST VOLUME    h=300px       │                │
│              │  └──────────────────────────────────┘                │
│              │  ┌───────────────┬──────────────────┐  gap=16px      │
│              │  │  DONUT        │  BARRAS HORIZ.   │  h=340px       │
│              │  └───────────────┴──────────────────┘                │
└──────────────┴──────────────────────────────────────────────────────┘
```

**Raios de borda:** cards `12px` · botões e inputs `8px` · pills/tabs `8px` · avatar `50%` · barras de gráfico `4px` no topo.

---

## 5. Anatomia dos Componentes

### 5.1 Sidebar (255px → 72px)

```
┌─────────────────────────────┐
│ ▢ Request Tracker           │  logo 32×32, radius 8px, bg esmeralda,
│   Approvals & Workflow      │  ícone CheckSquare em #0a0a0a
├─────────────────────────────┤  ↑ 14px / 700  ↑ 12px / #9ca3af
│ MAIN                        │  overline, pl=12px, mb=8px
│ ▪ Dashboard          ← ativo│  h=38px, radius 8px, px=12px, gap=10px
│ ▫ All Requests              │  ícone 18px
│ ▫ Pending Approvals         │
│                             │  mt=24px
│ ADMINISTRATION              │
│ ▫ User Management           │
│ ▫ Settings                  │
├─────────────────────────────┤  mt=auto, border-top
│ (U) User            [↪]     │  avatar 32px, nome 13px/600,
│     Admin                   │  role 11px/#9ca3af
└─────────────────────────────┘
```

**Item ativo:** fundo `rgba(16,185,129,0.10)` + texto e ícone em `#34d399` + **barra vertical de 3px** em `#10b981` colada à borda esquerda. A barra é o que garante distinção sem depender de cor (requisito do UX_SPEC).

**Colapsada (72px):** apenas o ícone, centralizado; rótulos removidos do fluxo mas expostos via `title` e `aria-label`; overlines das seções viram um divisor de 1px.

### 5.2 KpiCard

```
┌──────────────────────────────┐
│ Total Requests          [▢]  │  label 13px/#9ca3af · ícone em
│                              │  caixa 34×34, radius 8px, bg #1f1f1f
│ 10                           │  metric 30px/700, tabular-nums
│                              │
│ Last 7 days                  │  caption 12px, cor conforme variante
└──────────────────────────────┘
   p=18px · radius=12px · bg #141414 · border 1px #262626
```

| Card | Ícone | Cor do ícone | Legenda |
| :--- | :--- | :--- | :--- |
| Total Requests | `FileText` | `#9ca3af` | `Last 7 days` — neutra |
| Pending Review | `Clock` | `#f59e0b` | `⚠ Needs attention` — **âmbar, 600** |
| Approved | `CheckCircle2` | `#10b981` | `↑ Last 7 days` — esmeralda |
| Rejected | `XCircle` | `#ef4444` | `Last 7 days` — neutra |

A legenda de "Pending Review" só acende em âmbar quando o valor é **> 0**; em zero cai para neutra. Cor que não significa nada é ruído.

### 5.3 Request Volume (card full-width, h=300px)

- Cabeçalho: título `Request Volume` + badge `↗ 0%` (pill, bg `rgba(16,185,129,0.12)`, texto `#34d399`, 12px/600) · subtítulo `Last 7 days`.
- Plot em **SVG nativo**, `viewBox` responsivo, `preserveAspectRatio="none"` desligado nos textos.
- **Gradiente vertical** por barra: `#34d399` no topo → `#059669` na base (`<linearGradient x1=0 y1=0 x2=0 y2=1>`).
- Barras: largura = 62% do passo, `rx=4` só no topo, gap uniforme.
- Grid horizontal: 4 linhas em `#262626` a 1px, atrás das barras.
- Eixo X: `Aug 1 … Aug 7`, 12px, `#9ca3af`.

### 5.4 Status Distribution (donut)

- Donut de raio externo 78px, **espessura 22px**, iniciando às 12h e progredindo no sentido horário.
- **Gap de 2px** entre segmentos, desenhado com stroke da cor da superfície — resolve a adjacência de cores sem depender de contraste entre fatias.
- Centro: total agregado (24px/700) sobre o rótulo `Total` (11px/#9ca3af).
- Legenda em **2 colunas** abaixo: dot de 8px + label 13px + valor 13px/600 alinhado à direita.
- Ordem fixa: Approved · Pending · In Review · Rejected — estável entre recálculos, para que a posição na legenda seja memorizável.

### 5.5 Requests by Type (barras horizontais)

- Quatro trilhas de 26px de altura, gap 18px.
- Gradiente **horizontal** `#059669` → `#34d399` (esquerda → direita), `rx=4`.
- Rótulo da categoria acima da barra (12px/#9ca3af), valor no extremo direito da trilha.
- Eixo X inferior com 5 ticks derivados do máximo da série (`0 … max`), passo `max/4`. Com máximo 3, rende exatamente `0 · 0.75 · 1.5 · 2.25 · 3` como no spec.
- Trilha de fundo em `#1f1f1f` marcando os 100%, para dar leitura de proporção.

### 5.6 DemoModeToast

```
┌───────────────────────────────────┐
│▌ Demo Mode                    [×] │  ▌ = accent bar 3px #10b981
│  Viewing sample data. Remix this  │  título 13px/600
│  template to connect real data.   │  corpo 12px/#9ca3af
└───────────────────────────────────┘
   fixed bottom-right, 24px de margem, w=320px,
   bg #1a1a1a, border #262626, shadow 0 8px 24px rgba(0,0,0,.5)
```

### 5.7 Dropdowns e Tabs

- **Trigger:** h=34px, px=12px, bg `#141414`, border `#262626`, texto 13px, chevron 14px em `#9ca3af`.
- **Role: Admin** carrega um dot de 7px em `#10b981` antes do texto, sinalizando sessão ativa.
- **Menu:** bg `#1a1a1a`, border `#262626`, radius 8px, shadow, item h=34px; item selecionado com check à direita em `#34d399`.
- **Tabs de período:** grupo com bg `#141414` e border `#262626`, radius 8px, padding 3px. Tab ativa recebe bg `#242424` + **border `#3f3f46`** + texto branco; inativas em `#9ca3af`.

---

## 6. Mapa de Superfícies (elevação)

| Nível | Cor | Onde |
| :--- | :--- | :--- |
| 0 | `#0a0a0a` | Fundo da app, sidebar |
| 1 | `#141414` | Cards, triggers de dropdown, grupo de tabs |
| 2 | `#1a1a1a` | Menus abertos, toast, header do modal |
| 3 | `#1f1f1f` / `#242424` | Caixa de ícone do KPI, tab ativa, hover de item |

Sombra só nos níveis flutuantes: menu `0 6px 20px rgba(0,0,0,.45)` · toast `0 8px 24px rgba(0,0,0,.5)` · modal `0 20px 60px rgba(0,0,0,.6)`.

---

## 7. Handoff

Próximo agente: **Design System Specialist** → [`DESIGN_SYSTEM_TOKENS.md`](DESIGN_SYSTEM_TOKENS.md).

Restrição a propagar: **todo token nasce prefixado `--rt-`** e vive sob `.rt-root`, jamais em `:root` — o `index.css` do dashboard de recon do Merovíngio já ocupa `:root` com `--bg-dark`, `--primary`, `--text-main` etc.
