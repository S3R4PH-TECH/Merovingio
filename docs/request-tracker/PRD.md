# PRD — Request Tracker

> Artefato do **Frontend PM** (Dev-Team / Squad-Frontend).
> Entrada: cadeia Squad-UI-UX ([`UX_SPEC.md`](UX_SPEC.md) … [`INTERACTION_SPEC.md`](INTERACTION_SPEC.md))
> Saída para: **Frontend Tech Lead** → [`ARCHITECTURE.md`](ARCHITECTURE.md)
> Data: 2026-08-07

---

## 1. Visão Geral

**Request Tracker** é um dashboard de aprovações e workflow embarcado no frontend do Merovíngio. Entrega, em uma tela, o estado agregado de uma fila de solicitações: volume, pendências, composição por status e por tipo.

Roda inicialmente em **Demo Mode** — dados mockados — com a camada de dados desacoplada por trás de uma interface, de modo que trocar mock por API real não toque em nenhum componente de UI.

### Escopo desta entrega

| ✅ Dentro | ❌ Fora |
| :--- | :--- |
| Página Dashboard completa | Telas de listagem (All Requests, Pending Approvals) |
| 4 KPIs, 3 gráficos, filtros, modal de criação | Backend / persistência real |
| Sidebar com rota ativa, colapso, off-canvas | Autenticação real (o logout é UI-only) |
| Tema claro/escuro | Telas de User Management e Settings |
| Toast Demo Mode dispensável | Exportação de relatórios |

As rotas fora de escopo **existem na navegação** e renderizam um estado "em construção" nomeado e honesto — não são links mortos.

### Convivência com o dashboard de recon

O Merovíngio já possui um dashboard de recon em `frontend/src/App.tsx` (1151 linhas). Requisito não-funcional inviolável: **essa tela não pode ser modificada nem afetada visualmente**. As duas convivem sob um roteador por hash.

---

## 2. Persona

Recapitulada de [`UX_SPEC.md`](UX_SPEC.md): **Admin/gestor com poder de aprovação**, sessões de 30–90s, precisa responder "há algo travado?" em até 5 segundos.

---

## 3. Especificação de Páginas e Componentes

### 3.1 Rotas

| Rota (hash) | Tela | Estado nesta entrega |
| :--- | :--- | :--- |
| `#/request-tracker` ou `#/request-tracker/dashboard` | Dashboard | ✅ Completa |
| `#/request-tracker/requests` | All Requests | Placeholder nomeado |
| `#/request-tracker/approvals` | Pending Approvals | Placeholder nomeado |
| `#/request-tracker/users` | User Management | Placeholder nomeado |
| `#/request-tracker/settings` | Settings | Placeholder nomeado |
| qualquer outro hash | Dashboard de recon (`App.tsx`) | Intocado |

### 3.2 Árvore de componentes

```
RequestTracker                     ← shell + estado de filtros + tema
├── Sidebar
│   ├── SidebarBrand
│   ├── SidebarSection ×2          ← "Main", "Administration"
│   │   └── SidebarItem ×5
│   └── SidebarFooter              ← avatar U · User/Admin · logout
├── Header
│   ├── botão de colapso
│   ├── ThemeToggle
│   ├── Dropdown "Role"            ← dot verde
│   └── Dropdown "Use case"
└── DashboardPage
    ├── WelcomeHeader
    ├── FilterBar
    │   ├── PeriodTabs             ← 24h · 7d(ativo) · 30d
    │   ├── Dropdown "All Types"
    │   ├── Dropdown "All Statuses"
    │   └── botão "+ New Request"
    ├── KpiGrid → KpiCard ×4
    ├── RequestVolumeChart
    ├── grid 2col
    │   ├── StatusDonutChart
    │   └── RequestsByTypeChart
    ├── NewRequestModal            ← condicional
    └── DemoModeToast              ← dispensável
```

### 3.3 Conteúdo dos KPIs

