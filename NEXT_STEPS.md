# Próximos Passos — Merovíngio

> O que fazer ao retomar o projeto. Detalhamento de cada item (justificativa, arquivos, esforço) em [`PLANO_DE_ACAO.md`](PLANO_DE_ACAO.md); contexto do projeto em [`CONTEXT.md`](CONTEXT.md).
>
> **Reescrito em 2026-08-07.** A versão anterior estava dessincronizada do código: listava como pendentes itens já entregues (migração polling→callback, segundo TES, endpoint de `tes_registry`, indexador/OpenSearch) e como "não iniciados" o frontend, o `data-indexer` e o `data-sync-svc`, que existem e rodam.

## ⚠️ Estado atual: trabalho não commitado

```bash
git branch --show-current   # fix/fases-0-2-seguranca-confiabilidade
git status --short          # tudo no working tree, NADA commitado
```

Nada foi mergeado em `main`. Revisar antes de commitar.

---

## Bloco 1 — Fechar e commitar o branch atual

### 1.1 🔴 Verificar `tool_execution_jobs.resume_url` no banco vivo

```bash
docker exec merovingio-platform-postgres psql -U gateway -d gateway -c "\d tool_execution_jobs"
```

A coluna existe em `app/models.py` e é escrita por `tes_lease` / lida por `tes_callback`, mas **nenhuma migration antiga a criou** (`001eb5d2ef0b` é anterior a ela; `52bfe257d3f4` só tocou em `tes_registry`). Qualquer banco montado por `alembic upgrade head` — que é o que o `README.md` manda fazer — está sem a coluna, e `/internal/tes-lease` derruba com erro de coluna inexistente.

Se a coluna não aparecer, aplicar a migration nova (`9f4a1c7d2b83`), que repara o drift com guarda por inspector.

### 1.2 Rodar a suíte no seu ambiente

```bash
docker run -d --name gateway-testdb \
  -e POSTGRES_USER=gateway -e POSTGRES_PASSWORD=gateway -e POSTGRES_DB=gateway_test \
  -p 15433:5432 postgres:16-alpine

cd backend-gateway
export PLATFORM_TEST_DATABASE_URL="postgresql+asyncpg://gateway:gateway@localhost:15433/gateway_test"
export GATEWAY_JWT_SECRET="test-secret"
./.venv/bin/python -m pytest tests/ -q
```

Última execução conhecida: **61 passed**. Rodar também `data-indexer/tests/` (6 testes novos de auth) e `data-sync-svc/tests/`.

### 1.3 ❌ Fase 2.1 — reescrever o workflow n8n (único item das Fases 0–2 ainda pendente)

`workflows/recon-baseline.json` tem quatro defeitos. Reescrever de uma vez, não em quatro edições:

1. **Segredo hardcoded** — `"X-Internal-Token": "dev-only-internal-token-change-me"` aparece 3× num arquivo em Git. Migrar para credencial nativa do n8n.
2. **Nenhum caminho de erro** — grafo linear, nó final com `"status": "success"` literal. Se o TES falhar ou o `Wait` não retomar, o Run fica preso em `running` para sempre e a reconciliação `completed_with_warnings` nunca dispara. Adicionar Error Workflow + status dinâmico.
3. **Registry contornado** — chama `http://recon-runner:8000/run` hardcoded, ignorando o `tes_base_url` do lease.
4. **Multi-domínio descartado** — usa `allowed_domains[0]`.

### 1.4 Revisar e commitar

Atenção a duas mudanças com impacto externo:

- **Breaking change**: `TesRegistryResponse` perdeu `static_token`, ganhou `has_static_token`.
- **Novo segredo**: `DATA_INDEXER_TOKEN` precisa estar alinhado entre `backend-gateway` e `data-indexer`. Sem ele a indexação para — e o Gateway engole a exceção em silêncio (item 5.2 do plano).

---

## Bloco A — Toolkit de segurança integrado ao n8n

> **Pré-requisito:** Bloco 1.3 concluído (workflow reescrito sem segredos hardcoded e com Error Workflow).
> Os TES abaixo seguem o mesmo padrão de `pd-recon`, `net-scan` etc. — FastAPI + scope check + callback.

### Mapeamento de ferramentas → TES

