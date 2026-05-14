package br.com.casagranum.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Cream = Color(0xFFF5F0EA)
private val CreamDeep = Color(0xFFEBE3D8)
private val Copper = Color(0xFFA96132)
private val CopperDark = Color(0xFF8B4E28)
private val Ink = Color(0xFF1C2120)
private val InkDim = Color(0xFF3D3935)
private val Wheat = Color(0xFFD4C4A8)

private val LightColors = lightColorScheme(
    primary = Copper,
    onPrimary = Cream,
    primaryContainer = CopperDark,
    onPrimaryContainer = Cream,
    secondary = Wheat,
    onSecondary = Ink,
    background = Cream,
    onBackground = Ink,
    surface = Cream,
    onSurface = Ink,
    surfaceVariant = CreamDeep,
    onSurfaceVariant = InkDim,
    outline = Wheat,
)

@Composable
fun CasaGranumTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightColors,
        content = content,
    )
}
