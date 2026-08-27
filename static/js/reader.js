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

export function selectionInfo(sel, doc = document) {
  if (!sel || sel.isCollapsed) return null;
  const raw = sel.toString().replace(/\s+/g, " ").trim();
  if (!raw || raw.length > 90) return null;
  const words = raw.split(" ").filter(Boolean);
  if (words.length > 12) return null;
  let passage = raw;
  try {
    const node = sel.anchorNode;
    const el = node?.nodeType === 1 ? node : node?.parentElement;
    const block = el?.closest?.("p, li, td, article, section, .textLayer, div") || el;
    passage = (block?.innerText || raw).replace(/\s+/g, " ").trim().slice(0, 1800);
  } catch {
    /* ignore */
  }
  return { word: raw, sentence: extractSentence(passage, words[0]), passage, range: sel.rangeCount ? sel.getRangeAt(0) : null };
}

function unwrap(el) {
  if (!el || !el.parentNode) return;
  const p = el.parentNode;
  while (el.firstChild) p.insertBefore(el.firstChild, el);
  p.removeChild(el);
  p.normalize();
}

export function bindGlossEvents(root, { onGloss, hover, getDoc }) {
  const doc = root.ownerDocument || document;
  let hoverTimer = null;
  let mark = null;
  let hoverWord = "";
  const win = doc.defaultView || window;

  const clearMark = () => {
    if (mark) {
      unwrap(mark);
      mark = null;
    }
  };

  const paint = (range, cls) => {
    clearMark();
    if (!range) return;
    try {
      mark = doc.createElement("span");
      mark.className = cls;
      range.surroundContents(mark);
    } catch {
      mark = null;
    }
  };

  const emitFromPoint = (x, y, { open, requireChange }) => {
    const info = wordAtPoint(x, y, doc);
    if (!info) return;
    paint(info.range, open ? "gloss-active" : "gloss-hover");
    if (!open) return;
    if (requireChange && info.word.toLowerCase() === hoverWord) return;
    hoverWord = info.word.toLowerCase();
    onGloss(info);
  };

  const onClick = (e) => {
    if (e.target.closest?.("a, button, input, textarea")) return;
    const sel = (getDoc ? getDoc().getSelection() : win.getSelection());
    if (selectionInfo(sel, doc)) return;
    emitFromPoint(e.clientX, e.clientY, { open: true, requireChange: false });
  };

  const onMouseMove = (e) => {
    if (!hover()) return;
    if (window.matchMedia && window.matchMedia("(hover: none)").matches) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(
      () => emitFromPoint(e.clientX, e.clientY, { open: true, requireChange: true }),
      480
    );
  };

  const onMouseOut = (e) => {
    if (!root.contains(e.relatedTarget)) {
      clearTimeout(hoverTimer);
      if (mark && mark.classList.contains("gloss-hover")) clearMark();
    }
  };

  const onUp = () => {
    const sel = (getDoc ? getDoc().getSelection() : win.getSelection());
    const selected = selectionInfo(sel, doc);
    if (selected && selected.word.split(" ").length > 1) onGloss(selected);
  };

  root.addEventListener("click", onClick);
  root.addEventListener("mousemove", onMouseMove);
  root.addEventListener("mouseout", onMouseOut);
  root.addEventListener("mouseup", onUp);
  root.addEventListener("touchend", onUp);

  return () => {
    clearTimeout(hoverTimer);
    clearMark();
    root.removeEventListener("click", onClick);
    root.removeEventListener("mousemove", onMouseMove);
    root.removeEventListener("mouseout", onMouseOut);
    root.removeEventListener("mouseup", onUp);
    root.removeEventListener("touchend", onUp);
  };
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
  }

  destroy() {
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
    this.stage.innerHTML = "";
  }

  async load({ type, title, text, blob }) {
    this.destroy();
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
    this.cleanup.push(
      bindGlossEvents(article, {
        onGloss: this.onGloss,
        hover: () => this.getSettings().hover
      })
    );
  }

  async loadDocx(blob) {
    const buffer = await blob.arrayBuffer();
    const result = await window.mammoth.convertToHtml({ arrayBuffer: buffer });
    const article = document.createElement("article");
    article.className = "prose";
    article.innerHTML = result.value || "<p>(Empty document.)</p>";
    this.stage.appendChild(article);
    this.cleanup.push(
      bindGlossEvents(article, {
        onGloss: this.onGloss,
        hover: () => this.getSettings().hover
      })
    );
  }

  async loadPdf(blob) {
    const pdfjsLib = window.pdfjsLib;
    const data = await blob.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    this.pdf = pdf;
    const scroller = document.createElement("div");
    scroller.className = "pdf-scroller";
    this.stage.appendChild(scroller);

    const slots = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const slot = document.createElement("div");
      slot.className = "pdf-page-slot";
      slot.dataset.page = String(i);
      slot.innerHTML = `<div class="pdf-page-inner"><div class="pdf-skeleton">Page ${i}</div></div>`;
      scroller.appendChild(slot);
      slots.push(slot);
    }

    const drawn = new Set();
    const draw = async (slot) => {
      const n = Number(slot.dataset.page);
      if (drawn.has(n)) return;
      drawn.add(n);
      const page = await pdf.getPage(n);
      const inner = slot.querySelector(".pdf-page-inner");
      const unscaled = page.getViewport({ scale: 1 });
      const cssWidth = Math.min(inner.clientWidth || this.stage.clientWidth - 24, 900);
      const scale = cssWidth / unscaled.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const textLayer = document.createElement("div");
      textLayer.className = "textLayer";
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;

      inner.innerHTML = "";
      inner.style.width = `${viewport.width}px`;
      inner.style.height = `${viewport.height}px`;
      inner.appendChild(canvas);
      inner.appendChild(textLayer);
      slot.style.minHeight = `${viewport.height}px`;

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
      this.cleanup.push(
        bindGlossEvents(textLayer, {
          onGloss: this.onGloss,
          hover: () => this.getSettings().hover
        })
      );
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) draw(e.target);
        }
      },
      { root: this.stage, rootMargin: "1200px 0px" }
    );
    slots.forEach((s) => io.observe(s));
    this.cleanup.push(() => io.disconnect());
    if (slots[0]) draw(slots[0]);
    return { pages: pdf.numPages };
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
      style.textContent = `.gloss-hover{background:rgba(240,212,138,.7);} .gloss-active{background:rgba(180,68,46,.22);} ::selection{background:rgba(180,68,46,.28);}`;
      idoc.head.appendChild(style);
      this.cleanup.push(
        bindGlossEvents(idoc.body, {
          onGloss: this.onGloss,
          hover: () => this.getSettings().hover,
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
