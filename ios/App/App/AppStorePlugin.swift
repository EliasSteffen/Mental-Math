import Foundation
import UIKit
import StoreKit
import Capacitor

/// App Store: Bewertungsdialog des Systems und die App-Seite im App Store.
/// Gegenstück in JS: src/platform/native.ts (AppStorePlugin) und src/platform/index.ts.
/// Ob der Dialog wirklich erscheint, entscheidet iOS (höchstens dreimal in 365 Tagen, in TestFlight nie);
/// `requested` sagt nur, ob er angefragt wurde. Fehlercodes: invalid_request, unavailable.
@objc(AppStorePlugin)
public class AppStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppStorePlugin"
    public let jsName = "AppStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openStorePage", returnType: CAPPluginReturnPromise),
    ]

    @objc func requestReview(_ call: CAPPluginCall) {
        Task { @MainActor [weak self] in
            guard let scene = self?.activeScene() else {
                call.resolve(["requested": false])
                return
            }
            AppStore.requestReview(in: scene)
            call.resolve(["requested": true])
        }
    }

    /// App-Seite im App Store; mit writeReview gleich das Formular „Bewertung schreiben“.
    @objc func openStorePage(_ call: CAPPluginCall) {
        guard let appId = call.getString("appId"), AppStorePlugin.validAppId(appId) else {
            call.reject("invalid appId", "invalid_request")
            return
        }
        let query = call.getBool("writeReview") == true ? "?action=write-review" : ""
        guard let url = URL(string: "itms-apps://apps.apple.com/app/id\(appId)\(query)") else {
            call.reject("invalid appId", "invalid_request")
            return
        }
        Task { @MainActor in
            if await UIApplication.shared.open(url) {
                call.resolve()
            } else {
                // z. B. im Simulator (kein App Store)
                call.reject("cannot open App Store", "unavailable")
            }
        }
    }

    /// Szene der WebView, sonst die erste aktive im Vordergrund.
    @MainActor private func activeScene() -> UIWindowScene? {
        if let scene = bridge?.viewController?.view.window?.windowScene {
            return scene
        }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
    }

    /// App-Store-ID: nur Ziffern (ASCII), höchstens 12.
    static func validAppId(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 12 && value.allSatisfy { $0.isASCII && $0.isNumber }
    }
}
