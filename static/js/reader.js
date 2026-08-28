function caretRange(x, y, doc = document) {
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const r = doc.createRange();
    r.setStart(pos.offsetNode, pos.offset);
    r.collapse(true);
    return r;
  }
  return null;
}

const WORD_RE = /[\p{L}\p{N}'’\u2011-]/u;

export function wordAtPoint(x, y, doc = document) {
  const range = caretRange(x, y, doc);
  if (!range || !range.startContainer || range.startContainer.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const node = range.startContainer;
  const text = node.textContent || "";
  let i = Math.min(range.startOffset, Math.max(0, text.length - 1));
  if (!WORD_RE.test(text[i] || "")) {
    if (i > 0 && WORD_RE.test(text[i - 1])) i -= 1;
    else return null;
  }
  let a = i;
  let b = i + 1;
  while (a > 0 && WORD_RE.test(text[a - 1])) a -= 1;
  while (b < text.length && WORD_RE.test(text[b])) b += 1;
  const word = text.slice(a, b).replace(/^[’']|[’']$/g, "");
  if (!word || word.length > 48) return null;

  const wr = doc.createRange();
  wr.setStart(node, a);
  wr.setEnd(node, b);

  const block =
    (node.parentElement &&
      node.parentElement.closest("p, li, td, th, blockquote, h1, h2, h3, h4, article, section, .textLayer, div")) ||
    node.parentElement;
  const blockText = (block?.innerText || text).replace(/\s+/g, " ").trim();
  const sentence = extractSentence(blockText, word);
  const passage = blockText.slice(0, 1800);
  return { word, sentence, passage, range: wr };
}

export function extractSentence(text, word) {
  if (!text) return "";
  const parts = text.split(/(?<=[.!?])\s+/);
  const lower = word.toLowerCase();
  const hit = parts.find((p) => p.toLowerCase().includes(lower));
  return (hit || parts[0] || text).trim();
}

export function selectionInfo(sel) {
  if (!sel || sel.isCollapsed) return null;
  const raw = sel.toString().replace(/\s+/g, " ").trim();
  if (!raw || raw.length > 80) return null;
  const words = raw.split(" ").filter(Boolean);
  if (words.length > 4) return null;
  let passage = raw;
  try {
    const node = sel.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const block = el?.closest?.("p, li, td, article, section, .textLayer, div") || el;
    passage = (block?.innerText || raw).replace(/\s+/g, " ").trim().slice(0, 1800);
  } catch {
    /* ignore */
  }
  return {
    word: raw,
    sentence: extractSentence(passage, words[0]),
    passage,
    range: sel.rangeCount ? sel.getRangeAt(0) : null
  };
}

let explainBtn = null;

export function removeExplainButton() {
  if (explainBtn) {
    explainBtn.remove();
    explainBtn = null;
  }
}

function showExplainButton(info, onGloss) {
  removeExplainButton();
  const range = info.range;
  const rect = range && range.getBoundingClientRect ? range.getBoundingClientRect() : null;
  if (!rect || (!rect.width && !rect.height)) return;

  explainBtn = document.createElement("button");
  explainBtn.type = "button";
  explainBtn.className = "cw-explain";
  explainBtn.textContent = "Explain";
  explainBtn.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    removeExplainButton();
    onGloss(info);
  });
  document.body.appendChild(explainBtn);

  const left = Math.min(Math.max(8, rect.left), window.innerWidth - 100);
  let top = rect.bottom + 8;
  if (top + 40 > window.innerHeight) top = Math.max(8, rect.top - 44);
  explainBtn.style.left = `${left}px`;
  explainBtn.style.top = `${top}px`;
}

export function bindGlossEvents(root, { onGloss, getDoc }) {
  if (!getDoc && typeof window !== "undefined" && window.CW) {
    return () => {};
  }
  const doc = root.ownerDocument || document;
  const win = doc.defaultView || window;
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  let last = "";
  let lastAt = 0;

  const fire = (info) => {
    if (!info || !info.word) return;
    const now = Date.now();
    if (info.word === last && now - lastAt < 700) return;
    last = info.word;
    lastAt = now;
    removeExplainButton();
    onGloss(info);
  };

  const onUp = (e) => {
    if (e.target.closest?.("button, a, input, textarea, .cw-explain")) return;
    const sel = getDoc ? getDoc().getSelection() : win.getSelection();
    const selected = selectionInfo(sel);
    if (selected) fire(selected);
  };

  const onClick = (e) => {
    if (e.target.closest?.("a, button, input, textarea, .cw-explain")) return;
    const sel = getDoc ? getDoc().getSelection() : win.getSelection();
    if (selectionInfo(sel)) return;
    if (!coarse) return;
    fire(wordAtPoint(e.clientX, e.clientY, doc));
  };

  root.addEventListener("mouseup", onUp);
  root.addEventListener("touchend", onUp);
  root.addEventListener("click", onClick);

  return () => {
    removeExplainButton();
    root.removeEventListener("mouseup", onUp);
    root.removeEventListener("touchend", onUp);
    root.removeEventListener("click", onClick);
  };
}