| Ferramenta | TES | Status |
|---|---|---|
| theHarvester | `recon-runner` | ✅ Existente |
| subfinder + httpx | `pd-recon` | ✅ Existente |
| nmap | `net-scan` | ✅ Existente |
| **naabu** | `net-scan` (engine alternativo) | 🔧 Adicionado |
| **Nuclei** + Nuclei-Templates | `pd-scan` (novo) | 🔨 Criado |
| **Katana** + **GoSpider** | `pd-crawler` (novo) | 🔨 Criado |
| **ffuf** + **dirsearch** | `fuzz-svc` (novo) | 🔨 Criado |
| SecLists | Volume `seclists_data` (init-container) | 🔨 Criado |
| Nuclei-Templates | Volume `nuclei_templates` (init-container) | 🔨 Criado |

### A.1 — 🔴 Subir e testar os 3 novos TES

Os serviços foram criados em `Pentesters-Team/services/{pd-scan,pd-crawler,fuzz-svc}/`
e adicionados ao `docker-compose.yml` com seus init-containers de volume.

```bash
# Na raiz do Merovingio (requer recon_net existente)
docker network create recon_net 2>/dev/null || true
docker compose build pd-scan pd-crawler fuzz-svc net-scan
docker compose up -d nuclei-templates-init seclists-init
# Aguardar os init-containers terminarem (SecLists ~4-6 GB, demora na 1ª vez)
docker compose up -d pd-scan pd-crawler fuzz-svc net-scan
```

Verificar saúde:
```bash
docker compose ps
curl http://localhost:18000/admin/tes  # todos os 8 TES devem aparecer
```

### A.2 — Registrar os novos TES no Gateway

```bash
docker compose exec backend-gateway python3 scripts/seed_tes.py
```

Espera-se a saída:
```
Registered TES pd-scan (id=...) -> http://pd-scan:8000
Registered TES pd-crawler (id=...) -> http://pd-crawler:8000
Registered TES fuzz-svc (id=...) -> http://fuzz-svc:8000
```

### A.3 — Importar e testar o workflow de exemplo

O arquivo `workflows/recon-full-chain.json` contém o workflow
**Subfinder → Naabu → Nuclei** com:
- Tokens via **n8n Credentials** (não hardcoded)
- `tes_base_url` dinâmico do lease (não hardcoded)
- Error Workflow conectado para captura de falhas
- Status dinâmico no callback final

Para importar:
1. Abrir o n8n em `http://localhost:15678`
2. `Import from file` → selecionar `workflows/recon-full-chain.json`
3. Criar as credenciais no n8n: `Gateway Internal Token`, `pd-recon Token`,
   `net-scan Token`, `pd-scan Token` — todas do tipo **HTTP Header Auth**
   com nome `X-Internal-Token` e valor de `GATEWAY_INTERNAL_TOKEN`/tokens
   correspondentes do `.env`
4. Ativar o workflow e testar via:
   ```bash
   curl -X POST http://localhost:15678/webhook/run-full-chain \
     -H 'Content-Type: application/json' \
     -d '{"run_id": "<uuid>", "domain": "hackthissite.org"}'
   ```

### A.4 — Rodar as suítes de teste

```bash
# pd-scan
cd Pentesters-Team/services/pd-scan
pip install -r requirements.txt
python -m pytest tests/ -q

# pd-crawler
cd Pentesters-Team/services/pd-crawler
pip install -r requirements.txt
python -m pytest tests/ -q

# fuzz-svc
cd Pentesters-Team/services/fuzz-svc
pip install -r requirements.txt
python -m pytest tests/ -q
```

### Critério de aceite do Bloco A

- [ ] `GET /admin/tes` lista 8 TES registrados
- [ ] `GET http://pd-scan:8000/healthz` → `{"status": "ok"}`
- [ ] `GET http://pd-crawler:8000/healthz` → `{"status": "ok"}`
- [ ] `GET http://fuzz-svc:8000/healthz` → `{"status": "ok"}`
- [ ] Workflow `recon-full-chain` dispara e completa com `Run.status = success`
- [ ] Assets persistidos no `GET /programs/{id}/assets`

---

## Bloco 2 — Separação de custódia (Fase 3)

**Objetivo:** `Workspace/Merovingio/` sobe sozinho, num diretório limpo, sem nada de `Pentesters-Team/` no disco. Pré-requisito para rodar no servidor da equipe operadora.

Ordem: contrato de escopo estrito primeiro (3.2), porque ele redefine a interface que todo o resto usa.

1. Internalizar `is_in_scope()` — remover o `sys.path` bridge e o `COPY` do Dockerfile.
2. 🔴 **Contrato de escopo estrito** — o lease passa a carregar `root_domains` + `cidrs` + `out_of_scope`; escopo vira campo **obrigatório** nos 5 TES; ausente ou vazio → erro explícito, nunca fallback. Excluir `scope.json` e `DEFAULT_ALLOWED_DOMAINS` do caminho.
3. Mover os TES para dentro do projeto ou publicá-los como imagens versionadas.
4. Assumir a rede `recon_net`, o `recon-runner` e o `theHarvester`.
5. Consolidar segredos num `.env` único + `.env.example`.
6. Teste de fumaça: clonar só este diretório, subir, rodar um scan end-to-end.

