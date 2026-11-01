import UIKit
import Capacitor

/// Bridge der App: registriert das eigene Plugin (NativeAuth) und zeigt beim Laden dieselbe Hintergrundfarbe wie der
/// Startbildschirm (hell/dunkel), bis die Web-Oberfläche ihren eigenen Hintergrund zeichnet.
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAuthPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let background = UIColor(named: "LaunchBackground") ?? .systemBackground
        view.backgroundColor = background
        webView?.isOpaque = false
        webView?.backgroundColor = .clear
        webView?.scrollView.backgroundColor = background
    }
}