| Card | Ícone | Valor | Legenda | Variante |
| :--- | :--- | :--- | :--- | :--- |
| Total Requests | `FileText` | contagem filtrada | `Last 7 days` (reflete o período ativo) | neutral |
| Pending Review | `Clock` | `pending` + `in_review` | `⚠ Needs attention` se > 0, senão `Last 7 days` | warning |
| Approved | `CheckCircle2` | `approved` | `↑ Last 7 days` | positive |
| Rejected | `XCircle` | `rejected` | `Last 7 days` | neutral |

A legenda de período é **derivada** do filtro ativo: com "Last 24 hours" selecionado ela lê `Last 24 hours`. Rótulo fixo mentiria para o usuário.

### 3.4 Dataset de demonstração

10 requests, produzindo exatamente os números do layout de referência:

| Status | Qtd |
| :--- | ---: |
| Pending | 8 |
| In Review | 2 |
| Approved | 0 |
| Rejected | 0 |

| Tipo | Qtd |
| :--- | ---: |
| Paid Time Off | 3 |
| Remote Work | 3 |
| Training Request | 2 |
| Expense Report | 2 |

KPIs resultantes: Total **10** · Pending Review **10** · Approved **0** · Rejected **0** — batendo com o mockup.

---

## 4. Fluxos de Interação

### 4.1 Filtragem

Os três filtros (período, tipo, status) são **conjuntivos** (AND). Toda mudança recalcula KPIs e os três gráficos na mesma passada, sem reload e sem mover o foco.

### 4.2 Criação de request

1. Clique em `+ New Request` → modal abre, foco no primeiro campo.
2. Campos: **Title** (obrigatório), **Type** (select, obrigatório), **Description** (opcional).
3. Submit com título vazio → erro inline com `role="alert"`, foco vai ao campo inválido, modal **não fecha**.
4. Submit válido → request criado com status `pending`, data = agora, modal fecha, foco volta ao `+ New Request`, KPIs e gráficos recalculam.
5. `Esc` ou Cancel → fecha sem criar.

### 4.3 Tema, colapso e toast

- **Tema:** alterna `data-theme` na raiz da feature. Persiste em `localStorage` sob a chave `rt-theme`. Sem chave salva, respeita `prefers-color-scheme`.
- **Colapso:** 255px ↔ 72px. Abaixo de 1024px vira off-canvas com overlay, `Esc` fecha.
- **Toast:** visível na carga, dispensável, **não volta na mesma sessão**. Não persiste entre reloads — é aviso sobre a origem dos dados, e reload pode significar dados novos.

---

## 5. Estados de UI

| Estado | Tratamento |
| :--- | :--- |
| Loading | Skeleton com as alturas finais — zero layout shift |
| Vazio | KPIs em `0`; gráficos mantêm eixos e exibem "No requests match the current filters" |
| Populado | Layout completo |
| Erro | Banner vermelho no topo do conteúdo; navegação continua utilizável |

---

## 6. Requisitos de Acessibilidade

Herdados na íntegra de [`ACCESSIBILITY_REPORT.md`](ACCESSIBILITY_REPORT.md). Os inegociáveis:

1. Contraste WCAG AA em ambos os temas — CTA primário com `--rt-text-on-accent`, **jamais branco sobre esmeralda**.
2. Toda a interface operável por teclado; foco visível; sem `tabindex` positivo.
3. Landmarks (`nav`/`header`/`main`) + skip link.
4. `aria-current="page"` no item de nav ativo; `role="tablist"`/`aria-selected` nas tabs de período.
5. Gráficos como `<figure role="img">` com `aria-label` textual da série; SVG interno `aria-hidden`.
6. Modal com `role="dialog"`, `aria-modal`, focus trap e devolução de foco.
7. `prefers-reduced-motion` respeitado.

---

## 7. Cenários BDD

### Épico 1 — Filtragem

