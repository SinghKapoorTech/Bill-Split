package com.singhkapoortech.divit;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Workaround for a Samsung tablet rendering bug where the WebView
        // renderer fails to paint when remote debugging is disabled.
        // Also lets us attach Chrome DevTools to investigate further.
        WebView.setWebContentsDebuggingEnabled(true);
        super.onCreate(savedInstanceState);
    }
}
