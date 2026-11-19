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
  cover?: string;
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
  "title, author, year, genre, isbn, publisher, pages, language, rating, notes.",
  "Kirjoita kenttien arvot suomeksi (paitsi alkukieliset nimet, kuten kirjan ja tekijän nimi).",
  'Jätä avaimen arvoksi tyhjä merkkijono (""), jos et pysty määrittämään sitä. Älä keksi tietoja.',
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
  const body = (req.body ?? {}) as Record<string, unknown>;
  let book: Book;
  if (body.description && typeof body.description === "string") {
    try {
      const response = await client.chat.complete({
        model: MODEL,
        messages: [
          { role: "system", content: EXTRACT_SYSTEM_PROMPT },
          { role: "user", content: body.description },
        ],
        responseFormat: { type: "json_object" },
      });
      const content = response.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? content : "";
      book = normalizeBook(JSON.parse(text));
      if (!book.title) {
        res.status(422).json({ error: "Malli ei tunnistanut kirjan nimeä; lisää tietoja ja kokeile uudelleen" });
        return;
      }
      if (body.cover && typeof body.cover === "string") book.cover = body.cover;
    } catch (err) {
      console.error(err);
      res.status(502).json({ error: "Kirjan tietoja ei saatu poimittua" });
      return;
    }
  } else if (body.book && typeof body.book === "object") {
    book = normalizeBook(body.book as Record<string, unknown>);
    if (!book.title) {
      res.status(400).json({ error: "Kirjan nimi on pakollinen" });
      return;
    }
    const cover = (body.book as Record<string, unknown>).cover;
    if (cover && typeof cover === "string") book.cover = cover;
  } else {
    res.status(400).json({ error: "Kirjan kuvaus puuttuu" });
    return;
  }
  const books = await readBooks();
  books.push(book);
  await writeBooks(books);
  res.json({ book, total: books.length });
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
  if (typeof body.cover === "string") {
    if (body.cover) updated.cover = body.cover;
    else updated.cover = books[index].cover;
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

const LANGUAGE_NAMES: Record<string, string> = {
  fi: "suomi", fin: "suomi",
  sv: "ruotsi", swe: "ruotsi",
  en: "englanti", eng: "englanti",
  de: "saksa", ger: "saksa",
  fr: "ranska", fre: "ranska",
  ru: "venäjä", rus: "venäjä",
  es: "espanja", spa: "espanja",
  it: "italia", ita: "italia",
  et: "eesti", est: "eesti",
  no: "norja", nor: "norja",
};

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function parseIsbn(raw: string): string | null {
  const digits = raw.replace(/[^0-9xX]/g, "");
  return /^[0-9]{9,12}[0-9xX]$/.test(digits) ? digits : null;
}

function languageName(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code;
}

async function lookupFinna(query: string): Promise<Record<string, any> | null> {
  const base =
    "https://api.finna.fi/v1/search?format=json&limit=3&type=AllFields&lookfor=" +
    encodeURIComponent(query);
  const urls = [
    base + '&filter%5B%5D=building%3A%220%2FFennica%2F%22',
    base,
  ];
  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const record = data.records?.[0];
      if (record?.title) return record;
    } catch {
      continue;
    }
  }
  return null;
}

function fromFinna(record: Record<string, any>): Partial<Book> {
  const author = Object.values(record.authors ?? {})
    .flat()
    .map((a: any) => a?.name)
    .filter(Boolean)[0];
  const year = Array.isArray(record.years) ? record.years[0] : record.years;
  const langCode = Array.isArray(record.languages) ? record.languages[0] : record.languages;
  const image = record.images?.[0];
  return {
    title: record.title,
    author: author ? String(author) : undefined,
    year: year != null ? String(year) : undefined,
    isbn: record.isbns?.[0] ? String(record.isbns[0]) : undefined,
    publisher: record.publishers?.[0] ? String(record.publishers[0]) : undefined,
    language: langCode ? languageName(String(langCode)) : undefined,
    cover: image
      ? String(image).startsWith("http")
        ? String(image)
        : "https://api.finna.fi/" + String(image)
      : undefined,
  };
}

