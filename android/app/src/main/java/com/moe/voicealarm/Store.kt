package com.moe.voicealarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class Task(
    val id: String,
    val title: String,
    val notes: String,
    val dueAt: Long,
    val audioPath: String = "",
    val transcript: String = "",
    val done: Boolean = false
) { companion object }

object Store {
    private fun prefs(ctx: Context) = ctx.getSharedPreferences("voicealarm", Context.MODE_PRIVATE)

    fun tasks(ctx: Context): MutableList<Task> {
        val arr = prefs(ctx).getString("tasks", null) ?: return mutableListOf()
        val out = mutableListOf<Task>()
        for (i in 0 until arr.length()) out.add(Task.fromJSON(arr.getJSONObject(i)))
        return out
    }

    fun save(ctx: Context, list: List<Task>) {
        val arr = JSONArray()
        list.forEach { arr.put(it.toJSON()) }
        prefs(ctx).edit().putString("tasks", arr.toString()).apply()
    }

    fun add(ctx: Context, t: Task) { val l = tasks(ctx); l.add(t); save(ctx, l) }
    fun update(ctx: Context, t: Task) { save(ctx, tasks(ctx).map { if (it.id == t.id) t else it }) }
    fun get(ctx: Context, id: String): Task? = tasks(ctx).firstOrNull { it.id == id }
    fun remove(ctx: Context, id: String) {
        tasks(ctx).firstOrNull { it.id == id }?.audioPath?.let { File(it).delete() }
        save(ctx, tasks(ctx).filter { it.id != id })
    }
    fun markFired(ctx: Context, id: String) { save(ctx, tasks(ctx).map { if (it.id == id) it.copy(done = true) else it }) }

    fun groqKey(ctx: Context): String = prefs(ctx).getString("groq_key", "") ?: ""
    fun setGroqKey(ctx: Context, k: String) { prefs(ctx).edit().putString("groq_key", k).apply() }

    fun audioDir(ctx: Context): File = File(ctx.filesDir, "audio").apply { mkdirs() }
}

fun Task.toJSON(): JSONObject = JSONObject()
    .put("id", id).put("title", title).put("notes", notes).put("dueAt", dueAt)
    .put("audioPath", audioPath).put("transcript", transcript).put("done", done)

fun Task.Companion.fromJSON(o: JSONObject): Task = Task(
    o.getString("id"), o.optString("title"), o.optString("notes"), o.getLong("dueAt"),
    o.optString("audioPath"), o.optString("transcript"), o.optBoolean("done")
)
