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
  "Olet kirjastonhoitaja-apulainen, joka auttaa kirjoista pitävää ihmistä rakentamaan metatietokannan omasta kirjakokoelmastaan.",
  "Vastaa aina suomeksi.",
  "Vastaa kysymyksiin kirjoista, ehdota luokittelutapoja ja auta järjestämään kirjastoa.",
  "Kun käyttäjä kuvaa kirjan, voit tarjoutua poimimaan siitä jäsenneltyä metatietoa kokoelmaan tallennettavaksi.",
].join(" ");

const EXTRACT_SYSTEM_PROMPT = [
  "Poimit metatiedot henkilökohtaisen kirjakokoelman tietokantaan käyttäjän kuvauksesta.",
  "Palauta ainoastaan yksi JSON-objekti, jossa on seuraavat avaimet:",
  'title, author, year, genre, isbn, publisher, pages, language, rating, notes.',
  "Kirjoita kenttien arvot suomeksi (paitsi alkukieliset nimet, kuten kirjan ja tekijän nimi).",
  "Jätä avaimen arvoksi tyhjä merkkijono (\"\"), jos et pysty määrittämään sitä. Älä keksi tietoja.",
].join(" ");

app.post("/api/chat", async (req, res) => {
  const { messages } = req.body as { messages?: { role: string; content: string }[] };
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Viesti puuttuu" });
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
    res.status(502).json({ error: "Mistral API -kutsu epäonnistui" });
  }
});

app.post("/api/books", async (req, res) => {
  const { description } = req.body as { description?: string };
  if (!description || typeof description !== "string") {
    res.status(400).json({ error: "Kirjan kuvaus puuttuu" });
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
      res.status(422).json({ error: "Malli ei tunnistanut kirjan nimeä; lisää tietoja ja kokeile uudelleen" });
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
    res.status(404).json({ error: "Kirjaa ei löytynyt" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const updated = normalizeBook(body);
  if (!updated.title) {
    res.status(400).json({ error: "Kirjan nimi on pakollinen" });
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
    res.status(404).json({ error: "Kirjaa ei löytynyt" });
    return;
  }
  books.splice(index, 1);
  await writeBooks(books);
  res.json({ total: books.length });
});

app.listen(PORT, () => {
  console.log(`Book catalog running at http://localhost:${PORT}`);
});
