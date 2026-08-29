package com.moe.voicealarm

import android.app.Activity
import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class AlarmActivity : Activity() {
    private var player: MediaPlayer? = null
    private var vib: Vibrator? = null
    private var flash: Handler? = null
    private var flip = true
    private lateinit var root: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
        val title = intent.getStringExtra("title") ?: "Reminder"
        val notes = intent.getStringExtra("notes") ?: ""
        val id = intent.getStringExtra("id") ?: ""

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#b3121f"))
            setPadding(48, 96, 48, 96)
        }
        val icon = TextView(this).apply { text = "⏰"; textSize = 56f; gravity = Gravity.CENTER }
        val tv = TextView(this).apply { text = title; textSize = 26f; setTypeface(typeface, android.graphics.Typeface.BOLD); setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(0, 32, 0, 16) }
        val nv = TextView(this).apply { text = notes.replace("\n", "\n• "); textSize = 16f; setTextColor(Color.parseColor("#ffe3e3")); gravity = Gravity.CENTER }
        val dismiss = Button(this).apply { text = "✅ Dismiss"; textSize = 18f; setOnClickListener {
            Store.remove(this@AlarmActivity, id)
            stopAll(); finish()
        } }
        val snooze = Button(this).apply { text = "😴 Snooze 5 min"; textSize = 18f; setOnClickListener {
            val am = getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val t = Store.tasks(this@AlarmActivity).firstOrNull { it.id == id }
            val due = System.currentTimeMillis() + 5 * 60000
            val task = t ?: Task(id, title, notes, due)
            if (t == null) Store.add(this@AlarmActivity, task)
            schedule(this@AlarmActivity, id, title, notes, due)
            stopAll(); finish()
        } }
        root.addView(icon); root.addView(tv); root.addView(nv)
        LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(0, 48, 0, 0)
            addView(snooze); addView(dismiss)
            root.addView(this)
        }
        setContentView(root)
        startAlarmSounds()
        flash = Handler(Looper.getMainLooper())
        flash?.post(object : Runnable {
            override fun run() {
                flip = !flip
                root.setBackgroundColor(if (flip) Color.parseColor("#b3121f") else Color.parseColor("#6f0d18"))
                flash?.postDelayed(this, 500)
            }
        })
    }

    private fun startAlarmSounds() {
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val t = Store.tasks(this).firstOrNull { it.id == (intent.getStringExtra("id") ?: "") }
        var played = false
        // YOUR VOICE as the alarm sound, if the note has audio
        if (t != null && t.audioPath.isNotBlank()) {
            try {
                player = MediaPlayer().apply {
                    setDataSource(t.audioPath)
                    setAudioAttributes(attrs)
                    isLooping = true
                    prepare(); start()
                }
                played = true
            } catch (e: Exception) { }
        }
        if (!played) {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            player = MediaPlayer().apply {
                setDataSource(this@AlarmActivity, uri)
                setAudioAttributes(attrs)
                isLooping = true
                prepare(); start()
            }
        } catch (e: Exception) { }
        }
        try {
            vib = getSystemService(Vibrator::class.java)
            val pattern = longArrayOf(0, 700, 300, 700, 300)
            if (Build.VERSION.SDK_INT >= 26) vib?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            else @Suppress("DEPRECATION") vib?.vibrate(pattern, 0)
        } catch (e: Exception) { }
    }

    private fun stopAll() {
        try { player?.stop(); player?.release() } catch (e: Exception) { }
        vib?.cancel()
        flash?.removeCallbacksAndMessages(null)
    }

    override fun onDestroy() { stopAll(); super.onDestroy() }
    override fun onBackPressed() { /* must choose */ }

    companion object {
        fun schedule(ctx: Context, id: String, title: String, notes: String, dueAt: Long) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            val i = Intent(ctx, AlarmReceiver::class.java).putExtra("id", id).putExtra("title", title).putExtra("notes", notes)
            val flags = android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getBroadcast(ctx, id.hashCode(), i, flags)
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueAt, pi)
            } catch (e: SecurityException) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dueAt, pi)
            }
        }
    }
}
