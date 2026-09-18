package com.db.ai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import kotlin.math.cos
import kotlin.math.sin

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
private fun DbCore(active: Boolean) {
    val transition = rememberInfiniteTransition(label = "db-core")
    val pulse by transition.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(tween(1100), RepeatMode.Reverse),
        label = "pulse"
    )
    val rotation by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(if (active) 1800 else 4200)),
        label = "rotation"
    )
    val breathe by transition.animateFloat(
        initialValue = 0.35f,
        targetValue = 0.75f,
        animationSpec = infiniteRepeatable(tween(900), RepeatMode.Reverse),
        label = "breathe"
    )

    Canvas(
        Modifier
            .fillMaxWidth()
            .height(210.dp)
    ) {
        val center = Offset(size.width / 2f, size.height / 2f)
        val radius = minOf(size.width, size.height) * 0.19f * pulse

        // Soft layered glow.
        drawCircle(Color(0xFF4FC3F7).copy(alpha = 0.055f), radius * 2.8f)
        drawCircle(Color(0xFF4FC3F7).copy(alpha = 0.08f), radius * 2.1f)
        drawCircle(Color(0xFF4FC3F7).copy(alpha = 0.13f), radius * 1.55f)

        // Rotating energy rings.
        for (i in 0 until 3) {
            val ringRadius = radius * (1.55f + i * 0.22f)
            drawCircle(
                Color(0xFF81D4FA).copy(alpha = 0.20f - i * 0.045f),
                ringRadius,
                style = Stroke(width = 2.dp.toPx())
            )
        }

        // Orbiting nodes.
        for (i in 0 until 4) {
            val angle = Math.toRadians((rotation + i * 90f).toDouble())
            val orbit = radius * 1.55f
            val node = Offset(
                center.x + cos(angle).toFloat() * orbit,
                center.y + sin(angle).toFloat() * orbit
            )
            drawCircle(Color(0xFFB3E5FC).copy(alpha = 0.45f), radius * 0.07f, node)
        }

        // DB core.
        drawCircle(Color(0xFF0288D1).copy(alpha = breathe), radius)
        drawCircle(Color(0xFFB3E5FC).copy(alpha = 0.85f), radius * 0.68f)
        drawCircle(Color(0xFF01579B), radius * 0.48f)
        drawCircle(Color.White.copy(alpha = 0.9f), radius * 0.16f)
    }
}

@Composable
private fun DbApp() {
    var input by remember { mutableStateOf("") }
    var showApp by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var conversationId by remember { mutableStateOf<String?>(null) }
    var messages by remember { mutableStateOf(listOf(ChatMessage("Hello. I am DB. The app shell is ready.", true))) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(180)
        showApp = true
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
                enter = fadeIn(animationSpec = tween(700)) + scaleIn(
                    initialScale = 0.90f,
                    animationSpec = tween(700)
                )
            ) {
                Column(
                    Modifier.fillMaxSize().padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text("DB", style = MaterialTheme.typography.headlineMedium)
                    Text("Your personal AI", color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f))

                    DbCore(active = sending)

                    LazyColumn(
                        Modifier.weight(1f).fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        items(messages) { m ->
                            Text(
                                if (m.fromDb) "DB: " + m.text else "You: " + m.text,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                        }
                    }

                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            input,
                            { input = it },
                            Modifier.weight(1f),
                            placeholder = { Text(if (sending) "DB is thinking..." else "Message DB") },
                            singleLine = true,
                            enabled = !sending
                        )
                        Button(
                            enabled = !sending && input.isNotBlank(),
                            onClick = {
                                val sent = input.trim()
                                input = ""
                                messages = messages + ChatMessage(sent, false)
                                sending = true
                                scope.launch {
                                    sendToDb(sent, conversationId).onSuccess { result ->
                                        conversationId = result.second ?: conversationId
                                        messages = messages + ChatMessage(result.first, true)
                                    }.onFailure { error ->
                                        messages = messages + ChatMessage(
                                            "I could not reach the DB server: " +
                                                (error.message ?: "unknown error"),
                                            true
                                        )
                                    }
                                    sending = false
                                }
                            }
                        ) { Text("Send") }
                    }
                }
            }
        }
    }
}
