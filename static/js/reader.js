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
    const angle = Math.atan2(tx[1], tx[0]);
    if (angle) span.style.transform = `rotate(${angle}rad)`;
    layer.appendChild(span);
  }
}

async function fillPdfTextLayer(pdfjsLib, textContent, layer, viewport) {
  layer.replaceChildren();
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
    this.stage.dataset.kind = type;
    if (type === "pdf") return this.loadPdf(blob);
    if (type === "epub") return this.loadEpub(blob);
    if (type === "docx") return this.loadDocx(blob);
    return this.loadText(text || "", title);
  }

  loadText(text, title) {
    const article = document.createElement("article");
    article.className = "prose";
    article.innerHTML = `${title ? `<header class="prose-kicker">${escapeHtml(title)}</header>` : ""}${textToProse(text)}`;
    this.stage.appendChild(article);
    this.cleanup.push(bindGlossEvents(article, { onGloss: this.onGloss }));
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
    try {
      const textContent = await page.getTextContent();
      const task = pdfjsLib.renderTextLayer({
        textContent,
        container: textLayer,
        viewport,
        textDivs: []
      });
      if (task && task.promise) await task.promise;
    } catch (err) {
      console.warn("PDF text layer failed", err);
    }
    this.cleanup.push(bindGlossEvents(textLayer, { onGloss: this.onGloss }));
  }

  async loadPdf(blob) {
    const pdfjsLib = window.pdfjsLib;
    const data = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    this.pdf = pdf;
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
