import Foundation
import UIKit
import Capacitor

/// Live-Updates der Web-Schicht (docs/PLAN-live-updates.md). Laden, Prüfen und Speichern der Bundles macht das JS
/// (src/platform/live-update.ts) nach Library/NoCloud/ionic_built_snapshots/<id>/ – derselbe Ort, an dem Capacitor einen
/// gespeicherten serverBasePath beim Start sucht (CAPBridgeViewController.instanceDescriptor). Dieses Plugin übernimmt nur,
/// was JavaScript nicht kann, weil es in einem kaputten Bundle gar nicht erst läuft:
/// - trial: Bundle probeweise laden, ohne es zu speichern. Meldet es sich nicht binnen timeoutMs mit ready(), lädt der
///   Wächter wieder das vorherige Bundle und vermerkt das neue als fehlgeschlagen.
/// - ready: Die laufende Oberfläche funktioniert – Wächter aus, Startzähler zurück, ein geladenes Bundle wird Startbundle.
/// - reset: zurück zum eingebauten Bundle.
/// - guardLaunch (aus MainViewController): Fehlt das gespeicherte Bundle oder hat es sich drei Kaltstarts in Folge nicht
///   gemeldet, startet die App mit dem eingebauten.
/// Ein neues Binary (Store-Update) setzt Capacitor selbst auf das eingebaute Bundle zurück.
@objc(LiveUpdatePlugin)
public class LiveUpdatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveUpdatePlugin"
    public let jsName = "LiveUpdate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "trial", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise)
    ]

    static let maxUnconfirmedLaunches = 3
    private static let launchesKey = "LiveUpdate.unconfirmedLaunches"
    private static let failedKey = "LiveUpdate.failed"
    /// Schlüssel, unter dem Capacitor (und sein WebView-Plugin) den gespeicherten Pfad ablegt
    private static let serverBasePathKey = "serverBasePath"
    private static let snapshotsFolder = "ionic_built_snapshots"

    static var snapshotsURL: URL {
        FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("NoCloud", isDirectory: true)
            .appendingPathComponent(snapshotsFolder, isDirectory: true)
    }

    /// Eingebautes Bundle, wie Capacitor es ohne gespeicherten Pfad lädt (CAPInstanceDescriptor)
    static var builtInURL: URL {
        (Bundle.main.resourceURL ?? Bundle.main.bundleURL).appendingPathComponent("public", isDirectory: true)
    }

    /// Bundle-ID = Ordnername: 16 Hex-Zeichen (src/core/live-update.ts bundleId), nie ein Pfad
    static func validId(_ id: String) -> Bool {
        id.count == 16 && id.allSatisfy { "0123456789abcdef".contains($0) }
    }

    /// Ordnername des Bundles unter ionic_built_snapshots, sonst nil (eingebaut)
    static func bundleId(of location: URL) -> String? {
        location.deletingLastPathComponent().lastPathComponent == snapshotsFolder ? location.lastPathComponent : nil
    }

    static func recordFailed(_ id: String) {
        var failed = UserDefaults.standard.stringArray(forKey: failedKey) ?? []
        failed.removeAll { $0 == id }
        failed.append(id)
        UserDefaults.standard.set(Array(failed.suffix(20)), forKey: failedKey)
    }

    /// Vor dem Laden der WebView (MainViewController.instanceDescriptor): Startschutz für ein gespeichertes Bundle.
    static func guardLaunch(_ descriptor: InstanceDescriptor) {
        let defaults = UserDefaults.standard
        guard let id = bundleId(of: descriptor.appLocation) else {
            defaults.set(0, forKey: launchesKey)
            return
        }
        let launches = defaults.integer(forKey: launchesKey)
        let index = descriptor.appLocation.appendingPathComponent("index.html").path
        if !FileManager.default.fileExists(atPath: index) || launches >= maxUnconfirmedLaunches {
            CAPLog.print("⚡️ LiveUpdate: Bundle \(id) verworfen (\(launches) Starts ohne ready) – eingebautes Bundle")
            recordFailed(id)
            KeyValueStore.standard[serverBasePathKey] = nil as String?
            defaults.set(0, forKey: launchesKey)
            descriptor.appLocation = builtInURL
            return
        }
        defaults.set(launches + 1, forKey: launchesKey)
    }

    // Wächter für einen Probelauf (nur auf dem Main-Thread benutzt)
    private var watchdog: DispatchWorkItem?
    private var trialId: String?
    private var fallbackPath: String?
    private var timeoutMs = 10_000
    private var paused = false

    override public func load() {
        // Bundles gehören nicht ins iCloud-Backup
        var noCloud = Self.snapshotsURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: Self.snapshotsURL, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? noCloud.setResourceValues(values)

        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(didBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    private var viewController: CAPBridgeViewController? {
        bridge?.viewController as? CAPBridgeViewController
    }

    @objc func info(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let dict = Bundle.main.infoDictionary ?? [:]
            let running = self.viewController.flatMap { Self.bundleId(of: URL(fileURLWithPath: $0.getServerBasePath())) }
            call.resolve([
                "nativeVersion": dict["CFBundleShortVersionString"] as? String ?? "",
                "nativeBuild": dict["CFBundleVersion"] as? String ?? "",
                "testFlight": Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt",
                "running": running ?? NSNull(),
                "failed": UserDefaults.standard.stringArray(forKey: Self.failedKey) ?? []
            ])
        }
    }

    @objc func trial(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), Self.validId(id) else {
            call.reject("Ungültige Bundle-ID")
            return
        }
        let url = Self.snapshotsURL.appendingPathComponent(id, isDirectory: true)
        guard FileManager.default.fileExists(atPath: url.appendingPathComponent("index.html").path) else {
            call.reject("Bundle \(id) fehlt")
            return
        }
        let timeout = max(2_000, call.getInt("timeoutMs") ?? 10_000)
        DispatchQueue.main.async {
            guard let vc = self.viewController else {
                call.reject("Keine Bridge")
                return
            }
            self.trialId = id
            self.fallbackPath = vc.getServerBasePath()
            self.timeoutMs = timeout
            self.paused = false
            self.arm()
            call.resolve()
            CAPLog.print("⚡️ LiveUpdate: Probelauf \(id)")
            vc.setServerBasePath(path: url.path) // nicht gespeichert: ein Neustart landet wieder beim vorherigen
        }
    }

    @objc func ready(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.disarm()
            UserDefaults.standard.set(0, forKey: Self.launchesKey)
            var running: String?
            if let vc = self.viewController {
                let path = vc.getServerBasePath()
                running = Self.bundleId(of: URL(fileURLWithPath: path))
                // Läuft ein geladenes Bundle, startet die App künftig damit; läuft das eingebaute, ist nichts gespeichert
                KeyValueStore.standard[Self.serverBasePathKey] = running == nil ? nil : path
            }
            call.resolve(["running": running ?? NSNull()])
        }
    }

    @objc func reset(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.disarm()
            KeyValueStore.standard[Self.serverBasePathKey] = nil as String?
            UserDefaults.standard.set(0, forKey: Self.launchesKey)
            call.resolve()
            CAPLog.print("⚡️ LiveUpdate: zurück zum eingebauten Bundle")
            self.viewController?.setServerBasePath(path: Self.builtInURL.path)
        }
    }

    private func arm() {
        watchdog?.cancel()
        let item = DispatchWorkItem { [weak self] in self?.expire() }
        watchdog = item
        DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(timeoutMs), execute: item)
    }

    private func disarm() {
        watchdog?.cancel()
        watchdog = nil
        trialId = nil
        fallbackPath = nil
        paused = false
    }

    private func expire() {
        guard let id = trialId, let fallback = fallbackPath else { return }
        CAPLog.print("⚡️ LiveUpdate: Bundle \(id) hat sich nicht gemeldet – zurück zum vorherigen")
        Self.recordFailed(id)
        disarm()
        viewController?.setServerBasePath(path: fallback)
    }

    // Im Hintergrund läuft kein JS: Wächter anhalten und bei Rückkehr neu starten
    @objc private func didEnterBackground() {
        DispatchQueue.main.async {
            guard self.trialId != nil, let item = self.watchdog else { return }
            item.cancel()
            self.watchdog = nil
            self.paused = true
        }
    }

    @objc private func didBecomeActive() {
        DispatchQueue.main.async {
            guard self.paused, self.trialId != nil else { return }
            self.paused = false
            self.arm()
        }
    }
}
