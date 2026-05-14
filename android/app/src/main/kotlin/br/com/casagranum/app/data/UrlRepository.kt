package br.com.casagranum.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "casagranum_settings")
private val SERVER_URL = stringPreferencesKey("server_url")

class UrlRepository(private val context: Context) {

    val serverUrl: Flow<String?> = context.dataStore.data.map { it[SERVER_URL] }

    suspend fun setUrl(url: String) {
        val normalized = normalize(url)
        context.dataStore.edit { it[SERVER_URL] = normalized }
    }

    companion object {
        fun normalize(raw: String): String {
            val trimmed = raw.trim().trimEnd('/')
            if (trimmed.isEmpty()) return ""
            if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
                return trimmed
            }
            // Hosts privados/loopback ficam em http; resto vai pra https.
            val isLocal = trimmed.startsWith("localhost") ||
                trimmed.startsWith("127.") ||
                trimmed.startsWith("192.168.") ||
                trimmed.startsWith("10.") ||
                trimmed.matches(Regex("""^172\.(1[6-9]|2\d|3[01])\..*"""))
            return if (isLocal) "http://$trimmed" else "https://$trimmed"
        }

        fun isValid(raw: String): Boolean {
            val s = raw.trim()
            if (s.length < 3) return false
            return !s.contains(" ") && s.contains(".") || s.startsWith("http://localhost") || s.startsWith("localhost")
        }
    }
}
