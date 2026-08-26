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

