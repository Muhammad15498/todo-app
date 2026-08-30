const GEMINI_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash"
];

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "gemma2-9b-it"
];

export async function lookup({ query, sentence, passage, settings }) {
  const q = (query || "").replace(/\s+/g, " ").trim();
  if (!q) return null;

  const result = {
    query: q,
    headword: q,
    phonetic: "",
    audio: "",
    sentence: sentence || "",
    contextual: null,
    meanings: [],
    phrases: [],
    wiki: null,
    coach: null,
    translation: null
  };

  const geminiKey = (settings?.geminiKey || localStorage.getItem("cw-gemini") || "").trim();
  const groqKey = (settings?.groqKey || localStorage.getItem("cw-groq") || "").trim();
  if (!geminiKey && !groqKey) {
    result.aiError = "Paste a free Gemini key, or a free Groq key, then highlight again.";
    return result;
  }

  const cacheId = cacheKey(q, sentence);
  const hit = cacheGet(cacheId);
  if (hit) {
    result.coach = hit;
    return result;
  }

  try {
    const text = await generateCoach(
      geminiKey,
      groqKey,
      buildCoachPrompt(wordSafe(q), sentence, (passage || "").slice(0, 2500))
    );
    result.coach = parseCoach(text);
    cacheSet(cacheId, result.coach);
  } catch (err) {
    result.aiError = friendlyError(err);
  }
  return result;
}

function wordSafe(q) {
  return String(q).slice(0, 80);
}

function buildCoachPrompt(word, sentence, passage) {
  return `You are a patient English teacher for an intelligent adult who is NOT a native speaker.

They highlighted: "${word}"
It sits inside this sentence: "${sentence || ""}"
Nearby text: "${passage || ""}"

They are asking: I see this word in this sentence — what is the writer actually saying?

RULES FOR EVERY LINE YOU WRITE:
- English a 12-year-old knows. Never explain a hard word with a harder word.
- Each block: ONE sentence, 18 words or fewer.
- If the highlight is part of a phrase (give up, take into account, in spite of), treat the WHOLE phrase as the thing to explain.

RETURN ONLY:

Phrase:
The whole phrase if this is not a single word. Else leave empty.

This Sentence:
The FULL sentence in very simple English. A friend could understand the line without the hard word.

Here it means:
What the highlighted text is doing HERE. One short line. Not other dictionary senses.

Arabic:
Egyptian-friendly. Start with الجملة دي معناها: then the simple sentence. Then والكلمة هنا: then the word here.

The Word:
What this word or phrase usually means, even outside this book. One short line.

What they mean:
Why the writer said THESE words here. The point. Think like a human in the room.

How people hear it:
Tone or feeling a native speaker takes. Leave empty if the word has no extra colour.

In this book:
One short line about how this idea shows up in THIS passage. Not a kitchen example.

Picture It:
One small scene they can close their eyes and see.

For Instance:
Two complete everyday English sentences with THIS same meaning. One sentence per line. Do not start with "such as".

Sounds Like:
How to say it, like: oh-PAYK

Don't Confuse:
Only if ONE similar word would trick them. Else leave empty.

EXAMPLE
Highlighted: account
Sentence: The committee took the delay into account.
Phrase: take into account
This Sentence: The group thought about the delay when they decided. They did not ignore it.
Here it means: took into account = they considered it; it changed the decision.
The Word: account can mean money records, or paying attention to something.
What they mean: They are saying the delay was not ignored. It changed what they decided.
How people hear it: Careful and fair — they weighed the delay instead of brushing it off.
Arabic: الجملة دي معناها: اللجنة حسبت حساب التأخير وهي بتقرر. والكلمة هنا: take into account يعني يعتبر الحاجة دي مش يتجاهلها.
Picture It: People at a table. One person points at a clock. The others nod and change the plan.
For Instance:
We took the rain into account and left twenty minutes early.
The doctor took her other medicines into account before choosing a new one.
Sounds Like: uh-KOWNT
Don't Confuse: Not a bank account. Here it is about paying attention to something.

Do not use markdown, bullets, or emojis. Use exactly those headings.
`;
}

