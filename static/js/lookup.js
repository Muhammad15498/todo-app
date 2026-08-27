const GEMINI_MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite"
];

const GROQ_MODELS = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"];

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
  return `You are an English vocabulary coach helping a non-native English speaker understand authentic English.

The learner highlighted:

"${word}"

The learner wants to understand the highlighted text mainly THROUGH ITS CONTEXT.

A dictionary gloss is not enough. After reading you, they should know: what it means here, what it is in real life, and how to picture it.

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

Prefer "the way people act" over "conduct". Prefer "things people do" over "behaviours" if you are explaining "behaviours".

Make the meaning obvious from the situation.

RETURN ONLY THESE SECTIONS:

Sounds Like:

How to say it, in simple pieces. Example: bih-HAY-vyorz

Meaning:

One short, simple meaning of the word itself. What IS this thing in the world? If it is abstract, make it physical: what would you see, hear, or do?

Context:

Explain exactly what the writer means HERE. This is the MOST IMPORTANT section. Connect the word to this sentence so the learner cannot miss it.

In Real Life:

What this looks like outside the book. Everyday. Concrete. For "behaviours": the things people actually do — shouting, sharing, hiding, helping — not a theory. 2 short sentences.

Picture It:

One image the learner can close their eyes and see. If the word is abstract, invent a small scene.

For Instance:

Two everyday "such as..." cases, not copied from the passage. Start with "such as".

Arabic:

The SAME contextual meaning in simple Egyptian-friendly Arabic, as: "هو هنا قصده كذا..."

When To Use It:

When a native speaker naturally says this. 1–2 short sentences.

Don't Confuse:

Only if ONE similar word could genuinely confuse the learner. Otherwise leave empty.

Examples:

TWO short natural sentences using the word.

The Idea:

ONE short memorable idea only if useful.

STRICT RULES:

Context is the priority, but In Real Life and Picture It must still be concrete.

Do not make the explanation complicated.

Do not use Markdown.

Do not use **.

Do not use bullet points.

Do not use emojis.

Do not repeat yourself.

Use exactly:

Sounds Like:
Meaning:
Context:
In Real Life:
Picture It:
For Instance:
Arabic:
When To Use It:
Don't Confuse:
Examples:
The Idea:
`;
}

export function parseCoach(text) {
  const result = {
    "Sounds Like": "",
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
    "Sounds Like:",
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
