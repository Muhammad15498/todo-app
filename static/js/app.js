import { db, uid } from "./db.js";
import { SAMPLES } from "./samples.js";
import { lookup, speak, testGemini } from "./lookup.js";
import { Reader, kindFromName, titleFromName, removeExplainButton } from "./reader.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const DEFAULTS = {
  theme: "paper",
  fontSize: 20,
  font: "newsreader",
  hover: false,
  lang: "ar",
  geminiKey: "",
  groqKey: "",
  model: "gemini-3.5-flash-lite"
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

function clampFont(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 16) return 20;
  return Math.min(28, Math.round(x));
}

function applyTheme() {
  state.settings.fontSize = clampFont(state.settings.fontSize);
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
  document.body.classList.toggle("cw-reading", name === "reader");
  if (name !== "reader") closePanel();
  removeExplainButton();
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
  try {
    await db.deleteDoc("sample-how");
  } catch {
    /* ignore */
  }
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
  let doc = id ? await db.getDoc(id) : null;
  if (!doc) {
    const sample = SAMPLES.find((s) => s.id === id);
    if (!sample) {
      toast("Could not open that yet. Try the sample again.");
      return;
    }
    doc = {
      id: sample.id,
      title: sample.title,
      type: "sample",
      blurb: sample.blurb,
      builtin: true,
      text: sample.body
    };
  }
  if (doc.type === "sample" || doc.builtin) {
    const sample = SAMPLES.find((s) => s.id === doc.id);
    if (sample && sample.body) doc.text = sample.body;
  }
  if (doc.id) {
    doc.lastOpened = Date.now();
    db.putDoc(doc).catch(() => {});
  }
  state.current = doc;
  showView("reader");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  $("#readerTitle").textContent = doc.title;
  $("#panelBody").innerHTML = emptyPanelHtml();
  $(".reader")?.classList.remove("panel-collapsed");
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
      <h2>Highlight 1–4 words.</h2>
      <p>Let go once. You get the whole sentence in simple English, then what the word is doing in that line.</p>
    </div>`;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function exampleLines(text) {
  return String(text || "")
    .replace(/^such as\s*/i, "")
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((line) => line.replace(/^[-•]\s*/, "").replace(/^such as\s*/i, "").trim())
    .filter((line) => line.length > 8)
    .slice(0, 3);
}

function exampleBlocks(text) {
  const lines = exampleLines(text);
  if (!lines.length) return "";
  return `<div class="block"><h3>Other real examples</h3>${lines
    .map((line) => `<p class="sentence">${escapeHtml(line)}</p>`)
    .join("")}</div>`;
}

function markSentence(sentence, word) {
  const safe = escapeHtml(sentence);
  if (!word) return safe;
  const re = new RegExp(`(${escapeRegExp(word)})`, "ig");
  return safe.replace(re, "<mark>$1</mark>");
}

function openPanel() {
  $("#panel").classList.add("open");
  $(".reader")?.classList.remove("panel-collapsed");
  $("#scrim").classList.add("show");
}

function closePanel() {
  $("#panel").classList.remove("open");
  $(".reader")?.classList.add("panel-collapsed");
  $("#scrim").classList.remove("show");
}

function renderPanel(data, loading) {
  const el = $("#panelBody");
  if (loading) {
    el.innerHTML = `<p class="plain"><span class="busy"></span> &nbsp; Understanding “${escapeHtml(loading)}” from the context…</p>`;
    openPanel();
    return;
  }
  if (!data) {
    el.innerHTML = emptyPanelHtml();
    return;
  }

  const coach = data.coach;
  const thisSentence = (coach && (coach["This Sentence"] || coach.Context || "").trim()) || "";
  const hereMeans = (coach && (coach["Here it means"] || coach.Meaning || "").trim()) || "";
  const mainPlain =
    thisSentence ||
    hereMeans ||
    data.contextual?.definition ||
    data.wiki?.extract ||
    "I could not find a dictionary entry for this. Try a slightly shorter phrase, or add a free Gemini key in Settings — the same engine as Context Word.";

  const pos = data.contextual?.pos || "";
  const senses = (data.meanings || []).slice(0, 6);

  const coachHtml = coach
    ? `
      ${
        data.sentence
          ? `<div class="block"><h3>The line you are reading</h3><p class="sentence">${markSentence(data.sentence, data.query)}</p></div>`
          : ""
      }
      ${thisSentence ? `<div class="block"><h3>This sentence, simply</h3><p class="plain">${escapeHtml(thisSentence)}</p></div>` : ""}
      ${hereMeans ? `<div class="block"><h3>Here it means</h3><p class="plain">${escapeHtml(hereMeans)}</p></div>` : ""}
      ${
        coach.Arabic.trim()
          ? `<div class="block"><h3>العربي ببساطة</h3><p class="translation" dir="rtl">${escapeHtml(coach.Arabic.trim())}</p></div>`
          : ""
      }
      ${coach["Picture It"]?.trim() ? `<div class="block"><h3>See it in your head</h3><p class="plain">${escapeHtml(coach["Picture It"].trim())}</p></div>` : ""}
      ${exampleBlocks(coach["For Instance"])}
      ${coach["Don't Confuse"]?.trim() ? `<div class="block"><h3>Don't confuse</h3><p class="plain">${escapeHtml(coach["Don't Confuse"].trim())}</p></div>` : ""}
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

  const sounds = (coach && coach["Sounds Like"] && coach["Sounds Like"].trim()) || data.phonetic || "";
  el.innerHTML = `
    <div class="headword-row">
      <h2 class="headword">${escapeHtml(data.headword || data.query)}</h2>
      <button class="icon-btn speak-btn" id="speakWord" type="button" aria-label="Pronounce">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>
      </button>
    </div>
    <div class="meta-row">
      ${sounds ? `<span class="phonetic">${escapeHtml(sounds)}</span>` : ""}
      ${pos ? `<span class="pos">${escapeHtml(pos)}</span>` : ""}
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
      settings: {
        ...state.settings,
        geminiKey: state.settings.geminiKey || localStorage.getItem("cw-gemini") || "",
        groqKey: state.settings.groqKey || localStorage.getItem("cw-groq") || ""
      }
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
      <article class="vocab-item" data-open-word="${w.id}" tabindex="0">
        <div>
          <h3>${escapeHtml(w.word)}</h3>
          ${w.meaning ? `<p>${escapeHtml(w.meaning)}</p>` : ""}
          ${w.context ? `<p class="sentence" style="margin-top:.5rem">${escapeHtml(w.context)}</p>` : ""}
          <p style="margin-top:.4rem;font-size:.8rem">${escapeHtml(w.docTitle || "")}</p>
        </div>
        <button class="icon-btn" data-del-word="${w.id}" aria-label="Delete">×</button>
      </article>`
    )
    .join("");
}

