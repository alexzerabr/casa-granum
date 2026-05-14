# Casa Granum — App Android

App nativo Kotlin + Jetpack Compose que envelopa o frontend web numa WebView. Distribuição interna via APK (sem Play Store).

- **Layout, fontes, funcionalidades:** idênticos ao web (a app *é* o web).
- **URL do servidor:** configurável no app, persiste em DataStore. Tela de boas-vindas na primeira abertura, ícone de engrenagem pra trocar depois.
- **Features:** download (CSV vai pra pasta Downloads), HTTP cleartext liberado (LAN/localhost), pull-to-refresh, back gesture (volta no histórico da WebView).
- **Identidade:** `br.com.casagranum.app` · minSdk 24 (Android 7) · targetSdk 34.

## Build local

Pré-requisitos: JDK 17, Android SDK (Android Studio Hedgehog ou superior, ou via `sdkmanager` CLI).

```bash
cd android
./gradlew assembleDebug          # APK debug em app/build/outputs/apk/debug/
./gradlew assembleRelease        # APK release assinado (precisa keystore.properties)
```

## Release via CI (GitHub Actions)

O workflow [`.github/workflows/android-release.yml`](../.github/workflows/android-release.yml) builda APK assinado a cada tag `android-v*` e anexa no GitHub Release.

### Setup único — gerar keystore e configurar secrets

1. Gerar keystore (uma vez, guardar em local seguro fora do repo):

   ```bash
   keytool -genkeypair -v -keystore release.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias casagranum
   ```

   Anote a senha do keystore, o alias (`casagranum`) e a senha da chave.

2. Codificar o keystore em base64 pra colocar como secret:

   ```bash
   base64 -w0 release.jks
   ```

3. Em `Settings → Secrets and variables → Actions` do repo, criar:

   | Secret | Valor |
   |---|---|
   | `KEYSTORE_BASE64` | output do `base64 -w0 release.jks` |
   | `KEYSTORE_PASSWORD` | senha do keystore |
   | `KEY_ALIAS` | `casagranum` |
   | `KEY_PASSWORD` | senha da chave |

### Disparar um release

```bash
git tag android-v1.0.0
git push origin android-v1.0.0
```

Quando o workflow terminar (verde), abra a página de Releases do repo — o APK estará anexado como `casa-granum-android-v1.0.0.apk`.

## Instalar no celular (sideload)

1. Baixar o `.apk` do Release no celular (link direto no navegador).
2. Em `Configurações → Segurança → Instalar apps desconhecidos`, autorizar o app que abriu o `.apk` (Chrome, Files, etc.).
3. Abrir o `.apk` baixado, confirmar a instalação.
4. Na primeira abertura, informar a URL do servidor:
   - LAN: `http://192.168.x.x:8080`
   - Local: `http://localhost:8080` (só funciona se o backend rodar no próprio celular, raro)
   - Produção: `https://app.casagranum.com.br`

Pra trocar a URL depois, toque no ícone de engrenagem no canto superior direito.

## Estrutura

```
android/
├── app/
│   ├── build.gradle.kts                   # config do módulo (sdk versions, deps, signing)
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── kotlin/br/com/casagranum/app/
│       │   ├── MainActivity.kt
│       │   ├── data/UrlRepository.kt      # DataStore + normalização da URL
│       │   └── ui/
│       │       ├── App.kt                 # roteia welcome ↔ webview
│       │       ├── WelcomeScreen.kt       # primeira abertura
│       │       ├── WebViewScreen.kt       # WebView + gear + download + refresh
│       │       └── theme/Theme.kt         # paleta da marca em Material3
│       └── res/                           # strings, cores, ícones, network config
├── build.gradle.kts                       # plugins root
├── settings.gradle.kts
└── gradle/wrapper/                        # Gradle 8.7
```

## Limitações conhecidas (v1)

- Sem push notifications — alertas de estoque seguem indo pelo Telegram.
- Sem upload de arquivos via WebView (não há fluxo no web que precise).
- Sem dark mode (web também é light-only).
