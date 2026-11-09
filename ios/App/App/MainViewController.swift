import UIKit
import WebKit
import Capacitor

/// Bridge der App: registriert die eigenen Plugins (NativeAuth, AppStore, LiveUpdate), zeigt beim Laden dieselbe
/// Hintergrundfarbe wie der Startbildschirm (hell/dunkel), bis die Web-Oberfläche ihren eigenen Hintergrund zeichnet,
/// und schaltet die iOS-Zurück-Geste passend zur Route.
class MainViewController: CAPBridgeViewController {
    private var routeObservation: NSKeyValueObservation?

    /// Routen laufender Runden (src/router.ts); dorthin führt kein Wisch, er würde eine neue Runde starten.
    private static let sessionRoutes: Set<Substring> = ["train", "chain", "parallel", "einstufung", "challenge"]

    /// Oberster Pfadteil und Tiefe einer Hash-Route ("/lernen/x?a=1" → ("lernen", 2)).
    private static func route(_ fragment: String?) -> (root: Substring, depth: Int)? {
        let path = (fragment ?? "").prefix { $0 != "?" }
        let parts = path.split(separator: "/")
        return parts.first.map { ($0, parts.count) }
    }

    /// Zurück-Wisch nur auf Unterseiten: Tab-Seiten haben kein Zurück, und in einer laufenden Runde würde er sie
    /// ohne Rückfrage abbrechen.
    static func allowsSwipeBack(current: String?, previous: String?) -> Bool {
        guard let page = route(current) else { return false }
        if let target = route(previous), sessionRoutes.contains(target.root) { return false }
        switch page.root {
        case "lernen", "profil": return page.depth > 1
        case "custom", "rangliste": return true
        default: return false
        }
    }

    /// WebKit legt je einen Rand-Recognizer für Zurück (links) und Vorwärts (rechts) an. Geschaltet werden sie einzeln:
    /// allowsBackForwardNavigationGestures = false würde auch die Vorschaubilder der Seiten abschalten.
    private func syncSwipeBack(_ webView: WKWebView) {
        // Beim Zurückgehen meldet WebKit die neue URL, bevor die Liste nachzieht: currentItem ist dann noch die alte Seite
        let list = webView.backForwardList
        let previous = list.item(at: list.currentItem?.url == webView.url ? -1 : -2)?.url.fragment
        let allowed = Self.allowsSwipeBack(current: webView.url?.fragment, previous: previous)
        for case let edgePan as UIScreenEdgePanGestureRecognizer in webView.gestureRecognizers ?? [] {
            edgePan.isEnabled = edgePan.edges == .left && allowed
        }
    }

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
        webView?.allowsBackForwardNavigationGestures = true
        // Feuert auch bei Hash-Wechseln der Web-App
        routeObservation = webView?.observe(\.url, options: [.initial, .new]) { [weak self] webView, _ in
            self?.syncSwipeBack(webView)
        }
    }
}
