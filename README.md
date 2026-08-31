# UWE---UniversalWordEditor
Estou cansado do Word (Microsoft), estou cansado do Docs (Google) e estou muito cansado do Canva. Hora de criar o melhor dos 2 (ou 3) mundos. Esse é o projeto do UWE, Editor de Texto (ou palavras) Universal. (o nome não é UTE pois acho um tanto estranho, mas estou aberto caso vcs achem melhor mudar o nome). Esse projeto ainda está em desenvolvimento.

O código pode estar com erro, pois eu criei em HTML por um método um tanto estranho. Abrir o DevTools direto pelo navegador e fazer o código lá. Deu muitos erros, então chamei ajuda de algumas IAs. Mesmo assim, ainda está em beta. A principio, este editor de texto tem suporte a maioria dos "tipos" de imagem, como png, jpeg, pdf, bmp, gif, eps e svg. 

Eu também não sei como farei para colocar na web, se vc souber, sinta-se à vontade para colocar nos comentários. 

Tem também a pasta do node_modules, mas eu não consigo enviar pois tem 500 pastas, e sub pastas e sub-sub pastas etc... Mas pelo que sei, o node modules não é tão necessário. (Metade do peso do UWE é do node_modules, ele contém 34 MIL ARQUIVOS) 
<img width="1401" height="450" alt="image" src="https://github.com/user-attachments/assets/da01f699-c147-49f3-8b76-53e404d5a9f4" />
Essa é a foto dos arquivos que estão disponíveis aqui

---

## Como rodar localmente

**Backend (FastAPI):**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

**Frontend (Vite + React):**
```bash
npm install
npm run dev
```
Abra `http://localhost:3000`. O Vite já faz proxy de `/api` para o backend em `:8001` (configurado em `vite.config.ts`).

Se `npm install` travar com o erro `Cannot read properties of null (reading 'edgesOut')`, é um bug conhecido do resolvedor de dependências do npm (não é problema do projeto) — rode `npm install --legacy-peer-deps` no lugar.

**Build de produção:**
```bash
npm run build   # gera dist/
```

## Correções aplicadas nesta revisão

- Código-fonte (raiz e `src/`) estava salvo como output já transformado pelo navegador (não código real) — recuperado via sourcemaps embutidos.
- Removidos ~24 arquivos duplicados na raiz que nunca eram usados de fato.
- `favicon.svg` e `robots.txt` movidos para `public/` (não eram servidos antes).
- `vite.config.ts` reconstruído; `tailwind.config.js/.ts` e `vite.config.mjs` removidos (continham HTML colado por engano; Tailwind v4 não precisa deles).
- Backend: adicionado o endpoint `POST /api/media/upload` que faltava (upload de mídia retornava 404).
- Backend: corrigido bug que impedia desativar a "Fonte Global" depois de ativada.
- Adicionado `backend/requirements.txt` (não existia).

## Funcionalidade #1: Login

- **Backend:** tabela `users` (e-mail único, senha com hash bcrypt), JWT (30 dias de validade), endpoints `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`. Todos os endpoints de documentos e upload agora exigem token e retornam apenas dados do dono (isolamento por usuário testado).
- **Frontend:** contexto de autenticação (`src/lib/auth.tsx`), páginas `/login` e `/register`, rotas protegidas (`RequireAuth`) redirecionam para login se não autenticado, token enviado automaticamente em toda chamada à API, sessão expirada desloga sozinho.
- **Segurança:** o token fica no `localStorage` (padrão comum e simples). Para um produto voltado ao público, o próximo passo recomendável é migrar para cookie `httpOnly` — mais resistente a ataques XSS — mas isso exige configurar CSRF, que é um passo à parte.

## Funcionalidade #2: Compartilhamento

- **Backend:** nova tabela `document_shares` (documento + usuário + papel). Papéis: `editor` (edita conteúdo, não gerencia compartilhamento nem exclui) e `viewer` (somente leitura). Endpoints: `GET/POST /api/documents/{id}/shares` e `DELETE /api/documents/{id}/shares/{user_id}` — todos exclusivos do dono. `GET /api/documents` agora retorna documentos próprios + compartilhados com você. Convite é feito pelo e-mail de uma conta já existente no UWE (não há convite por link/e-mail externo ainda).
- **Frontend:** botão "Compartilhar" no Dashboard (menu do card, só para o dono) e no Editor (cabeçalho, só para o dono) abrem o mesmo diálogo — convidar por e-mail, trocar papel, remover acesso. Documentos compartilhados exibem uma etiqueta com o nome do dono. No Editor, quem é `viewer` vê tudo em modo somente leitura (barra de ferramentas, inserção de mídia e busca/substituir ficam ocultas; título e fonte global ficam bloqueados).

