/* Classic script: wires every button even if the ES module never loads. */
(function () {
  if (window.CW) return;

  var lastId = "";
  var lastAt = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function say(msg) {
    var bar = el("bootBar");
    if (bar) bar.textContent = msg;
    var t = el("toast");
    if (t) {
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(say._t);
      say._t = setTimeout(function () {
        t.classList.remove("show");
      }, 4000);
    }
  }

  function key() {
    var a = el("bannerKey");
    var b = el("setGemini");
    var fromBox = ((a && a.value) || (b && b.value) || "").trim();
    try {
      return fromBox || (localStorage.getItem("cw-gemini") || "").trim();
    } catch (e) {
      return fromBox;
    }
  }

  function showModal(id, on) {
    var m = el(id);
    if (!m) {
      say("Missing " + id);
      return;
    }
    m.classList.toggle("hidden", !on);
  }

  function showView(name) {
    var lib = el("view-library");
    var reader = el("view-reader");
    var vocab = el("view-vocab");
    var top = el("topbar");
    if (lib) lib.classList.toggle("hidden", name !== "library");
    if (reader) reader.classList.toggle("hidden", name !== "reader");
    if (vocab) vocab.classList.toggle("hidden", name !== "vocab");
    if (top) top.classList.toggle("hidden", name === "reader");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function showText(title, text) {
    showView("reader");
    if (el("readerTitle")) el("readerTitle").textContent = title || "Reading";
    var stage = el("stage");
    if (!stage) return;
    var paras = String(text || "")
      .replace(/\r\n/g, "\n")
      .split(/\n{2,}/)
      .map(function (p) {
        return "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>";
      })
      .join("");
    stage.innerHTML =
      '<article class="prose"><header class="prose-kicker">' +
      escapeHtml(title || "") +
      "</header>" +
      paras +
      "</article>";
    if (el("panelBody")) {
      el("panelBody").innerHTML =
        '<div class="panel-empty"><h2>Highlight 1–4 words.</h2><p>The meaning appears here as soon as you let go.</p></div>';
    }
  }

  function paintPdfText(textContent, layer, viewport, pdfjsLib) {
    var Util = pdfjsLib.Util;
    layer.innerHTML = "";
    var items = textContent.items || [];
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      if (!item.str) continue;
      var tx = Util ? Util.transform(viewport.transform, item.transform) : item.transform;
      var fontHeight = Math.hypot(tx[2], tx[3]) || 12;
      var span = document.createElement("span");
      span.textContent = item.str;
      span.style.left = tx[4] + "px";
      span.style.top = tx[5] - fontHeight + "px";
      span.style.fontSize = fontHeight + "px";
      span.style.fontFamily = "sans-serif";
      layer.appendChild(span);
    }
  }

  async function showPdf(file) {
    showView("reader");
    if (el("readerTitle")) el("readerTitle").textContent = file.name;
    var stage = el("stage");
    if (!stage) return;
    stage.innerHTML = '<p class="plain">Opening PDF…</p>';
    if (!window.pdfjsLib) {
      say("PDF engine not loaded yet. Wait a second and try again.");
      return;
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    var pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    stage.innerHTML = "";
    stage.dataset.kind = "pdf";
    var width = Math.max(420, (stage.clientWidth || 720) - 24);
    var max = Math.min(pdf.numPages, 20);
    var anyText = false;
    for (var i = 1; i <= max; i += 1) {
      var page = await pdf.getPage(i);
      var base = page.getViewport({ scale: 1 });
      var viewport = page.getViewport({ scale: width / base.width });
      var wrap = document.createElement("div");
      wrap.className = "pdf-page-inner";
      wrap.style.width = Math.floor(viewport.width) + "px";
      wrap.style.height = Math.floor(viewport.height) + "px";
      wrap.style.margin = "0.85rem auto";
      var canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.pointerEvents = "none";
      var layer = document.createElement("div");
      layer.className = "textLayer";
      layer.style.width = Math.floor(viewport.width) + "px";
      layer.style.height = Math.floor(viewport.height) + "px";
      wrap.appendChild(canvas);
      wrap.appendChild(layer);
      stage.appendChild(wrap);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
      var textContent = await page.getTextContent().catch(function () {
        return { items: [] };
      });
      var items = (textContent.items || []).filter(function (it) {
        return it.str && String(it.str).trim();
      });
      if (items.length) {
        anyText = true;
        paintPdfText(textContent, layer, viewport, window.pdfjsLib);
      }
    }
    if (!anyText) {
      say("This PDF is a picture. There is no text to highlight. Open a sample instead.");
    } else {
      say("Opened PDF · highlight 1–4 words");
    }
  }

  function parseCoach(text) {
    var result = {
      Meaning: "",
      Context: "",
      Arabic: "",
      "When To Use It": "",
      "Don't Confuse": "",
      Examples: "",
      "The Idea": ""
    };
    var headings = Object.keys(result).map(function (k) {
      return k + ":";
    });
    var current = null;
    String(text || "")
      .split("\n")
      .forEach(function (raw) {
        var line = raw.trim();
        if (!line) return;
        var heading = headings.find(function (h) {
          return line.toLowerCase().indexOf(h.toLowerCase()) === 0;
        });
        if (heading) {
          current = heading.replace(":", "");
          var content = line.substring(heading.length).trim();
          if (content) result[current] += content + " ";
        } else if (current) {
          result[current] += line + " ";
        }
      });
    return result;
  }

  function openPanel() {
    var p = el("panel");
    if (p) p.classList.add("open");
    var s = el("scrim");
    if (s) s.classList.add("show");
  }

  async function localExplain(info) {
    var body = el("panelBody");
    if (!body) return;
    openPanel();
    body.innerHTML =
      '<p class="plain"><span class="busy"></span> &nbsp; Understanding “' +
      escapeHtml(info.word) +
      '”…</p>';
    var k = key();
    if (!k) {
      body.innerHTML =
        '<div class="panel-empty"><h2>' +
        escapeHtml(info.word) +
        '</h2><p>Paste your Gemini key on the shelf, then highlight again.</p></div>';
      return;
    }
    try {
      var prompt =
        'You are an English vocabulary coach. The learner highlighted "' +
        info.word +
        '". Immediate sentence: "' +
        (info.sentence || "") +
        '". Nearby: "' +
        (info.passage || "").slice(0, 1800) +
        '". Use extremely clear simple English. RETURN ONLY these headings:\nMeaning:\nContext:\nArabic:\nWhen To Use It:\nDon\'t Confuse:\nExamples:\nThe Idea:\n';
      var res = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
          encodeURIComponent(k),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        body.innerHTML =
          '<p class="hint">Gemini failed: ' +
          escapeHtml((data.error && data.error.message) || String(res.status)) +
          "</p>";
        return;
      }
      var raw =
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;
      var coach = parseCoach(raw);
      body.innerHTML =
        '<h2 class="headword">' +
        escapeHtml(info.word) +
        "</h2>" +
        (coach.Meaning
          ? '<div class="block"><h3>Meaning</h3><p class="plain">' + escapeHtml(coach.Meaning) + "</p></div>"
          : "") +
        (coach.Context
          ? '<div class="block"><h3>Context</h3><p class="plain">' + escapeHtml(coach.Context) + "</p></div>"
          : "") +
        (coach.Arabic
          ? '<div class="block"><h3>العربي ببساطة</h3><p class="translation" dir="rtl">' +
            escapeHtml(coach.Arabic) +
            "</p></div>"
          : "");
    } catch (err) {
      body.innerHTML =
        '<p class="hint">Could not reach Gemini in this window. Open the preview in a new tab.</p>';
    }
  }

  function selectionInStage() {
    var stage = el("stage");
    var reader = el("view-reader");
    if (!stage || !reader || reader.classList.contains("hidden")) return null;
    var sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode) return null;
    if (!stage.contains(sel.anchorNode)) return null;
    var raw = sel.toString().replace(/\s+/g, " ").trim();
    if (!raw || raw.length > 80) return null;
    var words = raw.split(" ").filter(Boolean);
    if (!words.length || words.length > 4) return null;
    var passage = raw;
    try {
      var node = sel.anchorNode;
      var host = node.nodeType === 1 ? node : node.parentElement;
      var block = (host && host.closest && host.closest("p, li, .textLayer, article, div")) || host;
      passage = ((block && block.innerText) || raw).replace(/\s+/g, " ").trim().slice(0, 1800);
    } catch (e) {}
    return { word: raw, sentence: passage, passage: passage };
  }

  function onHighlight() {
    var info = selectionInStage();
    if (!info) return;
    var now = Date.now();
    if (info.word === onHighlight._last && now - (onHighlight._at || 0) < 800) return;
    onHighlight._last = info.word;
    onHighlight._at = now;
    if (window.cwGloss) window.cwGloss(info);
    else localExplain(info);
  }

  var CW = {
    say: say,
    saveKey: function () {
      var k = key();
      if (!k) return say("Paste the Gemini key first.");
      try {
        localStorage.setItem("cw-gemini", k);
      } catch (e) {}
      var banner = el("bannerKey");
      var set = el("setGemini");
      if (banner && !banner.value) banner.value = k;
      if (set && !set.value) set.value = k;
      say("Key saved on this device.");
    },
    testKey: async function () {
      var k = key();
      if (!k) return say("Paste the Gemini key first.");
      say("Testing Gemini…");
      try {
        var res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
            encodeURIComponent(k),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: "Reply with the single word: OK" }] }]
            })
          }
        );
        var data = await res.json().catch(function () {
          return {};
        });
        if (!res.ok) {
          say("Gemini failed: " + ((data.error && data.error.message) || res.status));
          return;
        }
        var text =
          data.candidates &&
          data.candidates[0] &&
          data.candidates[0].content &&
          data.candidates[0].content.parts &&
          data.candidates[0].content.parts[0] &&
          data.candidates[0].content.parts[0].text;
        say("Gemini works: " + String(text || "OK").slice(0, 48));
      } catch (err) {
        say("Gemini blocked in this frame. Open the preview in a new tab.");
      }
    },
    settings: function (on) {
      if (typeof on !== "boolean") on = true;
      var set = el("setGemini");
      if (on && set && !set.value) {
        try {
          set.value = localStorage.getItem("cw-gemini") || "";
        } catch (e) {}
      }
      showModal("settingsModal", on);
      say(on ? "Settings open" : "Settings closed");
    },
    saveSettings: function () {
      var k = ((el("setGemini") && el("setGemini").value) || "").trim() || key();
      if (k) {
        try {
          localStorage.setItem("cw-gemini", k);
        } catch (e) {}
      }
      var theme = el("setTheme") && el("setTheme").value;
      if (theme) document.documentElement.dataset.theme = theme;
      showModal("settingsModal", false);
      say("Settings saved");
      if (window.cwSaveSettings) window.cwSaveSettings();
    },
    paste: function (on) {
      showModal("pasteModal", on);
    },
    savePaste: function () {
      var title = ((el("pasteTitle") && el("pasteTitle").value) || "Pasted text").trim();
      var text = ((el("pasteText") && el("pasteText").value) || "").trim();
      if (!text) return say("Paste some text first.");
      showModal("pasteModal", false);
      if (window.cwIngestPaste) {
        window.cwIngestPaste(title, text);
        return;
      }
      showText(title, text);
      say("Opened pasted text");
    },
    openFile: function () {
      var f = el("fileInput");
      if (!f) return say("File picker missing");
      var now = Date.now();
      if (now - (CW.openFile._at || 0) < 800) return;
      CW.openFile._at = now;
      say("Pick a PDF or text file…");
      f.click();
    },
    home: function () {
      showView("library");
    },
    vocab: function () {
      showView("vocab");
      say("Notebook");
      if (window.cwRenderVocab) window.cwRenderVocab();
    },
    sample: function (which) {
      var pack =
        which === "bank"
          ? {
              id: "sample-bank",
              title: "The river and the ledger",
              text: "He reached the bank at dusk. The river had dropped after the long heat, leaving a shelf of pale stones. He sat on the bank and took off his shoes. In his pocket was a letter from the bank, the other kind — the one with columns and a balance.\n\nThe current of the river sounded like paper being torn. He thought of the current in his account. Bank. Current. Light. Run. Highlight any of those words."
            }
          : which === "science"
            ? {
                id: "sample-machines",
                title: "Quiet machines",
                text: "The engine did not fail so much as it declined to continue. The fault was opaque at first. She isolated the circuit, mitigated the heat, and waited. She was sanguine about the repair. Ubiquitous sensors make every engine a little more honest.\n\nHighlight opaque, mitigate, sanguine, or ubiquitous."
              }
            : {
                id: "sample-phrases",
                title: "Phrases that hide",
                text: "The committee took the delay into account and, in the end, decided to give up the old plan. Nobody wanted to make a mountain out of a molehill, but the deadline was real.\n\nMaya had carried out the first half of the work in spite of a fever. She did not look up from the page until the numbers began to make sense. We can still figure this out, she said.\n\nHighlight give up, take into account, in spite of, or any single word."
              };
      if (window.cwOpenDoc) {
        Promise.resolve(window.cwOpenDoc(pack.id)).then(function () {
          var reader = el("view-reader");
          if (reader && reader.classList.contains("hidden")) showText(pack.title, pack.text);
        });
        say("Opened a sample. Highlight 1–4 words.");
        return;
      }
      showText(pack.title, pack.text);
      say("Opened a sample. Highlight 1–4 words.");
    },
    onFiles: async function (files) {
      var list = files && files.length ? files : null;
      if (!list || !list.length) return;
      var n = 0;
      while (!window.cwIngestFiles && n < 40) {
        await new Promise(function (r) {
          setTimeout(r, 50);
        });
        n += 1;
      }
      if (window.cwIngestFiles) {
        window.cwIngestFiles(list);
        return;
      }
      var file = list[0];
      say("Opening " + file.name + "…");
      try {
        if (/\.pdf$/i.test(file.name)) await showPdf(file);
        else showText(file.name.replace(/\.[^.]+$/, ""), await file.text());
      } catch (err) {
        say("Could not open that file: " + (err.message || "error"));
      }
    }
  };

  window.CW = CW;
  window.cwSaveKey = function () {
    CW.saveKey();
  };
  window.cwTestKey = function () {
    CW.testKey();
  };

  function handle(id) {
    var now = Date.now();
    if (id === lastId && now - lastAt < 350) return true;
    lastId = id;
    lastAt = now;
    switch (id) {
      case "bannerSave":
        CW.saveKey();
        return true;
      case "bannerTest":
      case "setTest":
        CW.testKey();
        return true;
      case "btnSettings":
      case "btnSettings2":
        CW.settings(true);
        return true;
      case "setCancel":
        CW.settings(false);
        return true;
      case "setSave":
        CW.saveSettings();
        return true;
      case "openFile":
      case "drop":
        CW.openFile();
        return true;
      case "btnPaste":
        CW.paste(true);
        return true;
      case "pasteCancel":
        CW.paste(false);
        return true;
      case "pasteSave":
        CW.savePaste();
        return true;
      case "brand":
      case "backLib":
      case "vocabBack":
        CW.home();
        return true;
      case "btnVocab":
      case "btnVocab2":
        CW.vocab();
        return true;
      case "cardDemo":
        CW.sample("phrases");
        return true;
      case "cardBank":
        CW.sample("bank");
        return true;
      case "cardScience":
        CW.sample("science");
        return true;
      case "installDismiss":
        if (el("installTip")) el("installTip").classList.add("hidden");
        return true;
      default:
        return false;
    }
  }

  function fromEvent(e) {
    var node = e.target;
    if (!node || !node.closest) return;
    if (node.closest("#stage, .textLayer, .prose, #panelBody")) return;
    var hit = node.closest("button, .card, #drop, [data-cw]");
    if (hit && hit.id && handle(hit.id)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  document.addEventListener("click", fromEvent, true);
  document.addEventListener(
    "pointerup",
    function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      fromEvent(e);
    },
    true
  );

  function wireFile() {
    var f = el("fileInput");
    if (!f || f.dataset.cwBound) return;
    f.dataset.cwBound = "1";
    f.addEventListener("change", function (e) {
      CW.onFiles(e.target.files);
    });
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  ready(function () {
    wireFile();
    say("Context Word · build 7 · buttons are live");
  });
})();
