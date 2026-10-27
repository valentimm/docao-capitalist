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

Cutucar o Docão solta uma frase e uma gorjeta pequena. Não substitui o império.

**Recomeçar** zera o save deste aparelho.

## Notas de design

- O loop é o do AdVenture Capitalist, em versão curta: um timer por negócio, receita = base × quantidade, custo da próxima leva = base × coeficiente ^ quantidade.
- Sem gerente, **Começar** dispara um ciclo. A receita cai no saldo quando a barra enche, nunca no clique. Com gerente, o ciclo recomeça sozinho e o crédito continua no fim da barra.
- Ao voltar, a renda offline dos negócios com gerente entra no caixa, com teto de **8 horas**. Sem gerente, só o ciclo que já estava andando pode fechar, e a grana entra nesse fechamento.
- O save usa `localStorage`, chave `docao-capitalista-v1`.
- Prestígio (anjo / reset com bônus) ficou de fora do v0. Comprar, coletar e automatizar já fecham a fantasia.
- Visual de churrasco no fim da tarde: contorno de desenho, fonte Fredoka, paleta de brasa, grama e red cup. O porco é um SVG original, não a arte oficial da marca.
- Números grandes aparecem como `mil`, `mi`, `bi`, `tri`.

## Fora do v0

- Prestígio e investidores.
- Melhorias de velocidade e de lucro por negócio.
- Conquistas e trilha sonora de verdade.
- Conta e sincronização entre aparelhos.
