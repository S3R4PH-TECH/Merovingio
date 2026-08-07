# REVIEW — Request Tracker

> Artefato do **Frontend Reviewer** (Dev-Team / Squad-Frontend).
> Auditoria final do ciclo TDD · Data: 2026-08-07

## Status: ✅ **APPROVED**

---

## 1. Validação TDD

| Verificação | Resultado |
| :--- | :--- |
| Testes existiam **antes** do código de produção? | ✅ Sim — [`TEST_REPORT.md`](TEST_REPORT.md) registra 12/12 arquivos falhando por módulo inexistente |
| A falha RED foi pelo motivo certo? | ✅ `Failed to resolve import … Does the file exist?`, não erro de sintaxe |
| Suíte 100% verde ao final? | ✅ **164/164 testes, 12/12 arquivos** |
| Ordem Red → Green → Refactor respeitada? | ✅ Camada pura verde (47/47) antes de qualquer componente |

```
 Test Files  12 passed (12)
      Tests  164 passed (164)
   Duration  5.65s
```

### Defeitos encontrados na fase GREEN e corrigidos

**1. Foco não retornava ao abridor do modal — defeito real de acessibilidade.**
`ACCESSIBILITY_REPORT.md` §5 exige que fechar o dialog devolva o foco ao `+ New Request`. A primeira implementação não fazia isso: com `Esc`, o foco caía em `<body>` e o usuário de teclado recomeçava a tabulação do topo da página. Corrigido em `NewRequestModal.tsx` capturando `document.activeElement` na abertura e restaurando no cleanup do efeito.

**2. `getByLabelText(/type/i)` ambíguo no teste de integração — defeito de precisão do teste.**
Na página completa a query casava tanto o campo *Type* do modal quanto o `aria-label` do gráfico "Requests by **type**". O teste foi escopado com `within(dialog)`, preservando exatamente a intenção original. A asserção não foi enfraquecida — foi desambiguada.

Vale registrar que o item 2 **é um sinal de qualidade**: a ambiguidade só existe porque os gráficos têm `aria-label` descritivo de verdade. Um gráfico mudo não teria colidido.

---

## 2. Isolamento do dashboard de recon (requisito crítico)

Auditado com evidência, não por confiança:

| Barreira | Verificação | Resultado |
| :--- | :--- | :--- |
| Nenhum seletor global no CSS da feature | `grep -nE "^\s*:root\|^\s*html\|^\s*body"` | ✅ zero ocorrências |
| Todo seletor prefixado `.rt-` | `grep -oE "^\.[a-zA-Z][^ ,{]*" \| grep -v "^\.rt-"` | ✅ zero ocorrências |
| Tokens fora de `:root` | Teste `scopes its design tokens away from :root` | ✅ passa |
| `App.tsx` alterado por este trabalho? | `grep -cE "rt-\|RequestTracker" src/App.tsx` | ✅ **0** |
| Os dois dashboards nunca coexistem | `Root.test.tsx` — 5 testes | ✅ passa |

`App.tsx`, `App.css` e `index.css` **não receberam nenhuma alteração deste trabalho**.

> ⚠️ **Nota factual, não achado:** `git status` mostra `App.tsx` como modificado. Essas alterações são o trabalho de recon **pré-existente e não commitado** do branch `fix/fases-0-2-seguranca-confiabilidade` (parsing de escopo, `HostData`, novos ícones) — presentes antes desta sessão e alheias a esta feature. Verificado: o arquivo não contém uma única referência ao Request Tracker.

O único arquivo pré-existente tocado é **`main.tsx`**, que passou a montar `<Root/>` em vez de `<App/>` — 2 linhas, exatamente o previsto em [`ARCHITECTURE.md`](ARCHITECTURE.md) §6.

---

## 3. Dependências

| Verificação | Resultado |
| :--- | :--- |
| Dependências de **runtime** adicionadas | ✅ **Nenhuma** — `dependencies` continua `react`, `react-dom`, `lucide-react` |
| Dependências de **dev** adicionadas | `vitest`, `jsdom@25`, 4 pacotes de Testing Library — não entram no bundle |
| Build de produção | ✅ `tsc -b && vite build` limpo — CSS 23.02 kB (gzip 4.91), JS 259.39 kB (gzip 79.13) |

O `jsdom` fixado em 25.x é decisão documentada: as versões ≥26 empacotam `undici` 7, que exige Node ≥22, e este ambiente roda Node 20.19.2.

---

## 4. Acessibilidade (WCAG 2.1 AA)

Verificado por script executável, não por inspeção visual: `npm run check:contrast`.

```
All 20 combinations pass, and the rejected pairing is still rejected.
```

| Item | Resultado |
| :--- | :--- |
| Contraste de texto, dark e light | ✅ 20/20 — 13 em AAA |
| Botão primário | ✅ **7.80:1** (dark) e **5.48:1** (light) |
| Guarda de regressão | ✅ branco sobre esmeralda travado em 2.54:1 — o script falha se alguém "restaurar" o mockup |
| Landmarks + skip link | ✅ testados |
| `aria-current` no item ativo | ✅ testado, exatamente um por vez |
| Tabs com roving tabindex e setas | ✅ testado, incluindo `Home`/`End` |
| Focus trap e devolução de foco no modal | ✅ testado |
| Gráficos com `role="img"` + descrição textual | ✅ testado nos três |
| Toast como `role="status"`, não `alert` | ✅ testado |
| `prefers-reduced-motion` | ✅ implementado |

