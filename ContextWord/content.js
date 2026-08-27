const API_KEY = "AQ.Ab8RN6KqTWlwzGH95aXG3QEKgT1-qwNgcys-cmklbs2zFa3iCQ";

let popup = null;
let explainButton = null;

let pendingSelection = null;
let pendingContext = null;
let pendingRect = null;

let requestInProgress = false;


// ==================================================
// GET CONTEXT
// ==================================================

function getContext(selection) {

  const range = selection.getRangeAt(0);

  let node = range.commonAncestorContainer;

  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  const block = node.closest(
    "p, li, blockquote, article, section, main"
  );

  const immediateContext = block
    ? block.innerText.trim()
    : "";

  let surroundingContext = "";

  if (block && block.parentElement) {
    surroundingContext =
      block.parentElement.innerText
        .replace(/\s+/g, " ")
        .trim();
  }

  const pageText =
    document.body.innerText
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 8000);

  return {
    immediateContext:
      immediateContext.substring(0, 4000),

    surroundingContext:
      surroundingContext.substring(0, 6000),

    pageText
  };
}


// ==================================================
// CREATE EXPLAIN BUTTON
// ==================================================

function createExplainButton(rect, selectedText) {

  removeExplainButton();

  explainButton =
    document.createElement("button");

  explainButton.id =
    "context-word-explain-button";

  explainButton.innerHTML =
    "Explain";

  document.body.appendChild(
    explainButton
  );

  positionExplainButton(
    rect
  );

  explainButton.addEventListener(
    "mousedown",
    function (event) {

      event.preventDefault();
      event.stopPropagation();

      startExplanation(
        selectedText
      );
    }
  );
}


// ==================================================
// POSITION EXPLAIN BUTTON
// ==================================================

function positionExplainButton(rect) {

  if (!explainButton) return;

  const margin = 8;

  const width = 82;
  const height = 36;

  let left =
    rect.left +
    window.scrollX;

  let top =
    rect.bottom +
    window.scrollY +
    margin;


  if (
    left + width >
    window.scrollX +
    window.innerWidth -
    margin
  ) {

    left =
      window.scrollX +
      window.innerWidth -
      width -
      margin;
  }


  if (
    left <
    window.scrollX +
    margin
  ) {

    left =
      window.scrollX +
      margin;
  }


  if (
    rect.bottom +
    height +
    margin >
    window.innerHeight
  ) {

    top =
      rect.top +
      window.scrollY -
      height -
      margin;
  }


  explainButton.style.left =
    `${left}px`;

  explainButton.style.top =
    `${top}px`;
}


// ==================================================
// REMOVE EXPLAIN BUTTON
// ==================================================

function removeExplainButton() {

  if (explainButton) {

    explainButton.remove();

    explainButton = null;
  }
}


// ==================================================
// START EXPLANATION
// ==================================================

async function startExplanation(
  selectedText
) {

  if (
    requestInProgress
  ) {
    return;
  }

  if (!pendingContext) {
    return;
  }

  removeExplainButton();

  requestInProgress =
    true;


  createPopup(
    pendingRect,
    selectedText
  );


  const answer =
    await askAI(
      selectedText,
      pendingContext
    );


  requestInProgress =
    false;


  if (!popup) {
    return;
  }


  displayAnswer(
    answer,
    selectedText
  );
}


// ==================================================
// CREATE POPUP
// ==================================================

function createPopup(
  rect,
  selectedText
) {

  removePopup();

  popup =
    document.createElement("div");

  popup.id =
    "context-word-popup";

  popup.innerHTML = `

    <div class="cw-header">

      <div class="cw-word">

        <span class="cw-selected-word">
          ${escapeHTML(selectedText)}
        </span>

        <button
          id="cw-pronunciation"
          title="American pronunciation"
        >
          🔊
        </button>

      </div>

      <button
        id="cw-close"
      >
        ×
      </button>

    </div>

    <div id="cw-content">

      <div class="cw-loading">
        Understanding it from the context...
      </div>

    </div>
  `;


  document.body.appendChild(
    popup
  );


  positionPopup(
    rect
  );


  document
    .getElementById(
      "cw-close"
    )
    .addEventListener(
      "mousedown",
      function (event) {

        event.preventDefault();
        event.stopPropagation();

        removePopup();
      }
    );


  document
    .getElementById(
      "cw-pronunciation"
    )
    .addEventListener(
      "mousedown",
      function (event) {

        event.preventDefault();
        event.stopPropagation();

        speakAmerican(
          selectedText
        );
      }
    );
}


