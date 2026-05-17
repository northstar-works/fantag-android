package com.northstarlabs.fantag;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String PREFS = "fantag_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String DEFAULT_SERVER_URL = "http://192.168.0.4:8010";

    private WebView webView;
    private LinearLayout root;
    private String serverUrl;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        serverUrl = prefs.getString(KEY_SERVER_URL, DEFAULT_SERVER_URL);
        buildUi();
        loadFantag();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void buildUi() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(5, 10, 20));
        root.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 10, 20));
        webView.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f));

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setDatabaseEnabled(true);
        ws.setLoadWithOverviewMode(false);
        ws.setUseWideViewPort(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        ws.setCacheMode(WebSettings.LOAD_NO_CACHE);
        ws.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        ws.setUserAgentString(ws.getUserAgentString() + " FANTAGAndroid/" + BuildConfig.VERSION_NAME);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && request.isForMainFrame()) {
                    showErrorScreen("FANTAG could not load", "Server: " + serverUrl + "\nCheck Wi-Fi, VPN, and that fantag-ui is running.");
                }
            }
        });

        setContentView(root);
    }

    private void loadFantag() {
        root.removeAllViews();
        root.addView(webView);
        String url = normalizeUrl(serverUrl);
        webView.loadUrl(url + (url.contains("?") ? "&" : "?") + "android=1&v=" + BuildConfig.VERSION_CODE);
    }

    private String normalizeUrl(String url) {
        if (url == null || url.trim().isEmpty()) return DEFAULT_SERVER_URL;
        url = url.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://" + url;
        }
        while (url.endsWith("/")) url = url.substring(0, url.length() - 1);
        return url;
    }

    private void showErrorScreen(String title, String message) {
        runOnUiThread(() -> {
            root.removeAllViews();
            LinearLayout panel = new LinearLayout(this);
            panel.setOrientation(LinearLayout.VERTICAL);
            panel.setPadding(32, 32, 32, 32);
            panel.setGravity(Gravity.CENTER_HORIZONTAL);
            panel.setBackgroundColor(Color.rgb(5, 10, 20));
            panel.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));

            TextView heading = new TextView(this);
            heading.setText(title + "\nVERSION=" + BuildConfig.VERSION_NAME + " / BUILD=" + BuildConfig.VERSION_CODE);
            heading.setTextColor(Color.WHITE);
            heading.setTextSize(20);
            heading.setGravity(Gravity.CENTER);
            panel.addView(heading);

            TextView body = new TextView(this);
            body.setText("\n" + message + "\n\nNetwork connected: " + isNetworkConnected());
            body.setTextColor(Color.rgb(160, 174, 192));
            body.setTextSize(14);
            panel.addView(body);

            EditText input = new EditText(this);
            input.setText(serverUrl);
            input.setSingleLine(true);
            input.setTextColor(Color.WHITE);
            input.setHintTextColor(Color.GRAY);
            input.setHint("http://192.168.0.4:8010");
            panel.addView(input, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT));

            Button save = new Button(this);
            save.setText("Save Server URL and Retry");
            save.setOnClickListener(v -> {
                serverUrl = normalizeUrl(input.getText().toString());
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_SERVER_URL, serverUrl).apply();
                loadFantag();
            });
            panel.addView(save);

            Button retry = new Button(this);
            retry.setText("Retry");
            retry.setOnClickListener(v -> loadFantag());
            panel.addView(retry);

            root.addView(panel);
        });
    }

    private boolean isNetworkConnected() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo info = cm != null ? cm.getActiveNetworkInfo() : null;
            return info != null && info.isConnected();
        } catch (Exception ignored) {
            return false;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
