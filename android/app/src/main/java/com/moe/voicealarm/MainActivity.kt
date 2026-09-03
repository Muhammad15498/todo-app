package com.moe.voicealarm

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.MediaPlayer
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.util.UUID
import kotlin.concurrent.thread

class MainActivity : Activity() {
    private var listening = false
    private var recording = false
    private var recStart = 0L
    private var langAr = true
    private var manualMs = 0L
    private var lastAudio: String? = null
    private var lastDur = 0L
    private var sr: SpeechRecognizer? = null
    private var player: MediaPlayer? = null

    private lateinit var micBtn: Button
    private lateinit var status: TextView
    private lateinit var text: EditText
    private lateinit var bubble: LinearLayout
    private lateinit var listWrap: LinearLayout
    private val ui = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable { override fun run() { renderTasks(); ui.postDelayed(this, 1000) } }
    private val clocker = object : Runnable {
        override fun run() {
            if (recording) status.text = "🔴 Recording… ${fmt(System.currentTimeMillis() - recStart)}"
            ui.postDelayed(this, 500)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val bg = Color.parseColor("#0a0e1c"); val card = Color.parseColor("#181e30"); val acc = Color.parseColor("#7c5cff")
        val scroll = ScrollView(this).apply { setBackgroundColor(bg); setFillViewport(true) }
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(40, 60, 40, 60) }

        root.addView(TextView(this).apply { text = "⏱ Voice Alarm — native v2"; textSize = 22f; setTypeface(typeface, Typeface.BOLD); setTextColor(Color.WHITE) })
        root.addView(TextView(this).apply { text = "Tap 🎤, speak (any mix of عربي/English), tap ⏹. The RECORDING is always saved — like WhatsApp. Transcription is automatic if it can, retryable if not."
            textSize = 13f; setTextColor(Color.parseColor("#9aa5c4")); setPadding(0, 12, 0, 8) })

        val langBtn = Button(this).apply { text = "🎙 Language: العربية"; setTextColor(Color.WHITE); background = chipBg(card)
            setOnClickListener { langAr = !langAr; text = if (langAr) "🎙 Language: العربية" else "🎙 Language: English" } }
        val keyBtn = Button(this).apply { text = "🔑 Groq key"; setTextColor(Color.WHITE); background = chipBg(card)
            setOnClickListener { askKey() } }
        root.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.START
            addView(langBtn); addView(keyBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { leftMargin = 16 }) })

        micBtn = Button(this).apply { text = "🎤 RECORD"; setTextColor(Color.WHITE); textSize = 20f; setTypeface(typeface, Typeface.BOLD)
            background = GradientDrawable().apply { shape = GradientDrawable.RECTANGLE; cornerRadius = 60f; setColor(Color.parseColor("#ff4757")) }
            setOnClickListener { if (recording) stopRec() else startRec() } }
        root.addView(micBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 20 })

        status = TextView(this).apply { textSize = 14f; setTextColor(Color.parseColor("#9aa5c4")); setPadding(0, 16, 0, 0) }
        root.addView(status)

        bubble = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; visibility = android.view.View.GONE; setPadding(28, 24, 28, 24)
            background = GradientDrawable().apply { cornerRadius = 28f; setColor(card) } }
        val playBtn = Button(this).apply { text = "▶ Play recording"; setTextColor(Color.WHITE); background = chipBg(card); setOnClickListener { playLast() } }
        val cloudBtn = Button(this).apply { text = "🌐 Transcribe (Groq)"; setTextColor(Color.WHITE); background = chipBg(acc); setOnClickListener { transcribeLast(this) } }
        bubble.addView(LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; addView(playBtn); addView(cloudBtn, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { leftMargin = 16 }) })
        val bubInfo = TextView(this).apply { textSize = 12f; setTextColor(Color.parseColor("#9aa5c4")); setPadding(0, 8, 0, 8) }
        bubble.tag = bubInfo; bubble.addView(bubInfo)
        root.addView(bubble, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 16 })

        text = EditText(this).apply { hint = "Transcript (editable) — auto-filled when possible"; setHintTextColor(Color.parseColor("#6d7595"))
            setTextColor(Color.WHITE); textSize = 16f; minLines = 3; setPadding(28, 24, 28, 24)
            background = GradientDrawable().apply { cornerRadius = 24f; setColor(Color.parseColor("#111631")) } }
        root.addView(text, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 16 })

        val chips = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; setPadding(0, 16, 0, 0) }
        listOf("+1m" to 60000L, "+5m" to 300000L, "+30m" to 1800000L, "+1h" to 3600000L).forEach { (label, ms) ->
            chips.addView(Button(this).apply { text = label; setTextColor(Color.WHITE); textSize = 13f; background = chipBg(card)
                setOnClickListener { manualMs = ms; status.text = "Manual time: +$label (used only if no time detected in text)" } })
        }
        root.addView(chips)

        val start = Button(this).apply { text = "▶ Arm alarm"; setTextColor(Color.WHITE); textSize = 18f; setTypeface(typeface, Typeface.BOLD)
            background = GradientDrawable().apply { cornerRadius = 40f; setColor(acc) }; setOnClickListener { process() } }
        root.addView(start, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 20 })

        root.addView(TextView(this).apply { text = "Armed alarms"; textSize = 13f; setTypeface(typeface, Typeface.BOLD); setTextColor(Color.parseColor("#9aa5c4")); setPadding(0, 32, 0, 8) })
        listWrap = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(listWrap)
        scroll.addView(root)
        setContentView(scroll)

        fireOverdue()
        ui.post(ticker); ui.post(clocker)
    }

    private fun chipBg(color: Int) = GradientDrawable().apply { cornerRadius = 80f; setColor(color); setStroke(2, Color.parseColor("#2c3554")) }
    private fun fmt(ms: Long) = String.format("%02d:%02d", (ms / 60000) % 60, (ms / 1000) % 60)

    private fun startRec() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 7); return
        }
        if (!Recorder.start(this)) { toast("Could not start recording — try again"); return }
        recording = true; recStart = System.currentTimeMillis()
        micBtn.text = "⏹ STOP"
        status.text = "🔴 Recording…"
        lastAudio = null; text.setText(""); bubble.visibility = android.view.View.GONE
        // live text = BONUS layer (never blocks the recording)
        try {
            if (SpeechRecognizer.isRecognitionAvailable(this)) {
                sr = SpeechRecognizer.createSpeechRecognizer(this).apply {
                    setRecognitionListener(object : RecognitionListener {
                        override fun onReadyForSpeech(p: Bundle?) {} override fun onBeginningOfSpeech() {} override fun onRmsChanged(r: Float) {}
                        override fun onBufferReceived(b: ByteArray?) {} override fun onEndOfSpeech() {} override fun onEvent(i: Int, b: Bundle?) {}
                        override fun onError(e: Int) { /* bonus layer - ignore */ }
                        override fun onResults(b: Bundle?) {
                            b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let {
                                if (text.text.isBlank()) text.setText(it)
                            }
                        }
                        override fun onPartialResults(b: Bundle?) {
                            b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.let { text.setText(it) }
                        }
                    })
                    startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (langAr) "ar-EG" else "en-US")
                    })
                }
            }
        } catch (e: Exception) { /* audio still recording */ }
    }

    private fun stopRec() {
        try { sr?.stopListening(); sr?.destroy() } catch (e: Exception) {}
        sr = null
        val res = Recorder.stop()
        recording = false; micBtn.text = "🎤 RECORD"
        if (res == null) { status.text = "⚠ Recording came back empty — tap 🎤 and try again"; return }
        lastAudio = res.first; lastDur = res.second
        bubble.visibility = android.view.View.VISIBLE
        (bubble.tag as TextView).text = "🎙 Saved ${fmt(lastDur)} — the recording is safe. Transcribe it or edit the text, then ▶ Arm alarm."
        status.text = "✓ Recording saved (${fmt(lastDur)})"
        val key = Store.groqKey(this)
        if (key.isNotBlank()) transcribeLast(null)
    }

    private fun playLast() {
        val p = lastAudio ?: return toast("No recording in this session — armed notes can be replayed from the list")
        try {
            player?.release()
            player = MediaPlayer().apply { setDataSource(p); prepare(); setOnCompletionListener { it.release(); player = null }; start() }
        } catch (e: Exception) { toast("Playback failed") }
    }

    private fun transcribeLast(view: Button?) {
        val p = lastAudio ?: return toast("Record something first")
        val key = Store.groqKey(this)
        if (key.isBlank()) { askKey("Add your free Groq key (console.groq.com/keys) for automatic transcription — or type the text manually."); return }
        status.text = "🌐 Groq is transcribing your recording…"
        thread {
            try {
                val t = GroqClient.transcribe(key, p)
                runOnUiThread {
                    if (t.isNotBlank()) { text.setText(t); status.text = "✓ Transcribed by Groq (whisper-large-v3)" }
                    else status.text = "⚠ Empty transcript — check audio and retry"
                }
            } catch (e: Exception) {
                runOnUiThread { status.text = "⚠ ${e.message?.take(120)} — tap 🌐 to retry (recording is safe)" }
            }
        }
    }

    private fun askKey(msg: String? = null) {
        val box = EditText(this).apply { hint = "gsk_..."; setTextColor(Color.WHITE); setText(Store.groqKey(this@MainActivity)) }
        AlertDialog.Builder(this).apply {
            setTitle("🔑 Groq API key"); setMessage(msg ?: "Free key: console.groq.com/keys — email signup, no card. Powers mixed Arabic/English transcription.")
            setView(box)
            setPositiveButton("Save") { _, _ -> Store.setGroqKey(this@MainActivity, box.text.toString().trim()); toast("Key saved") }
            setNegativeButton("Cancel", null)
            show()
        }
    }

    private fun process() {
        val raw = text.text.toString().trim()
        if (raw.isEmpty() && lastAudio == null) { toast("Record or type something first"); return }
        val src = raw.ifBlank { "Voice note" }
        val parts = TimeParser.splitReminders(src)
        var made = 0
        parts.forEach { part ->
            val w = TimeParser.parseWhen(part, System.currentTimeMillis())
            val due = w?.dueAt ?: (if (manualMs > 0) System.currentTimeMillis() + manualMs else System.currentTimeMillis() + 3000)
            val t = cleanTitle(part)
            val id = UUID.randomUUID().toString().take(8)
            Store.add(this, Task(id, t, "", due, lastAudio ?: "", part))
            AlarmActivity.schedule(this, id, t, "", due)
            made++
        }
        manualMs = 0; lastAudio = null
        bubble.visibility = android.view.View.GONE
        status.text = "🚀 $made alarm(s) armed — they will ring even if you close the app or turn the screen off"
        text.setText("")
        renderTasks()
    }

    private fun cleanTitle(s: String): String {
        var t = s.trim().trimEnd('.', '!', '،', ',')
        t = Regex("^(فكرني|ذكرني|remind me)\\s*", RegexOption.IGNORE_CASE).replace(t, "")
        return if (t.length > 80) t.take(80) + "…" else t
    }

    private fun fireOverdue() {
        Store.tasks(this).filter { !it.done && it.dueAt <= System.currentTimeMillis() }.forEach {
            AlarmActivity.schedule(this, it.id, it.title, it.notes, System.currentTimeMillis() + 300)
        }
    }

    private fun renderTasks() {
        val now = System.currentTimeMillis()
        val tasks = Store.tasks(this).filter { !it.done }.sortedBy { it.dueAt }
        listWrap.removeAllViews()
        if (tasks.isEmpty()) { listWrap.addView(TextView(this).apply { text = "Nothing armed — record a note ↑"; setTextColor(Color.parseColor("#6d7595")); textSize = 14f; setPadding(0, 16, 0, 16) }); return }
        tasks.forEach { t ->
            val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(28, 24, 28, 24)
                background = GradientDrawable().apply { cornerRadius = 28f; setColor(Color.parseColor("#181e30")) } }
            val left = (t.dueAt - now) / 1000
            val cd = String.format("%02d:%02d:%02d", left / 3600, (left % 3600) / 60, left % 60)
            card.addView(TextView(this).apply { text = t.title; setTextColor(Color.WHITE); textSize = 16f; setTypeface(typeface, Typeface.BOLD) })
            if (t.transcript.isNotBlank() && t.transcript != t.title)
                card.addView(TextView(this).apply { text = t.transcript; setTextColor(Color.parseColor("#9aa5c4")); textSize = 12f; setPadding(0, 6, 0, 0) })
            card.addView(TextView(this).apply { text = "⏱ $cd"; setTextColor(Color.parseColor("#7ce7ff")); textSize = 26f; setTypeface(typeface, Typeface.BOLD) })
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            if (t.audioPath.isNotBlank()) row.addView(Button(this).apply { text = "▶ voice"; setTextColor(Color.WHITE); textSize = 12f; background = chipBg(Color.parseColor("#181e30"))
                setOnClickListener { try { player?.release(); MediaPlayer().apply { setDataSource(t.audioPath); prepare(); setOnCompletionListener { it.release() }; start() } } catch (e: Exception) { toast("Cannot play") } } })
            row.addView(Button(this).apply { text = "✖ cancel"; setTextColor(Color.parseColor("#9aa5c4")); textSize = 12f; background = chipBg(Color.parseColor("#181e30"))
                setOnClickListener { Store.remove(this@MainActivity, t.id); renderTasks() } })
            card.addView(row)
            listWrap.addView(card, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = 16 })
        }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, res: IntArray) {
        super.onRequestPermissionsResult(code, perms, res)
        if (code == 7 && res.isNotEmpty() && res[0] == PackageManager.PERMISSION_GRANTED) startRec()
        else if (code == 7) toast("Mic denied — Settings → Apps → Voice Alarm → Permissions")
    }

    override fun onDestroy() { try { sr?.destroy() } catch (e: Exception) {}; player?.release(); super.onDestroy() }
}