// ==================================================
// AMERICAN PRONUNCIATION
// ==================================================

function speakAmerican(text) {

  if (
    !("speechSynthesis" in window)
  ) {
    return;
  }

  window
    .speechSynthesis
    .cancel();


  const utterance =
    new SpeechSynthesisUtterance(
      text
    );

  utterance.lang =
    "en-US";

  utterance.rate =
    0.9;

  utterance.pitch =
    1;


  const voices =
    window
      .speechSynthesis
      .getVoices();


  const americanVoice =
    voices.find(
      voice =>
        voice.lang === "en-US"
    );


  if (
    americanVoice
  ) {

    utterance.voice =
      americanVoice;
  }


  window
    .speechSynthesis
    .speak(
      utterance
    );
}


// ==================================================
// POSITION POPUP
// ==================================================

function positionPopup(rect) {

  if (!popup) return;

  const margin = 10;

  const popupWidth =
    Math.min(
      430,
      window.innerWidth -
      margin * 2
    );

  popup.style.width =
    `${popupWidth}px`;


  let left =
    rect.left +
    window.scrollX;


  if (
    left + popupWidth >
    window.scrollX +
    window.innerWidth -
    margin
  ) {

    left =
      window.scrollX +
      window.innerWidth -
      popupWidth -
      margin;
  }


  if (
    left <
    window.scrollX +
    margin
  ) {

    left =
      window.scrollX +
      margin;
  }


  let top =
    rect.bottom +
    window.scrollY +
    margin;


  const estimatedHeight =
    520;


  if (
    rect.bottom +
    estimatedHeight >
    window.innerHeight
  ) {

    top =
      rect.top +
      window.scrollY -
      estimatedHeight -
      margin;
  }


  if (
    top <
    window.scrollY +
    margin
  ) {

    top =
      window.scrollY +
      margin;
  }


  popup.style.left =
    `${left}px`;

  popup.style.top =
    `${top}px`;
}


// ==================================================
// REMOVE POPUP
// ==================================================

function removePopup() {

  if (popup) {

    popup.remove();

    popup = null;
  }
}


// ==================================================
// ASK GEMINI
// ==================================================

async function askAI(
  selectedText,
  context
) {

  const prompt = `

You are an English vocabulary coach helping
a non-native English speaker understand authentic
English.

The learner highlighted:

"${selectedText}"


The learner wants to understand the highlighted
text mainly THROUGH ITS CONTEXT.

CONTEXT:

Immediate text:
"${context.immediateContext}"

Nearby surrounding text:
"${context.surroundingContext}"

Additional webpage context:
"${context.pageText}"


IMPORTANT:

The highlighted text may be only PART of a larger
expression.

For example:

"account"

in:

"take this into account"

should be understood as:

"take something into account".

"up"

in:

"give up"

should be understood as:

"give up".

Use the surrounding context to identify the actual
expression whenever the context clearly supports it.

Do not force a larger phrase if the word is genuinely
being used independently.


LANGUAGE:

The learner is an intelligent adult but is not a
native English speaker.

Use extremely clear, simple English.

Do not explain a difficult word using another
difficult word.

The learner should NOT need to look up words inside
your explanation.

Prefer:

"accept that something is true"

over:

"acknowledge something".

Prefer:

"give something up to reach an agreement"

over:

"make a concession in a negotiation".

Make the meaning obvious from the situation.


RETURN ONLY THESE SECTIONS:

Meaning:

Very short and simple meaning.


Context:

Explain exactly what the writer means HERE.

This is the MOST IMPORTANT section.

Make the connection between the word and the
surrounding situation very clear.

If necessary, explain the relevant part of the
sentence in simple English.


Arabic:

Explain the SAME contextual meaning in simple
Egyptian-friendly Arabic.

Do not translate word-for-word.

Explain it naturally as:

"هو هنا قصده كذا..."


When To Use It:

Briefly explain when a native speaker naturally
uses this word or expression.

Only 1–2 short sentences.


Don't Confuse:

Only include this if ONE similar word or expression
could genuinely confuse the learner.

Otherwise leave it empty.


Examples:

Give TWO short, natural examples.

Keep them simple.


The Idea:

Give ONE short memorable idea only if useful.

Example:

"Insight = seeing something beneath the surface."


STRICT RULES:

Context is the priority.

Do not give a generic dictionary explanation when
the context gives a clear meaning.

Do not make the explanation complicated.

Do not use Markdown.

Do not use **.

Do not use bullet points.

Do not use emojis.

Do not include unnecessary sections.

Do not repeat yourself.

Do not provide Word Family.

Do not provide Common Patterns.

Do not provide long linguistic explanations.

Use exactly:

Meaning:
Context:
Arabic:
When To Use It:
Don't Confuse:
Examples:
The Idea:

`;


  try {

    const response =
      await fetch(

        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=" +
        API_KEY,

        {

          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify({

              contents: [

                {
                  parts: [

                    {
                      text:
                        prompt
                    }

                  ]
                }

              ]

            })
        }
      );


    const result =
      await response.json();


    if (!response.ok) {

      console.error(
        result
      );

      return (
        "ERROR\n\n" +
        (
          result.error?.message ||
          "AI request failed."
        )
      );
    }


    return (
      result
        .candidates?.[0]
        ?.content?.parts?.[0]
        ?.text ||
      "No explanation returned."
    );

  } catch (error) {

    console.error(
      error
    );

    return (
      "ERROR\n\n" +
      "Could not connect to AI."
    );
  }
}


