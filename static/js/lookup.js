function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

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

  const geminiKey = (settings?.geminiKey || "").trim();
  if (!geminiKey) {
    result.aiError = "Paste your Gemini key on the home screen first — same key as the Chrome extension.";
    return result;
  }

  try {
    result.coach = await geminiExplain({
      word: q,
      sentence,
      passage: (passage || "").slice(0, 3500),
      settings: { ...settings, geminiKey }
    });
  } catch (err) {
    result.aiError = err.message || "Could not reach Gemini.";
  }
  return result;
}

function buildCoachPrompt(word, sentence, passage) {
  return `You are an English vocabulary coach helping a non-native English speaker understand authentic English.

The learner highlighted:

"${word}"

The learner wants to understand the highlighted text mainly THROUGH ITS CONTEXT.

CONTEXT:

Immediate text:
"${sentence || ""}"

Nearby surrounding text:
"${passage || ""}"

IMPORTANT:

The highlighted text may be only PART of a larger expression.

For example:

"account" in "take this into account" should be understood as "take something into account".

"up" in "give up" should be understood as "give up".

Use the surrounding context to identify the actual expression whenever the context clearly supports it.

Do not force a larger phrase if the word is genuinely being used independently.

LANGUAGE:

The learner is an intelligent adult but is not a native English speaker.

Use extremely clear, simple English.

Do not explain a difficult word using another difficult word.

The learner should NOT need to look up words inside your explanation.

Prefer "accept that something is true" over "acknowledge something".

Make the meaning obvious from the situation.

RETURN ONLY THESE SECTIONS:

Meaning:

Very short and simple meaning.

Context:

Explain exactly what the writer means HERE.

This is the MOST IMPORTANT section.

Make the connection between the word and the surrounding situation very clear.

If necessary, explain the relevant part of the sentence in simple English.

Arabic:

Explain the SAME contextual meaning in simple Egyptian-friendly Arabic.

Do not translate word-for-word.

Explain it naturally as: "هو هنا قصده كذا..."

When To Use It:

Briefly explain when a native speaker naturally uses this word or expression.

Only 1–2 short sentences.

Don't Confuse:

Only include this if ONE similar word or expression could genuinely confuse the learner.

Otherwise leave it empty.

Examples:

Give TWO short, natural examples.

Keep them simple.

The Idea:

Give ONE short memorable idea only if useful.

STRICT RULES:

Context is the priority.

Do not give a generic dictionary explanation when the context gives a clear meaning.

Do not make the explanation complicated.

Do not use Markdown.

Do not use **.

Do not use bullet points.

Do not use emojis.

Do not repeat yourself.

Use exactly:

Meaning:
Context:
Arabic:
When To Use It:
Don't Confuse:
Examples:
The Idea:
`;
}

export function parseCoach(text) {
  const result = {
    Meaning: "",
    Context: "",
    Arabic: "",
    "When To Use It": "",
    "Don't Confuse": "",
    Examples: "",
    "The Idea": ""
  };
  const headings = [
    "Meaning:",
    "Context:",
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

function extractText(data) {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function geminiBrowser(key, model, prompt) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Gemini ${res.status}`);
  }
  const text = extractText(data);
  if (!text) throw new Error("No explanation returned.");
  return text;
}

async function geminiProxy(key, model, prompt) {
  const res = await fetch("/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, model, prompt })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `AI error ${res.status}`);
  if (!data.text) throw new Error("No explanation returned.");
  return data.text;
}

async function geminiExplain({ word, sentence, passage, settings }) {
  const prompt = buildCoachPrompt(word, sentence, passage);
  const models = unique([
    settings.model,
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest"
  ]);
  let lastErr = "Could not connect to Gemini.";
  for (const model of models) {
    try {
      const text = await geminiBrowser(settings.geminiKey, model, prompt);
      return parseCoach(text);
    } catch (err) {
      lastErr = err.message || lastErr;
      try {
        const text = await geminiProxy(settings.geminiKey, model, prompt);
        return parseCoach(text);
      } catch (err2) {
        lastErr = err2.message || lastErr;
      }
    }
  }
  throw new Error(
    lastErr +
      " — if this keeps failing, open the preview in a new browser tab (not the small side panel) and try again."
  );
}

export function speak(text, lang = "en") {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang.startsWith("en") ? "en-US" : lang;
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
}
