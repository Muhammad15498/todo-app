package com.moe.voicealarm

import org.json.JSONObject
import java.io.DataOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Free cloud Whisper (mixed Arabic/English natively). Key: console.groq.com/keys */
object GroqClient {
    fun transcribe(apiKey: String, path: String): String {
        val boundary = "----va" + System.currentTimeMillis()
        val conn = URL("https://api.groq.com/openai/v1/audio/transcriptions").openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.connectTimeout = 20000
        conn.readTimeout = 60000
        conn.setRequestProperty("Authorization", "Bearer $apiKey")
        conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
        val out = DataOutputStream(conn.outputStream)
        out.writeBytes("--$boundary\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-large-v3-turbo\r\n")
        out.writeBytes("--$boundary\r\nContent-Disposition: form-data; name=\"response_format\"\r\n\r\njson\r\n")
        out.writeBytes("--$boundary\r\nContent-Disposition: form-data; name=\"temperature\"\r\n\r\n0\r\n")
        out.writeBytes("--$boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"note.m4a\"\r\nContent-Type: audio/mp4\r\n\r\n")
        File(path).inputStream().use { it.copyTo(out) }
        out.writeBytes("\r\n--$boundary--\r\n")
        out.flush(); out.close()
        val code = conn.responseCode
        val body = (if (code in 200..299) conn.inputStream else conn.errorStream).bufferedReader().use { it.readText() }
        if (code !in 200..299) throw Exception("Groq HTTP $code: ${body.take(160)}")
        return JSONObject(body).optString("text", "").trim()
    }
}
