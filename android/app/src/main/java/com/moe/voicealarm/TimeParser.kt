package com.moe.voicealarm

import java.util.Calendar

object TimeParser {
    private val digits: Map<Char, Char> = buildMap {
        val ar = "٠١٢٣٤٥٦٧٨٩"; val fa = "۰۱۲۳۴۵۶۷۸۹"
        for (i in 0..9) { put(ar[i], '0' + i); put(fa[i], '0' + i) }
    }
    private val ARNUM = mapOf(
        "اتنين" to 2L, "تلاتة" to 3L, "تلات" to 3L, "اربعة" to 4L, "اربع" to 4L,
        "خمسة" to 5L, "خمس" to 5L, "خمساية" to 5L, "ستة" to 6L, "ست" to 6L,
        "سبعة" to 7L, "سبع" to 7L, "تمانية" to 8L, "تسعة" to 9L, "تسع" to 9L,
        "عشرة" to 10L, "عشر" to 10L
    )

    data class When(val dueAt: Long, val phrase: String)

    fun normalize(raw: String): String {
        var s = buildString { for (c in raw) append(digits[c] ?: c) }
        s = s.replace("شويه", "شوية").replace("كده", "كدا").replace("ثوانيه", "ثواني")
            .replace("دقائق", "دقايق").replace("مساء", "مسا")
            .replace("[أإآ]".toRegex(), "ا").replace("ى", "ي")
        return s
    }

    private fun unitMs(n: Long, u: String): Long? {
        val l = u.lowercase()
        return when {
            l.startsWith("s") || u.contains("ثاني") || u.contains("ثوان") -> n * 1000
            l.startsWith("m") && !l.startsWith("mo") || u.contains("دقيق") || u.contains("دقايق") || u == "د" -> n * 60000
            l.startsWith("h") || u == "س" || u.contains("ساع") -> n * 3600000
            else -> null
        }
    }

    private fun narrated(src: String, phrase: String): Boolean {
        val i = src.indexOf(phrase); if (i < 0) return false
        val back = src.substring(maxOf(0, i - 34), i)
        return Regex("قال|قالت|قالوا|يقول|told me|he said|she said|they said", RegexOption.IGNORE_CASE).containsMatchIn(back)
    }

    fun explicitTail(text: String): Boolean {
        val t = normalize(text).trim().split(Regex("\\s+")).takeLast(7).joinToString(" ")
        return Regex("فكرني|ذكرني|remind me", RegexOption.IGNORE_CASE).containsMatchIn(t)
    }

