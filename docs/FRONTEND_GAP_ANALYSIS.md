# Análise de Lacunas — Frontend × Plataforma

> Levantamento completo do que o Merovíngio expõe versus o que a interface apresenta.
> Data: 2026-08-07 · Base: `backend-gateway` (14 tabelas, 25 endpoints de usuário), `frontend/src`

---

## 1. Veredito

O dashboard atual consome **1 dos 25 endpoints** de usuário do gateway (`GET /runs`). Ele responde bem a *"como está a saúde do pipeline?"* e não responde a nenhuma pergunta operacional: que workflows existem, o que rodou, o que está rodando agora, qual o escopo, como cadastrar alvo.

Pior: **houve regressão de capacidade.** O `App.tsx` legado tinha 4 telas funcionais. O Recon Tracker tem 1 tela real e 4 placeholders nomeados.

| | Legado (`#/legacy`) | Recon Tracker (atual) |
| :--- | :--- | :--- |
| Monitor de Runs | ✅ lista + hosts + output bruto + download ZIP | ❌ só contagem agregada |
| Launcher de workflow | ✅ dispara via webhook n8n | ❌ modal que só enfileira localmente |
| Cadastro de Target | ✅ formulário com parsing de escopo | ❌ placeholder |
| TES Registry | ✅ lista com health/concorrência | ❌ placeholder |
| KPIs e gráficos | ❌ | ✅ |

Sua leitura está correta. Eu troquei uma ferramenta operacional por um painel de métricas.

---

## 2. Inventário do backend

### 2.1 Endpoints existentes e o consumo atual

| Endpoint | Auth | Front usa? | O que destrava |
| :--- | :--- | :--- | :--- |
| `GET /runs` | pública | ✅ **único** | Lista de execuções |
| `GET /targets` | pública | ❌ | Lista de alvos e escopo |
| `POST /targets` | **pública** ⚠️ | ❌ | Cadastro de alvo |
| `POST /auth/login` | pública | ❌ | JWT — destrava todo o resto |
| `GET /me` | JWT | ❌ | Usuário e papel reais |
| `GET /runs/{id}` | JWT | ❌ | Detalhe da execução |
| `GET /runs/{id}/hosts` | JWT | ❌ | Hosts descobertos por run |
| `GET /runs/{id}/hosts/{host}/text` | JWT | ❌ | Saída bruta da ferramenta |
| `GET /runs/{id}/download-zip` | JWT | ❌ | Artefatos da execução |
| `GET /targets/{id}` | JWT | ❌ | Detalhe do alvo |
| `PATCH /targets/{id}` | JWT | ❌ | Editar escopo |
| `DELETE /targets/{id}` | JWT | ❌ | Remover alvo |
| `POST /targets/{id}/scope-check` | JWT | ❌ | **Testar se um valor está em escopo** |
| `GET /programs/{id}/targets` | JWT | ❌ | Alvos por programa |
| `POST /programs/{id}/targets` | JWT | ❌ | Alvo dentro do programa |
| `GET /admin/tes` | JWT admin | ❌ | Registro de TES + health |
| `GET /admin/tes/{id}` | JWT admin | ❌ | Detalhe do TES |
| `POST /admin/tes` | JWT admin | ❌ | Registrar TES |
| `PATCH /admin/tes/{id}` | JWT admin | ❌ | Ajustar concorrência/timeout |
| `DELETE /admin/tes/{id}` | JWT admin | ❌ | Remover TES |
| `POST /workflows/{id}/run` | JWT | ❌ | **Disparar execução de verdade** |
| `POST /workspaces/{id}/workflows` | JWT | ❌ | Registrar workflow |
| `POST /workspaces` | JWT | ❌ | Criar workspace |
| `POST /workspaces/{id}/programs` | JWT | ❌ | Criar programa |
| `POST /programs/{id}/members` | JWT | ❌ | Gerenciar membros |

**Confirmado por probe ao vivo:** `/runs` e `/targets` → 200 sem token; `/admin/tes`, `/me`, `/runs/{id}` → 401.

### 2.2 Endpoints que **não existem** e são necessários

| Faltando | Por que trava | Impacto |
| :--- | :--- | :--- |
| **`GET /workflows`** | Só há `POST` de criação e `POST /{id}/run`. **Não há como listar workflows.** | 🔴 Bloqueia o item nº 1 que você pediu |
| `GET /programs` | Só existe criação | 🟠 Sem seletor de programa real |
| `GET /workspaces` | Só existe criação | 🟠 Sem seletor de workspace |
| `GET /findings` | A tabela `findings` existe e **nenhum endpoint a expõe** | 🟠 Vulnerabilidades invisíveis |
| `GET /assets` | Assets só vêm aninhados em `/runs` | 🟡 Sem visão consolidada de superfície |

