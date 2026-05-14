package br.com.casagranum.app.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import br.com.casagranum.app.data.UrlRepository
import kotlinx.coroutines.launch

@Composable
fun App() {
    val context = LocalContext.current
    val repo = remember { UrlRepository(context) }
    val url by repo.serverUrl.collectAsState(initial = null)
    val scope = rememberCoroutineScope()

    val current = url
    if (current.isNullOrBlank()) {
        WelcomeScreen(
            onConnect = { typed -> scope.launch { repo.setUrl(typed) } },
        )
    } else {
        WebViewScreen(
            url = current,
            onChangeUrl = { typed -> scope.launch { repo.setUrl(typed) } },
        )
    }
}