    fun parseWhen(raw: String, now: Long): When? {
        val p = normalize(raw)
        val s = p.lowercase()
        var m: MatchResult?
        m = Regex("(?:بعد|خلال|in|after)\\s*(\\d+(?:\\.\\d+)?)\\s*(seconds?|secs?|s\\b|minutes?|mins?|m\\b|hours?|hrs?|h\\b|ثانية|ثواني|ثوان|دقيقة|دقايق|ساعة|ساعات|س|د)").find(s)
        if (m != null) { val ms = unitMs(m.groupValues[1].toDouble().toLong(), m.groupValues[2]); if (ms != null && !narrated(p, m.value)) return When(now + ms, m.value) }
        m = Regex("\\b(\\d+)\\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?)\\b").find(s)
        if (m != null) {
            val u = m.groupValues[2].lowercase()
            val ms = if (u.startsWith("d")) m.groupValues[1].toLong() * 86400000 else unitMs(m.groupValues[1].toLong(), u)
            if (ms != null && !narrated(p, m.value)) return When(now + ms, m.value)
        }
        m = Regex("(\\d+)\\s*(ثانية|ثواني|ثوان|دقيقة|دقايق|ساعة|ساعات)").find(p)
        if (m != null) { val ms = unitMs(m.groupValues[1].toLong(), m.groupValues[2]); if (ms != null && !narrated(p, m.value)) return When(now + ms, m.value) }
        val fuzzy = listOf(
            Pair("نص ساعة|نصف ساعة|half an hour", 1800000L),
            Pair("بعد ساعة|خلال ساعة|in an hour", 3600000L),
            Pair("in a minute", 60000L),
            Pair("دقيقتين|couple of minutes", 120000L),
            Pair("بعد شوية|كمان شوية|شويتين|in a bit|soon|قريبا", 300000L),
            Pair("ثواني|بعد ثانية|in a sec", 10000L),
            Pair("كم دقيقة|some minutes", 600000L),
            Pair("بعدين|later", 3600000L)
        )
        for ((pat, ms) in fuzzy) {
            m = Regex(pat, RegexOption.IGNORE_CASE).find(p)
            if (m != null && !narrated(p, m.value)) return When(now + ms, m.value)
        }
        val numw = ARNUM.keys.joinToString("|")
        m = Regex("(?:كمان|بعد|خلال)\\s*($numw)(?:\\s*(ثانية|ثواني|دقيقة|دقايق|ساعة|ساعات))?").find(p)
        if (m != null) {
            val n = ARNUM[m.groupValues[1]] ?: return null
            val ms = if (m.groupValues[2].isEmpty()) n * 60000 else unitMs(n, m.groupValues[2])
            if (ms != null && !narrated(p, m.value)) return When(now + ms, m.value)
        }
        m = Regex("($numw)\\s*(ثانية|ثواني|دقيقة|دقايق|ساعة|ساعات)").find(p)
        if (m != null) { val n = ARNUM[m.groupValues[1]] ?: return null; val ms = unitMs(n, m.groupValues[2]); if (ms != null && !narrated(p, m.value)) return When(now + ms, m.value) }
        val hasTomorrow = Regex("tomorrow|بكرة|بكره|غدا|بكرا").containsMatchIn(s)
        m = Regex("الساعة\\s*($numw)\\s*(مسا|م|ص|صباحا)?").find(p)
        if (m != null) {
            var h = (ARNUM[m.groupValues[1]] ?: return null).toInt()
            val ap = m.groupValues[2]
            if (ap == "مسا" || ap == "م") { if (h < 12) h += 12 } else if (h <= 7) h += 12
            val cal = Calendar.getInstance().apply { timeInMillis = now; set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
            if (cal.timeInMillis <= now || hasTomorrow) cal.add(Calendar.DAY_OF_YEAR, 1)
            return When(cal.timeInMillis, m.value)
        }
        m = Regex("(?:at|الساعة)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|ص|م|مسا)?").find(s)
        if (m != null) {
            var h = m.groupValues[1].toIntOrNull() ?: return null
            val min = m.groupValues[2].toIntOrNull() ?: 0
            if (h in 0..23 && min in 0..59) {
                when (m.groupValues[3]) {
                    "pm", "م", "مسا" -> if (h < 12) h += 12
                    "am", "ص" -> if (h == 12) h = 0
                    else -> if (h <= 7) h += 12
                }
                val cal = Calendar.getInstance().apply { timeInMillis = now; set(Calendar.HOUR_OF_DAY, h); set(Calendar.MINUTE, min); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
                if (cal.timeInMillis <= now || hasTomorrow) cal.add(Calendar.DAY_OF_YEAR, 1)
                return When(cal.timeInMillis, m.value)
            }
        }
        if (hasTomorrow) {
            val cal = Calendar.getInstance().apply { timeInMillis = now; add(Calendar.DAY_OF_YEAR, 1); set(Calendar.HOUR_OF_DAY, 9); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
            return When(cal.timeInMillis, "tomorrow")
        }
        return null
    }

    fun splitReminders(text: String): List<String> {
        val marks = Regex("فكرني|ذكرني|remind me", RegexOption.IGNORE_CASE).findAll(text).map { it.range.first }.toList()
        if (marks.size < 2) return listOf(text)
        val out = ArrayList<String>()
        for (i in marks.indices) {
            val from = marks[i]; val to = if (i + 1 < marks.size) marks[i + 1] else text.length
            val seg = text.substring(from, to).trim()
            if (seg.length > 2) out.add(seg)
        }
        return if (out.isEmpty()) listOf(text) else out
    }
}
