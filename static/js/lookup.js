const STOP = new Set(
  "a an the of to in for on with at from by as is was are were be been being that this it and or but not its his her their our your my we you they he she i to too very just into onto over under than then there here what which who whom whose how when where why if so such can could may might must shall should will would do does did done having have has had".split(
    " "
  )
);

function tokenize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 2 && !STOP.has(w));
}

function lemmas(word) {
  const w = word.toLowerCase().replace(/[’‘]/g, "'");
  const out = [w];
  if (w.endsWith("'s") && w.length > 3) out.push(w.slice(0, -2));
  if (w.endsWith("ies") && w.length > 4) out.push(w.slice(0, -3) + "y");
  if (w.endsWith("ing") && w.length > 5) {
    out.push(w.slice(0, -3), w.slice(0, -3) + "e");
    if (w.length > 6 && w.at(-4) === w.at(-5)) out.push(w.slice(0, -4));
  }
  if (w.endsWith("ed") && w.length > 4) {
    out.push(w.slice(0, -2), w.slice(0, -1), w.slice(0, -2) + "e");
  }
  if (w.endsWith("es") && w.length > 4) out.push(w.slice(0, -2), w.slice(0, -1));
  else if (w.endsWith("s") && w.length > 3 && !w.endsWith("ss")) out.push(w.slice(0, -1));
  if (w.endsWith("ly") && w.length > 4) out.push(w.slice(0, -2));
  if (w.endsWith("er") && w.length > 4) out.push(w.slice(0, -2), w.slice(0, -1));
  if (w.endsWith("est") && w.length > 5) out.push(w.slice(0, -3));
  return [...new Set(out)];
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("lookup failed");
  return res.json();
}

const FALLBACKS = {
  bank: [
    { pos: "noun", definition: "The land along the side of a river or lake.", example: "He sat on the bank and took off his shoes." },
    { pos: "noun", definition: "A company that keeps money, pays interest, and makes loans.", example: "A letter from the bank about the loan." }
  ],
  current: [
    { pos: "noun", definition: "The flow of water, air, or electricity.", example: "The current of the river." },
    { pos: "noun", definition: "The movement of money in an account, or what is happening now.", example: "The current in his account." },
    { pos: "adjective", definition: "Happening or used now.", example: "The current year." }
  ],
  light: [
    { pos: "noun", definition: "The brightness that lets us see.", example: "The light on the river." },
    { pos: "adjective", definition: "Not heavy; also, not serious.", example: "He walked back, lighter by a decision." }
  ],
  run: [
    { pos: "verb", definition: "To move quickly on foot; also, to manage a business, or to use up a supply.", example: "He had been running the shop for eleven years." }
  ],
  running: [
    { pos: "verb", definition: "Managing something, or using it up; also, moving fast.", example: "Running the shop; running out of time." }
  ],
  set: [
    { pos: "verb", definition: "To put something in a place; of birds, to land; of a face, to become firm.", example: "Ducks set down on the water. He set his jaw." }
  ],
  gloss: [
    { pos: "noun", definition: "A short explanation of a word, written beside the text.", example: "A gloss in the margin." },
    { pos: "verb", definition: "To explain a word in context.", example: "Tap a word and Gloss will gloss it." }
  ],
  vacuum: [
    { pos: "noun", definition: "An empty space; 'in a vacuum' means without the surrounding situation.", example: "Not in a vacuum." }
  ],
  sanguine: [
    { pos: "adjective", definition: "Hopeful and confident, even when things are difficult.", example: "She was sanguine about the repair." }
  ],
  opaque: [
    { pos: "adjective", definition: "Not clear; hard to see through or to understand.", example: "The fault was opaque at first." }
  ],
  mitigate: [
    { pos: "verb", definition: "To make something less harmful or serious.", example: "She mitigated the heat." }
  ],
  ubiquitous: [
    { pos: "adjective", definition: "Seeming to be everywhere at once.", example: "Ubiquitous sensors." }
  ],
  bright: [
    { pos: "adjective", definition: "Giving a lot of light; also, intelligent.", example: "A bright student is not emitting light." }
  ],
  cool: [
    { pos: "adjective", definition: "A bit cold; also, unfriendly or unimpressed.", example: "A cool reception." }
  ],
  rash: [
    { pos: "adjective", definition: "Too hasty; done without enough thought.", example: "His father called it rash." }
  ],
  intimate: [
    { pos: "adjective", definition: "Close and personal; private.", example: "A language that was less intimate." }
  ],
  cascade: [
    { pos: "noun", definition: "Something that falls or happens in a chain, one after another.", example: "A sensor that had drifted, then a cascade." }
  ],
  hunch: [
    { pos: "noun", definition: "A feeling or guess that is not based on proof.", example: "You still need a hunch." }
  ],
  idle: [
    { pos: "adjective", definition: "Not working or being used; of an engine, running without doing work.", example: "After a long idle." }
  ],
  register: [
    { pos: "noun", definition: "The level of formality in language — how posh, casual, or technical it sounds.", example: "Tone and register." }
  ],
  nuance: [
    { pos: "noun", definition: "A small difference in meaning, feeling, or tone.", example: "The nuance of a word in this sentence." }
  ]
};

