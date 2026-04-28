# Painel Oftalmocenter — Documento Mestre de Planejamento

**Versão:** 1.0
**Data:** Abril de 2026
**Autor:** Fernando (Oftalmocenter) com apoio de planejamento via Claude

---

## 0. INSTRUÇÕES PARA O CLAUDE CODE — LEIA ANTES DE QUALQUER COISA

Esta seção é a primeira coisa que você (Claude Code) deve ler. Ela define quem você é nesse projeto, quem é o usuário, e qual é o contrato de trabalho.

### 0.1 Quem é o usuário deste projeto

O usuário é Fernando, médico oftalmologista, proprietário da clínica Oftalmocenter em Marabá-PA. Ele é o **product owner e cliente final** deste projeto, não um desenvolvedor. Pontos-chave sobre ele que devem guiar todo o seu comportamento:

- **Fernando NÃO é programador.** Ele não escreve código, não lê código, não sabe debugar. Ele entende o domínio clínico profundamente, sabe como a clínica opera, e tem boa intuição sobre produto e UX, mas comandos de terminal, mensagens de erro, configurações técnicas e detalhes de implementação são fora do alcance dele.
- **Fernando sabe usar GitHub e Vercel** no nível "fazer upload de arquivo", "ver deploy", "configurar variável de ambiente". Ele já fez isso em outros projetos seus. Ele NÃO sabe rodar `npm install`, `git commit` via terminal, ou debugar logs de build.
- **Fernando confia em você.** Ele vai aceitar suas decisões técnicas. Use essa confiança com responsabilidade — não tome atalhos que vão prejudicá-lo depois.

### 0.2 Seu papel exato neste projeto

**Você é o desenvolvedor 100% responsável pela construção da plataforma.** Sua entrega final é um repositório de código completo, testado, documentado e pronto para deploy.

### 0.3 O contrato de qualidade

Antes de declarar qualquer fase concluída:
- Critério A — Builda sem erros (`npm run build` limpo).
- Critério B — TypeScript estritamente tipado, sem `any`.
- Critério C — Funciona com a API real (testado via deploy quando o sandbox não permite chamadas externas).
- Critério D — Funciona em produção, não só local.
- Critério E — Resiliência básica (Princípio 4: falhar de forma honesta).
- Critério F — Pronto para upload no GitHub (`.gitignore` correto, sem segredos commitados).

### 0.6 Princípios técnicos não-negociáveis

- Simplicidade > sofisticação.
- Funcionalidade > beleza nas fases iniciais.
- Tipagem rigorosa, sem `any`.
- Sem segredos no código.
- Comentários quando o código não é óbvio.

### 0.7 Stack obrigatória

- Next.js 14+ com App Router
- TypeScript em modo strict
- Tailwind CSS
- React 18+
- `fetch` nativo (não axios)
- `setInterval` / `useEffect` para polling
- Sem banco de dados, sem Firebase (na v1)
- Sem autenticação (na v1)

---

## 1. Visão e princípios

### 1.1 O problema

Hoje, na Oftalmocenter, o fluxo de pacientes pelos setores (recepção → exames/triagem → consulta → dilatação → consulta) é gerenciado por meio das checkboxes de status na agenda do ProDoctor. A informação existe, mas está fragmentada em múltiplas agendas.

### 1.2 A solução em uma frase

Um painel único, em tempo real, em formato Kanban estilo fast-food, exibido em telas estratégicas da Oftalmocenter, que consolida o estado de todos os pacientes do dia em todas as agendas, derivando seu estágio diretamente das checkboxes que a equipe já usa no ProDoctor.

### 1.3 Critérios de sucesso

- **Métrica 1 — Tempo médio de permanência por paciente** (entre `horaCompareceu` e `horaAtendido`).
- **Métrica 2 — Tempo morto por estágio.**
- **Métrica 3 — Capacidade diária.**

### 1.6 Princípios de design

1. **Zero atrito operacional** — a equipe não muda nada no que faz hoje.
2. **Precisão > performance** — preferível 15 s de atraso e correto, do que instantâneo e bugado.
3. **Tempo é a métrica visual primária.**
4. **Falhar de forma honesta** — se a API cair, mostrar "última atualização há X min".

### 1.7 Escopo da v1

- Sincronização ProDoctor → painel a cada 10-15 segundos.
- Três painéis distintos (Recepção, Sala de Exames, Consultório).
- Cards com cronômetro por estágio.
- Atualização visual em tempo real sem refresh manual.
- Seletor de médicos do dia, máximo 2 simultâneos.

