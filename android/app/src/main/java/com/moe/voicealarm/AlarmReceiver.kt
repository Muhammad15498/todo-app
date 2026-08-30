package com.moe.voicealarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        Store.markFired(ctx, id)
        val i = Intent(ctx, AlarmActivity::class.java).apply {
            putExtra("id", id)
            putExtra("title", intent.getStringExtra("title") ?: "Reminder")
            putExtra("notes", intent.getStringExtra("notes") ?: "")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK or
                     Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
        }
        ctx.startActivity(i)
    }
}