async function lookupOpenLibrary(query: string, isbn: string | null): Promise<Partial<Book> | null> {
  const fields = "title,author_name,first_publish_year,publisher,cover_i,number_of_pages_median,language";
  const q = isbn ? "isbn:" + isbn : query;
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&fields=${fields}&limit=1`;
  try {
    const data = await fetchJson(url);
    const doc = data.docs?.[0];
    if (!doc?.title) return null;
    const langCode = doc.language?.[0];
    return {
      title: doc.title,
      author: doc.author_name?.[0],
      year: doc.first_publish_year != null ? String(doc.first_publish_year) : undefined,
      publisher: doc.publisher?.[0],
      pages: doc.number_of_pages_median != null ? String(doc.number_of_pages_median) : undefined,
      language: langCode ? languageName(String(langCode)) : undefined,
      cover: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
    };
  } catch {
    return null;
  }
}

async function lookupGoogle(query: string, isbn: string | null): Promise<Partial<Book> | null> {
  let url =
    "https://www.googleapis.com/books/v1/volumes?q=" +
    (isbn ? "isbn:" + isbn : encodeURIComponent(query)) +
    "&maxResults=3&printType=books";
  if (process.env.GOOGLE_BOOKS_API_KEY) url += "&key=" + process.env.GOOGLE_BOOKS_API_KEY;
  try {
    const data = await fetchJson(url);
    const info = data.items?.map((item: any) => item.volumeInfo).find((v: any) => v?.title);
    if (!info) return null;
    const img = info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail;
    const yearMatch = info.publishedDate?.match(/\d{4}/);
    return {
      title: info.title,
      author: info.authors?.[0],
      year: yearMatch ? yearMatch[0] : undefined,
      genre: info.categories?.[0],
      publisher: info.publisher,
      pages: info.pageCount != null ? String(info.pageCount) : undefined,
      language: info.language ? languageName(String(info.language)) : undefined,
      cover: img ? String(img).replace(/^http:/, "https:") : undefined,
    };
  } catch {
    return null;
  }
}

app.post("/api/lookup", async (req, res) => {
  const { query } = req.body as { query?: string };
  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(400).json({ error: "Hakukenttä on tyhjä" });
    return;
  }
  const q = query.trim();
  const isbn = parseIsbn(q);
  const [finna, openlib, google] = await Promise.allSettled([
    lookupFinna(q),
    lookupOpenLibrary(q, isbn),
    lookupGoogle(q, isbn),
  ]);
  const sources: Record<string, boolean> = {
    fennica: finna.status === "fulfilled" && finna.value !== null,
    openlibrary: openlib.status === "fulfilled" && openlib.value !== null,
    googlebooks: google.status === "fulfilled" && google.value !== null,
  };
  const candidates: Partial<Book>[] = [];
  if (sources.fennica) candidates.push((finna as PromiseFulfilledResult<Record<string, any>>).value ? fromFinna((finna as PromiseFulfilledResult<Record<string, any>>).value) : {});
  if (sources.openlibrary) candidates.push(openlib as PromiseFulfilledResult<Partial<Book>> ? (openlib as PromiseFulfilledResult<Partial<Book>>).value : {});
  if (sources.googlebooks) candidates.push(google as PromiseFulfilledResult<Partial<Book>> ? (google as PromiseFulfilledResult<Partial<Book>>).value : {});
  const found: Partial<Book> = {};
  for (const candidate of candidates) {
    for (const [key, value] of Object.entries(candidate)) {
      if (value && !found[key as keyof Book]) (found as Record<string, unknown>)[key] = value;
    }
  }
  for (const key of FIELD_KEYS) {
    if (!found[key as keyof Book]) delete (found as Record<string, unknown>)[key];
  }
  if (Object.keys(found).length === 0) {
    res.status(404).json({ error: "Tietoja ei löytynyt kokeilemiesi lähteiden kautta" });
    return;
  }
  res.json({ found, sources });
});

app.listen(PORT, () => {
  console.log(`Book catalog running at http://localhost:${PORT}`);
});
