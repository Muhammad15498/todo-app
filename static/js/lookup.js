const GEMINI_MODEL = "gemini-3.5-flash-lite";

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
    result.aiError = "Paste your Gemini key first, then tap Test key.";
    return result;
  }

  try {
    const text = await geminiGenerate(
      geminiKey,
      buildCoachPrompt(wordSafe(q), sentence, (passage || "").slice(0, 2500))
    );
    result.coach = parseCoach(text);
  } catch (err) {
    result.aiError = err.message || "Could not reach Gemini.";
  }
  return result;
}

function wordSafe(q) {
  return String(q).slice(0, 80);
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

async function geminiGenerate(key, prompt) {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    GEMINI_MODEL +
    ":generateContent?key=" +
    encodeURIComponent(key);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Gemini HTTP ${res.status}`);
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) throw new Error("Gemini returned an empty answer.");
  return text;
}

export async function testGemini(key) {
  const k = (key || "").trim();
  if (!k) throw new Error("No key.");
  const text = await geminiGenerate(k, "Reply with the single word: OK");
  return text.trim();
}

export function speak(text, lang = "en") {
  if (!text || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang.startsWith("en") ? "en-US" : lang;
  u.rate = 0.92;
  window.speechSynthesis.speak(u);
}
