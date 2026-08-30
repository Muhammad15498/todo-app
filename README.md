# 🎙 Voice Alarm — talk, it thinks, it reminds

A free ($0) voice-first reminder + notes app in one HTML file. Record like a WhatsApp
voice note; the AI team transcribes (Arabic/English/mixed code-switching), analyzes,
summarizes, arms real countdown alarms, and replies out loud in a natural English voice.

**Use:** `https://muhammad15498.github.io/todo-app/voice-alarm.html` (needs the repo public) — or open the file directly on a PC.

## The AI team (all free)
- 🎧 **Ears** — Gemini (best Arabic) or whisper-large-v3 via Groq, or local whisper (offline)
- 🧠 **Brain** — Qwen3-32B (fast) / GPT-OSS-120B (deep) on a free Groq key: `console.groq.com/keys`
- ⚖️ **Referee** — built-in Egyptian-dialect time parser cross-checks every timer (works with zero keys)
- 🔊 **Voice** — Kokoro (in-browser, most natural, offline after one download) → Orpheus cloud → system voice

## Features
- Record-first: the voice note ALWAYS saves (plays back, survives refresh) — even with no mic
- Auto pipeline: silence check → transcribe → analyze → **3rd-person English summary bullets (full coverage)** → timer armed → spoken English confirmation
- Times in any mix: «كمان 3 seconds», «بعد تلات ثواني», "tomorrow at 9am" (MSA + Egyptian + typos)
- 🗒 Notes: editable transcript → saved notes → 💬 AI chat per note (thoughts/plans; mentioning a time arms a timer)
- ⬇/⬆ JSON backup (tasks + notes + voice notes; keys never leave the device)

## Keys & privacy
Only the free Groq `gsk_` key is needed (brain + voice). Optional Gemini key = better Arabic ears.
Keys/notes/recordings stay in this browser's local storage — nothing is sent anywhere else.

## Android APK
Native audio-first app in [`android/`](android/) (voice-as-alarm, exact alarms, Groq transcription).
Build free on GitHub Actions (workflow: `gradle assembleDebug` → artifact `app-debug.apk`).
