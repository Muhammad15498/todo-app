import { db, uid } from "./db.js";
import { SAMPLES } from "./samples.js";
import { lookup, speak } from "./lookup.js";
import { Reader, kindFromName, titleFromName } from "./reader.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const DEFAULTS = {
  theme: "paper",
  fontSize: 20,
  font: "newsreader",
  hover: true,
  lang: "ar",
  geminiKey: "",
  model: "gemini-2.5-flash"
};

const state = {
  settings: { ...DEFAULTS },
  view: "library",
  docs: [],
  words: [],
  current: null,
  lastGloss: null,
  lookupToken: 0
};

let reader;

function applyTheme() {
  document.documentElement.dataset.theme = state.settings.theme;
  document.documentElement.style.setProperty("--read-size", `${state.settings.fontSize / 16}rem`);
  const font =
    state.settings.font === "atkinson"
      ? '"Atkinson Hyperlegible", system-ui, sans-serif'
      : state.settings.font === "source"
        ? '"Source Serif 4", Georgia, serif'
        : '"Newsreader", Georgia, serif';
  document.documentElement.style.setProperty("--font-read", font);
  const themeColor = state.settings.theme === "night" ? "#161310" : state.settings.theme === "sepia" ? "#eddcbe" : "#f3ebdd";
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = themeColor;
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

function showView(name) {
  state.view = name;
  $("#view-library").classList.toggle("hidden", name !== "library");
  $("#view-reader").classList.toggle("hidden", name !== "reader");
  $("#view-vocab").classList.toggle("hidden", name !== "vocab");
  $("#topbar").classList.toggle("hidden", name === "reader");
  if (name !== "reader") closePanel();
}

function formatBytes(n) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(k) {
  return ({ pdf: "PDF", epub: "EPUB", docx: "Word", txt: "Text", md: "Markdown", html: "HTML", sample: "Sample" }[k] || k);
}

async function refreshLibrary() {
  state.docs = await db.allDocs();
  const shelf = $("#shelf");
  if (!state.docs.length) {
    shelf.innerHTML = `<div class="empty-shelf">Your shelf is empty. Open a book, or start with one of the samples — they are made for tapping.</div>`;
    return;
  }
  shelf.innerHTML = state.docs
    .map(
      (d) => `
      <article class="card" data-kind="${d.type}" data-id="${d.id}">
        ${d.builtin ? "" : `<button class="card-x" data-del="${d.id}" aria-label="Remove">×</button>`}
        <div class="card-kind">${kindLabel(d.type)}</div>
        <h3>${escapeHtml(d.title)}</h3>
        <p>${escapeHtml(d.blurb || "Open to read, then tap any word.")}</p>
        <div class="card-foot">
          <span>${d.builtin ? "On this device" : formatBytes(d.size) || "Saved"}</span>
          <span>${d.lastOpened ? new Date(d.lastOpened).toLocaleDateString() : "New"}</span>
        </div>
      </article>`
    )
    .join("");
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function ensureSamples() {
  const existing = await db.allDocs();
  const have = new Map(existing.map((d) => [d.id, d]));
  for (const s of SAMPLES) {
    const prev = have.get(s.id);
    await db.putDoc({
      id: s.id,
      title: s.title,
      type: "sample",
      blurb: s.blurb,
      builtin: true,
      addedAt: prev?.addedAt || Date.now(),
      lastOpened: prev?.lastOpened || 0,
      text: s.body
    });
  }
}

async function openDoc(id) {
  const doc = await db.getDoc(id);
  if (!doc) return;
  doc.lastOpened = Date.now();
  await db.putDoc(doc);
  state.current = doc;
  showView("reader");
  $("#readerTitle").textContent = doc.title;
  $("#panelBody").innerHTML = emptyPanelHtml();
  closePanel(true);
  let blob = null;
  if (!doc.builtin && doc.type !== "sample" && !doc.text) {
    blob = await db.getFile(doc.id);
    if (!blob) {
      toast("Could not find that file.");
      return;
    }
  }
  await reader.load({
    type: doc.type === "sample" || doc.type === "md" || doc.type === "html" ? "txt" : doc.type,
    title: doc.title,
    text: doc.text || (blob && doc.type === "txt" ? await blob.text() : ""),
    blob
  });
}

async function ingestFiles(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  for (const file of files) {
    if (file.size > 80 * 1024 * 1024) {
      toast(`${file.name} is too large (80 MB max).`);
      continue;
    }
    const type = kindFromName(file.name);
    const id = uid();
    const rec = {
      id,
      title: titleFromName(file.name),
      type,
      blurb: file.name,
      size: file.size,
      addedAt: Date.now(),
      lastOpened: Date.now(),
      builtin: false
    };
    if (type === "txt" || type === "md" || type === "html") {
      rec.text = await file.text();
    } else {
      await db.putFile(id, file);
    }
    await db.putDoc(rec);
    if (files.length === 1) {
      await refreshLibrary();
      await openDoc(id);
      return;
    }
  }
  await refreshLibrary();
  toast(`Added ${files.length} item${files.length > 1 ? "s" : ""}`);
}

async function ingestPaste(title, text) {
  const id = uid();
  await db.putDoc({
    id,
    title: title.trim() || "Pasted text",
    type: "txt",
    blurb: "Pasted on this device",
    text,
    addedAt: Date.now(),
    lastOpened: Date.now(),
    builtin: false
  });
  await refreshLibrary();
  await openDoc(id);
}

function emptyPanelHtml() {
  return `
    <div class="panel-empty">
      <h2>Tap a word.</h2>
      <p>I’ll tell you what it means <em>here</em> — in this sentence — not in a vacuum. On a computer you can hover; on a phone, tap. Drag to select a phrase.</p>
    </div>`;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markSentence(sentence, word) {
  const safe = escapeHtml(sentence);
  if (!word) return safe;
  const re = new RegExp(`(${escapeRegExp(word)})`, "ig");
  return safe.replace(re, "<mark>$1</mark>");
}

function openPanel() {
  $("#panel").classList.add("open");
  $("#scrim").classList.add("show");
}

function closePanel(keepDesktop = false) {
  if (keepDesktop && window.matchMedia("(min-width: 961px)").matches) return;
  $("#panel").classList.remove("open");
  $("#scrim").classList.remove("show");
}

function renderPanel(data, loading) {
  const el = $("#panelBody");
  if (loading) {
    el.innerHTML = `<p class="plain"><span class="busy"></span> &nbsp; Looking at “${escapeHtml(loading)}” in this passage…</p>`;
    openPanel();
    return;
  }
  if (!data) {
    el.innerHTML = emptyPanelHtml();
    return;
  }

  const coach = data.coach;
  const mainPlain =
    (coach && coach.Context.trim()) ||
    (coach && coach.Meaning.trim()) ||
    data.contextual?.definition ||
    data.wiki?.extract ||
    "I could not find a dictionary entry for this. Try a slightly shorter phrase, or add a free Gemini key in Settings — the same engine as Context Word.";

  const pos = data.contextual?.pos || "";
  const senses = (data.meanings || []).slice(0, 6);

  const coachHtml = coach
    ? `
      ${coach.Meaning.trim() ? `<div class="block"><h3>Meaning</h3><p class="plain">${escapeHtml(coach.Meaning.trim())}</p></div>` : ""}
      ${coach.Context.trim() ? `<div class="block"><h3>Context</h3><p class="plain">${escapeHtml(coach.Context.trim())}</p></div>` : ""}
      ${
        coach.Arabic.trim()
          ? `<div class="block"><h3>العربي ببساطة</h3><p class="translation" dir="rtl">${escapeHtml(coach.Arabic.trim())}</p></div>`
          : ""
      }
      ${
        data.sentence
          ? `<div class="block"><h3>As used here</h3><p class="sentence">${markSentence(data.sentence, data.query)}</p></div>`
          : ""
      }
      ${coach["When To Use It"].trim() ? `<div class="block"><h3>When to use it</h3><p class="plain">${escapeHtml(coach["When To Use It"].trim())}</p></div>` : ""}
      ${coach["Don't Confuse"].trim() ? `<div class="block"><h3>Don't confuse</h3><p class="plain">${escapeHtml(coach["Don't Confuse"].trim())}</p></div>` : ""}
      ${coach.Examples.trim() ? `<div class="block"><h3>Examples</h3><p class="sentence">${escapeHtml(coach.Examples.trim())}</p></div>` : ""}
      ${coach["The Idea"].trim() ? `<div class="block"><h3>The idea</h3><p class="plain">${escapeHtml(coach["The Idea"].trim())}</p></div>` : ""}
    `
    : `
      <div class="block">
        <h3>In this context</h3>
        <p class="plain">${escapeHtml(mainPlain)}</p>
      </div>
      ${
        data.sentence
          ? `<div class="block"><h3>As used here</h3><p class="sentence">${markSentence(data.sentence, data.query)}</p></div>`
          : ""
      }
      ${
        data.translation
          ? `<div class="block"><h3>العربي ببساطة</h3><p class="translation" dir="rtl">${escapeHtml(data.translation)}</p></div>`
          : ""
      }
      ${
        data.phrases?.length
          ? `<div class="block"><h3>This might be a phrase</h3>${data.phrases
              .map(
                (p) =>
                  `<button class="phrase-chip" data-phrase="${escapeHtml(p.phrase)}"><b>${escapeHtml(p.phrase)}</b><span>${escapeHtml(p.definition)}</span></button>`
              )
              .join("")}</div>`
          : ""
      }
      ${
        data.contextual?.example
          ? `<div class="block"><h3>Example</h3><p class="sentence">${escapeHtml(data.contextual.example)}</p></div>`
          : ""
      }
      ${
        !state.settings.geminiKey
          ? `<p class="hint">For the same explanations as Context Word, paste a free Gemini key in Settings.</p>`
          : ""
      }
    `;

  el.innerHTML = `
    <h2 class="headword">${escapeHtml(data.headword || data.query)}</h2>
    <div class="meta-row">
      ${data.phonetic ? `<span class="phonetic">${escapeHtml(data.phonetic)}</span>` : ""}
      ${pos ? `<span class="pos">${escapeHtml(pos)}</span>` : ""}
      <button class="ghost-btn" id="speakWord" type="button">Listen</button>
    </div>
    ${coachHtml}
    <div class="panel-actions">
      <button class="primary-btn" id="saveWord" type="button">Save to notebook</button>
      ${data.audio ? `<button class="ghost-btn" id="playAudio" type="button">Pronunciation</button>` : ""}
      ${data.wiki?.url ? `<a class="ghost-btn" href="${data.wiki.url}" target="_blank" rel="noopener">Wikipedia</a>` : ""}
    </div>
    ${
      !coach && senses.length > 1
        ? `<p class="other-label">Other senses, ranked against this passage</p>
           <ul class="senses">${senses
             .slice(1)
             .map(
               (s) =>
                 `<li><span class="pos">${escapeHtml(s.pos)}</span> ${escapeHtml(s.definition)}</li>`
             )
             .join("")}</ul>`
        : ""
    }
    ${data.aiError ? `<p class="hint">${escapeHtml(data.aiError)}</p>` : ""}
  `;

  $("#speakWord")?.addEventListener("click", () => speak(data.headword || data.query));
  $("#playAudio")?.addEventListener("click", () => {
    try {
      new Audio(data.audio).play();
    } catch {
      speak(data.headword || data.query);
    }
  });
  $("#saveWord")?.addEventListener("click", () => saveWord(data, mainPlain));
  $$("[data-phrase]", el).forEach((btn) => {
    btn.addEventListener("click", () => {
      gloss({ word: btn.dataset.phrase, sentence: data.sentence, passage: data.sentence });
    });
  });
  openPanel();
}

async function gloss(info) {
  const token = ++state.lookupToken;
  renderPanel(null, info.word);
  try {
    const data = await lookup({
      query: info.word,
      sentence: info.sentence,
      passage: info.passage,
      settings: state.settings
    });
    if (token !== state.lookupToken) return;
    state.lastGloss = { ...data, docId: state.current?.id, docTitle: state.current?.title };
    renderPanel(data);
  } catch (err) {
    if (token !== state.lookupToken) return;
    renderPanel({
      query: info.word,
      headword: info.word,
      sentence: info.sentence,
      meanings: [],
      phrases: [],
      contextual: { definition: err.message || "Lookup failed." }
    });
  }
}

async function saveWord(data, meaning) {
  await db.putWord({
    id: uid(),
    word: data.headword || data.query,
    meaning,
    context: data.sentence || "",
    docId: state.current?.id || "",
    docTitle: state.current?.title || "",
    savedAt: Date.now()
  });
  toast("Saved to your notebook");
  state.words = await db.allWords();
}

async function renderVocab() {
  state.words = await db.allWords();
  const list = $("#vocabList");
  $("#vocabCount").textContent = `${state.words.length} word${state.words.length === 1 ? "" : "s"}`;
  if (!state.words.length) {
    list.innerHTML = `<div class="empty-shelf">Words you save while reading will wait here, with the sentence they came from.</div>`;
    return;
  }
  list.innerHTML = state.words
    .map(
      (w) => `
      <article class="vocab-item">
        <div>
          <h3>${escapeHtml(w.word)}</h3>
          <p>${escapeHtml(w.meaning)}</p>
          ${w.context ? `<p class="sentence" style="margin-top:.5rem">${escapeHtml(w.context)}</p>` : ""}
          <p style="margin-top:.4rem;font-size:.8rem">${escapeHtml(w.docTitle || "")}</p>
        </div>
        <button class="icon-btn" data-del-word="${w.id}" aria-label="Delete">×</button>
      </article>`
    )
    .join("");
}

function fillSettings() {
  $("#setTheme").value = state.settings.theme;
  $("#setSize").value = state.settings.fontSize;
  $("#setFont").value = state.settings.font;
  $("#setHover").checked = !!state.settings.hover;
  $("#setLang").value = state.settings.lang;
  $("#setGemini").value = state.settings.geminiKey || "";
}

async function saveSettings() {
  state.settings = {
    ...state.settings,
    theme: $("#setTheme").value,
    fontSize: Number($("#setSize").value),
    font: $("#setFont").value,
    hover: $("#setHover").checked,
    lang: $("#setLang").value,
    geminiKey: $("#setGemini").value.trim()
  };
  await db.setKV("settings", state.settings);
  applyTheme();
  toast("Settings saved");
}

function showModal(id, on) {
  $(id).classList.toggle("hidden", !on);
}

function setupDrop(zone) {
  ["dragenter", "dragover"].forEach((ev) => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add("over");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === "drop") ingestFiles(e.dataTransfer.files);
      zone.classList.remove("over");
    });
  });
}

function setupSheetDrag() {
  const panel = $("#panel");
  const handle = $("#panelHandle");
  let startY = 0;
  handle.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
  }, { passive: true });
  handle.addEventListener("touchmove", (e) => {
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  handle.addEventListener("touchend", (e) => {
    const dy = e.changedTouches[0].clientY - startY;
    panel.style.transform = "";
    if (dy > 90) closePanel();
  });
}

function maybeIosTip() {
  const ua = navigator.userAgent || "";
  const ios = /iphone|ipad|ipod/i.test(ua);
  const stand = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (ios && !stand && !sessionStorage.getItem("gloss-ios-tip")) {
    $("#iosTip").classList.remove("hidden");
  }
}

async function boot() {
  const saved = await db.getKV("settings", null);
  if (saved) state.settings = { ...DEFAULTS, ...saved };
  applyTheme();
  await ensureSamples();
  await refreshLibrary();

  reader = new Reader({
    stage: $("#stage"),
    getSettings: () => state.settings,
    onGloss: (info) => gloss(info)
  });

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  $("#openFile").addEventListener("click", () => $("#fileInput").click());
  $("#fileInput").addEventListener("change", (e) => ingestFiles(e.target.files));
  setupDrop($("#drop"));
  setupDrop($("#view-library"));

  $("#btnPaste").addEventListener("click", () => {
    $("#pasteTitle").value = "";
    $("#pasteText").value = "";
    showModal("#pasteModal", true);
    $("#pasteText").focus();
  });
  $("#pasteCancel").addEventListener("click", () => showModal("#pasteModal", false));
  $("#pasteSave").addEventListener("click", async () => {
    const text = $("#pasteText").value.trim();
    if (!text) return toast("Paste some text first.");
    showModal("#pasteModal", false);
    await ingestPaste($("#pasteTitle").value, text);
  });

  $("#btnVocab").addEventListener("click", async () => {
    await renderVocab();
    showView("vocab");
  });
  $("#btnVocab2").addEventListener("click", async () => {
    await renderVocab();
    showView("vocab");
  });
  $("#vocabBack").addEventListener("click", () => showView("library"));
  $("#vocabList").addEventListener("click", async (e) => {
    const id = e.target.dataset.delWord;
    if (!id) return;
    await db.deleteWord(id);
    await renderVocab();
  });
  $("#vocabExport").addEventListener("click", () => {
    const rows = [["word", "meaning", "sentence", "source"]].concat(
      state.words.map((w) => [w.word, w.meaning, w.context, w.docTitle])
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c || "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "gloss-notebook.csv";
    a.click();
  });

  $("#shelf").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-del]");
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      await db.deleteDoc(del.dataset.del);
      await refreshLibrary();
      return;
    }
    const card = e.target.closest(".card");
    if (card) openDoc(card.dataset.id);
  });

  $("#backLib").addEventListener("click", () => {
    reader.destroy();
    showView("library");
    refreshLibrary();
  });
  $("#brand").addEventListener("click", () => {
    reader.destroy();
    showView("library");
  });

  $("#btnSettings").addEventListener("click", () => {
    fillSettings();
    showModal("#settingsModal", true);
  });
  $("#btnSettings2").addEventListener("click", () => {
    fillSettings();
    showModal("#settingsModal", true);
  });
  $("#setCancel").addEventListener("click", () => showModal("#settingsModal", false));
  $("#setSave").addEventListener("click", async () => {
    await saveSettings();
    showModal("#settingsModal", false);
  });
  $("#pasteModal").addEventListener("click", (e) => {
    if (e.target.id === "pasteModal") showModal("#pasteModal", false);
  });
  $("#settingsModal").addEventListener("click", (e) => {
    if (e.target.id === "settingsModal") showModal("#settingsModal", false);
  });

  $("#panelClose").addEventListener("click", () => closePanel());
  $("#scrim").addEventListener("click", () => closePanel());
  setupSheetDrag();

  $("#iosDismiss").addEventListener("click", () => {
    $("#iosTip").classList.add("hidden");
    sessionStorage.setItem("gloss-ios-tip", "1");
  });
  maybeIosTip();

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      showModal("#settingsModal", false);
      showModal("#pasteModal", false);
      closePanel();
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
}

boot().catch((err) => {
  console.error(err);
  toast("Something went wrong starting Gloss.");
});
