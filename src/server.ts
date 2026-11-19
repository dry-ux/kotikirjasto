import path from "node:path";
import fs from "node:fs/promises";
import express from "express";
import { Mistral } from "@mistralai/mistralai";

const PORT = Number(process.env.PORT ?? 3000);
const MODEL = "mistral-small-latest";
const DATA_FILE = path.resolve("data/books.json");

if (!process.env.MISTRAL_API_KEY) {
  console.error("MISTRAL_API_KEY is not set. Copy .env.example to .env and add your key.");
  process.exit(1);
}

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const app = express();
app.use(express.json());
app.use(express.static(path.resolve("public")));

interface Book {
  title: string;
  author?: string;
  year?: string;
  genre?: string;
  isbn?: string;
  publisher?: string;
  pages?: string;
  language?: string;
  rating?: string;
  notes?: string;
}

const FIELD_KEYS = [
  "title", "author", "year", "genre", "isbn",
  "publisher", "pages", "language", "rating", "notes",
] as const;

function normalizeBook(input: Record<string, unknown>): Book {
  const book: Book = { title: "" };
  for (const key of FIELD_KEYS) {
    const value = input[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      book[key] = String(value).trim();
    }
  }
  return book;
}

async function readBooks(): Promise<Book[]> {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, "utf8")) as Book[];
  } catch {
    return [];
  }
}

async function writeBooks(books: Book[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(books, null, 2) + "\n");
}

const CHAT_SYSTEM_PROMPT = [
  "You are a librarian assistant helping a book lover build a metadata database for her personal book collection.",
  "Answer questions about books, suggest cataloging conventions, and help organize her library.",
  "When the user describes a book, offer to extract structured metadata she can save to her collection.",
].join(" ");

const EXTRACT_SYSTEM_PROMPT = [
  "You extract book metadata for a personal collection database.",
  "From the user's description, return a single JSON object with these keys:",
  'title, author, year, genre, isbn, publisher, pages, language, rating, notes.',
  "Use an empty string for any field you cannot determine. Do not invent values.",
].join(" ");

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body as { messages?: { role: string; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages is required" });
    return;
  }
  try {
    const response = await client.chat.complete({
      model: MODEL,
      messages: [
        { role: "system", content: CHAT_SYSTEM_PROMPT },
        ...messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) })),
      ],
    });
    const content = response.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    res.json({ reply: text });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Mistral API request failed" });
  }
});

app.post("/api/books", async (req, res) => {
  const { description } = req.body as { description?: string };
  if (!description || typeof description !== "string") {
    res.status(400).json({ error: "description is required" });
    return;
  }
  try {
    const response = await client.chat.complete({
      model: MODEL,
      messages: [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        { role: "user", content: description },
      ],
      responseFormat: { type: "json_object" },
    });
    const content = response.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content : "";
    const book = normalizeBook(JSON.parse(text));
    if (!book.title) {
      res.status(422).json({ error: "Model returned no book title; add more details and try again" });
      return;
    }
    const books = await readBooks();
    books.push(book);
    await writeBooks(books);
    res.json({ book, total: books.length });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not extract book metadata" });
  }
});

app.get("/api/books", async (_req, res) => {
  res.json(await readBooks());
});

app.put("/api/books/:index", async (req, res) => {
  const index = Number(req.params.index);
  const books = await readBooks();
  if (!Number.isInteger(index) || index < 0 || index >= books.length) {
    res.status(404).json({ error: "book not found" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updated = normalizeBook(body);
  if (!updated.title) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  books[index] = updated;
  await writeBooks(books);
  res.json({ book: updated });
});

app.delete("/api/books/:index", async (req, res) => {
  const index = Number(req.params.index);
  const books = await readBooks();
  if (!Number.isInteger(index) || index < 0 || index >= books.length) {
    res.status(404).json({ error: "book not found" });
    return;
  }
  books.splice(index, 1);
  await writeBooks(books);
  res.json({ total: books.length });
});

app.listen(PORT, () => {
  console.log(`Book catalog running at http://localhost:${PORT}`);
});
