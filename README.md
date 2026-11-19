# kotikirjasto 📚

Omien kirjojen metatiedot — a minimal web app for a book lover building a
metadata database for her personal book collection. It uses the official
[@mistralai/mistralai](https://www.npmjs.com/package/@mistralai/mistralai)
TypeScript SDK with the `mistral-small-latest` model.

Features:

- **Chat** — ask about books, authors, or how to organize your library.
- **Add a book** — paste any description or back-cover text; the model extracts
  structured metadata (title, author, year, genre, ISBN, …) in JSON mode and
  saves it.
- **Edit & delete** — click any book in the Collection list to open an edit
  form where you can complete or correct any field, save, or remove the book.
- **Collection** — your saved books, stored in `data/books.json`.

The Mistral API key lives only on the server (`src/server.ts`); the browser
never sees it — the frontend talks to `/api/chat` and `/api/books` endpoints.

## Setup

```bash
npm install
cp .env.example .env
# then edit .env and set MISTRAL_API_KEY to your key from https://console.mistral.ai
```

## Run locally

```bash
npm run dev     # dev server with auto-reload on http://localhost:3000
# or
npm start       # without watch mode
```

Then open <http://localhost:3000>.

## Project layout

```
src/server.ts     Express server: serves the UI, /api/chat, /api/books
public/           Chat interface (vanilla HTML/CSS/JS)
data/books.json   Your collection (created on first save)
```
