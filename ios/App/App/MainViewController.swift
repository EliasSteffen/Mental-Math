import UIKit
import Capacitor

/// Bridge der App: registriert die eigenen Plugins (NativeAuth, AppStore, LiveUpdate) und zeigt beim Laden dieselbe
/// Hintergrundfarbe wie der Startbildschirm (hell/dunkel), bis die Web-Oberfläche ihren eigenen Hintergrund zeichnet.
class MainViewController: CAPBridgeViewController {
    /// Startschutz für Live-Updates: ein fehlendes oder wiederholt nicht startendes Bundle → eingebautes (LiveUpdatePlugin)
    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        LiveUpdatePlugin.guardLaunch(descriptor)
        return descriptor
    }

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeAuthPlugin())
        bridge?.registerPluginInstance(AppStorePlugin())
        bridge?.registerPluginInstance(LiveUpdatePlugin())
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