**Reformular a regra de custódia** no `CONTEXT.md`. A atual é organizacional ("nenhum serviço fora do Pentesters-Team invoca ferramenta ofensiva") e deixa de significar algo sem a equipe. Substituir pela fronteira técnica:

> O n8n nunca executa binário. Toda ferramenta roda atrás de um TES. Todo TES valida escopo contra o lease antes de qualquer subprocesso.

---

## Bloco 3 — Governança operável (Fase 4)

O que transforma "a equipe operadora define o escopo" de política em algo exercível. Depende do Bloco 2.

**Bloqueio de fundo:** a API de leitura não existe. Não há `GET` de workflows, de runs, de workspaces nem de programas. O frontend atual não é mock por atalho — a API que ele consumiria nunca foi escrita.

1. Endpoints de listagem (workflows, runs, workspaces, programs) com paginação e filtro.
2. `GET /tools` read-only, **sem `static_token`**, + health-check real dos TES (`health_status` hoje nasce `unknown` e só muda por PATCH manual).
3. Campo `tools[]` em `workflow_definitions` + validação contra `tes_registry` no registro.
4. Ativar `program_workflow_enablement` — a tabela existe desde a migration inicial com zero endpoints e zero código a usar.
5. Validação de formato em `root_domains`/`cidrs` + `scope-check` em lote com preview (colar texto, um item por linha; upload de arquivo fica para depois).
6. Frontend real, incluído no `docker-compose.yml`.

---

## Bloco 4 — Débito técnico (Fase 5)

Nenhum item bloqueia os anteriores; encaixar onde sobrar capacidade.

1. **`data-sync-svc`: implementar ou marcar como stub.** Não sincroniza nada — sobe wordlists e CVEs hardcoded. NVD, GHSA, OSV.dev e SecLists nunca são consultados; o `NVD_API_KEY` do compose não é lido em lugar nenhum do código.
2. **`data-indexer`: parar de engolir exceções.** As buscas capturam tudo e devolvem vazio — indisponibilidade do OpenSearch é indistinguível de "nada encontrado".
3. **Padronizar Dockerfiles.** `backend-gateway` é digest-pinned, não-root, `uv`; `data-indexer`/`data-sync-svc` usam base sem pin, root, `pip` com requirements `>=`.
4. **Reconciliar a documentação.** `backend-gateway/README.md` ainda afirma que trigger/lease/callback "não estão implementados" e cita "28 testes"; o `README.md` da raiz descreve um grafo de workflow (`Wait` + `Poll Job` + branch) que não existe mais no JSON.

---

## Decisões firmadas (não reabrir sem motivo novo)

- ✅ **Servidor dedicado, outra equipe opera.** A plataforma vai rodar sozinha, sem o time atual gerenciando. Toda dependência do `Pentesters-Team/` precisa ser cortada (Bloco 2).
- ✅ **O projeto não embarca escopo pré-definido.** Sem `scope.json`, sem lista default, sem Target seedado. A governança da equipe operadora define o escopo pela API/UI, com RBAC e `audit_log`. Escopo ausente é erro, não motivo para fallback.
- ✅ **Vault vs. `.env`**: fica em `.env`/secrets de compose. Revisitar só com gatilho concreto (multi-nó, dezenas de chaves, rotação/auditoria).
- ✅ **Sem exposição a terceiros.** Uso interno — a ressalva da Sustainable Use License do n8n não se aplica enquanto isso não mudar.
- ✅ **CLI própria e GitHub Action saíram do plano.** A motivação era paridade com `trickest-cli`/`trickest/action` para CI/CD comercial; não se pagam com uso interno e equipe operando pela UI.
- ✅ **Nome do projeto**: Merovíngio.

---

## Ressalva sobre o histórico deste repositório

O repositório tem **um único commit**, e esse commit carrega dois defeitos independentes no caminho crítico: o `import os` ausente em `app/routers/internal.py` (corrigido no branch) e o `resume_url` sem migration (idem). A narrativa do `README.md` sobre a "PoC validada ponta a ponta com 83 assets persistidos" descreve um estado que o código commitado **não reproduz** — foi verdade num ponto anterior do desenvolvimento.

Ao retomar, tratar os documentos como fonte de intenção, não de estado. O estado é o código.