// ==================================================
// PARSE ANSWER
// ==================================================

function parseAnswer(text) {

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


  let current =
    null;


  for (
    const rawLine
    of text.split("\n")
  ) {

    const line =
      rawLine.trim();


    if (!line) {
      continue;
    }


    const heading =
      headings.find(
        h =>
          line
            .toLowerCase()
            .startsWith(
              h.toLowerCase()
            )
      );


    if (heading) {

      current =
        heading.replace(
          ":",
          ""
        );


      const content =
        line
          .substring(
            heading.length
          )
          .trim();


      if (content) {

        result[current] +=
          content + " ";
      }


    } else if (current) {

      result[current] +=
        line + " ";
    }
  }


  return result;
}


// ==================================================
// DISPLAY ANSWER
// ==================================================

function displayAnswer(
  answer,
  selectedText
) {

  if (!popup) {
    return;
  }


  const container =
    document.getElementById(
      "cw-content"
    );


  if (!container) {
    return;
  }


  if (
    answer.startsWith(
      "ERROR"
    )
  ) {

    container.innerHTML = `

      <div class="cw-error">
        ${escapeHTML(answer)}
      </div>

    `;

    return;
  }


  const sections =
    parseAnswer(
      answer
    );


  let html =
    "";


  if (
    sections.Meaning.trim()
  ) {

    html += section(
      "Meaning",
      sections.Meaning
    );
  }


  if (
    sections.Context.trim()
  ) {

    html += section(
      "Context",
      sections.Context
    );
  }


  if (
    sections.Arabic.trim()
  ) {

    html += `

      <div
        class="cw-arabic"
      >

        <div
          class="cw-title"
        >
          العربي ببساطة
        </div>

        <div
          class="cw-text"
        >
          ${escapeHTML(
            sections.Arabic.trim()
          )}
        </div>

      </div>

    `;
  }


  const remaining = [

    "When To Use It",
    "Don't Confuse",
    "Examples",
    "The Idea"

  ];


  for (
    const title
    of remaining
  ) {

    if (
      sections[title] &&
      sections[title].trim()
    ) {

      html += section(
        title,
        sections[title]
      );
    }
  }


  container.innerHTML =
    html;
}


// ==================================================
// SECTION
// ==================================================

function section(
  title,
  text
) {

  return `

    <div
      class="cw-section"
    >

      <div
        class="cw-title"
      >
        ${escapeHTML(
          title
        )}
      </div>

      <div
        class="cw-text"
      >
        ${escapeHTML(
          text.trim()
        )}
      </div>

    </div>

  `;
}


// ==================================================
// ESCAPE HTML
// ==================================================

function escapeHTML(
  text
) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent =
    text || "";

  return div.innerHTML;
}


// ==================================================
// DETECT SELECTION
// ==================================================

