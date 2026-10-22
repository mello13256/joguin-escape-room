# Depósito 13 — escape room 3D de terror

Jogo em primeira pessoa feito com [three.js](https://threejs.org/) que roda direto no navegador.
Você está trancado num depósito escuro e abandonado, cheio de salas e portas. Uma criatura
anda devagar pelas salas e, se te vê, corre atrás de você 25% mais rápido que você.

## Objetivo

1. Encontre os computadores espalhados pelas salas (7 no mapa, em salas sorteadas a cada partida).
2. Chegue perto e aperte **E** para hackear. Cada computador pede **3 respostas certas** de perguntas básicas de Python.
   Errar dispara um alarme e a criatura vai até lá investigar.
3. Com **5 computadores hackeados**, as **2 portas de saída** se abrem e a criatura passa a andar direto até você.
4. Saia para o estacionamento e **segure E por 2,5 segundos** perto do carro para fugir.

## Controles

| Tecla | Ação |
|---|---|
| W A S D / setas | andar |
| Mouse | olhar em volta |
| E | hackear computador / segurar para entrar no carro |
| 1 2 3 4 | responder as perguntas |
| W A S D ou Q (no terminal) | sair do terminal (o progresso fica salvo) |
| F | ligar/desligar a lanterna. Com ela desligada a criatura só te enxerga de perto |
| Esc | pausar |

## Como jogar

Abra o `index.html` no navegador (Chrome, Edge ou Firefox). O three.js é carregado pela internet (CDN jsDelivr),
então é preciso estar online.

Se preferir servir os arquivos localmente:

```bash
python -m http.server 8000
# depois abra http://localhost:8000
```

## Estrutura

```
index.html        telas, HUD, estilos e carregamento dos scripts
js/perguntas.js   banco de perguntas de Python (fácil de editar)
js/mapa.js        mapa do depósito em texto (cada caractere = 2x2 m)
js/texturas.js    texturas geradas por código (paredes, chão, caixotes, sangue...)
js/audio.js       todos os sons sintetizados com WebAudio (passos, grito, alarme...)
js/jumpscare.js   gerador de pixel art aleatória animada para o jumpscare
js/criatura.js    modelo 3D e inteligência da criatura
js/jogo.js        mundo 3D, jogador, computadores, portas, carro e regras do jogo
```

Não tem nenhum arquivo de imagem ou som: tudo é gerado pelo código.
Para mudar as perguntas, edite `js/perguntas.js`. O índice `r` é a posição da resposta certa,
e as opções são embaralhadas durante o jogo.
