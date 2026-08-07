# Plano de Ação — Merovíngio

> Consolidado a partir da análise completa do projeto (2026-08-07). Substitui na prática a ordem de prioridades do [`NEXT_STEPS.md`](NEXT_STEPS.md), que está desatualizado em relação ao código (as prioridades #1, #4, #5, #6 e #7 de lá já estão total ou parcialmente entregues).

## Decisões do dono do projeto que orientam este plano

1. **A plataforma vai rodar sozinha num servidor, para outra equipe**, sem o time atual gerenciando. Toda dependência do `Pentesters-Team/` precisa ser cortada.
2. **O projeto não embarca escopo pré-definido.** Nem arquivo, nem default, nem seed. O escopo é definido pela governança da equipe operadora, via API/UI, com RBAC e audit log.
3. **A equipe operadora precisa enxergar e controlar o que roda**: catálogo de ferramentas, catálogo de workflows habilitados, cadastro de escopo em lote.

---

## Fase 0 — Destravar (0,5 dia)

Nada abaixo pode ser validado enquanto o fluxo end-to-end estiver quebrado. Fazer primeiro, hoje.

| # | Tarefa | Detalhe |
|---|---|---|
| 0.1 | **`import os` em `app/routers/internal.py`** | O módulo usa `os.getenv()` na linha 122 sem importar `os`. Todo `POST /internal/tes-callback` retorna 500 antes do `db.commit()`: assets não persistem, `job.status` fica em `leased`, o `resume_url` nunca dispara e o Run fica preso em `running` para sempre. É uma linha e destrava a funcionalidade central do projeto. |
| 0.2 | **Rodar a suíte e reconciliar os números** | São **43** testes no gateway (13+9+8+7+5+1), não 42 nem 28. O `test_tes_callback_persists_assets` deve estar falhando por causa de 0.1. Corrigir as três contagens contraditórias nos docs. |

---

## Fase 1 — Segurança (2,5 dias)

Fazer antes da Fase 3: não faz sentido empacotar e mover os TES carregando junto um RBAC quebrado.

| # | Tarefa | Detalhe |
|---|---|---|
| 1.1 | **RBAC em `/admin/tes`** | Hoje exige apenas `get_current_user`. Qualquer usuário autenticado — inclusive sem membership nenhuma — pode ler o `static_token` de todos os TES em texto claro e repontar o `base_url` de uma ferramenta para um servidor sob seu controle, recebendo token + escopo no próximo lease. Exigir `owner\|admin` de workspace e remover `static_token` de qualquer response de leitura. |
| 1.2 | **Checagem de escopo real em `/internal/tes-lease`** | O handler carrega o `Target` mas nunca chama `value_in_target_scope()`. O roadmap (seção 5, A.3) e o docstring de `POST /targets/{id}/scope-check` afirmam que essa validação existe. Não existe — o enforcement está 100% no TES, sem a defesa em profundidade prometida. |
| 1.3 | **Autenticação no `data-indexer`** | Sem auth alguma. Qualquer serviço em `control_net` — incluindo os workers do n8n, que executam nós definidos por usuário — lê e escreve assets/findings de qualquer programa. A fronteira de tenancy do Gateway não existe aqui. |
| 1.4 | **Rate limiting e timing no login** | `POST /auth/login` só chama `verify_password` quando o usuário existe (canal lateral de enumeração de e-mail) e não tem rate limiting. Menor, mas trivial de corrigir. |

O segredo hardcoded no workflow JSON também é item de segurança, mas está na Fase 2 porque faz parte da reescrita única do workflow.

---

## Fase 2 — Confiabilidade do fluxo (2 dias)

Pode correr em paralelo com a Fase 1 (arquivos diferentes).

### 2.1 Reescrever o workflow n8n — **uma vez só, cobrindo quatro correções**

O [`workflows/recon-baseline.json`](workflows/recon-baseline.json) tem quatro defeitos distintos. Editá-lo quatro vezes é retrabalho: fazer uma reescrita única.

1. **Segredo hardcoded** — `"X-Internal-Token": "dev-only-internal-token-change-me"` aparece 3× num arquivo versionado em Git. Rotacionar `GATEWAY_INTERNAL_TOKEN` quebra o workflow em silêncio. Migrar para credencial nativa do n8n.
2. **Nenhum caminho de erro** — o grafo é linear e o nó final envia `"status": "success"` hardcoded. Se o TES falhar ou o `Wait` nunca retomar, o Gateway jamais recebe callback de nível-Run. A reconciliação `completed_with_warnings`, que o Gateway implementa corretamente, **nunca é acionada em produção**. Adicionar Error Workflow (Error Trigger) + status dinâmico.
3. **Registry contornado** — o nó chama `http://recon-runner:8000/run` hardcoded, ignorando o `tes_base_url` devolvido pelo lease. Isso anula a justificativa nº 1 do `tes_registry` ("o workflow só carrega o nome lógico, nunca um endereço físico").
4. **Multi-domínio descartado** — usa `allowed_domains[0]`. Um Target com 3 domínios raiz só é escaneado no primeiro.

### 2.2 Índices no banco

A migration inicial cria 14 tabelas e **nenhum `create_index`** além de PKs e uniques. Sem índice: `assets.run_id`, `assets.program_id`, `runs.program_id`, `runs.target_id`, `tool_execution_jobs.run_id`, `findings.*`, `audit_log.*`. A tabela `assets` recebe ~83 linhas por run do PoC — em uso real vira milhões de linhas com sequential scan em toda consulta de dashboard.

---

## Fase 3 — Separação de custódia (2,5 dias)

**Objetivo:** `Workspace/Merovingio/` sobe sozinho, num diretório limpo, sem nada de `Pentesters-Team/` no disco.

### Pontos de acoplamento mapeados

- **Código** — [`app/scope.py:33-40`](backend-gateway/app/scope.py) insere `Pentesters-Team/mcp_servers/` no `sys.path` e importa `scope_guard`. O Gateway usa **só `is_in_scope()`**: 16 linhas puras, sem dependências.
- **Build** — [`backend-gateway/Dockerfile:33`](backend-gateway/Dockerfile) faz `COPY Pentesters-Team/mcp_servers/scope_guard.py`; o compose constrói 4 TES com `context: ../..` apontando para `Pentesters-Team/services/*/Dockerfile`.
- **Runtime** — `recon_net` é `external: true`, criada pelo compose do outro time; `recon-runner` não está no compose do Merovíngio; `RECON_RUNNER_TOKEN` vem do `.env` do outro repo; o build do `recon-runner` exige o clone vendorizado em `Pentesters-Team/tools/theHarvester/`.
- **Escopo em runtime** — `recon-runner/app/scope.py:40` chama `scope_guard.load_allowed_domains()`, que lê `Pentesters-Team/mcp_servers/scope.json`, **ignorando o `allowed_domains` do lease**. Os TES mais novos aceitam o campo, mas caem no mesmo arquivo quando ele não vem.

| # | Tarefa | Esforço |
|---|---|---|
| 3.1 | **Internalizar a lógica de escopo.** Criar `backend-gateway/app/scope_match.py` com `is_in_scope()` (cópia literal), remover o `sys.path` bridge e o `COPY` do Dockerfile. Teste de paridade contra o original enquanto os dois coexistirem. | 2h |
| 3.2 | **Contrato de escopo estrito** — ver detalhamento abaixo. | 1,5 dia |
| 3.3 | **Mover os TES para dentro** (`Workspace/Merovingio/services/`) ou publicá-los como imagens versionadas num registry. Ajustar os 4 `dockerfile:` e trocar `context: ../..` por contexto local. | 4h |
| 3.4 | **Assumir rede, `recon-runner` e `theHarvester`.** Declarar `recon_net` no próprio compose (deixa de ser `external`); trazer o `recon-runner` para o compose do Merovíngio; vendorizar o `theHarvester` ou fixá-lo como imagem pré-buildada. | 4h |
| 3.5 | **Consolidar segredos num `.env` único** do Merovíngio, com `.env.example` cobrindo os tokens dos 5 TES. Resolve junto o item de segredo hardcoded em `scripts/seed_tes.py` (`"secret-tok"`). | 2h |
| 3.6 | **Teste de fumaça de isolamento:** clonar só `Workspace/Merovingio/` para diretório limpo, `docker compose up --build`, rodar um scan end-to-end. É o critério de aceite da fase inteira. | 2h |

### 3.2 — Contrato de escopo estrito (decisão nº 2)

**O projeto não embarca escopo.** Sem `scope.json`, sem `DEFAULT_ALLOWED_DOMAINS`, sem Target seedado. Verificado: `seed_user.py` cria só um usuário e `seed_tes.py` registra só endereços de TES — **nenhum script seeda escopo hoje**. O único escopo pré-definido em todo o sistema é o `scope.json` do outro repo, então a mudança é remoção, não reescrita.

O fallback atual é `["localhost", "127.0.0.1"]`. De dentro de um container TES, isso não significa "a máquina do analista" — significa **o próprio TES**. É um escopo pré-autorizado apontando para a infraestrutura da plataforma.

**Lacuna que essa decisão expõe:** se o escopo passa a vir exclusivamente do lease, o lease precisa carregá-lo inteiro. Hoje `TesLeaseResponse` tem só `allowed_domains`, preenchido por `allowed_domains_snapshot()`, que achata **apenas `target.root_domains`**. Ficam de fora:

- **`cidrs`** — um Target definido por faixa de IP não chega ao TES. Sem o fallback, `allowed_domains` vem vazio e tudo é recusado. Escopo por CIDR não funciona.
- **`out_of_scope`** — a lista de veto nunca chega ao enforcement. Excluir `admin.cliente.com` não impede nada: o TES faz suffix-match contra `cliente.com` e aprova.

Hoje a governança define três coisas e só uma atravessa até onde a decisão importa. O `scope.json` mascarava isso.

**Tarefas:**

1. `TesLeaseResponse` devolve o escopo completo — `root_domains`, `cidrs`, `out_of_scope` — como objeto estruturado, substituindo `allowed_domains_snapshot()`.
2. Nos 5 TES, o escopo vira **campo obrigatório** do request: sem `Optional`, sem `= None`, sem fallback. O `recon-runner` precisa aceitá-lo (hoje não aceita nada e lê o arquivo direto).
3. Ausente ou vazio → **erro explícito** (`scope_not_provided`, 422), nunca um default. Regra escrita: *um TES sem escopo entregue não executa; ele falha e diz por quê.*
4. Portar veto e CIDR para o TES: `out_of_scope` checado antes de `root_domains`, mesma semântica de sufixo do Gateway.
5. Excluir `scope.json`, `load_allowed_domains()` e `DEFAULT_ALLOWED_DOMAINS` do caminho do Merovíngio. O `pentest_mcp.py` do Pentesters-Team mantém a cópia dele para uso próprio — não estamos quebrando o outro time, estamos parando de compartilhar o arquivo.
6. **Aceite:** stack limpa, sem nenhum Target criado, todo scan recusado com erro claro — não com "0 resultados", não com fallback.

### Reformular a regra de custódia

Hoje a regra é organizacional: *"nenhum serviço fora do Pentesters-Team invoca ferramenta ofensiva"*. Rodando sozinho, sem equipe, isso deixa de significar algo. Reescrever no `CONTEXT.md` como fronteira técnica:

> O n8n nunca executa binário. Toda ferramenta roda atrás de um TES. Todo TES valida escopo contra o lease antes de qualquer subprocesso.

---

## Fase 4 — Governança operável (8,5 dias)

O que transforma a decisão nº 2 de política em algo que a equipe consegue exercer. Depende da Fase 3: validar lote contra `root_domains` + `cidrs` + `out_of_scope` só faz sentido depois que os três forem o escopo canônico.

### O bloqueio de fundo: a API de leitura não existe

| Existe | Não existe |
|---|---|
| `POST /workspaces/{id}/workflows` | `GET` de workflows — **não há como listar** |
| `POST /workflows/{id}/run`, `GET /runs/{id}` | `GET /runs` — não há como listar execuções |
| `GET /programs/{id}/targets` | `GET /workspaces`, `GET /programs` |
| `/admin/tes` (CRUD completo) | Visão de ferramentas para operador |

O frontend não é mock só por atalho: **a API que ele consumiria não existe**. Dashboard e Launcher são impossíveis contra a API atual.

| # | Tarefa | Detalhe | Esforço |
|---|---|---|---|
| 4.1 | **Endpoints de listagem** | `GET` de workflows, runs, workspaces, programs — com paginação e filtro. Destrava qualquer UI. | 1 dia |
| 4.2 | **`GET /tools` + health-check real** | Endpoint read-only separado do `/admin/tes`, **sem `static_token`** (reusar o admin seria vazamento de credencial por design) e sem `base_url`. O campo `health_status` hoje nasce `"unknown"` e só muda por `PATCH` manual — o mock do frontend mostra "healthy" pulsando, é ficção. Precisa de health-check batendo no `/healthz` de cada TES. | 1 dia |
| 4.3 | **Campo `tools[]` em `workflow_definitions`** | "Ver as ferramentas que vão usar" exige ligar workflow → ferramentas, e essa ligação não existe no modelo: o `tool_name` está hardcoded dentro do JSON do n8n. Campo declarado no registro (não parsing do JSON, que acoplaria o Gateway ao formato do n8n) + validação de que todo `tool_name` existe no `tes_registry` — hoje um workflow pode ser registrado apontando para ferramenta inexistente e só falhar no meio de um Run. | 4h |
| 4.4 | **Ativar `program_workflow_enablement`** | A tabela existe desde a migration inicial com **zero endpoints e zero código a usar**. É exatamente o catálogo de "workflows habilitados por Program" — separa "workflow existe" de "esta equipe pode rodá-lo neste programa". Schema não muda. | 1 dia |
| 4.5 | **Escopo em lote com preview** | Ver detalhamento abaixo. | 1,5 dia |
| 4.6 | **Frontend real** | Catálogo de ferramentas, launcher com workflows habilitados, cadastro de escopo em lote, dashboard de execuções. Substitui o mock atual (475 linhas, zero chamadas de API, `setTimeout` simulando runs, indicador SSE hardcoded como `useState(true)`). Colocar no `docker-compose.yml` — hoje não há como servi-lo. | 4 dias |

### 4.5 — Cadastro de escopo em lote

O modelo já suporta muitos domínios por Target (`root_domains` é lista). O trabalho real não é aceitar o array — é **validar**.

`TargetCreate` aceita `List[str]` **sem validação nenhuma**. Num cadastro em lote isso vira:

- `*.exemplo.com` → o suffix-match nunca casa. Escopo silenciosamente vazio.
- `https://exemplo.com/` → idem, o esquema quebra o match.
- CIDR malformado → `ip_in_scope()` faz `continue` e ignora sem avisar ([`app/scope.py:61`](backend-gateway/app/scope.py)).
- Domínio presente em `root_domains` e `out_of_scope` → o veto vence, ninguém é avisado do conflito.

Colar 200 linhas e ter 12 falhando em silêncio é pior que não ter a funcionalidade: a equipe acredita ter autorizado algo que não autorizou — ou pior, ter excluído algo que não excluiu.

A primitiva certa **já existe**: `POST /targets/{id}/scope-check`. Generalizar para aceitar lista e ela vira o preview do lote — cola-se o texto, o Gateway devolve linha a linha o que é válido, o que é inválido e por quê, o que já existe e o que conflita com o veto; só então a equipe confirma.

> **Premissa adotada** (pendente de confirmação): entrada v1 é **colar texto**, um item por linha, como os programas de bug bounty publicam escopo. Upload de arquivo (CSV/JSON com metadados) fica para depois — muda o desenho do preview e do modelo, e não bloqueia o resto.

---

## Fase 5 — Débito técnico (3 dias)

Nenhum item bloqueia os anteriores. Encaixar onde sobrar capacidade.

| # | Tarefa |
|---|---|
| 5.1 | **`data-sync-svc`: implementar de verdade ou marcar como stub.** Não sincroniza nada — `/sync/wordlists` sobe 24 palavras hardcoded, `/sync/cve` sobe 2 CVEs hardcoded, `/sync/seclists` e `/sync/trickest-cve` sobem resumos com contagens inventadas. NVD, GHSA, OSV.dev e SecLists nunca são consultados; o `NVD_API_KEY` do compose não é lido em lugar nenhum. |
| 5.2 | **`data-indexer`: parar de engolir exceções.** Os handlers de busca capturam tudo e devolvem resultado vazio — indisponibilidade do OpenSearch é indistinguível de "nada encontrado". Os testes só afirmam `"total" in data` (sempre verdade) e não há teste algum para `/index/asset` ou `/index/finding`. |
| 5.3 | **Padronizar Dockerfiles.** `backend-gateway` é digest-pinned, não-root, `uv`. `data-indexer`/`data-sync-svc` usam `python:3.11-slim` sem pin, root, `pip` com requirements `>=` — não reprodutíveis. |
| 5.4 | **Criar `tests/test_migrations.py`.** O `conftest.py:10` afirma que Alembic "é exercitado separadamente" nesse arquivo. Ele não existe: as migrations nunca são testadas. |
| 5.5 | **Reconciliar a documentação.** `backend-gateway/README.md:3` afirma que trigger/lease/callback "não estão implementados" — estão. Os docs listam como "não iniciado" o frontend, o data-indexer, o data-sync-svc e 4 dos 5 TES, todos existentes e rodando. As contagens de teste divergem entre si (42 / 28 / 43 real). |

---

## Ordem e caminho crítico

```
Fase 0 (0,5d) ──> Fase 1 (2,5d) ──┐
                                  ├──> Fase 3 (2,5d) ──> Fase 4 (8,5d)
                  Fase 2 (2d) ────┘
                                       Fase 5 (3d) — paralelo, sem dependência
```

- **Fase 0 antes de tudo** — sem ela nenhuma outra mudança é validável.
- **Fases 1 e 2 em paralelo** — tocam arquivos diferentes (routers vs. workflow JSON + migration).
- **Fase 3 depois de 1** — não empacotar os TES carregando um RBAC quebrado junto.
- **Fase 4 depois de 3** — o contrato de escopo estrito é pré-requisito da validação em lote.

**Total: ~19 dias de trabalho.** O caminho crítico até "roda sozinho num servidor, com a equipe gerenciando o próprio escopo" é Fase 0 → 1 → 3 → 4, cerca de 14 dias.

## Reposicionamento

Duas coisas mudam de peso em relação ao `NEXT_STEPS.md` original:

- **O frontend deixa de ser "item 10, conectar o mock"** e vira a entrega principal da Fase 4 — é o que operacionaliza a governança de escopo definida pela decisão nº 2.
- **CLI própria e GitHub Action saem do plano.** A motivação era paridade com `trickest-cli`/`trickest/action` para CI/CD comercial. Com uso interno, servidor dedicado e uma equipe operando pela UI, não se pagam.