```gherkin
Funcionalidade: Filtrar o dashboard por período

  Cenário: Período padrão ao carregar
    Dado que abro o Request Tracker
    Quando o dashboard termina de carregar
    Então a tab "Last 7 days" está selecionada
    E o KPI "Total Requests" mostra "10"
    E a legenda do KPI "Total Requests" lê "Last 7 days"

  Cenário: Trocar para 24 horas recalcula tudo
    Dado que o dashboard está carregado com "Last 7 days" ativo
    Quando eu clico na tab "Last 24 hours"
    Então "Last 24 hours" tem aria-selected igual a "true"
    E "Last 7 days" tem aria-selected igual a "false"
    E a legenda do KPI "Total Requests" lê "Last 24 hours"
    E o gráfico "Request Volume" mostra apenas os pontos das últimas 24 horas

  Cenário: Navegar as tabs pelo teclado
    Dado que a tab "Last 7 days" está focada
    Quando eu pressiono a seta para a direita
    Então a tab "Last 30 days" recebe o foco e passa a ser a selecionada

  Cenário: Filtrar por tipo
    Dado que o dashboard está carregado
    Quando eu abro o dropdown "All Types" e escolho "Remote Work"
    Então o KPI "Total Requests" mostra "3"
    E o gráfico "Requests by Type" contém apenas a categoria "Remote Work"

  Cenário: Filtros conjuntivos sem resultado
    Dado que filtrei o tipo por "Expense Report"
    Quando eu filtro o status por "Approved"
    Então o KPI "Total Requests" mostra "0"
    E a mensagem "No requests match the current filters" é exibida
    E os eixos dos gráficos continuam visíveis
```

### Épico 2 — KPIs

```gherkin
Funcionalidade: Cartões de métrica

  Cenário: Pending Review sinaliza atenção
    Dado que existem 10 requests em pending ou in_review
    Quando o dashboard carrega
    Então o KPI "Pending Review" mostra "10"
    E a legenda "Needs attention" é exibida

  Cenário: Pending zerado não alarma
    Dado que filtrei o status por "Approved"
    Quando o dashboard recalcula
    Então o KPI "Pending Review" mostra "0"
    E a legenda "Needs attention" NÃO é exibida

  Cenário: Zero é explícito
    Dado que nenhum request está aprovado
    Quando o dashboard carrega
    Então o KPI "Approved" mostra "0"
    E o KPI "Approved" não está vazio
```

### Épico 3 — Gráficos

```gherkin
Funcionalidade: Visualizações

  Cenário: Volume tem uma barra por dia
    Dado que o período ativo é "Last 7 days"
    Quando o gráfico "Request Volume" renderiza
    Então 7 barras são desenhadas
    E o eixo X mostra rótulos de "Aug 1" até "Aug 7"

  Cenário: Distribuição de status na ordem canônica
    Quando o gráfico "Status Distribution" renderiza
    Então a legenda lista Approved, Pending, In Review e Rejected nessa ordem
    E "Pending" mostra o valor "8"
    E "In Review" mostra o valor "2"

  Cenário: Tipos ordenados por volume
    Quando o gráfico "Requests by Type" renderiza
    Então 4 categorias são desenhadas
    E o eixo X vai de "0" até o máximo da série

  Cenário: Gráfico legível por leitor de tela
    Quando o gráfico "Request Volume" renderiza
    Então ele expõe role "img"
    E seu nome acessível descreve a série em texto
    E o SVG interno está marcado como aria-hidden
```

### Épico 4 — Criação

