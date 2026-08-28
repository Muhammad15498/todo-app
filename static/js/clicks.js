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

  function groqKey() {
    var a = el("bannerGroq");
    var b = el("setGroq");
    var fromBox = ((a && a.value) || (b && b.value) || "").trim();
    try {
      return fromBox || (localStorage.getItem("cw-groq") || "").trim();
    } catch (e) {
      return fromBox;
    }
  }

  var GEMINI_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash"
  ];
  var GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"];

  function skipModel(msg) {
    return /quota|rate.?limit|429|resource.?exhausted|no longer available|not available|deprecated|not found|404|not supported/i.test(
      String(msg || "")
    );
  }

  async function generateFree(prompt) {
    var gem = key();
    var groq = groqKey();
    var last = "Paste a Gemini or Groq key first.";
    var i;
    if (groq) {
      for (i = 0; i < GROQ_MODELS.length; i += 1) {
        try {
          var gres = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + groq
            },
            body: JSON.stringify({
              model: GROQ_MODELS[i],
              temperature: 0.3,
              messages: [{ role: "user", content: prompt }]
            })
          });
          var gdata = await gres.json().catch(function () {
            return {};
          });
          if (!gres.ok) {
            last = (gdata.error && gdata.error.message) || String(gres.status);
            continue;
          }
          var gtext =
            gdata.choices && gdata.choices[0] && gdata.choices[0].message && gdata.choices[0].message.content;
          if (gtext) return gtext;
        } catch (err) {
          last = err.message || last;
        }
      }
    }
    if (gem) {
      for (i = 0; i < GEMINI_MODELS.length; i += 1) {
        try {
          var res = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/" +
              GEMINI_MODELS[i] +
              ":generateContent?key=" +
              encodeURIComponent(gem),
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
            last = (data.error && data.error.message) || String(res.status);
            continue;
          }
          var text =
            data.candidates &&
            data.candidates[0] &&
            data.candidates[0].content &&
            data.candidates[0].content.parts &&
            data.candidates[0].content.parts[0] &&
            data.candidates[0].content.parts[0].text;
          if (text) return text;
        } catch (err) {
          last = err.message || last;
        }
      }
    }
    throw new Error(
      skipModel(last) || /interactions api/i.test(String(last))
        ? groq
          ? "Still $0. Gemini skipped a retired model. Check the Groq key from console.groq.com, or wait a minute."
          : "Paste a Groq key from console.groq.com (also $0), Save, then Test. Gemini retired the old model."
        : last
    );
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
    document.body.classList.toggle("cw-reading", name === "reader");
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

  function extractSentence(text, word) {
    if (!text) return "";
    var parts = String(text).split(/(?<=[.!?])\s+/);
    var lower = String(word || "").toLowerCase();
    var hit = parts.filter(function (p) {
      return p.toLowerCase().indexOf(lower) !== -1;
    })[0];
    return (hit || parts[0] || text).trim();
  }

  function coachPrompt(word, sentence, passage) {
    return (
      "You are a patient English teacher for an intelligent adult who is NOT a native speaker.\n\n" +
      "They highlighted: \"" +
      word +
      "\"\n" +
      "It sits inside this sentence: \"" +
      sentence +
      "\"\n" +
      "Nearby text: \"" +
      (passage || "").slice(0, 1800) +
      "\"\n\n" +
      "They are asking: I see this word in this sentence — what is the writer actually saying?\n" +
      "Do NOT give a dictionary dump. First make the WHOLE SENTENCE clear. Then show what the highlighted bit is doing inside it.\n" +
      "If the highlight is only part of a phrase (give up, take into account, in spite of), explain the whole phrase.\n" +
      "Use extremely simple English. Never explain a hard word with another hard word.\n\n" +
      "RETURN ONLY:\n\n" +
      "This Sentence:\n" +
      "Rewrite the FULL sentence in very simple English, as if telling a friend. The learner must understand the whole line.\n\n" +
      "Here it means:\n" +
      "One short line: what the highlighted text is doing HERE. Not other dictionary senses.\n\n" +
      "Arabic:\n" +
      "Egyptian-friendly. Start with الجملة دي معناها: then the simple sentence. Then والكلمة هنا: then the word in this sentence.\n\n" +
      "Picture It:\n" +
      "One small scene they can close their eyes and see.\n\n" +
      "For Instance:\n" +
      "Two everyday cases. Start with such as.\n\n" +
      "Sounds Like:\n" +
      "How to say it, like: oh-PAYK\n\n" +
      "Don't Confuse:\n" +
      "Only if ONE similar word would trick them. Else leave empty.\n\n" +
      "EXAMPLE\n" +
      "Highlighted: account\n" +
      "Sentence: The committee took the delay into account.\n" +
      "This Sentence: The group thought about the delay when they decided. They did not ignore it.\n" +
      "Here it means: took into account = they considered it; it affected the decision.\n" +
      "Arabic: الجملة دي معناها: اللجنة حسبت حساب التأخير وهي بتقرر. والكلمة هنا: take into account يعني يعتبر الحاجة دي مش يتجاهلها.\n" +
      "Picture It: People at a table. One person points at a clock. The others nod and change the plan.\n" +
      "For Instance: such as counting extra traffic when you choose when to leave; such as a doctor considering your other medicines before giving a new one.\n" +
      "Sounds Like: uh-KOWNT\n" +
      "Don't Confuse: Not a bank account. Here it is about paying attention to something.\n\n" +
      "Do not use markdown, bullets, or emojis. Use exactly those headings."
    );
  }

  function parseCoach(text) {
    var result = {
      "Sounds Like": "",
      "This Sentence": "",
      "Here it means": "",
      Meaning: "",
      Context: "",
      "In Real Life": "",
      "Picture It": "",
      "For Instance": "",
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
    if (!key() && !groqKey()) {
      body.innerHTML =
        '<div class="panel-empty"><h2>' +
        escapeHtml(info.word) +
        '</h2><p>Paste a free Gemini key, or a Groq key from console.groq.com, then highlight again.</p></div>';
      return;
    }
    try {
      var raw = await generateFree(coachPrompt(info.word, info.sentence || "", info.passage || ""));
      var coach = parseCoach(raw);
      function block(title, text, cls) {
        if (!text || !String(text).trim()) return "";
        return (
          '<div class="block"><h3>' +
          title +
          "</h3><p class=\"" +
          (cls || "plain") +
          '">' +
          escapeHtml(text) +
          "</p></div>"
        );
      }
      body.innerHTML =
        '<div class="headword-row"><h2 class="headword">' +
        escapeHtml(info.word) +
        '</h2><button class="icon-btn speak-btn" id="speakWord" type="button" aria-label="Pronounce"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg></button></div>' +
        (coach["Sounds Like"]
          ? '<div class="meta-row"><span class="phonetic">' + escapeHtml(coach["Sounds Like"]) + "</span></div>"
          : "") +
        (info.sentence
          ? '<div class="block"><h3>The line you are reading</h3><p class="sentence">' +
            escapeHtml(info.sentence) +
            "</p></div>"
          : "") +
        block("This sentence, simply", coach["This Sentence"] || coach.Context) +
        block("Here it means", coach["Here it means"] || coach.Meaning) +
        block("العربي ببساطة", coach.Arabic, "translation") +
        block("Picture it", coach["Picture It"]) +
        block("For instance", coach["For Instance"]) +
        block("Don't confuse", coach["Don't Confuse"]);
      var speakBtn = el("speakWord");
      if (speakBtn) {
        speakBtn.onclick = function () {
          if (!window.speechSynthesis) return;
          window.speechSynthesis.cancel();
          var u = new SpeechSynthesisUtterance(info.word);
          u.lang = "en-US";
          window.speechSynthesis.speak(u);
        };
      }
    } catch (err) {
      body.innerHTML = '<p class="hint">' + escapeHtml(err.message || "Could not reach a free model.") + "</p>";
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
    return { word: raw, sentence: extractSentence(passage, raw) || passage, passage: passage };
  }

  function onHighlight() {
    if (!onHighlight._armed) return;
    onHighlight._armed = false;
    var info = selectionInStage();
    if (!info) return;
    say("Highlighted: " + info.word);
    openPanel();
    var body = el("panelBody");
    if (body) {
      body.innerHTML =
        '<p class="plain"><span class="busy"></span> &nbsp; Understanding “' +
        escapeHtml(info.word) +
        "” in this sentence…</p>";
    }
    if (window.cwGloss) window.cwGloss(info);
    else localExplain(info);
  }

  function bindHighlightWatch() {
    if (bindHighlightWatch._on) return;
    bindHighlightWatch._on = true;
    var t = null;
    function inStage(node) {
      var stage = el("stage");
      var reader = el("view-reader");
      if (!stage || !reader || reader.classList.contains("hidden") || !node) return false;
      return stage.contains(node);
    }
    function arm(e) {
      onHighlight._armed = inStage(e.target);
    }
    function kick() {
      clearTimeout(t);
      t = setTimeout(onHighlight, 80);
    }
    document.addEventListener("pointerdown", arm, true);
    document.addEventListener("pointerup", kick, true);
    document.addEventListener("touchend", kick, true);
    document.addEventListener(
      "keyup",
      function (e) {
        if (e.key === "Shift" || e.shiftKey) {
          onHighlight._armed = true;
          kick();
        }
      },
      true
    );
  }
  bindHighlightWatch();

  var CW = {
    say: say,
    saveKey: function () {
      var k = key();
      var g = groqKey();
      if (!k && !g) return say("Paste a Gemini key or a Groq key first.");
      try {
        if (k) localStorage.setItem("cw-gemini", k);
        if (g) localStorage.setItem("cw-groq", g);
      } catch (e) {}
      say(k && g ? "Gemini and Groq keys saved." : k ? "Gemini key saved." : "Groq key saved.");
    },
    testKey: async function () {
      if (!key() && !groqKey()) return say("Paste a Gemini key or a Groq key first.");
      say("Testing a free model…");
      try {
        var text = await generateFree("Reply with the single word: OK");
        say("Works: " + String(text || "OK").slice(0, 48));
      } catch (err) {
        say(err.message || "Test failed");
      }
    },
    settings: function (on) {
      if (typeof on !== "boolean") on = true;
      var set = el("setGemini");
      var groqBox = el("setGroq");
      if (on) {
        try {
          if (set && !set.value) set.value = localStorage.getItem("cw-gemini") || "";
          if (groqBox && !groqBox.value) groqBox.value = localStorage.getItem("cw-groq") || "";
        } catch (e) {}
      }
      showModal("settingsModal", on);
      say(on ? "Settings open" : "Settings closed");
    },
    saveSettings: function () {
      var k = ((el("setGemini") && el("setGemini").value) || "").trim() || key();
      var g = ((el("setGroq") && el("setGroq").value) || "").trim() || groqKey();
      try {
        if (k) localStorage.setItem("cw-gemini", k);
        if (g) localStorage.setItem("cw-groq", g);
      } catch (e) {}
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
            : which === "rules"
              ? {
                  id: "sample-rules",
                  title: "A few rules worth keeping",
                  text: "Keep your word, even when it is inconvenient. A small promise kept is worth more than a grand plan that never lands. In the long run, this is how trust is built.\n\nTake the slight in stride. Most of it is carelessness, not a plot. Leave a little room in the day. Empty time is not wasted.\n\nHighlight keep your word, in the long run, take it in stride, or make room."
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
      case "cardRules":
        CW.sample("rules");
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
    bindHighlightWatch();
    try {
      var gk = localStorage.getItem("cw-gemini") || "";
      var rq = localStorage.getItem("cw-groq") || "";
      if (el("bannerKey") && gk) el("bannerKey").value = gk;
      if (el("bannerGroq") && rq) el("bannerGroq").value = rq;
    } catch (e) {}
    say("Context Word · build 14 · sentence first");
  });
})();
