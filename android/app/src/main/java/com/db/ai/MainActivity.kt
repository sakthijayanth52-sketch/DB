package com.db.ai

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.content.SharedPreferences
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sin

data class ChatMessage(val text: String, val fromDb: Boolean)

private const val DB_BACKEND_URL = BuildConfig.DB_BACKEND_URL

class MainActivity : ComponentActivity() {
    private var tts: TextToSpeech? = null
    private var speechRecognizer: SpeechRecognizer? = null
    private var onSpeechResult: ((String) -> Unit)? = null

    private val micPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startListening()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.getDefault()
            }
        }
        if (SpeechRecognizer.isRecognitionAvailable(this)) {
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        }
        setContent { DbApp() }
    }

    private fun startListening() {
        val recognizer = speechRecognizer ?: return
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        }
        recognizer.setRecognitionListener(DbRecognitionListener(
            onResult = { text -> onSpeechResult?.invoke(text) },
            onError = { }
        ))
        recognizer.startListening(intent)
    }

    fun listen(onResult: (String) -> Unit) {
        onSpeechResult = onResult
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            startListening()
        } else {
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    fun speak(text: String) {
        if (text.isNotBlank()) {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "db-response")
        }
    }

    override fun onDestroy() {
        speechRecognizer?.destroy()
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}

private class DbRecognitionListener(
    private val onResult: (String) -> Unit,
    private val onError: (Int) -> Unit
) : android.speech.RecognitionListener {
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onError(error: Int) = onError.invoke(error)
    override fun onResults(results: Bundle?) {
        val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        if (!text.isNullOrBlank()) onResult(text)
    }
    override fun onPartialResults(partialResults: Bundle?) {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
}

private suspend fun sendToDb(message: String, conversationId: String?): Result<Triple<String, String?, String>> =
    withContext(Dispatchers.IO) {
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
            if (code !in 200..299) error("DB server error: $code")
            val json = JSONObject(responseBody)
            val reply = json.optString("text")
            val responseId = json.optString("responseId").ifBlank { null }
            val newConversationId = json.optString("conversationId")
            Triple(reply, responseId, newConversationId)
        }
    }

@Composable
private fun DbCore(active: Boolean) {
    val transition = rememberInfiniteTransition(label = "db-core")
    val pulse by transition.animateFloat(0.92f, 1.08f, infiniteRepeatable(tween(1100), RepeatMode.Reverse), label = "pulse")
    val rotation by transition.animateFloat(0f, 360f, infiniteRepeatable(tween(if (active) 900 else 4200)), label = "rotation")
    val breathe by transition.animateFloat(0.35f, 0.75f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "breathe")

    Canvas(Modifier.fillMaxWidth().height(210.dp)) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val radius = minOf(size.width, size.height) * 0.19f * pulse
        drawCircle(Color(0xFF4FC3F7).copy(alpha = 0.055f), radius * 2.8f)
        drawCircle(Color(0xFF4FC3F7).copy(alpha = 0.08f), radius * 2.1f)
        drawCircle(Color(0xFF4FC3F7).copy(alpha = 0.13f), radius * 1.55f)
        for (i in 0 until 3) {
            drawCircle(Color(0xFF81D4FA).copy(alpha = 0.20f - i * 0.045f), radius * (1.55f + i * 0.22f), style = Stroke(width = 2.dp.toPx()))
        }
        for (i in 0 until 4) {
            val angle = Math.toRadians((rotation + i * 90f).toDouble())
            val orbit = radius * 1.55f
            drawCircle(Color(0xFFB3E5FC).copy(alpha = 0.45f), radius * 0.07f,
                Offset(center.x + cos(angle).toFloat() * orbit, center.y + sin(angle).toFloat() * orbit))
        }
        drawCircle(Color(0xFF0288D1).copy(alpha = breathe), radius)
        drawCircle(Color(0xFFB3E5FC).copy(alpha = 0.85f), radius * 0.68f)
        drawCircle(Color(0xFF01579B), radius * 0.48f)
        drawCircle(Color.White.copy(alpha = 0.9f), radius * 0.16f)
    }
}

