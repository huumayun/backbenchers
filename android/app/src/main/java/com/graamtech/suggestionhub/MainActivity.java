package com.graamtech.suggestionhub;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
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
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        int editorialBg = Color.parseColor("#FAF9F6");

        // Seamless borderless status bar & navigation bar matching app background (#FAF9F6)
        window.setStatusBarColor(editorialBg);
        window.setNavigationBarColor(editorialBg);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        View decorView = window.getDecorView();
        decorView.setBackgroundColor(editorialBg);

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decorView);
        if (controller != null) {
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);
        }

        // Automatically adjust for both 3-Button Navigation and Gesture Navigation
        // so no app button ever goes underneath the Android navigation buttons,
        // and no divider line appears under the status bar.
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            contentView.setBackgroundColor(editorialBg);
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
        }

        // Seamlessly launch WhatsApp, WhatsApp Business, Telegram and system intent URLs
        // without trapping them inside WebView or throwing ERR_UNKNOWN_URL_SCHEME
        if (bridge != null) {
            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    if (request == null || request.getUrl() == null) {
                        return super.shouldOverrideUrlLoading(view, request);
                    }
                    Uri url = request.getUrl();
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

                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }
}
