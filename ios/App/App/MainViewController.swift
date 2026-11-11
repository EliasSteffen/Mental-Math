import UIKit
import WebKit
import Capacitor

/// Bridge der App: registriert die eigenen Plugins (NativeAuth, AppStore, LiveUpdate, SwipeBack), zeigt beim Laden dieselbe
/// Hintergrundfarbe wie der Startbildschirm (hell/dunkel), bis die Web-Oberfläche ihren eigenen Hintergrund zeichnet,
/// und schaltet die iOS-Zurück-Geste passend zur Route.
class MainViewController: CAPBridgeViewController {
    private var routeObservation: NSKeyValueObservation?
    /// Letzte Meldung der Web-Schicht (SwipeBackPlugin): Pfad ohne "#" und Query, und ob dort gewischt werden darf.
    private var webSwipeBack: (path: String, enabled: Bool)?

    // Die drei Listen müssen mit src/core/swipe-back.ts übereinstimmen (tests/swipe-back.test.ts liest diese Datei).

    /// Routen laufender Runden (src/router.ts); dorthin führt kein Wisch, er würde eine neue Runde starten.
    private static let sessionRoutes: Set<Substring> = ["train", "chain", "parallel", "einstufung", "challenge"]
    /// Seiten mit Zurück auf jeder Tiefe (Profil ist seit v11 eine Modal-Seite; laufende Rennen sperrt die Web-Schicht).
    private static let swipeBackRoots: Set<Substring> = ["profil", "settings", "fortschritt", "analyse", "quests", "custom", "rangliste", "duell", "rennen"]
    /// Seiten mit Zurück erst ab Tiefe 2 (die Tab-Startseiten haben keins).
    private static let swipeBackSubpageRoots: Set<Substring> = ["lernen", "erfolge"]

    /// Oberster Pfadteil und Tiefe einer Hash-Route ("/lernen/x?a=1" → ("lernen", 2)).
    private static func route(_ fragment: String?) -> (root: Substring, depth: Int)? {
        let path = (fragment ?? "").prefix { $0 != "?" }
        let parts = path.split(separator: "/")
        return parts.first.map { ($0, parts.count) }
    }

    /// Pfad wie die Web-Schicht ihn meldet: ohne Query und ohne Anfangs-/Endstrich ("/lernen/x?a=1" → "lernen/x"; Heute → "").
    static func normalizedPath(_ fragment: String?) -> String {
        let path = (fragment ?? "").prefix { $0 != "?" }
        return path.split(separator: "/").joined(separator: "/")
    }

    /// Führt die Seite in eine laufende Runde (Training, Ketten, Parallel, Einstufung, Challenge, Spiel eines Mini-Cases)?
    private static func isSessionRoute(_ fragment: String?) -> Bool {
        guard let target = route(fragment) else { return false }
        return sessionRoutes.contains(target.root) || (target.root == "case" && target.depth > 1)
    }

    /// Zurück-Wisch nur auf Unterseiten: Tab-Seiten haben kein Zurück, und in einer laufenden Runde würde er sie
    /// ohne Rückfrage abbrechen. Das ist die feste Regel, solange die Web-Schicht nichts meldet.
    static func allowsSwipeBack(current: String?, previous: String?) -> Bool {
        guard let page = route(current) else { return false }
        if isSessionRoute(previous) { return false }
        if swipeBackRoots.contains(page.root) { return true }
        if swipeBackSubpageRoots.contains(page.root) { return page.depth > 1 }
        return page.root == "case" && page.depth == 1
    }

    /// Meldet die Web-Schicht etwas für den aktuellen Pfad, gilt ihr Wert (sie kennt z. B. laufende Rennen); sonst die feste Regel.
    /// Nie zurück in eine laufende Runde, auch wenn die Web-Schicht es erlaubt.
    static func swipeBackEnabled(current: String?, previous: String?, report: (path: String, enabled: Bool)?) -> Bool {
        if let report = report, report.path == normalizedPath(current) {
            return report.enabled && !isSessionRoute(previous)
        }
        return allowsSwipeBack(current: current, previous: previous)
    }

    /// Meldung des SwipeBackPlugin (Hauptthread).
    func setWebSwipeBack(path: String, enabled: Bool) {
        webSwipeBack = (path: Self.normalizedPath(path), enabled: enabled)
        if let webView = webView { syncSwipeBack(webView) }
    }

    /// WebKit legt je einen Rand-Recognizer für Zurück (links) und Vorwärts (rechts) an. Geschaltet werden sie einzeln:
    /// allowsBackForwardNavigationGestures = false würde auch die Vorschaubilder der Seiten abschalten.
    private func syncSwipeBack(_ webView: WKWebView) {
        // Beim Zurückgehen meldet WebKit die neue URL, bevor die Liste nachzieht: currentItem ist dann noch die alte Seite
        let list = webView.backForwardList
        let previous = list.item(at: list.currentItem?.url == webView.url ? -1 : -2)?.url.fragment
        let allowed = Self.swipeBackEnabled(current: webView.url?.fragment, previous: previous, report: webSwipeBack)
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
        bridge?.registerPluginInstance(SwipeBackPlugin())
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

/// Zurück-Wisch: die Web-Schicht meldet je Seite, ob er gelten soll (sie kennt laufende Rennen und den Verlauf).
/// Gegenstück in JS: src/platform/native.ts (SwipeBackPlugin) und src/platform/index.ts (reportSwipeBack).
/// Ohne Meldung gilt die feste Regel in MainViewController.allowsSwipeBack. Fehlercode: invalid_request.
@objc(SwipeBackPlugin)
public class SwipeBackPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SwipeBackPlugin"
    public let jsName = "SwipeBack"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    ]

    /// path: Hash-Pfad ohne "#" und Query ("erfolge/shop"; Heute: ""); enabled: Wisch auf dieser Seite erlaubt.
    @objc func set(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let enabled = call.getBool("enabled") else {
            call.reject("invalid arguments", "invalid_request")
            return
        }
        DispatchQueue.main.async { [weak self] in
            (self?.bridge?.viewController as? MainViewController)?.setWebSwipeBack(path: path, enabled: enabled)
            call.resolve()
        }
    }
}