@Composable
private fun DbApp() {
    val activity = androidx.compose.ui.platform.LocalContext.current as MainActivity
    val prefs: SharedPreferences = remember {
        activity.getSharedPreferences("db_state", android.content.Context.MODE_PRIVATE)
    }
    var input by remember { mutableStateOf("") }
    var showApp by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var listening by remember { mutableStateOf(false) }
    var conversationId by remember { mutableStateOf(prefs.getString("conversation_id", null)) }
    var speakReplies by remember { mutableStateOf(true) }
    var messages by remember { mutableStateOf(listOf(ChatMessage("Hello. I am DB. Voice and text are ready.", true))) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(180)
        showApp = true
        val savedId = conversationId
        if (savedId != null) {
            withContext(Dispatchers.IO) {
                runCatching {
                    val connection = (URL(DB_BACKEND_URL + "/v1/conversations/" + savedId + "/messages").openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 10_000
                        readTimeout = 20_000
                    }
                    val code = connection.responseCode
                    val body = if (code in 200..299) connection.inputStream.bufferedReader().use { it.readText() } else ""
                    connection.disconnect()
                    if (code !in 200..299) error("history unavailable")
                    val json = JSONObject(body)
                    val arr = json.optJSONArray("messages") ?: return@runCatching
                    val restored = mutableListOf<ChatMessage>()
                    for (i in 0 until arr.length()) {
                        val item = arr.getJSONObject(i)
                        val role = item.optString("role")
                        val text = item.optString("content")
                        if (text.isNotBlank()) restored += ChatMessage(text, role == "assistant")
                    }
                    if (restored.isNotEmpty()) messages = restored
                }
            }
        }
    }

    fun submit(text: String) {
        val sent = text.trim()
        if (sent.isBlank() || sending) return
        input = ""
        messages = messages + ChatMessage(sent, false)
        sending = true
        scope.launch {
            sendToDb(sent, conversationId).onSuccess { result ->
                conversationId = result.third.ifBlank { conversationId ?: "" }.ifBlank { null }
                conversationId?.let { prefs.edit().putString("conversation_id", it).apply() }
                messages = messages + ChatMessage(result.first, true)
                if (speakReplies) activity.speak(result.first)
            }.onFailure { error ->
                val reply = "I could not reach the DB server: " + (error.message ?: "unknown error")
                messages = messages + ChatMessage(reply, true)
                if (speakReplies) activity.speak(reply)
            }
            sending = false
        }
    }

    val darkColors = darkColorScheme(
        primary = Color(0xFF81D4FA),
        onPrimary = Color(0xFF003544),
        background = Color(0xFF05070A),
        surface = Color(0xFF0A0F14),
        surfaceVariant = Color(0xFF121A21)
    )

    MaterialTheme(colorScheme = darkColors) {
        Surface(Modifier.fillMaxSize(), color = darkColors.background) {
            AnimatedVisibility(
                visible = showApp,
                enter = fadeIn(tween(700)) + scaleIn(initialScale = 0.90f, animationSpec = tween(700))
            ) {
                Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column {
                            Text("DB", style = MaterialTheme.typography.headlineMedium)
                            Text("Your personal AI", color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(
                                selected = speakReplies,
                                onClick = { speakReplies = !speakReplies },
                                label = { Text(if (speakReplies) "Voice on" else "Voice off") }
                            )
                        }
                    }

                    DbCore(active = sending || listening)

                    LazyColumn(
                        Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(messages) { m ->
                            Text(if (m.fromDb) "DB: " + m.text else "You: " + m.text)
                        }
                    }

                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = input,
                            onValueChange = { input = it },
                            Modifier.weight(1f),
                            placeholder = { Text(if (listening) "Listening..." else if (sending) "DB is thinking..." else "Message DB") },
                            singleLine = true,
                            enabled = !sending
                        )
                        IconButton(
                            enabled = !sending,
                            onClick = {
                                listening = true
                                activity.listen { text ->
                                    listening = false
                                    input = text
                                    submit(text)
                                }
                            }
                        ) { Text("🎙") }
                        Button(enabled = !sending && input.isNotBlank(), onClick = { submit(input) }) {
                            Text("Send")
                        }
                    }
                }
            }
        }
    }
}