export function parseCoach(text) {
  const result = {
    "Sounds Like": "",
    Phrase: "",
    "This Sentence": "",
    "The Word": "",
    "Here it means": "",
    "What they mean": "",
    "How people hear it": "",
    "In this book": "",
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
  const headings = [
    "How people hear it:",
    "In this book:",
    "What they mean:",
    "Sounds Like:",
    "This Sentence:",
    "The Word:",
    "Here it means:",
    "Phrase:",
    "Meaning:",
    "Context:",
    "In Real Life:",
    "Picture It:",
    "For Instance:",
    "Arabic:",
    "When To Use It:",
    "Don't Confuse:",
    "Examples:",
    "The Idea:"
  ];
  let current = null;
  for (const rawLine of String(text || "").split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = headings.find((h) => line.toLowerCase().startsWith(h.toLowerCase()));
    if (heading) {
      current = heading.replace(":", "");
      const content = line.substring(heading.length).trim();
      if (content) result[current] += content + " ";
    } else if (current) {
      result[current] += line + " ";
    }
  }
  return result;
}

function cacheKey(q, sentence) {
  return String(q || "").toLowerCase() + "|" + String(sentence || "").slice(0, 160);
}

function cacheGet(id) {
  try {
    const raw = sessionStorage.getItem("cw-coach3:" + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheSet(id, coach) {
  try {
    sessionStorage.setItem("cw-coach3:" + id, JSON.stringify(coach));
  } catch {
    /* ignore */
  }
}

function skipModel(msg) {
  return /quota|rate.?limit|429|resource.?exhausted|no longer available|not available|deprecated|not found|404|not supported/i.test(
    String(msg || "")
  );
}

function friendlyError(err) {
  const msg = String(err && err.message ? err.message : err || "");
  if (skipModel(msg) || /interactions api/i.test(msg)) {
    return "Gemini is busy or that model is gone. Paste a Groq key from console.groq.com (also $0), Save, then Test key.";
  }
  return msg || "Could not reach a free model.";
}

async function geminiOnce(key, model, prompt) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    model +
    ":generateContent?key=" +
    encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Gemini HTTP ${res.status}`);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Empty Gemini answer.");
  return text;
}

async function groqOnce(key, model, prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Groq HTTP ${res.status}`);
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("Empty Groq answer.");
  return text;
}

async function generateCoach(geminiKey, groqKey, prompt) {
  let last = null;
  if (groqKey) {
    for (const model of GROQ_MODELS) {
      try {
        return await groqOnce(groqKey, model, prompt);
      } catch (err) {
        last = err;
      }
    }
  }
  if (geminiKey) {
    for (const model of GEMINI_MODELS) {
      try {
        return await geminiOnce(geminiKey, model, prompt);
      } catch (err) {
        last = err;
        if (!skipModel(err.message)) break;
      }
    }
  }
  throw last || new Error("Paste a Groq key from console.groq.com — also free.");
}

export async function testGemini(key) {
  const geminiKey = (key || localStorage.getItem("cw-gemini") || "").trim();
  const groqKey = (localStorage.getItem("cw-groq") || "").trim();
  if (!geminiKey && !groqKey) throw new Error("Paste a Gemini or Groq key first.");
  const text = await generateCoach(geminiKey, groqKey, "Reply with the single word: OK");
  return text.trim();
}

function voiceScore(v) {
  const n = String(v.name || "").toLowerCase();
  let s = 0;
  if (/natural|neural|online|premium|enhanced|wavenet|studio|google|microsoft|samantha|siri|aria|jenny|guy|sara|libby|sonner|daniel|moira|karen|ravi|zira|susan/.test(n)) s += 6;
  if (/google us english|microsoft aria|microsoft jenny/.test(n)) s += 4;
  if (v.localService === false) s += 3;
  if (/^en-US/i.test(v.lang)) s += 2;
  else if (/^en/i.test(v.lang)) s += 1;
  if (/compact|robot|espeak|flite|dumb/.test(n)) s -= 8;
  return s;
}

function bestVoice() {
  const voices = window.speechSynthesis.getVoices() || [];
  const en = voices.filter((v) => /^en/i.test(v.lang || ""));
  const pool = en.length ? en : voices;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}

export function speak(text, lang = "en") {
  if (!text || !window.speechSynthesis) return;
  const go = () => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = bestVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang || "en-US";
    } else {
      u.lang = lang.startsWith("en") ? "en-US" : lang;
    }
    u.rate = 0.9;
    u.pitch = 1;
    window.speechSynthesis.speak(u);
  };
  if (!(window.speechSynthesis.getVoices() || []).length) {
    window.speechSynthesis.addEventListener("voiceschanged", go, { once: true });
    setTimeout(go, 280);
    return;
  }
  go();
}
