const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const bookForm = document.getElementById("book-form");
const bookInput = document.getElementById("book-input");
const bookResult = document.getElementById("book-result");
const bookList = document.getElementById("book-list");
const bookCount = document.getElementById("book-count");
const editArea = document.getElementById("edit-area");
const lookupForm = document.getElementById("lookup-form");
const lookupInput = document.getElementById("lookup-input");
const lookupResult = document.getElementById("lookup-result");

const FIELDS = [
  ["title", "Nimi"],
  ["author", "Tekijä"],
  ["year", "Vuosi"],
  ["genre", "Genre"],
  ["isbn", "ISBN"],
  ["publisher", "Kustantaja"],
  ["pages", "Sivut"],
  ["language", "Kieli"],
  ["rating", "Arvosana"],
  ["notes", "Muistiinpanot"],
];

const FIELD_LABELS = Object.fromEntries(FIELDS);

const SOURCE_NAMES = { fennica: "Fennica", openlibrary: "Open Library", googlebooks: "Google Books" };

const history = [];
let books = [];
let editingIndex = null;
let lastLookup = null;

function addMsg(role, text) {
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = chatInput.value.trim();
  if (!content) return;
  chatInput.value = "";
  addMsg("user", content);
  history.push({ role: "user", content });
  const pending = addMsg("assistant", "…");
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Pyyntö epäonnistui");
    pending.textContent = data.reply;
    history.push({ role: "assistant", content: data.reply });
  } catch (err) {
    pending.className = "msg error";
    pending.textContent = err.message;
  }
});

bookForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const description = bookInput.value.trim();
  if (!description) return;
  const button = bookForm.querySelector("button");
  button.disabled = true;
  bookResult.textContent = "Poimitaan tietoja…";
  try {
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Pyyntö epäonnistui");
    renderBook(data.book);
    loadBooks();
    bookInput.value = "";
  } catch (err) {
    bookResult.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

function renderBook(book) {
  bookResult.textContent = "";
  const table = document.createElement("table");
  for (const [key, value] of Object.entries(book)) {
    if (!value) continue;
    const row = table.insertRow();
    if (key === "cover") {
      const img = document.createElement("img");
      img.src = value;
      img.className = "cover";
      img.alt = "kansikuva";
      row.insertCell().textContent = "Kansikuva";
      row.insertCell().appendChild(img);
    } else {
      row.insertCell().textContent = FIELD_LABELS[key] || key;
      row.insertCell().textContent = value;
    }
  }
  bookResult.appendChild(table);
}

async function loadBooks() {
  const res = await fetch("/api/books");
  books = await res.json();
  bookList.textContent = "";
  bookCount.textContent = `(${books.length})`;
  books.forEach((book, index) => {
    const li = document.createElement("li");
    if (book.cover) {
      const img = document.createElement("img");
      img.src = book.cover;
      img.className = "cover small";
      img.alt = "";
      img.addEventListener("error", () => img.remove());
      li.appendChild(img);
    }
    const link = document.createElement("button");
    link.type = "button";
    link.className = "book-link";
    link.textContent = book.title || "Nimetön";
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = ` — ${[book.author, book.year, book.genre].filter(Boolean).join(", ")}`;
    li.appendChild(link);
    li.appendChild(meta);
    link.addEventListener("click", () => openEditor(index));
    bookList.appendChild(li);
  });
  if (editingIndex !== null && editingIndex >= books.length) closeEditor();
}

function openEditor(index) {
  editingIndex = index;
  const book = books[index] || {};
  editArea.textContent = "";
  const form = document.createElement("form");
  form.id = "edit-form";
  const heading = document.createElement("h3");
  heading.textContent = `Muokkaa: ${book.title || "Nimetön"}`;
  form.appendChild(heading);
  for (const [key, label] of FIELDS) {
    const row = document.createElement("div");
    row.className = "edit-row";
    const input = document.createElement("input");
    input.id = `edit-${key}`;
    input.name = key;
    input.value = book[key] || "";
    input.placeholder = label;
    input.autocomplete = "off";
    row.appendChild(input);
    form.appendChild(row);
  }
  const lookup = document.createElement("div");
  lookup.className = "edit-row lookup-row";
  const editorLookupInput = document.createElement("input");
  editorLookupInput.id = "edit-lookup";
  editorLookupInput.placeholder = "ISBN tai nimi ja tekijä";
  editorLookupInput.autocomplete = "off";
  editorLookupInput.value = book.isbn || [book.title, book.author].filter(Boolean).join(" ");
  const lookupBtn = document.createElement("button");
  lookupBtn.type = "button";
  lookupBtn.textContent = "Hae verkosta";
  const lookupInfo = document.createElement("div");
  lookupInfo.className = "lookup-info";
  const coverPreview = document.createElement("img");
  coverPreview.className = "cover";
  coverPreview.alt = "";
  coverPreview.style.display = "none";
  const lookupSummary = document.createElement("span");
  lookupSummary.className = "meta";
  lookupInfo.append(coverPreview, lookupSummary);
  function setSummary(text) { lookupSummary.textContent = text; }
  lookupBtn.addEventListener("click", () => enrichEditor(editorLookupInput.value, setSummary, coverPreview, lookupBtn, form));
  lookup.append(editorLookupInput, lookupBtn);
  form.appendChild(lookup);
  form.appendChild(lookupInfo);

  async function enrichEditor(query, report, coverPreview, btn, form) {
    const q = (query || "").trim();
    if (!q) {
      alert("Kirjoita hakusanaksi ISBN tai kirjan nimi.");
      return;
    }
    btn.disabled = true;
    report("Haetaan Fennicasta ja muista lähteistä…");
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pyyntö epäonnistui");
      const filled = [];
      for (const [key, label] of FIELDS) {
        const input = document.getElementById(`edit-${key}`);
        const value = data.found[key];
        if (value && !input.value.trim()) {
          input.value = value;
          filled.push(label);
        }
      }
      if (data.found.cover) {
        coverPreview.src = data.found.cover;
        coverPreview.style.display = "";
        coverPreview.addEventListener("error", () => { coverPreview.style.display = "none"; });
        form.dataset.cover = data.found.cover;
      }
      const who = Object.keys(data.sources).filter(k => data.sources[k]).map(k => SOURCE_NAMES[k]).join(", ");
      report(filled.length
        ? `Täydennetty: ${filled.join(", ")} (lähteet: ${who})`
        : `Uusia tietoja ei löytynyt (lähteet: ${who || "ei vastanneita"}).`);
    } catch (err) {
      report(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  const buttons = document.createElement("div");
  buttons.className = "edit-buttons";
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = "Tallenna";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Peruuta";
  cancel.className = "secondary";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Poista";
  remove.className = "danger";
  buttons.append(save, cancel, remove);
  form.appendChild(buttons);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {};
    for (const [key] of FIELDS) {
      body[key] = document.getElementById(`edit-${key}`).value.trim();
    }
    if (!body.title) {
      alert("Kirjan nimi on pakollinen.");
      return;
    }
    body.cover = form.dataset.cover || book.cover || "";
    save.disabled = true;
    try {
      const res = await fetch(`/api/books/${editingIndex}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pyyntö epäonnistui");
      closeEditor();
      loadBooks();
    } catch (err) {
      alert(err.message);
      save.disabled = false;
    }
  });
  cancel.addEventListener("click", closeEditor);
  remove.addEventListener("click", async () => {
    if (!confirm(`Poistetaanko "${book.title || "Nimetön"}" kokoelmasta?`)) return;
    remove.disabled = true;
    try {
      const res = await fetch(`/api/books/${editingIndex}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Poisto epäonnistui");
      closeEditor();
      loadBooks();
    } catch (err) {
      alert(err.message);
      remove.disabled = false;
    }
  });

  editArea.appendChild(form);
}

function closeEditor() {
  editingIndex = null;
  editArea.textContent = "";
}

lookupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = lookupInput.value.trim();
  if (!query) return;
  const button = lookupForm.querySelector("button");
  button.disabled = true;
  lookupResult.textContent = "Haetaan Fennicasta, Open Librariesta ja Google Booksesta…";
  try {
    const res = await fetch("/api/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Pyyntö epäonnistui");
    lastLookup = data.found;
    renderLookup(data);
  } catch (err) {
    lookupResult.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

function renderLookup(data) {
  lookupResult.textContent = "";
  const table = document.createElement("table");
  for (const [key, label] of FIELDS) {
    const value = data.found[key];
    if (!value) continue;
    const row = table.insertRow();
    row.insertCell().textContent = label;
    row.insertCell().textContent = value;
  }
  lookupResult.appendChild(table);
  if (data.found.cover) {
    const img = document.createElement("img");
    img.src = data.found.cover;
    img.className = "cover";
    img.alt = "kansikuva";
    img.addEventListener("error", () => img.remove());
    lookupResult.appendChild(img);
  }
  const who = Object.keys(data.sources).filter(k => data.sources[k]).map(k => SOURCE_NAMES[k]).join(", ");
  const p = document.createElement("p");
  p.className = "meta";
  p.textContent = `Lähteet: ${who || "ei vastanneita"}`;
  lookupResult.appendChild(p);
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = "Lisää kokoelmaan";
  add.addEventListener("click", async () => {
    if (!lastLookup) return;
    add.disabled = true;
    try {
      const res = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ book: lastLookup }),
      });
      const data2 = await res.json();
      if (!res.ok) throw new Error(data2.error || "Pyyntö epäonnistui");
      renderBook(data2.book);
      loadBooks();
      lookupInput.value = "";
      lookupResult.textContent = "";
      lastLookup = null;
    } catch (err) {
      alert(err.message);
      add.disabled = false;
    }
  });
  lookupResult.appendChild(add);
}

loadBooks();
