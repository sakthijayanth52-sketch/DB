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

data class ChatMessage(val text: String, val fromDb: Boolean)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { DbApp() }
    }
}

@Composable
private fun DbApp() {
    var input by remember { mutableStateOf("") }
    var messages by remember { mutableStateOf(listOf(ChatMessage("Hello. I am DB. The app shell is ready.", true))) }
    MaterialTheme {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("DB", style = MaterialTheme.typography.headlineMedium)
                Text("Your personal AI")
                LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(messages) { m -> Text(if (m.fromDb) "DB: ${m.text}" else "You: ${m.text}") }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(input, { input = it }, Modifier.weight(1f), placeholder = { Text("Message DB") }, singleLine = true)
                    Button(onClick = { if (input.isNotBlank()) { val sent = input.trim(); messages = messages + ChatMessage(sent, false) + ChatMessage("Backend connection will be enabled next.", true); input = "" } }) { Text("Send") }
                }
            }
        }
    }
}
