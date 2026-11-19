const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const bookForm = document.getElementById("book-form");
const bookInput = document.getElementById("book-input");
const bookResult = document.getElementById("book-result");
const bookList = document.getElementById("book-list");
const bookCount = document.getElementById("book-count");
const editArea = document.getElementById("edit-area");

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

const history = [];
let books = [];
let editingIndex = null;

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
    row.insertCell().textContent = FIELD_LABELS[key] || key;
    row.insertCell().textContent = value;
  }
  bookResult.appendChild(table);
}

const FIELD_LABELS = Object.fromEntries(FIELDS);

async function loadBooks() {
  const res = await fetch("/api/books");
  books = await res.json();
  bookList.textContent = "";
  bookCount.textContent = `(${books.length})`;
  books.forEach((book, index) => {
    const li = document.createElement("li");
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

loadBooks();
