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

### 3.1 (Opcional) Conectar o Firebase para guardar histórico

Os 3 painéis funcionam **sem o Firebase** — esta etapa é opcional.

Quando configurado, o servidor passa a gravar no Firestore cada vez que
um paciente troca de estágio (ex.: vai da Recepção para a Sala de
Exames). Esses eventos viram a base de dados para o **dashboard de
análise** que vamos construir depois (tempo médio na recepção,
comparativo entre convênios, etc.).

**Como configurar (uma vez só, ~5 minutos):**

1. Acesse https://console.firebase.google.com e clique em **Adicionar
   projeto**. Pode chamar de "painel-oftalmocenter".
2. Pode desabilitar o Google Analytics (não usamos).
3. Quando o projeto abrir, no menu lateral clique em **Build → Firestore
   Database** → **Create database**.
4. Escolha **Production mode** (a regra padrão bloqueia tudo, mas o
   nosso código usa o Admin SDK que tem permissão automática).
5. Em **Cloud Firestore location**, selecione `southamerica-east1`
   (São Paulo) — fica mais perto.
6. Clique em **Enable** e espere alguns segundos.
7. Volte ao menu lateral, clique no **engrenagem** ao lado de "Project
   Overview" → **Project settings** → aba **Service accounts**.
8. Clique em **Generate new private key** → **Generate key**. Vai
   baixar um arquivo JSON.
9. Abra esse arquivo num editor de texto e copie **todo** o conteúdo.
10. No Vercel, vá em **Settings → Environment Variables** e adicione:

| Nome da variável | Valor |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | (cole o JSON inteiro do arquivo do passo 9) |

Marque para **Production, Preview e Development**.

11. Vá em **Deployments**, abra o último deploy e clique nos `...` →
    **Redeploy**.

**Como confirmar que funcionou:**

Acesse `https://SUA-URL.vercel.app/api/diagnostico` e procure pelo
campo `firebase`. Você deve ver:

```json
"firebase": {
  "configurado": true,
  "inicializado": true,
  "projectId": "painel-oftalmocenter-XXXX",
  "escritaTeste": { "ok": true, "duracaoMs": 200 }
}
```

Daí em diante, toda transição de estágio detectada pelo painel é
gravada no Firestore na coleção `eventosEstagio`. Para conferir, abra
o **Firebase Console → Firestore Database** e olhe a coleção — depois
de alguns pacientes passarem pelo painel, você verá os documentos
aparecendo lá.

### 3.2 (Opcional) Habilitar o modo edição (mover paciente pelo painel)

Por padrão os painéis são **somente leitura** — espelham o ProDoctor mas
não alteram nada. Quando você ligar o modo edição, cada card vira
clicável e abre um menu de "para onde mover este paciente" com todas
as opções (Recepção / Sala de exames / Pronto p/ médico / Em dilatação /
Atendido / Faltou). A mudança é enviada para o ProDoctor pela API.

**Pré-requisitos:**

1. Na sua chave do ProDoctor, adicione a permissão **"Alterar na
   Agenda"** (Painel ProDoctor → Cadastros → Permissões da chave).
   Sem isso o ProDoctor recusa as alterações com erro 401.

2. No Vercel → Settings → Environment Variables, adicione:

| Nome da variável | Valor |
|---|---|
| `EDIT_PIN` | Um número de 4 a 8 dígitos. Quem souber pode editar. |

Marque para **Production, Preview e Development**.

3. Redeploy.

**Como usar:**

1. No header de qualquer painel, aparece um botão de cadeado fechado
   (ao lado do botão de beep).
2. Clique → janela pede o PIN. Digite e confirme.
3. Cadeado fica amarelo aberto: modo edição ligado nesta aba.
4. Clique em qualquer card → modal com todos os destinos abre.
5. Escolha o destino → o paciente migra (em até 5s o card pula de
   coluna em todos os painéis abertos).
6. Para travar, clique no cadeado de novo (ou feche a aba — o PIN
   não persiste entre sessões).

**Observações:**

- O PIN fica em `sessionStorage` do navegador (some quando a aba fecha).
  Cada TV pode ter o cadeado independente.
- Sem `EDIT_PIN` configurado no Vercel, o cadeado fica desabilitado
  com tooltip explicando.
- Mudanças feitas pelo painel são gravadas no histórico do Firestore
  (Fase A) — aparecem no dashboard normalmente.

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

### 1. Abra a página de diagnóstico

Acesse `https://SUA-URL.vercel.app/api/diagnostico`. Ela mostra:
- Se cada variável de ambiente está configurada (sem revelar os valores).
- Qual URL da API ProDoctor está sendo usada efetivamente.
- O resultado de uma sondagem rápida em 3-4 URLs candidatas do ProDoctor:
  qualquer uma que retornar `"ok": true` é uma URL válida e pode ser
  configurada na variável `PRODOCTOR_API_URL` do Vercel.

Exemplo de saída útil:
```json
{
  "sondagens": {
    "https://api.prodoctor.net.br": {
      "ok": false,
      "erro": "TypeError: fetch failed",
      "causaErro": "Error: getaddrinfo ENOTFOUND api.prodoctor.net.br"
    },
    "https://api.prodoctor.com.br": {
      "ok": true,
      "status": 200,
      "duracaoMs": 240
    }
  }
}
```
No exemplo acima, a URL correta seria `https://api.prodoctor.com.br` —
basta atualizar a variável no Vercel e fazer Redeploy.

### 2. Se o diagnóstico não esclarecer

1. Vá em **Vercel → seu projeto → Logs** e veja a mensagem de erro.
2. Me envie a mensagem (ou cole o JSON de `/api/medicos`).
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
