# Docão Capitalista

A Brazilian churrasco idle game starring Docão, the party pig. Portuguese UI. Guest play stays in the browser; an account saves the empire in the cloud.

Idle no espírito de AdVenture Capitalist: o Docão sai de uma barraca de torresmo e vai montando um império de red cup, food truck, churrascaria, mercado, balada e mega fazenda. A interface é em pt-BR. Sem conta, o progresso fica no navegador. Com conta, o mesmo save segue pra outro aparelho.

## Como rodar

```bash
npm install
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173).

Build de produção:

```bash
npm install
npm run build
npm run preview
```

O `npm run build` gera a pasta `dist/`, pronta para um site estático (Vercel detecta Vite).

A API local (o mesmo handler do Worker, com SQLite em `worker/.data`) sobe separado:

```bash
node worker/dev-server.mjs
npm run dev
```

O Vite encaminha `/api` para `http://127.0.0.1:8787`. Sem essa API o jogo continua, só que o login avisa que a nuvem não respondeu.

Testes da economia, da regra de merge e da API:

```bash
npm test
```

## Como jogar

1. Compre a **Barraca de Torresmo** (você começa com R$ 5). A primeira barra já sai andando.
2. A grana entra quando a barra chega no fim. Toque em **Começar** para o próximo ciclo — o clique não paga na hora.
3. Reinvista. O seletor ×1 / ×10 / ×100 / Máx vale para todos os negócios.
4. Quando der, **contrate um gerente**. A partir daí aquele negócio recomeça sozinho, e o caixa só cresce no fim de cada ciclo.
5. Suba a escada: Quiosque de Red Cup, Food Truck do Docão, Churrascaria, Mercado da Porcada, Balada Cheers, Fazenda Cheers, Império do Churrasco.
6. Quando o botão **Anjos** mostrar anjo pendente, abra, confira e **Renasça**. O caixa, os negócios e os gerentes zeram. Anjo e bênção ficam, e a próxima brasa rende mais.

Cutucar o Docão solta uma frase e uma gorjeta pequena. Não substitui o império.

**Recomeçar** zera o save deste aparelho, anjos inclusos. Não é renascimento. Logado, zera a nuvem também.

**Entrar** cria a conta ou abre uma que já existe (e-mail e senha). O rodapé diz se o império está só no aparelho, salvando, salvo na nuvem ou sem rede.

## Notas de design

- O loop é o do AdVenture Capitalist, em versão curta: um timer por negócio, receita = base × quantidade, custo da próxima leva = base × coeficiente ^ quantidade.
- Sem gerente, **Começar** dispara um ciclo. A receita cai no saldo quando a barra enche, nunca no clique. Com gerente, o ciclo recomeça sozinho e o crédito continua no fim da barra.
- Ao voltar, a renda offline dos negócios com gerente entra no caixa, com teto de **8 horas**. Sem gerente, só o ciclo que já estava andando pode fechar, e a grana entra nesse fechamento.
- O save usa `localStorage`, chave `docao-capitalista-v1`. A versão interna vai no campo `v` (agora 2). Save antigo (`v: 1`) entra com 0 anjos e o império intacto. O campo `rev` sobe a cada compra, renascimento ou zeramento e serve pra desempate. A sessão fica em `docao-capitalista-session`.
- Sem conta, nada sai do aparelho. No primeiro login — e sempre que os dois lados existem — vale esta regra:
  1. Ganha o save com `totalEarned` maior (grana de todas as vidas, anjos inclusos nessa carreira).
  2. Empate: ganha o `rev` maior, pra não perder compra que ainda não rendeu.
  3. Empate de novo: a nuvem ganha.
- Logado, a nuvem é a fonte da verdade. Um PUT com carreira menor, ou com a mesma carreira e `rev` menor, volta 409 e o aparelho adota o save da nuvem. **Recomeçar** manda `force: true` e pode substituir um império maior. Sair para de enviar, mas deixa a cópia local.
- O tempo offline entra depois da escolha. A comparação usa o save guardado, não o que a barra renderia se ficasse contando na espera.
- **Anjos do Docão** são o prestígio. `floor(√granaDeTodasAsVidas / 400)` é o total merecido. Renascer entrega só a diferença que ainda não foi reivindicada (bolso + anjos já gastos). A grana de todas as vidas não zera. Cada anjo no bolso dá +2% de receita (+4% com Bênção dobrada). Bênçãos permanentes: receita ×2 (10), ciclos −25% (15), gerentes −30% (20), negócios −40% (25), taxa do anjo em dobro (30). O primeiro anjo pede R$ 160 mil de carreira e quase não vale o zeramento. A primeira bênção, aos 10 anjos, pede R$ 16 mi — por volta do meio do jogo.
- Visual de churrasco no fim da tarde: contorno de desenho, fonte Fredoka, paleta de brasa, grama e red cup. O porco é um SVG original, não a arte oficial da marca.
- Números grandes aparecem como `mil`, `mi`, `bi`, `tri`.

## Publicar a conta

O jogo continua estático na Vercel. A conta mora num Worker com D1. Não tem segredo: a senha vira PBKDF2 no Worker e o navegador guarda um token opaco. Não commite `.dev.vars` nem `.env`.

1. Instale o Wrangler (`npx wrangler@4`) e entre na conta Cloudflare (`npx wrangler login`).
2. Na pasta `worker/`:

```bash
cd worker
npx wrangler d1 create docao-capitalista
```

3. Troque `database_id` em `worker/wrangler.jsonc` pelo UUID que o comando imprimir. O `00000000-0000-0000-0000-000000000000` é só um marcador.
4. Aplique a migration e publique:

```bash
npx wrangler d1 migrations apply docao-capitalista --remote
npx wrangler deploy
```

5. O deploy imprime a URL `https://docao-capitalista-api.<conta>.workers.dev`.
6. Na Vercel (projeto `docao-capitalist`), em Production e Preview, defina:

```bash
VITE_API_URL=https://docao-capitalista-api.<conta>.workers.dev
```

Sem barra no fim. O Vite grava essa URL no build, então precisa de um deploy novo depois de mudar a variável.

7. Origens liberadas no Worker (`vars.ALLOWED_ORIGINS` em `wrangler.jsonc`):

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `https://docao-capitalist.vercel.app`

Preview `https://…docao-capitalist….vercel.app` entra sem listar uma a uma. Outra origem: edite `ALLOWED_ORIGINS` e rode `npx wrangler deploy` de novo. Isso não é segredo, é variável pública.

Pra espelhar a API na máquina com D1 local em vez do `dev-server.mjs`:

```bash
cd worker
npx wrangler d1 migrations apply docao-capitalista --local
npx wrangler dev
```

## Fora desta versão

- Melhorias de velocidade e de lucro por negócio, uma a uma.
- Conquistas e trilha sonora de verdade.
