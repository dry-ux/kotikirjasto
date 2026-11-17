const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const bookForm = document.getElementById("book-form");
const bookInput = document.getElementById("book-input");
const bookResult = document.getElementById("book-result");
const bookList = document.getElementById("book-list");
const bookCount = document.getElementById("book-count");

const history = [];

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
    if (!res.ok) throw new Error(data.error || "Request failed");
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
  bookResult.textContent = "Extracting metadata…";
  try {
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
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
    row.insertCell().textContent = key;
    row.insertCell().textContent = value;
  }
  bookResult.appendChild(table);
}

async function loadBooks() {
  const res = await fetch("/api/books");
  const books = await res.json();
  bookList.textContent = "";
  bookCount.textContent = `(${books.length})`;
  for (const book of books) {
    const li = document.createElement("li");
    li.textContent = book.title || "Untitled";
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = ` — ${[book.author, book.year, book.genre].filter(Boolean).join(", ")}`;
    li.appendChild(meta);
    bookList.appendChild(li);
  }
}

loadBooks();
