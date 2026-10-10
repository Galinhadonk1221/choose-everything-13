CHOOSE EVERYTHING! V4.6 — GROQ GPT-OSS 120B + OPENROUTER AUTOMATICO
====================================================================

Base: V4.5 (2.411 cartas, convites por link, seleção de times, leilões,
Power gerado pela IA e narração REAL de confrontos 1v1 em streaming).

NOVO
- GROQ_API_KEY ativa Groq GPT-OSS 120B como IA principal.
- OPENROUTER_API_KEY configura a reserva automática para erros, limites,
  timeout, ausência de resposta ou veredito inválido.
- Se a Groq não estiver configurada, funciona apenas com OpenRouter.
- Narração em streaming e resultado final usam a cadeia Groq > OpenRouter.
- Não inclui nem utiliza GEMINI_API_KEY (mesmo que já exista no Railway).
- No modo Groq, narração usa raciocínio baixo e julgamento, médio,
  para equilibrar velocidade e análise.
- Dados e chaves de APIs ficam somente no servidor.
- GET /api/health informa o provedor principal e a reserva.
- Novos testes automatizados simulam troca de provedor e narração.

INSTALAÇÃO
- Leia CONFIGURAR_RAILWAY.txt neste pacote.
- Instale dependências: npm install
- Rode o site localmente: npm start
- Rode os testes: npm test

SERVIÇOS
Groq: https://console.groq.com/keys
Groq Docs: https://console.groq.com/docs/api-reference
OpenRouter: https://openrouter.ai/

AVISOS
- O modelo gratuito é sujeito a cotas e nem sempre terá a mesma velocidade.
- Uma chave inválida falhará; o fallback precisa ter chave válida separada.
- Não foram realizados testes com credenciais reais de APIs.
- Este ZIP é uma atualização do código; não publica automaticamente o site.

--------- ANOTAÇÕES DA VERSÃO ANTERIOR ---------
CHOOSE EVERYTHING! V4.5 — GOOGLE GEMINI + OPENROUTER AUTOMATICO
===============================================================

Esta versao preserva a V4.4 (2.411 cartas, convites, time picker,
leiloes e narracao REAL em streaming) e adiciona:
- Gemini 3.8 Flash na API do Google como IA PRINCIPAL.
- OpenRouter como IA RESERVA quando Gemini estiver lento, der erro,
  ficar sem quota (429), usar modelo indisponivel, ou produzir JSON invalido.
- A troca funciona tanto para a narracao 1v1 ao vivo como para o
  julgamento final (ranking, vencedor e Power 1-10000).
- Se o primeiro modelo produzir so uma narracao parcial e falhar,
  a interface zera a narracao anterior antes de mostrar a nova IA.
- Caso configure apenas OPENROUTER_API_KEY, o modo anterior continua
  funcionando. Se configure apenas GEMINI_API_KEY, usa apenas Gemini.
- A pagina de resultado mostra o provedor que de fato julgou.
- GET /api/health exibe aiProvider, aiModel e aiFallbackAvailable.

CONFIGURACAO NO RAILWAY (Settings > Variables)
------------------------------------------------
GEMINI_API_KEY = sua chave do Google AI Studio (SECRETA)
GEMINI_MODEL   = gemini-3.8-flash
OPENROUTER_API_KEY = sua chave do OpenRouter (SECRETA)
OPENROUTER_MODEL   = nvidia/nemotron-3-ultra-550b-a55b:free

Links:
Google AI Studio: https://aistudio.google.com/api-keys
Documentacao API: https://ai.google.dev/gemini-api/docs/openai

ATENCAO
-------
- NAO coloque suas chaves nos arquivos nem no GitHub.
- O Google tem franquias gratuitas e limites por projeto. Consulte o AI Studio.
- Free tier pode usar dados para melhorar produtos: consulte as politicas.
- OpenRouter gratuito tambem tem limites e/ou indisponibilidade.
- O fallback nao inventa vereditos: se ambas falharem, o host pode
  tentar novamente, e nenhuma pontuacao de backup e criada.
- A narracao 1v1 e o ranking final sao duas consultas independentes;
  elas podem ter sido produzidas por modelos diferentes.
- Modelos de uma API nao ganham creditos automaticamente na outra.
- ZIP NAO PUBLICA NO RAILWAY: envie o conteudo do ZIP a raiz do
  repositorio Github conectado ao Railway e faca commit.
- LOCAL: npm install && npm start (Node >=18).

--------- ANOTACOES DA VERSAO ANTERIOR ---------

CHOOSE EVERYTHING! — V4.4 | CONVITE AUTOMÁTICO + IA NARRANDO BATALHAS + 2.411 CARTAS
====================================================================================

