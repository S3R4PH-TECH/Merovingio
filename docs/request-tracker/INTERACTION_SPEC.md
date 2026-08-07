# INTERACTION_SPEC — Request Tracker

> Artefato do **Interaction Prototyper** (Design-Team / Squad-UI-UX).
> Entrada: [`ACCESSIBILITY_REPORT.md`](ACCESSIBILITY_REPORT.md) · Encerra a cadeia do Squad-UI-UX
> Data: 2026-08-07

---

## 1. Tokens de Timing

```css
--rt-dur-fast: 120ms;   /* feedback de cor: hover, ativação de tab   */
--rt-dur-base: 180ms;   /* transformações: entrada de menu, toast    */
--rt-dur-slow: 260ms;   /* layout: colapso da sidebar, modal, charts */

--rt-ease-out:    cubic-bezier(0.16, 1, 0.3, 1);   /* entradas — decelera forte */
--rt-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);    /* mudanças de layout        */
--rt-ease-in:     cubic-bezier(0.4, 0, 1, 1);      /* saídas                    */
```

**Regra:** entrada usa `ease-out` e é ~40% mais lenta que a saída, que usa `ease-in`. Elementos chegam com calma e saem sem fazer o usuário esperar.

**Teto duro:** nada que bloqueie interação passa de 260ms.

---

## 2. Estados dos Componentes

### 2.1 Botão primário (`+ New Request`)

| Estado | Especificação |
| :--- | :--- |
| Default | `bg: --rt-accent` · `color: --rt-text-on-accent` · sem sombra |
| Hover | `bg: --rt-accent-hover` · `translateY(-1px)` · `shadow: 0 4px 12px rgba(16,185,129,.28)` |
| Active | `translateY(0)` · sem sombra · `120ms` |
| Focus | `outline: 2px solid --rt-accent; outline-offset: 2px` — **cumulativo** com hover |
| Disabled | `opacity: .45` · `cursor: not-allowed` · sem transform |

```css
.rt-btn-primary {
  background: var(--rt-accent);
  color: var(--rt-text-on-accent);
  transition:
    background-color var(--rt-dur-fast) var(--rt-ease-in-out),
    transform var(--rt-dur-fast) var(--rt-ease-out),
    box-shadow var(--rt-dur-base) var(--rt-ease-out);
}
.rt-btn-primary:hover:not(:disabled) {
  background: var(--rt-accent-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.28);
}
.rt-btn-primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: none;
  transition-duration: var(--rt-dur-fast);
}
```

### 2.2 Item de sidebar

| Estado | Especificação |
| :--- | :--- |
| Default | `color: --rt-text-muted` · fundo transparente |
| Hover | `bg: --rt-surface-3` · `color: --rt-text` · `120ms` |
| Ativo | `bg: --rt-accent-soft` · `color: --rt-accent-text` · **barra 3px à esquerda** |
| Focus | anel de foco padrão |

A barra ativa anima com `scaleY` a partir do centro (`transform-origin: center`), `180ms ease-out`. Nunca com `width`/`height` — evita reflow.

```css
.rt-nav-item::before {
  content: '';
  position: absolute;
  left: 0; top: 50%;
  width: 3px; height: 20px;
  background: var(--rt-accent);
  border-radius: 0 2px 2px 0;
  transform: translateY(-50%) scaleY(0);
  transition: transform var(--rt-dur-base) var(--rt-ease-out);
}
.rt-nav-item[aria-current='page']::before { transform: translateY(-50%) scaleY(1); }
```

### 2.3 Card e KpiCard

| Estado | Especificação |
| :--- | :--- |
| Default | `bg: --rt-surface` · `border: 1px solid --rt-border` |
| Hover | `border-color: --rt-border-strong` · `180ms` — **sem** transform |
| Loading | Skeleton com shimmer, respeitando a altura final |

Cards não levantam no hover. São superfícies de leitura, não alvos de clique; movimento aqui só distrai da varredura de 5 segundos definida no UX_SPEC.

### 2.4 Tabs de período

| Estado | Especificação |
| :--- | :--- |
| Inativa | `color: --rt-text-muted` · fundo transparente |
| Inativa + hover | `color: --rt-text` · `bg: rgba(255,255,255,.04)` |
| Ativa | `bg: --rt-surface-4` · `border: 1px solid --rt-border-strong` · `color: --rt-text` |
| Focus | anel de foco (roving tabindex — só a ativa é tabulável) |