async function dictionaryEntry(word) {
  const q = encodeURIComponent(word);
  try {
    return await fetchJson(`/api/dictionary/${q}`);
  } catch {
    try {
      return await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${q}`);
    } catch {
      const local = FALLBACKS[word.toLowerCase()];
      if (!local) throw new Error("lookup failed");
      return [{
        word,
        meanings: local.map((s) => ({
          partOfSpeech: s.pos,
          definitions: [{ definition: s.definition, example: s.example, synonyms: [] }]
        }))
      }];
    }
  }
}

async function wikiSummary(word) {
  const q = encodeURIComponent(word);
  try {
    return await fetchJson(`/api/wiki/${q}`);
  } catch {
    return fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${q}`);
  }
}

function flattenMeanings(entries) {
  const meanings = [];
  if (!Array.isArray(entries)) return meanings;
  for (const entry of entries) {
    for (const m of entry.meanings || []) {
      for (const d of m.definitions || []) {
        meanings.push({
          pos: m.partOfSpeech || "",
          definition: d.definition || "",
          example: d.example || "",
          synonyms: [...(d.synonyms || []), ...(m.synonyms || [])].slice(0, 6)
        });
      }
    }
  }
  return meanings;
}

function scoreSense(sense, context) {
  const ctx = new Set(tokenize(context));
  if (!ctx.size) return 0;
  const bag = tokenize(
    `${sense.definition} ${sense.example} ${(sense.synonyms || []).join(" ")} ${sense.pos}`
  );
  let n = 0;
  for (const t of bag) if (ctx.has(t)) n += 1;
  if (sense.example && tokenize(sense.example).some((t) => ctx.has(t))) n += 2;
  return n;
}

function pickAudio(entries) {
  if (!Array.isArray(entries)) return { phonetic: "", audio: "" };
  const first = entries[0] || {};
  let audio = "";
  let phonetic = first.phonetic || "";
  for (const p of first.phonetics || []) {
    if (p.audio && !audio) audio = p.audio;
    if (p.text && !phonetic) phonetic = p.text;
  }
  return { phonetic, audio };
}

export function neighbors(text, word) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  const m = clean.match(re);
  if (!m) return { prev: "", next: "" };
  const i = m.index;
  const before = clean.slice(Math.max(0, i - 40), i).trim().split(" ");
  const after = clean
    .slice(i + m[0].length, i + m[0].length + 40)
    .trim()
    .split(" ");
  return { prev: before.at(-1) || "", next: after[0] || "" };
}

