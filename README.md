# Docão Capitalista

A Brazilian churrasco idle game starring Docão, the party pig. Portuguese UI, browser-only, local save.

Idle no espírito de AdVenture Capitalist: o Docão sai de uma barraca de torresmo e vai montando um império de red cup, food truck, churrascaria, mercado, balada e mega fazenda. A interface é em pt-BR. Não tem servidor. O progresso fica no navegador.

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

Testes da economia:

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

**Recomeçar** zera o save deste aparelho, anjos inclusos. Não é renascimento.

## Notas de design

- O loop é o do AdVenture Capitalist, em versão curta: um timer por negócio, receita = base × quantidade, custo da próxima leva = base × coeficiente ^ quantidade.
- Sem gerente, **Começar** dispara um ciclo. A receita cai no saldo quando a barra enche, nunca no clique. Com gerente, o ciclo recomeça sozinho e o crédito continua no fim da barra.
- Ao voltar, a renda offline dos negócios com gerente entra no caixa, com teto de **8 horas**. Sem gerente, só o ciclo que já estava andando pode fechar, e a grana entra nesse fechamento.
- O save usa `localStorage`, chave `docao-capitalista-v1`. A versão interna vai no campo `v` (agora 2). Save antigo (`v: 1`) entra com 0 anjos e o império intacto.
- **Anjos do Docão** são o prestígio. `floor(√granaDeTodasAsVidas / 400)` é o total merecido. Renascer entrega só a diferença que ainda não foi reivindicada (bolso + anjos já gastos). A grana de todas as vidas não zera. Cada anjo no bolso dá +2% de receita (+4% com Bênção dobrada). Bênçãos permanentes: receita ×2 (10), ciclos −25% (15), gerentes −30% (20), negócios −40% (25), taxa do anjo em dobro (30). O primeiro anjo pede R$ 160 mil de carreira e quase não vale o zeramento. A primeira bênção, aos 10 anjos, pede R$ 16 mi — por volta do meio do jogo.
- Visual de churrasco no fim da tarde: contorno de desenho, fonte Fredoka, paleta de brasa, grama e red cup. O porco é um SVG original, não a arte oficial da marca.
- Números grandes aparecem como `mil`, `mi`, `bi`, `tri`.

## Fora desta versão

- Melhorias de velocidade e de lucro por negócio, uma a uma.
- Conquistas e trilha sonora de verdade.
- Conta e sincronização entre aparelhos.
