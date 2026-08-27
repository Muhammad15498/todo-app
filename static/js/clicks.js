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
        '<div class="panel-empty"><h2>Highlight a word.</h2><p>Select 1–4 words, then tap <b>Explain</b>.</p></div>';
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
    for (var i = 1; i <= max; i += 1) {
      var page = await pdf.getPage(i);
      var base = page.getViewport({ scale: 1 });
      var viewport = page.getViewport({ scale: width / base.width });
      var canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.maxWidth = Math.floor(viewport.width) + "px";
      canvas.style.margin = "0.85rem auto";
      canvas.style.boxShadow = "0 18px 50px rgba(31, 26, 20, 0.12)";
      stage.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
    }
    say("Opened PDF · " + pdf.numPages + " page" + (pdf.numPages === 1 ? "" : "s"));
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
    sample: function () {
      showText(
        "A short page to try",
        "The committee took the delay into account and decided to give up the old plan. Nobody wanted to make a mountain out of a molehill, but the deadline was real. Highlight any of those words, then tap Explain."
      );
      say("Opened a sample page. Highlight a word.");
    },
    onFiles: async function (files) {
      var list = files && files.length ? files : null;
      if (!list || !list.length) return;
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
        CW.sample();
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
    if (!node) return;
    if (node.closest) {
      var hit = node.closest("button, .card, #drop, [data-cw]");
      if (hit && hit.id && handle(hit.id)) {
        e.preventDefault();
        e.stopPropagation();
      }
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
