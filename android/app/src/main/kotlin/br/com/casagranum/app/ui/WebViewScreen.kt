package br.com.casagranum.app.ui

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.view.ViewGroup
import android.webkit.URLUtil
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import br.com.casagranum.app.R
import br.com.casagranum.app.data.UrlRepository

@Composable
fun WebViewScreen(url: String, onChangeUrl: (String) -> Unit) {
    val context = LocalContext.current
    var settingsOpen by remember { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }

    BackHandler(enabled = webViewRef?.canGoBack() == true) {
        webViewRef?.goBack()
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val refresh = SwipeRefreshLayout(ctx)
                val web = WebView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        loadsImagesAutomatically = true
                        mediaPlaybackRequiresUserGesture = false
                        cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
                        // true = WebView respeita o <meta viewport> do site (device-width).
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        builtInZoomControls = true
                        displayZoomControls = false
                        userAgentString = "$userAgentString CasaGranumApp"
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: android.webkit.WebResourceRequest,
                        ): Boolean {
                            val target = request.url
                            val base = Uri.parse(url)
                            // Mesma origem: navega na própria WebView.
                            if (target.host == base.host) return false
                            // Externo: abre no browser do sistema.
                            ctx.startActivity(
                                Intent(Intent.ACTION_VIEW, target).apply {
                                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                },
                            )
                            return true
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            refresh.isRefreshing = false
                        }
                    }
                    setDownloadListener { dlUrl, userAgent, contentDisposition, mimeType, _ ->
                        startDownload(ctx, dlUrl, userAgent, contentDisposition, mimeType)
                    }
                    loadUrl(url)
                }
                webViewRef = web
                refresh.addView(web)
                refresh.setOnRefreshListener { web.reload() }
                refresh
            },
            update = { refresh ->
                val web = refresh.getChildAt(0) as? WebView ?: return@AndroidView
                if (web.url != url && Uri.parse(web.url).toString() != url) {
                    web.loadUrl(url)
                }
            },
        )

        IconButton(
            onClick = { settingsOpen = true },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .navigationBarsPadding()
                .padding(16.dp)
                .alpha(0.85f),
            colors = IconButtonDefaults.iconButtonColors(
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.onSurface,
            ),
        ) {
            Icon(
                imageVector = Icons.Outlined.Settings,
                contentDescription = stringResource(R.string.settings_cd),
            )
        }
    }

    if (settingsOpen) {
        SettingsDialog(
            currentUrl = url,
            onDismiss = { settingsOpen = false },
            onConfirm = { typed ->
                settingsOpen = false
                onChangeUrl(typed)
            },
        )
    }
}

@Composable
private fun SettingsDialog(
    currentUrl: String,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    var value by remember { mutableStateOf(currentUrl) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_title)) },
        text = {
            OutlinedTextField(
                value = value,
                onValueChange = { value = it },
                singleLine = true,
                label = { Text(stringResource(R.string.url_label)) },
            )
        },
        confirmButton = {
            TextButton(
                onClick = { if (UrlRepository.isValid(value)) onConfirm(value) },
                enabled = UrlRepository.isValid(value),
            ) {
                Text(stringResource(R.string.save))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.cancel))
            }
        },
    )
}

private fun startDownload(
    context: Context,
    url: String,
    userAgent: String?,
    contentDisposition: String?,
    mimeType: String?,
) {
    val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
    val request = DownloadManager.Request(Uri.parse(url)).apply {
        setMimeType(mimeType)
        addRequestHeader("User-Agent", userAgent ?: "")
        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
        setTitle(name)
        setDescription("Casa Granum")
    }
    val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
    dm.enqueue(request)
    Toast.makeText(context, R.string.download_started, Toast.LENGTH_SHORT).show()
}
