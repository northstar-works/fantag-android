package com.northstarlabs.fantag

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.*
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.preference.PreferenceManager
import com.northstarlabs.fantag.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var isFirstLoad = true
    private var isForeground = false
    private var lastForegroundRefreshAt = 0L
    private val foregroundHandler = Handler(Looper.getMainLooper())
    private val foregroundRefreshRunnable = object : Runnable {
        override fun run() {
            if (!isForeground) return
            refreshShellAndWebApp("periodic", forcePageReload = false)
            foregroundHandler.postDelayed(this, PERIODIC_REFRESH_MS)
        }
    }

    companion object {
        private const val TAG = "FANTAG"
        const val PREF_SERVER_URL = "server_url"
        const val DEFAULT_URL = "https://fantag.sidneyshelton.com/"
        private const val PERIODIC_REFRESH_MS = 60_000L
        private const val FOREGROUND_REFRESH_MIN_MS = 15_000L
    }

    // File chooser for screenshot imports
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri ->
        val result = uri?.let { arrayOf(it) }
        filePathCallback?.onReceiveValue(result)
        filePathCallback = null
    }

    // Camera/storage permission request
    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { perms ->
        val granted = perms.values.all { it }
        if (!granted) {
            Toast.makeText(this, "Camera/storage permission needed for screenshot import", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // The app uses a custom Toolbar. Keep launch resilient even if a bad theme slips into a build.
        try {
            setSupportActionBar(binding.toolbar)
            supportActionBar?.title = ""
            binding.toolbar.title = ""
        } catch (e: IllegalStateException) {
            Log.e(TAG, "Toolbar setup failed; continuing without support ActionBar", e)
        }
        // Stable Android wrapper: Firebase/FCM push notifications intentionally disabled.
        // The native shell only provides Home/Refresh plus the actual Android shell version.
        // Web/backend navigation and status buttons live inside the web app itself.
        updateShellVersionBadge()
        binding.btnHome.setOnClickListener { loadFantag() }
        binding.btnRefresh.setOnClickListener { refreshShellAndWebApp("manual", forcePageReload = true) }
        setupWebView()
        setupSwipeRefresh()

        if (savedInstanceState != null) {
            binding.webView.restoreState(savedInstanceState)
        } else {
            loadFantag()
        }
    }

    // ── Toolbar ────────────────────────────────────────────────────────────────

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        // Explicit fixed toolbar buttons are defined in activity_main.xml.
        // Do not inflate menu items; this prevents buttons from floating into the status bar.
        return false
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_refresh -> {
                binding.webView.reload()
                true
            }
            R.id.action_settings -> {
                startActivity(Intent(this, SettingsActivity::class.java))
                true
            }
            R.id.action_home -> {
                loadFantag()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    // ── WebView Setup ──────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val wv = binding.webView
        val ws = wv.settings

        // JavaScript and storage
        ws.javaScriptEnabled = true
        ws.domStorageEnabled = true
        ws.databaseEnabled = true

        // Zoom and layout
        ws.useWideViewPort = true
        ws.loadWithOverviewMode = true
        ws.setSupportZoom(true)
        ws.builtInZoomControls = true
        ws.displayZoomControls = false

        // File access for screenshot imports
        ws.allowFileAccess = true
        ws.allowContentAccess = true

        // Avoid stale roster/status data when the shell opens or resumes.
        ws.cacheMode = WebSettings.LOAD_NO_CACHE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            ws.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }

        // Media
        ws.mediaPlaybackRequiresUserGesture = false

        // User-agent: identify as FANTAG Android
        ws.userAgentString = "${ws.userAgentString} FANTAGAndroid/${BuildConfig.VERSION_NAME}"

        wv.addJavascriptInterface(FantagAndroidBridge(this), "FantagAndroid")
        wv.webViewClient = FantagWebViewClient()
        wv.webChromeClient = FantagWebChromeClient()
        wv.scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            refreshShellAndWebApp("swipe", forcePageReload = true)
        }
        binding.swipeRefresh.setColorSchemeResources(
            R.color.fantag_green,
            R.color.fantag_blue
        )
    }

    // ── Navigation ─────────────────────────────────────────────────────────────

    private fun loadFantag() {
        val prefs = PreferenceManager.getDefaultSharedPreferences(this)
        val url = prefs.getString(PREF_SERVER_URL, DEFAULT_URL) ?: DEFAULT_URL
        if (!isNetworkAvailable()) {
            showOfflineState(url)
            return
        }
        showLoadingState()
        updateShellVersionBadge()
        binding.webView.loadUrl(url, noCacheHeaders())
    }

    private fun updateShellVersionBadge() {
        binding.tvShellVersion.text = "shell v${BuildConfig.VERSION_NAME} · ${BuildConfig.VERSION_CODE}"
    }

    private fun noCacheHeaders(): Map<String, String> = mapOf(
        "Cache-Control" to "no-cache, no-store, must-revalidate",
        "Pragma" to "no-cache"
    )

    private fun startForegroundRefreshLoop() {
        foregroundHandler.removeCallbacks(foregroundRefreshRunnable)
        foregroundHandler.postDelayed(foregroundRefreshRunnable, PERIODIC_REFRESH_MS)
    }

    private fun refreshShellAndWebApp(reason: String, forcePageReload: Boolean) {
        updateShellVersionBadge()

        if (forcePageReload) {
            if (!isNetworkAvailable()) {
                val currentUrl = binding.webView.url ?: DEFAULT_URL
                showOfflineState(currentUrl)
                return
            }
            binding.swipeRefresh.isRefreshing = true
            val currentUrl = binding.webView.url
            if (currentUrl.isNullOrBlank()) {
                loadFantag()
            } else {
                binding.webView.reload()
            }
            return
        }

        triggerWebAppDataRefresh(reason)
    }

    /**
     * Ask the web app to refresh its own live/status data without running any
     * native background job. This only runs while the Activity is resumed.
     * The web app can listen for either event name below, and we also click a
     * visible in-page Refresh/Sync button if one exists.
     */
    private fun triggerWebAppDataRefresh(reason: String) {
        if (binding.webView.url.isNullOrBlank()) return

        val safeReason = reason.replace("\\", "\\\\").replace("'", "\\'")
        val js = """
            (function(){
              const detail = { source: 'fantag-android-shell', reason: '$safeReason', ts: Date.now() };
              function visible(el){
                if (!el) return false;
                const r = el.getBoundingClientRect();
                const st = window.getComputedStyle(el);
                return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
              }
              function fire(name){
                try { window.dispatchEvent(new CustomEvent(name, { detail: detail })); } catch(e) {}
              }
              fire('fantag-android-refresh');
              fire('fantag:shell-refresh');
              fire('fantag:foreground-refresh');

              try {
                if (window.FANTAG && typeof window.FANTAG.refresh === 'function') { window.FANTAG.refresh(detail); return 'FANTAG.refresh'; }
                if (window.fantag && typeof window.fantag.refresh === 'function') { window.fantag.refresh(detail); return 'fantag.refresh'; }
                if (typeof window.fantagRefresh === 'function') { window.fantagRefresh(detail); return 'fantagRefresh'; }
                if (typeof window.refreshFantag === 'function') { window.refreshFantag(detail); return 'refreshFantag'; }
              } catch(e) {}

              const controls = Array.from(document.querySelectorAll('button, [role="button"], [title], [aria-label]'));
              const hit = controls.find(function(el){
                if (!visible(el) || el.disabled) return false;
                const label = ((el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('title') || '') + ' ' + (el.textContent || '')).toLowerCase();
                return /refresh|reload|sync|update/.test(label);
              });
              if (hit) { hit.click(); return 'clicked:' + ((hit.textContent || hit.getAttribute('aria-label') || hit.getAttribute('title') || '').trim()); }
              return 'event-only';
            })();
        """.trimIndent()

        binding.webView.evaluateJavascript(js) {
            binding.swipeRefresh.isRefreshing = false
        }
    }

    override fun onBackPressed() {
        if (binding.webView.canGoBack()) {
            binding.webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    // ── State Views ────────────────────────────────────────────────────────────

    private fun showLoadingState() {
        binding.loadingGroup.visibility = View.VISIBLE
        binding.offlineGroup.visibility = View.GONE
        binding.errorGroup.visibility = View.GONE
    }

    private fun showWebView() {
        binding.loadingGroup.visibility = View.GONE
        binding.offlineGroup.visibility = View.GONE
        binding.errorGroup.visibility = View.GONE
        binding.swipeRefresh.isRefreshing = false
    }

    private fun showOfflineState(url: String) {
        binding.loadingGroup.visibility = View.GONE
        binding.errorGroup.visibility = View.GONE
        binding.offlineGroup.visibility = View.VISIBLE
        binding.swipeRefresh.isRefreshing = false
        binding.btnRetry.setOnClickListener { loadFantag() }
        binding.tvOfflineUrl.text = url
    }

    private fun showErrorState(description: String, failingUrl: String?) {
        binding.loadingGroup.visibility = View.GONE
        binding.offlineGroup.visibility = View.GONE
        binding.errorGroup.visibility = View.VISIBLE
        binding.swipeRefresh.isRefreshing = false
        binding.tvErrorDesc.text = description
        binding.tvErrorUrl.text = failingUrl ?: ""
        binding.btnErrorRetry.setOnClickListener { loadFantag() }
        binding.btnErrorSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }

    // ── Network ────────────────────────────────────────────────────────────────

    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    // ── Save/Restore ────────────────────────────────────────────────────────────

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        binding.webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        isForeground = true
        binding.webView.onResume()
        updateShellVersionBadge()
        val now = SystemClock.elapsedRealtime()
        if (!isFirstLoad && now - lastForegroundRefreshAt > FOREGROUND_REFRESH_MIN_MS) {
            lastForegroundRefreshAt = now
            refreshShellAndWebApp("foreground", forcePageReload = false)
        }
        startForegroundRefreshLoop()
    }

    override fun onPause() {
        isForeground = false
        foregroundHandler.removeCallbacks(foregroundRefreshRunnable)
        binding.webView.onPause()
        super.onPause()
    }

    // ── WebViewClient ──────────────────────────────────────────────────────────

    inner class FantagWebViewClient : WebViewClient() {

        override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
            super.onPageStarted(view, url, favicon)
            if (isFirstLoad) showLoadingState()
            binding.progressBar.visibility = View.VISIBLE
        }

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            isFirstLoad = false
            showWebView()
            binding.progressBar.visibility = View.GONE
            updateShellVersionBadge()
            // Let the web/backend finish painting, then ask it to refresh its live/status data.
            foregroundHandler.postDelayed({
                if (isForeground) triggerWebAppDataRefresh("page-finished")
            }, 750L)
            // Update toolbar subtitle with current path
            val path = Uri.parse(url).path ?: ""
            supportActionBar?.subtitle = if (path.isBlank() || path == "/") null else path
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            super.onReceivedError(view, request, error)
            if (request.isForMainFrame) {
                val desc = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    error.description.toString()
                } else "Connection error"
                Log.e(TAG, "WebView error: $desc for ${request.url}")
                if (!isNetworkAvailable()) {
                    showOfflineState(request.url.toString())
                } else {
                    showErrorState(desc, request.url.toString())
                }
            }
        }

        // Keep all navigation inside the WebView (don't open external browser for FANTAG URLs)
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            val prefs = PreferenceManager.getDefaultSharedPreferences(this@MainActivity)
            val serverUrl = prefs.getString(PREF_SERVER_URL, DEFAULT_URL) ?: DEFAULT_URL
            val serverHost = Uri.parse(serverUrl).host ?: ""

            return if (uri.host == serverHost || uri.scheme == "blob") {
                false // Load in WebView
            } else {
                // External link → open in browser
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                } catch (e: Exception) {
                    Log.e(TAG, "Cannot open external URL: $uri")
                }
                true
            }
        }
    }

    // ── WebChromeClient ────────────────────────────────────────────────────────

    inner class FantagWebChromeClient : WebChromeClient() {

        override fun onProgressChanged(view: WebView, newProgress: Int) {
            binding.progressBar.progress = newProgress
        }

        override fun onReceivedTitle(view: WebView, title: String) {
            // Keep toolbar title as "FANTAG" — don't override with page title
        }

        // File chooser for screenshot import feature
        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams
        ): Boolean {
            this@MainActivity.filePathCallback?.onReceiveValue(null)
            this@MainActivity.filePathCallback = filePathCallback

            // Request permissions if needed
            val permsNeeded = buildList {
                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA)
                    != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.CAMERA)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.READ_MEDIA_IMAGES)
                        != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.READ_MEDIA_IMAGES)
                } else {
                    if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.READ_EXTERNAL_STORAGE)
                        != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.READ_EXTERNAL_STORAGE)
                }
            }

            if (permsNeeded.isNotEmpty()) {
                permissionLauncher.launch(permsNeeded.toTypedArray())
            }

            fileChooserLauncher.launch("image/*")
            return true
        }

        // Allow JS alerts, confirms, prompts
        override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
            android.app.AlertDialog.Builder(this@MainActivity)
                .setMessage(message)
                .setPositiveButton("OK") { _, _ -> result.confirm() }
                .setCancelable(false)
                .show()
            return true
        }

        override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
            android.app.AlertDialog.Builder(this@MainActivity)
                .setMessage(message)
                .setPositiveButton("OK") { _, _ -> result.confirm() }
                .setNegativeButton("Cancel") { _, _ -> result.cancel() }
                .show()
            return true
        }
    }
}