```gherkin
Funcionalidade: Novo request

  Cenário: Abrir o modal
    Quando eu clico em "+ New Request"
    Então um dialog com aria-modal "true" é exibido
    E o campo "Title" recebe o foco

  Cenário: Título obrigatório
    Dado que o modal está aberto
    Quando eu submeto com o título vazio
    Então a mensagem "Title is required" é exibida
    E o dialog permanece aberto

  Cenário: Criação bem-sucedida atualiza os números
    Dado que o modal está aberto
    Quando eu preencho "Title" com "New laptop" e o tipo com "Expense Report"
    E eu submeto o formulário
    Então o dialog fecha
    E o KPI "Total Requests" mostra "11"
    E o KPI "Pending Review" mostra "11"

  Cenário: Esc cancela
    Dado que o modal está aberto
    Quando eu pressiono Escape
    Então o dialog fecha
    E o KPI "Total Requests" continua em "10"
    E o foco volta para o botão "+ New Request"
```

### Épico 5 — Navegação e shell

```gherkin
Funcionalidade: Sidebar, header e tema

  Cenário: Item ativo reflete a rota
    Dado que a rota é "#/request-tracker/dashboard"
    Quando a sidebar renderiza
    Então o item "Dashboard" tem aria-current igual a "page"
    E nenhum outro item de navegação tem aria-current

  Cenário: Navegar muda o item ativo
    Dado que estou no Dashboard
    Quando eu clico em "Pending Approvals"
    Então "Pending Approvals" passa a ter aria-current "page"
    E "Dashboard" deixa de ter aria-current

  Cenário: Colapsar a sidebar
    Quando eu clico no botão "Collapse sidebar"
    Então a sidebar fica com data-collapsed "true"
    E o botão passa a ter aria-expanded "false"
    E os itens de navegação continuam com nome acessível

  Cenário: Alternar tema
    Dado que o tema atual é dark
    Quando eu clico no toggle de tema
    Então a raiz da feature fica com data-theme "light"
    E a preferência é gravada em localStorage

  Cenário: Dropdown de Role
    Quando eu abro o dropdown "Role"
    Então uma listbox é exibida com Admin, Manager e Employee
    E escolher "Manager" atualiza o rótulo do trigger para "Role: Manager"

  Cenário: Skip link
    Dado que a página acabou de carregar
    Quando eu pressiono Tab uma vez
    Então o link "Skip to main content" está focado
```

### Épico 6 — Demo Mode

```gherkin
Funcionalidade: Aviso de dados de demonstração

  Cenário: Toast aparece ao carregar
    Quando o dashboard carrega
    Então o toast "Demo Mode" é exibido
    E ele contém "Viewing sample data"
    E ele expõe role "status"

  Cenário: Dispensar o toast
    Dado que o toast "Demo Mode" está visível
    Quando eu clico em "Dismiss"
    Então o toast não é mais exibido
```

### Épico 7 — Isolamento do dashboard de recon

```gherkin
Funcionalidade: Convivência entre as duas telas

  Cenário: Hash desconhecido cai no recon
    Dado que a URL não tem hash de request-tracker
    Quando a aplicação monta
    Então o dashboard de recon é renderizado
    E nenhum elemento do Request Tracker está presente

  Cenário: Tokens não vazam
    Dado que o Request Tracker está montado
    Quando eu inspeciono as custom properties de :root
    Então nenhuma propriedade com prefixo "--rt-" está definida em :root
```

---

## 8. Critérios de Aceite

| # | Critério |
| :-- | :--- |
| 1 | Todos os cenários BDD das seções 7.1–7.7 passam automatizados |
| 2 | `src/App.tsx` fica byte-a-byte idêntico ao original |
| 3 | Nenhuma dependência **de runtime** nova em `package.json` |
| 4 | Zero `TODO`, `FIXME` ou placeholder no código entregue |
| 5 | `npm run build` e `npm run lint` passam limpos |
| 6 | Trocar mock por API real não exige tocar em componente de UI |

---

## 9. Handoff

Próximo agente: **Frontend Tech Lead** → [`ARCHITECTURE.md`](ARCHITECTURE.md).

Deve definir os **Seams de teste** que permitam validar as regras de derivação (KPIs, séries dos gráficos, filtragem) **sem renderizar componente**, e a interface de fonte de dados que torna o critério de aceite nº 6 verificável.