## Funcionalidade #3: Exportação para Word (.docx) e PDF

- **Como funciona:** o HTML do editor é convertido para uma estrutura intermediária (`src/lib/exportRich.ts`) que entende negrito/itálico/sublinhado/riscado, cor de texto e destaque, tamanho de fonte, links, títulos, citação, alinhamento, listas com marcador/numeradas e imagens — depois essa estrutura alimenta dois geradores independentes.
- **.docx:** gerado com a biblioteca `docx` — é um arquivo OOXML real (abre no Word, Google Docs, LibreOffice), não uma conversão de HTML disfarçada.
- **.pdf:** gerado com `pdfmake` — é um PDF vetorial de verdade, com texto selecionável e pesquisável (não é um "print" da tela virando imagem).
- **Imagens:** toda imagem inserida no documento é convertida para PNG (via canvas) antes de entrar no `.docx`/PDF, já que nem todo formato aceito pelo UWE (svg, webp, avif) é suportado nativamente pelos dois formatos de exportação.
- **Vídeo/áudio/anexos:** não podem ser embutidos em Word/PDF — aparecem como uma linha de texto com link para o arquivo original.
- **Limitação conhecida:** as fontes personalizadas do editor (DM Sans, Lora, etc.) não são incorporadas nos arquivos exportados — o `.docx` usa Calibri/Georgia/Courier New (fontes padrão do Word) como aproximação, e o PDF usa uma única fonte embutida (Roboto) para todo o texto, já que embutir os arquivos de fonte reais é um passo maior, não incluído nesta rodada.
- **Performance:** as duas bibliotecas de exportação (pesada, ~365KB e ~1.8MB) só são carregadas quando a pessoa clica em "Baixar" — não pesam no carregamento normal do editor.

## Correções de UI e de segurança (revisão pós-teste)

- **Fontes:** os 15 pacotes `@fontsource-*` estavam listados como dependência mas nunca eram importados — corrigido (`src/lib/fontFaces.ts`). O seletor de fonte por trecho usava `execCommand('fontName')`, que não entende valores CSS com aspas/fallback — trocado por um wrapper manual com `<span style="font-family:...">` (mesma técnica já usada pro tamanho de fonte). A "Fonte Global" também nunca funcionava: a variável CSS que ela define nunca era consumida por nenhuma regra — regra adicionada.
- **Barra lateral cortada:** tinha 320px e as 3 abas (Web/Imagens/LM) mal cabiam — alargada pra 384px, abas compactadas, e adicionada rolagem vertical (o conteúdo podia estourar a altura sem como rolar).
- **[Segurança] Timing leak no login:** login com e-mail inexistente pulava a verificação bcrypt inteira, respondendo bem mais rápido que senha errada — dava pra descobrir quais e-mails estão cadastrados só cronometrando a resposta. Corrigido: agora sempre roda uma comparação bcrypt (contra um hash fixo quando o e-mail não existe), igualando o tempo de resposta nos dois casos.
- **[Segurança] Segredo do JWT previsível:** se a variável de ambiente `JWT_SECRET` não fosse configurada, o backend usava uma string fixa visível no próprio código — qualquer deploy que esquecesse de configurá-la ficaria vulnerável a forjar login de qualquer conta. Agora gera um segredo aleatório por processo quando a variável não está definida (trade-off: reiniciar o backend sem `JWT_SECRET` configurado desloga todo mundo — comportamento correto pra local, e força a configurar de verdade em produção).
- **Crash com senha longa:** senha com mais de 72 bytes derrubava o backend com erro 500 (limite do próprio bcrypt), tanto no cadastro quanto no login. Agora retorna erro tratado (422 no cadastro, 401 no login) em vez de quebrar.
- **Logout indevido:** o frontend tratava qualquer falha ao verificar a sessão (erro de rede, backend reiniciando, um 500 qualquer) como "sessão inválida" e deslogava a pessoa mesmo com token válido. Agora só desloga de verdade em caso de 401 confirmado; qualquer outro erro mostra uma tela de "não foi possível conectar" com botão de tentar de novo, sem apagar o login.

## Funcionalidade #4: Colaboração em tempo real

