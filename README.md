# Painel Oftalmocenter

Painel operacional em tempo real da Oftalmocenter, alimentado pelas
checkboxes de status que a equipe já usa no ProDoctor.

> **Status atual:** Fase 1 (Fundação invisível) concluída. As rotas que falam
> com a API do ProDoctor já existem e classificam os pacientes em estágios.
> A interface visível dos painéis (Recepção, Sala de Exames, Consultório)
> ainda será construída nas Fases 2-4.

---

## Como subir esta versão para o ar (passo a passo)

Você não precisa rodar nada no terminal. Tudo é feito pelo GitHub e pelo Vercel.

### 1. Subir o código para o GitHub

1. Abra o repositório `painel-oftalmocenter` no GitHub.
2. Confirme que está na branch `claude/setup-oftalmocenter-panel-nFIZt` (o
   Claude já comitou os arquivos lá).
3. Quando quiser que essa versão vire a versão "oficial", abra um Pull
   Request dessa branch para a `main` e faça o merge.

### 2. Conectar ao Vercel

1. Acesse https://vercel.com e entre com sua conta.
2. Clique em **Add New → Project**.
3. Escolha o repositório `painel-oftalmocenter`.
4. Em **Framework Preset**, deixe como **Next.js** (o Vercel detecta sozinho).
5. **Não clique em Deploy ainda.** Antes, configure as variáveis de ambiente
   (próximo passo).

### 3. Configurar as variáveis de ambiente no Vercel

Ainda na tela de criação do projeto (ou depois, em **Settings → Environment
Variables**), adicione **5 variáveis**:

| Nome da variável | Valor |
|---|---|
| `PRODOCTOR_API_KEY` | A chave fornecida pelo ProDoctor |
| `PRODOCTOR_API_PASSWORD` | A senha da chave |
| `PRODOCTOR_API_TIMEZONE` | `-03:00` |
| `PRODOCTOR_API_TIMEZONE_NAME` | `America/Sao_Paulo` |
| `PRODOCTOR_API_URL` | `https://api.prodoctor.net.br` |

> ⚠️ **A URL da API ProDoctor (`PRODOCTOR_API_URL`) é uma estimativa.**
> Se o suporte do ProDoctor disser que sua clínica usa uma URL diferente,
> basta trocar o valor dessa variável aqui no Vercel — não precisa mexer em
> código.

Marque as 5 como disponíveis para **Production, Preview e Development**.

### 4. Fazer o primeiro deploy

Clique em **Deploy** no Vercel. Em 1-2 minutos a página estará no ar.

---

## Como verificar se está funcionando

Depois do deploy, o Vercel te dá uma URL no formato
`https://painel-oftalmocenter-XXXXX.vercel.app/`.

### Teste 1: a página inicial abre

Acesse a URL. Você deve ver uma tela com 3 cards:
**Recepção / Sala de exames / Consultório**.

> Os 3 cards ainda **não levam a lugar nenhum visível** — eles vão para as
> URLs dos painéis, que começam a ser construídas na Fase 2. É esperado que
> você veja "404" se clicar neles. A Fase 1 só monta o "encanamento".

### Teste 2: a lista de médicos vem do ProDoctor

Acesse `https://SUA-URL.vercel.app/api/medicos`.

- ✅ Se aparecer um JSON com `"medicos": [{"codigo": ..., "nome": ...}]`, está
  conversando com o ProDoctor corretamente.
- ❌ Se aparecer algo como `"fonteOnline": false` com uma mensagem de erro,
  abra um issue ou me envie o erro — provavelmente é a URL da API do
  ProDoctor que precisa ser ajustada.

### Teste 3: os agendamentos do dia vêm classificados

Pegue dois `codigo` de médicos do teste anterior e acesse:

```
https://SUA-URL.vercel.app/api/painel?medicos=123,456
```

(Trocando 123 e 456 pelos códigos reais.)

Você deve ver um JSON com `cards`. Cada card tem o estágio do paciente
(`RECEPCAO`, `SALA_EXAMES`, `PRONTO_MEDICO`, `DILATACAO`, `ATENDIDO` ou
`AGENDADO`) calculado a partir das checkboxes do ProDoctor. Compare com sua
agenda real do dia para validar.

---

## O que esta versão faz e o que não faz (ainda)

### ✅ Já funciona
- Conversa com a API do ProDoctor com autenticação correta.
- Classifica cada agendamento do dia em um dos 7 estágios da clínica.
- Cache de 10 segundos no servidor (não sobrecarrega o ProDoctor).
- Cache de idade de paciente por 12h (idade não muda durante o dia).
- Trata erros e quedas da API com elegância (não trava, devolve "fonte
  offline").

### 🚧 Vai aparecer nas próximas fases
- **Fase 2:** página `/recepcao` que mostra os pacientes em lista bruta,
  atualizando sozinha a cada 10 segundos. Sem decoração.
- **Fase 3:** mesma página da Fase 2, mas com cards bonitos, cores do
  ProDoctor, cronômetros e métricas.
- **Fase 4:** páginas `/exames` e `/consultorio` com a mesma estrutura.
- **Fase 5:** ajustes finos com a equipe usando.

---

## Estrutura de pastas (referência rápida)

```
painel-oftalmocenter/
├── app/                       Páginas e rotas Next.js
│   ├── api/medicos/           GET → lista médicos do ProDoctor
│   ├── api/painel/            GET → agendamentos classificados
│   ├── layout.tsx             Layout raiz
│   └── page.tsx               Página inicial (índice)
├── lib/                       Lógica reutilizável
│   ├── tipos.ts               Tipos TypeScript do domínio
│   ├── configuracao.ts        Constantes e leitura de env
│   ├── cores.ts               Cores por estágio
│   ├── classificador.ts       Mapa de checkboxes → estágio
│   └── prodoctor-client.ts    Cliente da API ProDoctor
├── docs/                      Documentação do projeto
│   ├── PLANEJAMENTO.md        O documento mestre
│   └── swagger.json           Sumário dos endpoints da API
├── .env.local                 Variáveis locais (NÃO vai para o GitHub)
├── .env.example               Modelo das variáveis necessárias
└── package.json               Lista de dependências
```

---

## Para rodar localmente (opcional, só para testes seus)

Se algum dia você quiser rodar na sua máquina:

1. Instale o Node.js 20+ (https://nodejs.org/).
2. No terminal, dentro da pasta do projeto, rode `npm install`.
3. Confira que o arquivo `.env.local` existe e tem as 5 variáveis preenchidas.
4. Rode `npm run dev`.
5. Abra http://localhost:3000.

(Mas você não precisa fazer isso para o painel funcionar na clínica — o
Vercel cuida de tudo.)

---

## Em caso de problema

Se algo não funcionar depois do deploy:

1. Vá em **Vercel → seu projeto → Logs** e veja a mensagem de erro.
2. Me envie a mensagem que aparecer (ou abra a URL `/api/medicos` e me mande
   o JSON que retornar).
3. Não tente "consertar" pelo Vercel mexendo no código — me chame.

---

## Notas técnicas (para referência)

- Stack: Next.js 16 (App Router), TypeScript estrito, Tailwind CSS, React 19.
- Hospedagem: Vercel (plano Hobby — gratuito).
- Polling: 10 segundos (configurável em `lib/configuracao.ts`).
- Cache no servidor: 10 segundos para a chamada principal, 12 horas para
  dados de paciente (idade).
- A chave da API ProDoctor **nunca** chega ao navegador — só é lida pelo
  servidor (rotas `/api/*`).
