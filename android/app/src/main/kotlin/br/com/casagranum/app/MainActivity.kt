package br.com.casagranum.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import br.com.casagranum.app.ui.App
import br.com.casagranum.app.ui.theme.CasaGranumTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            CasaGranumTheme {
                App()
            }
        }
    }
}
