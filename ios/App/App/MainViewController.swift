import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // Capacitor sets scrollView.bounces = false in prepareWebView.
        // Re-enable rubber-band scrolling so pages bounce at the top/bottom edges.
        webView?.scrollView.bounces = true
        webView?.scrollView.alwaysBounceVertical = true
        webView?.scrollView.alwaysBounceHorizontal = false
    }
}
