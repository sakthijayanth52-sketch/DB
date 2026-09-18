package com.db.ai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class ChatMessage(val text: String, val fromDb: Boolean)

private const val DB_BACKEND_URL = "http://10.0.2.2:8080"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { DbApp() }
    }
}

private suspend fun sendToDb(message: String, conversationId: String?): Result<Pair<String, String?>> = withContext(Dispatchers.IO) {
    runCatching {
        val connection = (URL(DB_BACKEND_URL + "/v1/chat").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 60_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        val body = JSONObject().apply {
            put("message", message)
            if (conversationId != null) put("conversationId", conversationId)
        }.toString()
        connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val responseBody = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
        connection.disconnect()
        if (code !in 200..299) error("DB server error: " + code)
        val json = JSONObject(responseBody)
        val reply = json.optString("message").ifBlank { json.optString("text") }
        val responseId = json.optString("responseId").ifBlank { null }
        Pair(reply, responseId)
    }
}

@Composable
private fun DbApp() {
    var input by remember { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var conversationId by remember { mutableStateOf<String?>(null) }
    var messages by remember { mutableStateOf(listOf(ChatMessage("Hello. I am DB. The app shell is ready.", true))) }
    val scope = rememberCoroutineScope()
    MaterialTheme {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("DB", style = MaterialTheme.typography.headlineMedium)
                Text("Your personal AI")
                LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(messages) { m -> Text(if (m.fromDb) "DB: " + m.text else "You: " + m.text) }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(input, { input = it }, Modifier.weight(1f), placeholder = { Text(if (sending) "DB is thinking..." else "Message DB") }, singleLine = true, enabled = !sending)
                    Button(enabled = !sending && input.isNotBlank(), onClick = {
                        val sent = input.trim()
                        input = ""
                        messages = messages + ChatMessage(sent, false)
                        sending = true
                        scope.launch {
                            sendToDb(sent, conversationId).onSuccess { result ->
                                conversationId = result.second ?: conversationId
                                messages = messages + ChatMessage(result.first, true)
                            }.onFailure { error ->
                                messages = messages + ChatMessage("I could not reach the DB server: " + (error.message ?: "unknown error"), true)
                            }
                            sending = false
                        }
                    }) { Text("Send") }
                }
            }
        }
    }
}