function paintPdfText(textContent, layer, viewport, pdfjsLib) {
  const Util = pdfjsLib.Util;
  layer.replaceChildren();
  for (const item of textContent.items || []) {
    if (!item.str) continue;
    const tx = Util
      ? Util.transform(viewport.transform, item.transform)
      : item.transform;
    const fontHeight = Math.hypot(tx[2], tx[3]) || 12;
    const span = document.createElement("span");
    span.textContent = item.str;
    span.style.left = `${tx[4]}px`;
    span.style.top = `${tx[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = "sans-serif";
    span.style.transformOrigin = "0% 0%";
    const angle = Math.atan2(tx[1], tx[0]);
    layer.appendChild(span);
    const intended = (item.width || 0) * viewport.scale;
    let transform = angle ? `rotate(${angle}rad)` : "";
    if (intended && span.offsetWidth) {
      transform += `${transform ? " " : ""}scaleX(${intended / span.offsetWidth})`;
    }
    if (transform) span.style.transform = transform;
  }
}

async function fillPdfTextLayer(pdfjsLib, textContent, layer, viewport) {
  layer.replaceChildren();
  layer.style.setProperty("--scale-factor", String(viewport.scale));
  try {
    if (typeof pdfjsLib.renderTextLayer === "function") {
      const task = pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        textContent,
        container: layer,
        viewport,
        textDivs: []
      });
      if (task && task.promise) await task.promise;
      else if (task && typeof task.then === "function") await task;
    }
  } catch (err) {
    console.warn("pdf.js text layer", err);
  }
  if (!layer.childElementCount) {
    paintPdfText(textContent, layer, viewport, pdfjsLib);
  }
}

function escapeHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function textToProse(text) {
  const paras = (text || "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  return paras
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function extractPdfPages(pdf) {
  const max = Math.min(pdf.numPages || 0, 250);
  const pages = [];
  for (let i = 1; i <= max; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent().catch(() => ({ items: [] }));
    let buf = "";
    for (const it of content.items || []) {
      buf += it.str || "";
      if (it.hasEOL) buf += "\n";
      else if (buf && !/\s$/.test(buf)) buf += " ";
    }
    const cleaned = buf.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    pages.push(cleaned);
  }
  return pages;
}

function setPager(index, total) {
  const wrap = document.getElementById("pager");
  const label = document.getElementById("pagerLabel");
  const prev = document.getElementById("pagerPrev");
  const next = document.getElementById("pagerNext");
  if (!wrap) return;
  if (!total || total < 2) {
    wrap.classList.add("hidden");
    return;
  }
  wrap.classList.remove("hidden");
  if (label) label.textContent = `${index + 1} / ${total}`;
  if (prev) prev.disabled = index <= 0;
  if (next) next.disabled = index >= total - 1;
}

function setReadModeBtn(mode, hasToggle) {
  const btn = document.getElementById("readMode");
  const zoom = document.getElementById("zoomGroup");
  if (btn) {
    if (!hasToggle) btn.classList.add("hidden");
    else {
      btn.classList.remove("hidden");
      btn.textContent = mode === "text" ? "Printed pages" : "Book pages";
    }
  }
  if (zoom) zoom.classList.toggle("hidden", mode === "text");
  if (mode !== "text") setPager(0, 0);
}

export class Reader {
  constructor({ stage, onGloss, getSettings }) {
    this.stage = stage;
    this.onGloss = onGloss;
    this.getSettings = getSettings;
    this.cleanup = [];
    this.pdf = null;
    this.book = null;
    this.rendition = null;
    this.zoom = 1;
    this._slots = [];
    this._drawn = new Set();
    this._title = "";
    this._plain = "";
    this._pages = [];
    this._pageIndex = 0;
    this._pdfMode = "";
  }

  destroy() {
    removeExplainButton();
    this.cleanup.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    this.cleanup = [];
    if (this.rendition) {
      try {
        this.rendition.destroy();
      } catch {
        /* ignore */
      }
    }
    this.rendition = null;
    this.book = null;
    this.pdf = null;
    this._slots = [];
    this._drawn = new Set();
    this._plain = "";
    this._pages = [];
    this._pageIndex = 0;
    this._pdfMode = "";
    this.stage.innerHTML = "";
    setReadModeBtn("text", false);
    setPager(0, 0);
  }

  clearStage() {
    removeExplainButton();
    this.cleanup.forEach((fn) => {
      try {
        fn();
      } catch {
        /* ignore */
      }
    });
    this.cleanup = [];
    this._slots = [];
    this._drawn = new Set();
    this.stage.innerHTML = "";
  }

  pageCssWidth() {
    const box = this.stage.getBoundingClientRect();
    const raw = box.width || this.stage.clientWidth || 0;
    const w = raw > 120 ? raw : 820;
    return Math.max(420, Math.floor((w - 28) * this.zoom));
  }

  async load({ type, title, text, blob }) {
    this.destroy();
    this.zoom = 1;
    this._title = title || "";
    this.stage.dataset.kind = type;
    if (type === "pdf") return this.loadPdf(blob);
    if (type === "epub") return this.loadEpub(blob);
    if (type === "docx") return this.loadDocx(blob);
    setReadModeBtn("text", false);
    return this.loadText(text || "", title);
  }

  async togglePdfMode() {
    if (!this.pdf || !this._pages.length) return;
    if (this._pdfMode === "text") {
      this.clearStage();
      this._pdfMode = "pages";
      this.stage.dataset.kind = "pdf";
      setReadModeBtn("pages", true);
      setPager(0, 0);
      return this._renderPdfPages();
    }
    this.clearStage();
    this._pdfMode = "text";
    this.stage.dataset.kind = "txt";
    setReadModeBtn("text", true);
    return this.showBookPage(this._pageIndex || 0);
  }

  turnPage(delta) {
    if (this._pdfMode === "pages" && this.pdf) {
      const slots = this._slots || [];
      if (!slots.length) return;
      const stage = this.stage;
      let current = 0;
      const top = stage.getBoundingClientRect().top + 24;
      slots.forEach((slot, i) => {
        if (slot.getBoundingClientRect().top <= top) current = i;
      });
      const next = Math.min(slots.length - 1, Math.max(0, current + delta));
      slots[next]?.scrollIntoView({ block: "start" });
      return;
    }
    if (!this._pages || this._pages.length < 2) return;
    const i = Math.min(this._pages.length - 1, Math.max(0, (this._pageIndex || 0) + delta));
    if (i === this._pageIndex) return;
    this.showBookPage(i);
  }

  showBookPage(index) {
    const pages = this._pages || [];
    if (!pages.length) return;
    const i = Math.min(pages.length - 1, Math.max(0, index | 0));
    this._pageIndex = i;
    this.clearStage();
    this.stage.dataset.kind = "txt";
    const raw = pages[i] || "";
    const article = document.createElement("article");
    article.className = "prose";
    const kicker = this._title
      ? `<header class="prose-kicker">${escapeHtml(this._title)}</header>`
      : "";
    const folio = pages.length > 1 ? `<p class="hint">Page ${i + 1} of ${pages.length}</p>` : "";
    const body = raw.trim()
      ? textToProse(raw)
      : `<p class="plain">This page is a picture in the file. There is no text to highlight. Tap Printed pages to see it as a photo.</p>`;
    article.innerHTML = kicker + folio + body;
    this.stage.appendChild(article);
    this.stage.scrollTop = 0;
    this.cleanup.push(bindGlossEvents(article, { onGloss: this.onGloss }));
    setPager(i, pages.length);
  }

  loadText(text, title) {
    this._pages = [text || ""];
    this._pageIndex = 0;
    this._title = title || this._title || "";
    this.showBookPage(0);
  }

  async loadDocx(blob) {
    const buffer = await blob.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
    const article = document.createElement("article");
    article.className = "prose";
    article.innerHTML = result.value || "<p>(Empty document.)</p>";
    this.stage.appendChild(article);
    this.cleanup.push(bindGlossEvents(article, { onGloss: this.onGloss }));
  }

  async _drawPage(slot) {
    const n = Number(slot.dataset.page);
    const pdf = this.pdf;
    const pdfjsLib = window.pdfjsLib;
    if (!pdf || !pdfjsLib) return;
    const page = await pdf.getPage(n);
    const inner = slot.querySelector(".pdf-page-inner");
    const unscaled = page.getViewport({ scale: 1 });
    const cssWidth = this.pageCssWidth();
    const scale = cssWidth / unscaled.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    canvas.style.pointerEvents = "none";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const textLayer = document.createElement("div");
    textLayer.className = "textLayer";
    textLayer.style.width = `${Math.floor(viewport.width)}px`;
    textLayer.style.height = `${Math.floor(viewport.height)}px`;

    inner.innerHTML = "";
    inner.style.width = `${Math.floor(viewport.width)}px`;
    inner.style.height = `${Math.floor(viewport.height)}px`;
    inner.appendChild(canvas);
    inner.appendChild(textLayer);
    slot.style.minHeight = `${Math.floor(viewport.height)}px`;

    await page.render({ canvasContext: ctx, viewport }).promise;
    const textContent = await page.getTextContent().catch(() => ({ items: [] }));
    const items = (textContent.items || []).filter((it) => it.str && String(it.str).trim());
    if (!items.length) {
      const note = document.createElement("div");
      note.className = "pdf-scan-note";
      note.textContent =
        "This page is a picture — there is no text to highlight. Open a sample on the shelf, or a PDF saved as text (not a scan).";
      inner.appendChild(note);
      return;
    }
    await fillPdfTextLayer(pdfjsLib, textContent, textLayer, viewport);
    this.cleanup.push(bindGlossEvents(textLayer, { onGloss: this.onGloss }));
  }

  async loadPdf(blob) {
    const pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
      this.stage.innerHTML = `<p class="plain">PDF engine not loaded yet. Wait a second and try again.</p>`;
      return;
    }
    this.stage.innerHTML = `<p class="plain"><span class="busy"></span> &nbsp; Opening book…</p>`;
    const data = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    this.pdf = pdf;
    const pages = await extractPdfPages(pdf);
    this._pages = pages;
    this._plain = pages.filter(Boolean).join("\n\n");
    this._pageIndex = 0;
    if ((this._plain || "").replace(/\s/g, "").length > 80) {
      this._pdfMode = "text";
      this.stage.innerHTML = "";
      this.stage.dataset.kind = "txt";
      setReadModeBtn("text", true);
      return this.showBookPage(0);
    }
    setReadModeBtn("pages", false);
    setPager(0, 0);
    this.stage.innerHTML = "";
    this.stage.dataset.kind = "pdf";
    return this._renderPdfPages();
  }

  async _renderPdfPages() {
    const pdf = this.pdf;
    if (!pdf) return;
    const scroller = document.createElement("div");
    scroller.className = "pdf-scroller";
    this.stage.appendChild(scroller);

    this._slots = [];
    this._drawn = new Set();
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const slot = document.createElement("div");
      slot.className = "pdf-page-slot";
      slot.dataset.page = String(i);
      slot.innerHTML = `<div class="pdf-page-inner"><div class="pdf-skeleton">Page ${i}</div></div>`;
      scroller.appendChild(slot);
      this._slots.push(slot);
    }

    const draw = async (slot) => {
      const n = Number(slot.dataset.page);
      const key = `${n}@${this.zoom.toFixed(2)}@${this.pageCssWidth()}`;
      if (this._drawn.has(key)) return;
      this._drawn.add(key);
      await this._drawPage(slot);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) draw(e.target);
        }
      },
      { root: this.stage, rootMargin: "1400px 0px" }
    );
    this._slots.forEach((s) => io.observe(s));
    this.cleanup.push(() => io.disconnect());
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (this._slots[0]) await draw(this._slots[0]);
    this._redraw = () => {
      this._drawn.clear();
      const vis = this._slots.filter((s) => {
        const r = s.getBoundingClientRect();
        const b = this.stage.getBoundingClientRect();
        return r.bottom > b.top - 400 && r.top < b.bottom + 400;
      });
      (vis.length ? vis : this._slots.slice(0, 1)).forEach((s) => draw(s));
    };
    return { pages: pdf.numPages };
  }

  setZoom(z) {
    this.zoom = Math.min(2.4, Math.max(0.7, z));
    if (this._redraw) this._redraw();
  }

  async loadEpub(blob) {
    const book = window.ePub(blob);
    this.book = book;
    const frame = document.createElement("div");
    frame.className = "epub-frame";
    this.stage.appendChild(frame);
    const rendition = book.renderTo(frame, {
      width: "100%",
      height: "100%",
      flow: "scrolled-doc",
      spread: "none"
    });
    this.rendition = rendition;
    const settings = this.getSettings();
    rendition.themes.default({
      body: {
        background: "transparent",
        color: "inherit",
        "font-family": settings.font === "atkinson" ? "Atkinson Hyperlegible, sans-serif" : "Newsreader, Georgia, serif",
        "font-size": "1.05em",
        "line-height": "1.7",
        padding: "1rem 1.2rem !important"
      },
      p: { "margin-bottom": "1em" },
      a: { color: "inherit" }
    });
    await rendition.display();
    const attach = (_section, view) => {
      const idoc = view.document;
      if (!idoc) return;
      const style = idoc.createElement("style");
      style.textContent = `::selection{background:rgba(180,68,46,.28);} `;
      idoc.head.appendChild(style);
      this.cleanup.push(
        bindGlossEvents(idoc.body, {
          onGloss: this.onGloss,
          getDoc: () => idoc
        })
      );
    };
    rendition.on("rendered", attach);
    return { pages: 0 };
  }
}

export function kindFromName(name = "") {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (n.endsWith(".epub")) return "epub";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".md") || n.endsWith(".markdown")) return "md";
  if (n.endsWith(".html") || n.endsWith(".htm")) return "html";
  return "txt";
}

export function titleFromName(name = "") {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled";
}