**Escopo, com transparência:** isso é presença ao vivo (ver quem está no documento agora) + sincronização automática do conteúdo (mudanças de outra pessoa aparecem sem precisar recarregar a página). **Não é** co-edição simultânea livre de conflitos ao estilo Google Docs (duas pessoas digitando na mesma frase e o texto se mesclando character a character) — isso exige um motor CRDT/OT, um projeto à parte, bem maior, que não foi construído aqui. Quando duas pessoas editam ao mesmo tempo, quem salvar por último "ganha" aquele ciclo — não há merge automático de edições sobrepostas.

- **Como funciona:** WebSocket em `/ws/documents/{id}`. Ao conectar, a primeira mensagem obrigatória é `{"type":"auth","token":"..."}` (o token não vai na URL para não vazar em logs de acesso do servidor). O servidor valida o token e o acesso ao documento (dono ou compartilhado) antes de aceitar.
- **Presença:** cada conexão é registrada por documento; toda entrada/saída dispara um broadcast da lista de quem está online (avatares com iniciais no cabeçalho do Editor).
- **Sincronização de conteúdo:** quando alguém com permissão de edição salva, o servidor persiste no banco E transmite a mudança para todo mundo mais no documento (exceto quem enviou). `viewer` nunca pode enviar mudança — o servidor recusa mesmo que o frontend tente.
- **Proteção contra sobrescrita:** uma atualização remota só é aplicada no navegador de alguém se o editor dessa pessoa **não estiver em foco** naquele instante — nunca arranca texto de baixo do cursor de quem está digitando. Se chegar enquanto a pessoa está digitando, fica pendente e aplica assim que ela parar (mantendo sempre só a versão mais recente, sem empilhar).
- **Robustez:** reconecta sozinho se a conexão cair (exceto quando a causa é auth/permissão — nesse caso não adianta tentar de novo). Se o WebSocket estiver fora do ar, o autosave via REST (já existente) continua funcionando normalmente como rede de segurança.
- **Limitação conhecida:** as conexões vivem na memória de um único processo do backend — funciona perfeitamente no `uvicorn` de hoje (um processo), mas rodar múltiplas instâncias/processos do backend ao mesmo tempo exigiria uma camada compartilhada (ex.: Redis pub/sub) para presença/broadcast chegarem em todo mundo, independente de qual instância cada pessoa está conectada. Fora do escopo desta rodada.
- **Testado de ponta a ponta:** simulei dois usuários reais conectando, um editando e o outro recebendo a mudança ao vivo, confirmei que o conteúdo é persistido de verdade no banco (não só transmitido), testei um `viewer` tentando escrever (rejeitado), token forjado (conexão recusada), usuário sem acesso ao documento (conexão recusada), e a lógica de "não aplicar enquanto a pessoa digita" isoladamente.

## Funcionalidade #5: Histórico de versões

- **Como funciona:** a cada edição de conteúdo/título, o estado *anterior* à mudança é salvo como uma versão — mas só se a última versão salva tiver mais de 5 minutos (evita criar uma versão a cada tecla digitada durante uma sessão contínua de edição).
- **Endpoints:** `GET /api/documents/{id}/versions` (lista), `GET /api/documents/{id}/versions/{version_id}` (detalhe/prévia), `POST /api/documents/{id}/versions/{version_id}/restore` (restaura).
- **Restaurar é reversível:** ao restaurar uma versão antiga, o estado atual (antes da restauração) também é salvo como versão nova — nunca se perde uma versão por restaurar outra.
- **Limite de 50 versões por documento**, com poda automática das mais antigas quando esse limite é ultrapassado.
- **Permissões:** qualquer pessoa com acesso ao documento (mesmo `viewer`) pode ver o histórico; só `editor`/`owner` pode restaurar.
- **Integração com colaboração em tempo real:** restaurar uma versão notifica ao vivo quem estiver com o documento aberto via WebSocket, do mesmo jeito que uma edição normal — testei isso especificamente (alguém só olhando o documento recebe a restauração de outra pessoa sem precisar recarregar a página).
- **Testado de ponta a ponta:** confirmei o throttle de 5 minutos (editar duas vezes seguidas não duplica versão), que o snapshot realmente captura o estado anterior à edição (não o novo), as permissões (viewer vê histórico mas não restaura — 403 testado de verdade), e a poda no limite de 50 — nesse último, **achei e corrigi um bug de off-by-one real** (o SQLAlchemy já conta a linha recém-inserida antes da consulta de contagem, e eu somava +1 de novo por engano, podando uma versão a mais do que devia).

