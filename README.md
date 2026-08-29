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

