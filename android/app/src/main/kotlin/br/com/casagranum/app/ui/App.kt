package br.com.casagranum.app.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
fun App() {
    Surface(modifier = Modifier.fillMaxSize()) {
        Text("Casa Granum")
    }
}