### 2.5 Dropdown

| Estado | Especificação |
| :--- | :--- |
| Trigger default | `bg: --rt-surface` · `border: 1px solid --rt-border` |
| Trigger hover | `border-color: --rt-border-strong` · `bg: --rt-surface-3` |
| Trigger aberto | `border-color: --rt-accent` · chevron `rotate(180deg)` em `180ms` |
| Item hover/focus | `bg: --rt-surface-3` |
| Item selecionado | `color: --rt-accent-text` + ícone de check à direita |

### 2.6 Input do modal

| Estado | Especificação |
| :--- | :--- |
| Default | `bg: --rt-surface-3` · `border: 1px solid --rt-border` |
| Hover | `border-color: --rt-border-strong` |
| Focus | `border-color: --rt-accent` + `box-shadow: 0 0 0 3px --rt-accent-ring` |
| Inválido | `border-color: --rt-status-rejected` + mensagem com `role="alert"` |
| Disabled | `opacity: .5` · `cursor: not-allowed` |

---

## 3. Micro-animações

### 3.1 Colapso da sidebar — 260ms

```css
.rt-sidebar {
  width: var(--rt-sidebar-w);
  transition: width var(--rt-dur-slow) var(--rt-ease-in-out);
}
.rt-sidebar[data-collapsed='true'] { width: var(--rt-sidebar-w-collapsed); }

.rt-nav-label {
  opacity: 1;
  transition: opacity var(--rt-dur-fast) var(--rt-ease-in-out);
}
.rt-sidebar[data-collapsed='true'] .rt-nav-label { opacity: 0; }
```

Os rótulos desvanecem em **120ms** enquanto a largura leva **260ms**. O texto sai de cena antes que o container aperte — sem quebra de linha nem "empurrão" visual no meio da transição.

### 3.2 Sidebar off-canvas (< 1024px)

| Elemento | Entrada | Saída |
| :--- | :--- | :--- |
| Painel | `translateX(-100%) → 0`, 260ms `ease-out` | `→ -100%`, 180ms `ease-in` |
| Overlay | `opacity 0 → 1`, 180ms | `1 → 0`, 120ms |

O overlay entra antes do painel terminar, ancorando o contexto de que a tela ficou modal.

### 3.3 Menu de dropdown

```css
@keyframes rt-menu-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.rt-menu {
  animation: rt-menu-in var(--rt-dur-base) var(--rt-ease-out);
  transform-origin: top center;
}
```

`scale` parte de `0.97`, não de `0.9`: escala agressiva em menu parece elástico barato.

### 3.4 Modal

| Elemento | Entrada (260ms `ease-out`) | Saída (180ms `ease-in`) |
| :--- | :--- | :--- |
| Overlay | `opacity 0 → 1` + `backdrop-filter: blur(0 → 4px)` | inverso |
| Painel | `opacity 0 → 1`, `translateY(12px → 0)`, `scale(.98 → 1)` | inverso |

Foco vai ao primeiro campo **após** a animação terminar (260ms), evitando que o leitor de tela anuncie um elemento ainda em movimento.

### 3.5 Toast Demo Mode

```css
@keyframes rt-toast-in {
  from { opacity: 0; transform: translateY(16px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

- **Entrada:** 260ms `ease-out`, com **400ms de atraso** após o mount — o usuário lê o dashboard primeiro, o meta-aviso chega depois.
- **Saída:** 180ms `ease-in` para `translateY(8px)` + `opacity 0`; desmonta no `transitionend`.
- **Sem auto-dismiss.** É informação de estado persistente, não notificação efêmera.
- A accent bar esquerda entra com `scaleY(0 → 1)`, 260ms, `transform-origin: top`.

### 3.6 Animação de entrada dos gráficos

| Gráfico | Animação | Timing |
| :--- | :--- | :--- |
| Request Volume | Barras crescem de baixo (`scaleY 0 → 1`, `transform-origin: bottom`) | 260ms `ease-out`, **stagger de 40ms** por barra |
| Status Donut | `stroke-dashoffset` do total → offset final | 400ms `ease-out`, uma vez |
| Requests by Type | Barras crescem da esquerda (`scaleX 0 → 1`, `transform-origin: left`) | 260ms `ease-out`, stagger de 50ms |

**Reanimação em troca de filtro:** as barras **interpolam a altura**, não reiniciam do zero. Reiniciar a cada clique de filtro faria a tela piscar. Só a primeira montagem cresce do zero.

```css
.rt-bar { transition: height var(--rt-dur-slow) var(--rt-ease-out),
                      y var(--rt-dur-slow) var(--rt-ease-out); }
