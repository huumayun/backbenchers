package com.graamtech.suggestionhub;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private int currentBarColor = Color.parseColor("#FAF9F6");
    private boolean currentLightBars = true; // true = dark clock/icons on light background

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Automatically adjust for both 3-Button Navigation and Gesture Navigation
        // so no app button ever goes underneath the Android navigation buttons,
        // and no divider line appears under the status bar.
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            contentView.setBackgroundColor(currentBarColor);
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
        }

        applySystemBarAppearance(currentBarColor, currentLightBars);
        if (contentView != null) {
            contentView.postDelayed(() -> applySystemBarAppearance(currentBarColor, currentLightBars), 150);
            contentView.postDelayed(() -> applySystemBarAppearance(currentBarColor, currentLightBars), 500);
        }

        // Seamlessly launch WhatsApp, WhatsApp Business, Telegram and system intent URLs
        // without trapping them inside WebView or throwing ERR_UNKNOWN_URL_SCHEME
        if (bridge != null) {
            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request != null && handleExternalUrl(request.getUrl())) {
                        return true;
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }

                @SuppressWarnings("deprecation")
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    if (url != null && handleExternalUrl(Uri.parse(url))) {
                        return true;
                    }
                    return super.shouldOverrideUrlLoading(view, url);
                }
            });

            if (bridge.getWebView() != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    bridge.getWebView().setForceDarkAllowed(false);
                }
                bridge.getWebView().addJavascriptInterface(new Object() {
                    @android.webkit.JavascriptInterface
                    public void openExternal(final String url) {
                        if (url == null || url.trim().isEmpty()) return;
                        runOnUiThread(() -> handleExternalUrl(Uri.parse(url.trim())));
                    }

                    @android.webkit.JavascriptInterface
                    public void setSystemBarTheme(final String hexColor, final boolean isDarkTheme) {
                        runOnUiThread(() -> {
                            try {
                                if (hexColor != null && !hexColor.trim().isEmpty()) {
                                    currentBarColor = Color.parseColor(hexColor.trim());
                                }
                                currentLightBars = !isDarkTheme;
                                applySystemBarAppearance(currentBarColor, currentLightBars);
                            } catch (Exception ignored) {}
                        });
                    }

                    @android.webkit.JavascriptInterface
                    public boolean isOnline() {
                        try {
                            android.net.ConnectivityManager cm =
                                (android.net.ConnectivityManager) getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
                            if (cm == null) return false;
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                android.net.Network network = cm.getActiveNetwork();
                                if (network == null) return false;
                                android.net.NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                                if (caps == null) return false;
                                boolean hasTransport =
                                    caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_WIFI) ||
                                    caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_CELLULAR) ||
                                    caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_ETHERNET) ||
                                    caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN);
                                boolean hasInternet =
                                    caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET);
                                return hasTransport && hasInternet;
                            } else {
                                @SuppressWarnings("deprecation")
                                android.net.NetworkInfo info = cm.getActiveNetworkInfo();
                                return info != null && info.isConnected();
                            }
                        } catch (Exception e) {
                            return false;
                        }
                    }
                }, "AndroidNative");
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarAppearance(currentBarColor, currentLightBars);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applySystemBarAppearance(currentBarColor, currentLightBars);
        }
    }

    @SuppressWarnings("deprecation")
    private void applySystemBarAppearance(int bgColor, boolean lightBars) {
        try {
            Window window = getWindow();
            if (window == null) return;

            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);

            window.setStatusBarColor(bgColor);
            window.setNavigationBarColor(bgColor);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.setNavigationBarDividerColor(Color.TRANSPARENT);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
            }

            View decorView = window.getDecorView();
            if (decorView != null) {
                decorView.setBackgroundColor(bgColor);

                // 1. Legacy systemUiVisibility flags (required by several OEM skins like MIUI/ColorOS)
                int vis = decorView.getSystemUiVisibility();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    if (lightBars) {
                        vis |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    } else {
                        vis &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                    }
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (lightBars) {
                        vis |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    } else {
                        vis &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                    }
                }
                decorView.setSystemUiVisibility(vis);

                // 2. AndroidX WindowInsetsControllerCompat
                WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, decorView);
                if (controller != null) {
                    controller.setAppearanceLightStatusBars(lightBars);
                    controller.setAppearanceLightNavigationBars(lightBars);
                }
            }

            // 3. Direct Android 11+ (API 30+) WindowInsetsController
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                WindowInsetsController insetsController = window.getInsetsController();
                if (insetsController != null) {
                    int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                             | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    insetsController.setSystemBarsAppearance(lightBars ? mask : 0, mask);
                }
            }

            View contentView = findViewById(android.R.id.content);
            if (contentView != null) {
                contentView.setBackgroundColor(bgColor);
            }
        } catch (Exception ignored) {}
    }

    private boolean handleExternalUrl(Uri url) {
        if (url == null) return false;
        String scheme = url.getScheme();
        String urlStr = url.toString();

        if (scheme != null && (
            scheme.equalsIgnoreCase("whatsapp") ||
            scheme.equalsIgnoreCase("tg") ||
            scheme.equalsIgnoreCase("intent") ||
            urlStr.contains("wa.me") ||
            urlStr.contains("api.whatsapp.com") ||
            urlStr.contains("t.me")
        )) {
            try {
                Intent intent;
                if ("intent".equalsIgnoreCase(scheme)) {
                    intent = Intent.parseUri(urlStr, Intent.URI_INTENT_SCHEME);
                } else {
                    intent = new Intent(Intent.ACTION_VIEW, url);
                }
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            } catch (Exception e) {
                try {
                    if ("whatsapp".equalsIgnoreCase(scheme)) {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(urlStr.replace("whatsapp://send/", "https://api.whatsapp.com/send/")));
                        browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(browserIntent);
                        return true;
                    }
                } catch (Exception ignored) {}
            }
        }
        return false;
    }
}