document.addEventListener(
  "mouseup",
  function (event) {

    // Ignore anything inside popup
    if (
      popup &&
      popup.contains(
        event.target
      )
    ) {
      return;
    }


    // Ignore anything inside Explain button
    if (
      explainButton &&
      explainButton.contains(
        event.target
      )
    ) {
      return;
    }


    setTimeout(
      function () {

        if (
          requestInProgress
        ) {
          return;
        }


        const selection =
          window.getSelection();


        if (
          !selection ||
          selection.rangeCount === 0
        ) {
          return;
        }


        const selectedText =
          selection
            .toString()
            .trim();


        if (!selectedText) {
          return;
        }


        const words =
          selectedText
            .split(/\s+/)
            .filter(Boolean);


        // Maximum 4 words
        if (
          words.length > 4
        ) {
          return;
        }


        const range =
          selection.getRangeAt(
            0
          );


        const startNode =
          range.startContainer;


        const startElement =
          startNode.nodeType ===
          Node.TEXT_NODE
            ? startNode.parentElement
            : startNode;


        // Never react to popup text
        if (
          popup &&
          popup.contains(
            startElement
          )
        ) {
          return;
        }


        // Store selection for later
        pendingSelection =
          selectedText;


        pendingContext =
          getContext(
            selection
          );


        pendingRect =
          range.getBoundingClientRect();


        // IMPORTANT:
        // No AI request here.
        // Only show Explain button.

        createExplainButton(
          pendingRect,
          pendingSelection
        );

      },
      120
    );
  }
);


// ==================================================
// CLICK OUTSIDE
// ==================================================

document.addEventListener(
  "mousedown",
  function (event) {

    // Clicking popup:
    // DO NOTHING.

    if (
      popup &&
      popup.contains(
        event.target
      )
    ) {
      return;
    }


    // Clicking Explain:
    // DO NOTHING.

    if (
      explainButton &&
      explainButton.contains(
        event.target
      )
    ) {
      return;
    }


    // Otherwise remove the button.
    removeExplainButton();

  }
);


// ==================================================
// STYLING
// ==================================================

const style =
  document.createElement(
    "style"
  );


style.textContent = `

#context-word-explain-button {

  position: absolute;

  z-index:
    2147483647;

  border:
    1px solid #d0d0d0;

  border-radius:
    8px;

  background:
    white;

  color:
    #222;

  padding:
    7px 12px;

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  font-size:
    14px;

  font-weight:
    600;

  cursor:
    pointer;

  box-shadow:
    0 4px 15px
    rgba(0,0,0,0.15);
}


#context-word-explain-button:hover {

  background:
    #f5f5f5;
}


#context-word-popup {

  position:
    absolute;

  z-index:
    2147483647;

  width:
    430px;

  max-width:
    calc(100vw - 20px);

  background:
    white;

  color:
    #222;

  border:
    1px solid #d9d9d9;

  border-radius:
    13px;

  box-shadow:
    0 10px 35px
    rgba(0,0,0,0.20);

  font-family:
    Arial,
    Helvetica,
    sans-serif;

  font-size:
    16px;

  line-height:
    1.55;

  overflow:
    hidden;
}


#context-word-popup * {
  box-sizing:
    border-box;
}


.cw-header {

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    center;

  padding:
    11px 15px;

  border-bottom:
    1px solid #eeeeee;
}


.cw-word {

  display:
    flex;

  align-items:
    center;

  gap:
    8px;

  min-width:
    0;
}


.cw-selected-word {

  font-size:
    17px;

  font-weight:
    700;

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}


#cw-pronunciation {

  border:
    none;

  background:
    transparent;

  cursor:
    pointer;

  font-size:
    18px;

  padding:
    2px 4px;

  border-radius:
    6px;
}


#cw-pronunciation:hover {

  background:
    #f1f1f1;
}


#cw-close {

  border:
    none;

  background:
    transparent;

  font-size:
    24px;

  cursor:
    pointer;

  color:
    #777;

  line-height:
    1;
}


#cw-content {

  padding:
    17px;

  max-height:
    600px;

  overflow-y:
    auto;
}


.cw-section {

  margin-bottom:
    17px;
}


.cw-title {

  font-weight:
    700;

  font-size:
    16px;

  margin-bottom:
    5px;
}


.cw-text {

  font-size:
    16px;

  line-height:
    1.6;
}


.cw-arabic {

  margin:
    17px 0;

  padding:
    13px;

  border-radius:
    9px;

  background:
    #f5f5f5;

  direction:
    rtl;

  text-align:
    right;
}


.cw-arabic .cw-title {

  text-align:
    right;
}


.cw-arabic .cw-text {

  text-align:
    right;

  line-height:
    1.9;
}


.cw-loading {

  padding:
    12px 0;

  text-align:
    center;

  color:
    #666;
}


.cw-error {

  color:
    #b00020;

  line-height:
    1.6;
}

`;


document.head.appendChild(
  style
);