Esta versão atualiza a V4.3.1, preservando leilão, modos 1v1 / 1v1v1 / 1v1v1v1 /
2v2 / 3v3, host, configuração de times, ranking e força 100% atribuída pela IA.

NOVIDADES
---------
1) Convites por link, sem inserir código manualmente:
   • Crie uma sala. No lobby clique em "📋 Copiar convite".
   • Envie o link https://SEU-DOMINIO/?room=ABCDE.
   • O navegador do convidado abre a sala automaticamente, usando o nome salvo
     ou criando um nome "Convidado####" caso ele ainda não tenha informado um.
   • O convidado entra no lobby se a sala estiver aberta e tiver espaço.
   • Não é possível ingressar em partidas já iniciadas ou salas excluídas.
   • Salas ficam somente em memória: reiniciar o servidor apaga as salas e invalida os links.

2) Catálogo ampliado de 1.550 para 2.411 cartas (+861 personagens).
   • Anime: 774 cartas com mapeamentos de nome/personagem/franquia.
   • Personagens novos também nas categorias de heróis, vilões, games,
     desenhos, filmes/séries e terror.
   • O total da categoria "Tudo misturado" agora é atualizado automaticamente.

3) Retratos para os novos personagens:
   • No anime, a busca de imagem usa título/franquia para encontrar retratos
     correspondentes no AniList. Algumas formas específicas dependem da wiki.
   • Nas outras categorias, procura imagens por nome via Wikipedia.
   • É preciso internet ACESSÍVEL aos servidores dessas fontes; elas podem
     limitar a API ou não ter imagem. Quando não há imagem confiável, é
     exibido um placeholder com o nome, em vez de uma foto ERRADA.
   • NÃO É GARANTIDO que todos os 2.411 personagens tenham fotos disponíveis
     ou que todas as imagens externas carreguem. Esse ponto exige um banco de
     imagens manualmente conferido/licenciado para garantia de 100%.
   • Debug de imagem: GET /api/image-debug/ID-DA-CARTA
   • Checagem geral: GET /api/health

4) Batalhas 1v1 narradas AO VIVO pela IA real do OpenRouter.
   • Agora NÃO existe mais texto/ganhador falso calculado no navegador.
   • A primeira chamada à IA transmite textos narrativos de duelos de pares
     efetivos de cartas dos times, enviados por streaming aos espectadores.
   • A tela mostra literalmente os trechos que o modelo envia, atualizando
     as fotos dos participantes ao mudar o "CONFRONTO N".
   • Uma segunda chamada à IA continua decidindo o ranking final,
     time campeão e todos os Powers de 1 a 10.000.
   • Os duelos individuais são ilustrações: o resultado da partida continua
     sendo o julgamento do elenco completo das equipes (sinergias/counters).
   • A narração pode falhar se o modelo gratuito não suportar streaming ou
     estiver congestionado; nesse caso, o julgamento final ainda é tentado.
   • O texto visível é ficção/narração solicitada da IA, NÃO chain-of-thought
     oculto. Não são divulgados pensamentos internos do modelo.

INSTALAÇÃO / PUBLICAÇÃO
-----------------------
1) Extraia este ZIP em uma pasta.
2) Substitua o conteúdo do repositório existente pelos arquivos deste ZIP.
   Não crie uma subpasta extra no GitHub: package.json precisa estar na raiz.
3) Faça commit/push no GitHub, para o Railway redeployar o projeto.
4) No Railway, mantenha as variáveis:
   OPENROUTER_API_KEY = sua chave (NUNCA divulgue no repositório)
   OPENROUTER_MODEL   = modelo disponível no OpenRouter com chat completions
   PORT               = definido automaticamente pelo Railway
5) Depois do deploy, abra https://SEU-DOMINIO/api/health e confira:
   judgeVersion: 4.4-live-narration-invites
   cards: 2411
6) Crie sala, clique em Copiar convite e abra o link em outro navegador.

LOCAL: npm install && npm start   (requer Node.js >=18, recomendado >=20)

AVISOS
------
• Requer ambiente com socket.io/express/openai instaláveis via npm.
• Ao hospedar múltiplas instâncias Railway, as salas em memória não são
  compartilhadas entre processos. Prefira 1 réplica por enquanto.
• Não acrescente pontuação oculta ao ranking: a IA é responsável pelo resultado.
• Links de convite identificam a sala, não são autenticação de usuário.
• Direitos autorais das imagens são dos respectivos titulares. Para uso público,
  confira permissões/licenças das fontes e prefira material autorizado.
• O pacote é código para atualizar; não publica o site automaticamente.
