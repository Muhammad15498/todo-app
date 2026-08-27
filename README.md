# Gloss

Read a PDF, an EPUB, a Word file, or anything you paste. Tap a word — or a phrase — and a **side panel** tells you what it means *in this sentence*, not in a vacuum.

Built as a phone-friendly web app (install it to the home screen). Your files stay on the device.

## Why a side panel

The browser-extension version used a popup. That fits a tab. It does not fit a book. A margin that stays open lets you keep the sentence in view while you learn the word — the old idea of a gloss, written beside the line.

On a phone there is no hover. Tap a word. Drag to select a phrase. That is the whole gesture.

## Run it

```bash
python -m pip install -r requirements.txt
python app.py
```

Open [http://localhost:5000](http://localhost:5000). On a phone, visit the same address on your network, then:

- **iPhone:** Share → Add to Home Screen
- **Android:** menu → Install app / Add to Home screen

## What it reads

PDF · EPUB · Word (.docx) · plain text · Markdown · pasted articles

Lookups use a public dictionary by default. Paste a **free Gemini key** (Google AI Studio) to get the same contextual coaching as the Context Word extension: Meaning, Context, Arabic, examples. The key is stored on the device, never in the repo.

## Privacy

Books are stored in IndexedDB on the device. The server only proxies dictionary, Wikipedia, and translation requests. The document itself is not uploaded.