export async function lookup({ query, sentence, passage, settings }) {
  const original = (query || "").trim();
  const q = original.replace(/\s+/g, " ");
  if (!q) return null;

  const context = `${sentence || ""} ${passage || ""}`;
  const words = q.split(" ").filter(Boolean);
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
    ai: null,
    translation: null
  };

  const attempts = [];
  if (words.length > 1) attempts.push(q);
  attempts.push(...lemmas(words.length === 1 ? q : words[0]));

  let entries = null;
  for (const attempt of attempts) {
    try {
      const data = await dictionaryEntry(attempt);
      if (Array.isArray(data) && data.length) {
        entries = data;
        result.headword = data[0].word || attempt;
        break;
      }
    } catch {
      /* try next */
    }
  }

  if (words.length === 1) {
    const { prev, next } = neighbors(`${sentence} ${passage}`, q);
    const collocations = [];
    if (prev && /[a-z]/i.test(prev)) collocations.push(`${prev} ${q}`);
    if (next && /[a-z]/i.test(next)) collocations.push(`${q} ${next}`);
    for (const phrase of collocations) {
      try {
        const data = await dictionaryEntry(phrase);
        if (Array.isArray(data) && data.length) {
          const defs = flattenMeanings(data);
          if (defs[0]) {
            result.phrases.push({
              phrase: data[0].word || phrase,
              definition: defs[0].definition,
              pos: defs[0].pos
            });
          }
        }
      } catch {
        /* not a phrase */
      }
    }
  }

  if (entries) {
    const audio = pickAudio(entries);
    result.phonetic = audio.phonetic;
    result.audio = audio.audio;
    result.meanings = flattenMeanings(entries);
    const ranked = result.meanings
      .map((s) => ({ ...s, score: scoreSense(s, context) }))
      .sort((a, b) => b.score - a.score);
    result.meanings = ranked;
    result.contextual = ranked[0] || null;
  } else {
    try {
      const wiki = await wikiSummary(q);
      if (wiki && wiki.extract && wiki.title && wiki.title.toLowerCase() !== "not found") {
        result.wiki = {
          title: wiki.title,
          extract: wiki.extract,
          url: wiki.content_urls?.desktop?.page || ""
        };
        result.headword = wiki.title;
        result.contextual = {
          pos: wiki.type === "standard" ? "term" : wiki.type || "term",
          definition: wiki.description ? `${wiki.description}. ${wiki.extract}` : wiki.extract,
          example: "",
          synonyms: [],
          score: 0
        };
      }
    } catch {
      /* ignore */
    }
  }

  if (settings?.ai && settings.apiKey) {
    try {
      result.ai = await aiExplain({
        word: q,
        sentence,
        passage: (passage || "").slice(0, 1800),
        settings
      });
    } catch (err) {
      result.aiError = err.message || "AI lookup failed";
    }
  }

  if (settings?.lang && settings.lang !== "en") {
    const toTranslate = result.ai?.plain || result.contextual?.definition || q;
    try {
      result.translation = await translate(toTranslate, settings.lang);
    } catch {
      /* ignore */
    }
  }

  return result;
}

async function aiExplain({ word, sentence, passage, settings }) {
  const base = (settings.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = settings.model || "gpt-4o-mini";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Gloss, a reading companion for English learners. Explain the selected word or short phrase IN THIS SPECIFIC CONTEXT, not every possible meaning. Use simple clear English (CEFR B1). Do not define a hard word with harder words. Return JSON only with keys: plain (1-2 sentences about this usage), pos (noun|verb|adjective|adverb|phrase|idiom|other), sense (very short gloss), nuance (tone/register or empty string), example (one original B1 example sentence)."
        },
        {
          role: "user",
          content: `Word/phrase: "${word}"\nSentence: ${sentence || "(none)"}\nPassage:\n${passage || "(none)"}`
        }
      ]
    })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 180) || `AI error ${res.status}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  try {
    return JSON.parse(text);
  } catch {
    return { plain: text, pos: "", sense: "", nuance: "", example: "" };
  }
}

async function translate(text, lang) {
  const url = `/api/translate?lang=${encodeURIComponent(lang)}&q=${encodeURIComponent(text.slice(0, 400))}`;
  const data = await fetchJson(url);
  return data?.translated || "";
}

export function speak(text, lang = "en") {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang.startsWith("en") ? "en-US" : lang;
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
}