**Destaque.** O achado de contraste do `+ New Request` (2.54:1, reprova AA) foi pego pelo `ACCESSIBILITY_SPECIALIST` **antes de uma linha de código existir**, e hoje está protegido por um teste automatizado. É o tipo de defeito que normalmente só aparece em auditoria pós-lançamento.

---

## 5. Estética e UI/UX

| Item | Resultado |
| :--- | :--- |
| Fidelidade ao layout de referência | ✅ Sidebar 255px, KPIs, volume, donut, barras horizontais, toast — todos conforme |
| Números do mockup reproduzidos | ✅ Total 10 · Pending 10 · Approved 0 · Rejected 0 · Pending 8 / In Review 2 |
| Eixo `0 · 0.75 · 1.5 · 2.25 · 3` | ✅ testado explicitamente |
| Responsividade | ✅ 4→2→1 colunas; sidebar off-canvas < 1024px |
| Tema claro/escuro | ✅ com persistência e fallback para `prefers-color-scheme` |
| Elementos genéricos ou desalinhados | ✅ nenhum |

### Refinamento aplicado além do spec

O eixo X do volume **rareia os rótulos** acima de 10 pontos. Sem isso, "Last 30 days" renderizaria 30 datas em ~900px — cerca de 30px cada, ilegível. Os rótulos são `<text>` dentro do SVG, alinhados ao centro exato de cada barra, em vez de um flexbox aproximado.

---

## 6. Ausência de placeholders

| Verificação | Resultado |
| :--- | :--- |
| `TODO` / `FIXME` / `XXX` no código novo | ✅ nenhum |
| "Lorem ipsum" ou texto falso | ✅ nenhum — os 10 requests têm títulos e solicitantes plausíveis |
| Componentes não funcionais | ✅ nenhum |
| Rotas fora de escopo | ✅ renderizam tela **nomeada e honesta**, não link morto |

---

## 7. Qualidade de código

| Item | Resultado |
| :--- | :--- |
| `npm run lint` (oxlint) | ✅ zero avisos no código novo (2 avisos pré-existentes em `App.tsx`, não tocado) |
| Tipagem | ✅ `tsc -b` limpo; zero `any` |
| Separação UI / lógica | ✅ toda derivação em `lib/selectors.ts`, puro e sem React |
| Determinismo temporal | ✅ `now` injetado; partes de data lidas em **UTC**, então o resultado não muda com o fuso da máquina |
| Memoização | ✅ `useMemo` em cada seletor derivado |
| Seam de dados | ✅ trocar `createMockDataSource` por uma fonte HTTP não toca em nenhum componente |

### Decisão de design que merece registro

`filterRequests` aplica **apenas limite inferior**, sem teto superior. Um request recém-criado carimba `createdAt` com o relógio real; um teto vindo do `now` injetado o descartaria silenciosamente, e o usuário criaria um item que não aparece. "Últimos 7 dias" significa "desde 7 dias atrás" — o comportamento está correto e o motivo está comentado no código.

---

## 8. Critérios de aceite do PRD

| # | Critério | Status |
| :-- | :--- | :--- |
| 1 | Cenários BDD dos 7 épicos automatizados e verdes | ✅ 164/164 |
| 2 | `App.tsx` não alterado por este trabalho | ✅ verificado |
| 3 | Nenhuma dependência de runtime nova | ✅ |
| 4 | Zero placeholders | ✅ |
| 5 | `build` e `lint` limpos | ✅ |
| 6 | Trocar mock por API real sem tocar em UI | ✅ garantido pelo SEAM 1 |

---

## 9. Observações não bloqueantes

1. **`#3b82f6` (5.01:1) e `#ef4444` (4.90:1)** passam em AA com margem estreita. No uso atual (legenda de 13px) estão conformes. Se algum dia forem usados abaixo de 13px, migrar para `#60a5fa` e `#f87171`.
2. **Node 20 fixa o jsdom em 25.x.** Ao subir o runtime para 22+, o pin pode ser liberado.
3. **Rotas fora de escopo** (All Requests, Pending Approvals, User Management, Settings) são telas nomeadas de placeholder, conforme escopo acordado no PRD §1 — não são regressão.
4. **Domínio.** O Request Tracker é um dashboard de aprovações de RH, enquanto o Merovíngio é uma plataforma de recon purple-team. Foi construído como feature isolada e autocontida, exatamente como pedido, sem acoplar-se ao domínio do host. Se o objetivo futuro for aplicar este layout às filas de aprovação do próprio Merovíngio, basta implementar `createHttpDataSource` contra o `backend-gateway` — nenhum componente muda.

---

## 10. Veredito

**✅ APPROVED**

Ciclo TDD cumprido sem atalhos: RED comprovado, GREEN alcançado, refatoração com lint e build limpos. Acessibilidade não apenas especificada, mas **verificada por script executável com guarda de regressão**. O dashboard de recon do Merovíngio permanece intacto, protegido por quatro barreiras independentes e coberto por testes.

Controle devolvido ao **Frontend Orchestrator** → **Orquestrador Geral do Dev-Team**.
