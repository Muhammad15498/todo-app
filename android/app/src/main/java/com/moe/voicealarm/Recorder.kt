package com.moe.voicealarm

import android.content.Context
import android.media.MediaMetadataRetriever
import android.media.MediaRecorder
import java.io.File
import java.util.UUID

/** WhatsApp-grade audio recording: the FILE is the product, this cannot silently fail */
object Recorder {
    private var mr: MediaRecorder? = null
    private var file: File? = null
    private var start = 0L

    fun start(ctx: Context): Boolean {
        return try {
            stop()
            file = File(Store.audioDir(ctx), UUID.randomUUID().toString().take(10) + ".m4a")
            @Suppress("DEPRECATION")
            mr = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(64000)
                setAudioSamplingRate(16000)
                setOutputFile(file!!.absolutePath)
                prepare(); start()
            }
            start = System.currentTimeMillis()
            true
        } catch (e: Exception) { false }
    }

    /** returns Pair(path, durationMs) or null */
    fun stop(): Pair<String, Long>? {
        val f = file; val rec = mr
        mr = null; file = null
        if (rec == null || f == null) return null
        return try {
            rec.stop(); rec.release()
            val dur = System.currentTimeMillis() - start
            if (f.length() < 900 || dur < 400) { f.delete(); null } else Pair(f.absolutePath, dur)
        } catch (e: Exception) { try { rec.release() } catch (_: Exception) {}; f.delete(); null }
    }

    fun durationOf(path: String): Long = try {
        val mmr = MediaMetadataRetriever()
        mmr.setDataSource(path)
        val d = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        mmr.release(); d
    } catch (e: Exception) { 0L }
}
