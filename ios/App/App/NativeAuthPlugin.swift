import Foundation
import UIKit
import Capacitor
import AuthenticationServices
import Security

/// Passkeys (WebAuthn) über AuthenticationServices und ein kleiner Keychain-Speicher für das Refresh-Token.
/// Gegenstück in JS: src/platform/native.ts (NativeAuthPlugin) und src/platform/native-auth.ts.
/// Alle Binärwerte als base64url. Fehlercodes: cancelled, not_supported, already_registered, verification_failed.
/// Voraussetzung: Associated Domain „webcredentials:<rpId>“ (App.entitlements) und die Datei
/// /.well-known/apple-app-site-association auf dieser Domain.
@objc(NativeAuthPlugin)
public class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAuthPlugin"
    public let jsName = "NativeAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "create", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "secureSet", returnType: CAPPluginReturnPromise),
    ]

    private var ceremony: Ceremony?

    @objc func create(_ call: CAPPluginCall) {
        guard let rpId = call.getString("rpId"),
              let challenge = Base64URL.decode(call.getString("challenge")),
              let userId = Base64URL.decode(call.getString("userId")),
              let userName = call.getString("userName") else {
            call.reject("invalid request", "invalid_request")
            return
        }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: userName, userID: userId)
        request.userVerificationPreference = .required
        request.attestationPreference = .none
        if #available(iOS 17.4, *) {
            let exclude = (call.getArray("exclude", String.self) ?? []).compactMap { Base64URL.decode($0) }
            request.excludedCredentials = exclude.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        }
        perform(request, call)
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let rpId = call.getString("rpId"), let challenge = Base64URL.decode(call.getString("challenge")) else {
            call.reject("invalid request", "invalid_request")
            return
        }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        request.userVerificationPreference = .required
        let allow = (call.getArray("allow", String.self) ?? []).compactMap { Base64URL.decode($0) }
        if !allow.isEmpty {
            request.allowedCredentials = allow.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        }
        perform(request, call)
    }

    /// Startet den Systemdialog; ein noch laufender Vorgang wird abgebrochen.
    private func perform(_ request: ASAuthorizationRequest, _ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("cancelled", "cancelled")
                return
            }
            self.ceremony?.cancel()
            let next = Ceremony(call: call, anchor: self.bridge?.webView?.window)
            self.ceremony = next
            next.start(request) { [weak self, weak next] in
                if let self, self.ceremony === next { self.ceremony = nil }
            }
        }
    }

    @objc func secureGet(_ call: CAPPluginCall) {
        guard let key = Keychain.validKey(call.getString("key")) else {
            call.reject("invalid key", "invalid_request")
            return
        }
        if let value = Keychain.get(key) {
            call.resolve(["value": value])
        } else {
            call.resolve(["value": NSNull()])
        }
    }

    @objc func secureSet(_ call: CAPPluginCall) {
        guard let key = Keychain.validKey(call.getString("key")) else {
            call.reject("invalid key", "invalid_request")
            return
        }
        if Keychain.set(key, call.getString("value")) {
            call.resolve()
        } else {
            call.reject("keychain error", "server_error")
        }
    }
}

/// Ein laufender Passkey-Vorgang: hält Controller und Call, bis das System antwortet.
private final class Ceremony: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var call: CAPPluginCall?
    private let anchor: UIWindow?
    private var controller: ASAuthorizationController?
    private var done: (() -> Void)?

    init(call: CAPPluginCall, anchor: UIWindow?) {
        self.call = call
        self.anchor = anchor
    }

    func start(_ request: ASAuthorizationRequest, done: @escaping () -> Void) {
        self.done = done
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        controller.performRequests()
    }

    func cancel() {
        controller?.cancel()
        finish { $0.reject("cancelled", "cancelled") }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        anchor ?? ASPresentationAnchor()
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        switch authorization.credential {
        case let r as ASAuthorizationPlatformPublicKeyCredentialRegistration:
            guard let attestation = r.rawAttestationObject else {
                finish { $0.reject("missing attestation", "verification_failed") }
                return
            }
            finish {
                $0.resolve([
                    "id": Base64URL.encode(r.credentialID),
                    "clientDataJSON": Base64URL.encode(r.rawClientDataJSON),
                    "attestationObject": Base64URL.encode(attestation),
                ])
            }
        case let a as ASAuthorizationPlatformPublicKeyCredentialAssertion:
            finish {
                $0.resolve([
                    "id": Base64URL.encode(a.credentialID),
                    "clientDataJSON": Base64URL.encode(a.rawClientDataJSON),
                    "authenticatorData": Base64URL.encode(a.rawAuthenticatorData),
                    "signature": Base64URL.encode(a.signature),
                    "userHandle": a.userID.isEmpty ? NSNull() : Base64URL.encode(a.userID),
                ])
            }
        default:
            finish { $0.reject("unexpected credential", "verification_failed") }
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let code: String
        let authError = error as? ASAuthorizationError
        switch authError?.code {
        case .canceled?:
            code = "cancelled"
        case .notHandled?, .notInteractive?:
            code = "not_supported"
        default:
            if #available(iOS 18.0, *), authError?.code == .matchedExcludedCredential {
                code = "already_registered"
            } else {
                code = "verification_failed"
            }
        }
        finish { $0.reject(error.localizedDescription, code) }
    }

    private func finish(_ respond: (CAPPluginCall) -> Void) {
        guard let call else { return }
        self.call = nil
        respond(call)
        done?()
        done = nil
    }
}

private enum Base64URL {
    static func encode(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func decode(_ string: String?) -> Data? {
        guard var s = string?.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/") else { return nil }
        while s.count % 4 != 0 { s += "=" }
        return Data(base64Encoded: s)
    }
}

/// Generisches Passwort im Keychain: nur auf diesem Gerät, nach dem ersten Entsperren lesbar.
private enum Keychain {
    static let service = (Bundle.main.bundleIdentifier ?? "app") + ".auth"

    static func validKey(_ key: String?) -> String? {
        guard let key, !key.isEmpty, key.count <= 40, key.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" }) else { return nil }
        return key
    }

    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
    }

    static func get(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// nil löscht den Eintrag.
    static func set(_ key: String, _ value: String?) -> Bool {
        SecItemDelete(query(key) as CFDictionary)
        guard let value else { return true }
        var q = query(key)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }
}