function fillNoteField(id, text, blockId) {
  const el = $(id);
  if (!el) return;
  el.textContent = text || "";
  const block = blockId ? $(blockId) : el;
  if (block) block.classList.toggle("hidden", !String(text || "").trim());
}

function openSavedWord(w) {
  if (!w) return;
  fillNoteField("#noteWord", w.word);
  fillNoteField("#notePhonetic", w.phonetic);
  fillNoteField("#noteMeaning", w.meaning, "#noteMeaningBlock");
  fillNoteField("#noteContext", w.context, "#noteContextBlock");
  fillNoteField("#noteSimple", w.simple, "#noteSimpleBlock");
  fillNoteField("#noteArabic", w.arabic, "#noteArabicBlock");
  const examples = $("#noteExamples");
  const exBlock = $("#noteExamplesBlock");
  if (examples) {
    const lines = exampleLines(w.examples);
    examples.innerHTML = lines.map((line) => `<p class="sentence">${escapeHtml(line)}</p>`).join("");
    if (exBlock) exBlock.classList.toggle("hidden", !lines.length);
  }
  fillNoteField("#noteSource", w.docTitle ? `From ${w.docTitle}` : "");
  const openBtn = $("#noteOpen");
  if (openBtn) {
    openBtn.dataset.docId = w.docId || "";
    openBtn.classList.toggle("hidden", !w.docId);
  }
  state.noteWord = w;
  showModal("#noteModal", true);
}