### 2.3 Tabelas sem representação alguma no front

Das **14 tabelas**, 9 nunca aparecem: `workflow_definitions`, `program_workflow_enablement`, `findings`, `audit_log`, `users`, `workspace_memberships`, `program_memberships`, `tool_execution_jobs`, `programs`.

---

## 3. Os dois bloqueadores reais

### 🔴 Bloqueador 1 — o frontend não tem autenticação

**18 dos 25 endpoints exigem JWT.** Sem tela de login, a interface está limitada a `/runs` e `/targets`. Isso sozinho explica por que o dashboard parece raso: detalhe de run, hosts, download, scope-check, TES e disparo real de workflow estão todos atrás do token.

`POST /auth/login` já existe e funciona. Falta o front guardar o token e mandá-lo no header.

### 🔴 Bloqueador 2 — não existe `GET /workflows`

Você pediu "Workflows" na página inicial. O gateway **não tem como listar workflows** — só criar e disparar. É preciso adicionar o endpoint no `backend-gateway`; não é trabalho de frontend.

Os workflows existem em disco (`workflows/recon-baseline.json`, `recon-full-chain.json`, `nmap-ffuf-theharvester.json`) e no n8n, mas a tabela `workflow_definitions` só é escrita, nunca lida.

---

## 4. Observação de segurança

**`POST /targets` está público.** O probe devolveu `422` (erro de validação de corpo), não `401` — ou seja, passa sem token. Comparado com `POST /programs/{id}/targets`, que exige JWT e checa RBAC, esse é um caminho alternativo sem autenticação para criar alvo.

Alvo define **escopo**, e escopo é o que autoriza uma ferramenta ofensiva a disparar contra um host. Criar alvo sem autenticação é, na prática, poder ampliar a superfície autorizada da plataforma.

Mesmo em `localhost` para uso interno, vale fechar. Não é urgência de produção — é uma inconsistência com o próprio modelo de custódia descrito no `CONTEXT.md`.

---

## 5. Mapa de telas proposto

| # | Tela | Conteúdo | Endpoints | Precisa de |
| :-- | :--- | :--- | :--- | :--- |
| 0 | **Login** | e-mail + senha, guarda JWT | `POST /auth/login`, `GET /me` | — |
| 1 | **Overview** | KPIs + gráficos **+ lista de Workflows + tabela de Runs recentes/ativos** | `GET /workflows`*, `GET /runs` | `GET /workflows` |
| 2 | **All Runs** | Tabela: status, alvo, ferramenta, duração, assets, ações | `GET /runs` | — |
| 3 | **Run Detail** | Hosts descobertos, jobs por ferramenta, saída bruta, download ZIP | `GET /runs/{id}`, `/hosts`, `/hosts/{h}/text`, `/download-zip` | JWT |
| 4 | **Active Runs** | Subconjunto em voo, com auto-refresh | `GET /runs` | — |
| 5 | **Scope / Targets** | Lista + **formulário de novo alvo** (root domains, CIDRs, out-of-scope) + testador de escopo | `GET/POST /targets`, `PATCH`, `DELETE`, `POST /targets/{id}/scope-check` | JWT p/ editar |
| 6 | **TES Registry** | Ferramentas, health, concorrência, timeout | `GET /admin/tes` | JWT admin |
| 7 | **Findings** | Vulnerabilidades por severidade | `GET /findings`* | endpoint novo |

\* endpoint que precisa ser criado no backend.

---

## 6. Sequência recomendada

| Fase | Entrega | Desbloqueia |
| :--- | :--- | :--- |
| **1** | Login + cliente HTTP com JWT | 18 endpoints de uma vez |
| **2** | Scope/Targets com formulário de cadastro | Item nº 2 do seu pedido |
| **3** | All Runs + Run Detail (hosts, output, ZIP) | Recupera o que o legado fazia |
| **4** | `GET /workflows` no gateway + Workflows na home | Item nº 1 do seu pedido |
| **5** | Disparo real de run (`POST /workflows/{id}/run`) | Substitui o modal que só enfileira |
| **6** | TES Registry + Findings | Fecha as tabelas órfãs |

A fase 1 é pré-requisito de quase tudo. A fase 4 é a única que exige mexer no backend.