---

## 2. Modelo de domínio

### 2.1 As 6 flags do ProDoctor

Para cada agendamento: `compareceu`, `atrasado`, `atendimento`, `exameSituacao` (no schema da API), `atendido`, `faltou`.

Timestamps automáticos: `horaCompareceu`, `horaAtendimento`, `horaAtendido`.

### 2.2 Convenção operacional

- **Recepção:** chega → `compareceu`. Termina ficha → `exame` (mantendo `compareceu`).
- **Sala de exames:** terminou exames → desmarca `exame` + marca `atendimento`.
- **Consultório:** atende → marca `atendido`. Se precisa dilatar → desmarca `atendimento` + marca `atrasado`.
- **Pós-dilatação:** desmarca `atrasado` + marca `atendimento`. Médico atende → marca `atendido`.

### 2.3 Tabela mestre

| Estágio | Combinação | Painel |
|---|---|---|
| Aguardando agendamento | nenhuma flag | Recepção (próximos) |
| Faltou | `faltou` | nenhum |
| Em recepção | `compareceu` | Recepção |
| Em sala de exames | `compareceu + exame` | Sala de Exames |
| Pronto para médico | `compareceu + atendimento` | Consultório |
| Aguardando dilatação | `compareceu + atrasado` | Recepção + Sala de Exames |
| Pronto pós-dilatação | `compareceu + atendimento` | Consultório |
| Atendido | `atendido` | nenhum |

### 2.4 Algoritmo

```
se atendido = true → ATENDIDO
senão se faltou = true → FALTOU
senão se compareceu e atrasado → DILATAÇÃO
senão se compareceu e atendimento → PRONTO_MÉDICO
senão se compareceu e exameSituacao → SALA_EXAMES
senão se compareceu → RECEPÇÃO
senão → AGENDADO
```

### 2.5 Médicos ativos

3 médicos cadastrados, 2 consultórios. Cada TV tem seleção própria salva em `localStorage`. Máximo 2 simultâneos.

---

## 3. Arquitetura técnica

### 3.1 Modelo

```
Painel (browser) ─HTTP→ API Route Vercel ─HTTP→ ProDoctor API
        ↑ polling 10s        (cache 10s)
```

### 3.2 Stack

- Next.js 14 com App Router
- TypeScript strict
- Vercel (auto-deploy via GitHub push)
- `fetch` nativo, `setInterval` no cliente
- Tailwind CSS
- Cache em memória no servidor

### 3.3 Variáveis de ambiente

- `PRODOCTOR_API_KEY`
- `PRODOCTOR_API_PASSWORD`
- `PRODOCTOR_API_TIMEZONE` = `-03:00`
- `PRODOCTOR_API_TIMEZONE_NAME` = `America/Sao_Paulo`
- `PRODOCTOR_API_URL` = `https://api.prodoctor.net.br` (configurável)

---

## 5. Roadmap de construção

- **Pré-fase:** preparação (chave API, repositório, deploy vazio).
- **Fase 1:** fundação invisível — `lib/` e rotas `/api/medicos`, `/api/painel`.
- **Fase 2:** painel mínimo viável (feio, funcional).
- **Fase 3:** painel da Recepção bonito.
- **Fase 4:** painéis Sala de Exames e Consultório.
- **Fase 5:** refinamento com a equipe usando.

---

## 6. Anexos técnicos

### 6.2 Endpoints da API ProDoctor utilizados

| Endpoint | Método | Uso |
|---|---|---|
| `/api/v1/Usuarios` | POST | Lista médicos |
| `/api/v1/Agenda/BuscarPorStatusTipo` | POST | Agendamentos do dia |
| `/api/v1/Pacientes/Detalhar/{codigo}` | GET | Idade do paciente |

### 6.3 Headers obrigatórios

```
X-APIKEY: {chave}
X-APIPASSWORD: {senha}
X-APITIMEZONE: -03:00
X-APITIMEZONENAME: America/Sao_Paulo
Content-Type: application/json
```

### 6.4 Limites

- Rate limit: 120 req/min.
- Paginação: máximo 5000 registros por página.
- Permissões da chave: "Acessar Agenda" + "Leitura em Pacientes".

---

**Fim do documento mestre. v1.0**

Para o documento completo (com todas as seções de UX, mockups e detalhamento de telas das Fases 3 e 4), ver a versão original mantida pelo Fernando.