function fillSettings() {
  $("#setTheme").value = state.settings.theme;
  $("#setSize").value = state.settings.fontSize;
  $("#setFont").value = state.settings.font;
  $("#setLang").value = state.settings.lang;
  $("#setGemini").value = state.settings.geminiKey || "";
  if ($("#setGroq")) $("#setGroq").value = state.settings.groqKey || localStorage.getItem("cw-groq") || "";
}

async function saveSettings() {
  state.settings = {
    ...state.settings,
    theme: $("#setTheme").value,
    fontSize: clampFont($("#setSize") && $("#setSize").value),
    font: $("#setFont").value,
    lang: $("#setLang").value,
    geminiKey: $("#setGemini").value.trim(),
    groqKey: ($("#setGroq") && $("#setGroq").value.trim()) || ""
  };
  persistLocalSettings();
  db.setKV("settings", state.settings).catch(() => {});
  applyTheme();
  toast("Settings saved");
  syncGeminiBanner();
}

function showModal(id, on) {
  $(id).classList.toggle("hidden", !on);
}

function setupDrop(zone) {
  if (!zone) return;
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
  if (!panel || !handle) return;
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

function syncGeminiBanner() {
  const has = !!(state.settings.geminiKey && state.settings.geminiKey.trim());
  $("#geminiBanner")?.classList.toggle("hidden", has);
}

function maybeInstallTip() {
  const ua = navigator.userAgent || "";
  const android = /android/i.test(ua);
  const ios = /iphone|ipad|ipod/i.test(ua);
  const stand = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (stand || sessionStorage.getItem("cw-install-tip")) return;
  if (android || ios) {
    if (ios) {
      $("#installTipText").innerHTML = "On iPhone: tap Share, then <b>Add to Home Screen</b>.";
    }
    $("#installTip").classList.remove("hidden");
  }
}

function loadLocalSettings() {
  try {
    const raw = localStorage.getItem("cw-settings");
    if (raw) Object.assign(state.settings, JSON.parse(raw));
    const key = localStorage.getItem("cw-gemini");
    if (key) state.settings.geminiKey = key;
    const groq = localStorage.getItem("cw-groq");
    if (groq) state.settings.groqKey = groq;
  } catch {
    /* ignore */
  }
  state.settings.model = DEFAULTS.model;
  state.settings.fontSize = clampFont(state.settings.fontSize);
  persistLocalSettings();
}

function persistLocalSettings() {
  try {
    localStorage.setItem("cw-settings", JSON.stringify(state.settings));
    if (state.settings.geminiKey) localStorage.setItem("cw-gemini", state.settings.geminiKey);
    if (state.settings.groqKey) localStorage.setItem("cw-groq", state.settings.groqKey);
  } catch {
    /* ignore */
  }
}

async function boot() {
  loadLocalSettings();
  applyTheme();
  syncGeminiBanner();

  reader = new Reader({
    stage: $("#stage"),
    getSettings: () => state.settings,
    onGloss: (info) => gloss(info)
  });

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  window.cwIngestFiles = ingestFiles;
  window.cwIngestPaste = ingestPaste;
  window.cwRenderVocab = renderVocab;
  window.cwSaveSettings = saveSettings;
  window.cwFillSettings = fillSettings;
  window.cwOpenDoc = openDoc;
  window.cwGloss = (info) => gloss(info);
  window.cwTogglePdfMode = () => reader?.togglePdfMode?.();
  window.cwClosePanel = () => closePanel();
  window.cwPage = (delta) => reader?.turnPage?.(delta);
  if (!window.CW) {
    $("#openFile")?.addEventListener("click", () => $("#fileInput").click());
  }
  if (!$("#fileInput")?.dataset.cwBound) {
    $("#fileInput")?.addEventListener("change", (e) => ingestFiles(e.target.files));
  }
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
    const del = e.target.closest("[data-del-word]");
    if (del) {
      e.preventDefault();
      e.stopPropagation();
      await db.deleteWord(del.dataset.delWord);
      await renderVocab();
      return;
    }
    const item = e.target.closest("[data-open-word]");
    if (!item) return;
    const w = state.words.find((row) => row.id === item.dataset.openWord);
    openSavedWord(w);
  });
  $("#noteClose")?.addEventListener("click", () => showModal("#noteModal", false));
  $("#noteSpeak")?.addEventListener("click", () => {
    if (state.noteWord) speak(state.noteWord.word);
  });
  $("#noteOpen")?.addEventListener("click", () => {
    const id = $("#noteOpen")?.dataset.docId;
    showModal("#noteModal", false);
    if (id) openDoc(id);
  });
  $("#readMode")?.addEventListener("click", () => reader?.togglePdfMode?.());
  $("#vocabExport").addEventListener("click", () => {
    const rows = [["word", "meaning", "sentence", "simply", "arabic", "examples", "source"]].concat(
      state.words.map((w) => [w.word, w.meaning, w.context, w.simple, w.arabic, w.examples, w.docTitle])
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

  $("#panelClose").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    closePanel();
  });
  $("#scrim").addEventListener("click", () => closePanel());
  $("#pagerPrev")?.addEventListener("click", () => reader?.turnPage?.(-1));
  $("#pagerNext")?.addEventListener("click", () => reader?.turnPage?.(1));
  document.addEventListener("keydown", (e) => {
    if (state.view !== "reader") return;
    if (e.target.closest?.("input, textarea, select, button")) return;
    if (e.key === "ArrowRight") reader?.turnPage?.(1);
    if (e.key === "ArrowLeft") reader?.turnPage?.(-1);
    if (e.key === "Escape") closePanel();
  });
  setupSheetDrag();

  $("#installDismiss")?.addEventListener("click", () => {
    $("#installTip").classList.add("hidden");
    sessionStorage.setItem("cw-install-tip", "1");
  });
  maybeInstallTip();

  $("#bannerSave")?.addEventListener("click", () => {
    const key = ($("#bannerKey").value || "").trim() || localStorage.getItem("cw-gemini") || "";
    if (!key) return;
    state.settings.geminiKey = key;
    persistLocalSettings();
    syncGeminiBanner();
  });

  async function runGeminiTest(key) {
    const k = (key || state.settings.geminiKey || "").trim();
    if (!k) return toast("Paste the Gemini key first.");
    toast("Testing Gemini…");
    try {
      const reply = await testGemini(k);
      toast("Gemini works: " + reply.slice(0, 40));
    } catch (err) {
      toast("Gemini failed: " + (err.message || "unknown"));
    }
  }
  $("#bannerTest")?.addEventListener("click", () =>
    runGeminiTest($("#bannerKey").value.trim() || state.settings.geminiKey)
  );
  $("#setTest")?.addEventListener("click", () =>
    runGeminiTest($("#setGemini").value.trim() || state.settings.geminiKey)
  );

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      showModal("#settingsModal", false);
      showModal("#pasteModal", false);
      closePanel();
    }
  });

  $("#zoomIn")?.addEventListener("click", () => reader.setZoom((reader.zoom || 1) + 0.2));
  $("#zoomOut")?.addEventListener("click", () => reader.setZoom((reader.zoom || 1) - 0.2));
  $("#zoomFit")?.addEventListener("click", () => reader.setZoom(1));
  $("#stage")?.addEventListener("scroll", () => removeExplainButton());

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }

  ensureSamples().then(() => refreshLibrary()).catch(() => {
    const shelf = $("#shelf");
    if (shelf && !shelf.innerHTML.trim()) {
      shelf.innerHTML = `<div class="empty-shelf">Open a PDF to start. Samples need a second to load.</div>`;
    }
  });
}

boot().catch((err) => {
  console.error(err);
  toast("Something went wrong starting Context Word.");
});