```

### 3.7 Troca de tema

```css
.rt-root, .rt-root .rt-card, .rt-root .rt-sidebar {
  transition: background-color var(--rt-dur-base) var(--rt-ease-in-out),
              border-color var(--rt-dur-base) var(--rt-ease-in-out),
              color var(--rt-dur-base) var(--rt-ease-in-out);
}
```

Aplicado apenas às superfícies estruturais. Colocar `transition: all` no `*` durante a troca de tema custa caro e ainda anima propriedades irrelevantes.

O ícone sol/lua faz cross-fade com `rotate(-90deg → 0)`, 260ms `ease-out`.

### 3.8 Skeleton de carregamento

```css
@keyframes rt-shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
.rt-skeleton {
  background: linear-gradient(90deg,
    var(--rt-surface-3) 25%, var(--rt-surface-4) 50%, var(--rt-surface-3) 75%);
  background-size: 200% 100%;
  animation: rt-shimmer 1.4s var(--rt-ease-in-out) infinite;
}
```

Única animação em loop da interface — e ela termina assim que os dados chegam, satisfazendo 2.2.2.

---

## 4. Movimento Reduzido (obrigatório)

```css
@media (prefers-reduced-motion: reduce) {
  .rt-root *,
  .rt-root *::before,
  .rt-root *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**Estado final idêntico.** Com movimento reduzido a interface não perde nenhuma informação — apenas chega instantaneamente ao mesmo lugar. Barras nascem na altura final, modal aparece pronto, toast surge posicionado.

---

## 5. Orçamento de Performance

| Regra | Motivo |
| :--- | :--- |
| Animar apenas `transform` e `opacity` | Propriedades de composição; não disparam layout nem paint |
| Nada de animar `width`/`height`/`top`/`left` | Forçam reflow a 60fps |
| Exceção: `<rect>` do SVG anima `height`/`y` | SVG não tem alternativa composta; custo confinado ao viewport do gráfico |
| `will-change` só durante a transição | Aplicado no início, removido no `transitionend` — permanente vaza memória de GPU |
| Stagger máximo de 40–50ms | Acima disso a sequência vira espera perceptível |

---

## 6. Matriz Consolidada de Estados

| Componente | Default | Hover | Active | Focus | Disabled |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Botão primário | accent | accent-hover + lift | sem lift | anel 2px | opacity .45 |
| Botão ghost | transparente | surface-3 | surface-4 | anel 2px | opacity .45 |
| Botão-ícone | text-muted | text + surface-3 | surface-4 | anel 2px | opacity .45 |
| Item de sidebar | text-muted | surface-3 + text | — | anel 2px | n/a |
| Item ativo | accent-soft + barra | accent-soft mais forte | — | anel 2px | n/a |
| Tab | text-muted | text + tint | — | anel 2px | opacity .45 |
| Tab ativa | surface-4 + borda | igual | — | anel 2px | n/a |
| Trigger dropdown | surface + borda | borda forte | borda accent | anel 2px | opacity .45 |
| Item de menu | transparente | surface-3 | surface-4 | surface-3 | opacity .45 |
| Card | surface + borda | borda forte | — | n/a | n/a |
| Input | surface-3 + borda | borda forte | — | borda accent + ring 3px | opacity .5 |
| Fechar toast | text-dim | text + surface-3 | — | anel 2px | n/a |

---

## 7. Encerramento da Cadeia Squad-UI-UX

Todos os cinco artefatos entregues:

| # | Artefato | Agente |
| :-- | :--- | :--- |
| 1 | [`UX_SPEC.md`](UX_SPEC.md) | UX Researcher |
| 2 | [`UI_SPEC.md`](UI_SPEC.md) | UI Designer |
| 3 | [`DESIGN_SYSTEM_TOKENS.md`](DESIGN_SYSTEM_TOKENS.md) | Design System Specialist |
| 4 | [`ACCESSIBILITY_REPORT.md`](ACCESSIBILITY_REPORT.md) | Accessibility Specialist |
| 5 | [`INTERACTION_SPEC.md`](INTERACTION_SPEC.md) | Interaction Prototyper |

Controle devolvido ao **Orquestrador Geral do Design-Team**, que repassa ao **Dev-Team → Squad-Frontend** para o ciclo TDD de implementação.
