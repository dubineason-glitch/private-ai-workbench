import Foundation
import Combine

@MainActor
final class ShellStore: ObservableObject {
    @Published var domain: String
    @Published var token: String = ""
    @Published var expiresAt: Date = .distantPast
    @Published var isAuthenticated = false
    @Published var isLoading = false
    @Published var errorMessage = ""

    private let domainKey = "workbench.domain"
    private let expiryKey = "workbench.expiry"
    private let tokenAccount = "private-ai-workbench-token"
    private let defaultDomain = "https://db.dubin.cc.cd"

    init() {
        self.domain = UserDefaults.standard.string(forKey: domainKey) ?? defaultDomain
        restoreSession()
    }

    func restoreSession() {
        domain = UserDefaults.standard.string(forKey: domainKey) ?? defaultDomain
        token = KeychainStore.read(account: tokenAccount) ?? ""
        let timestamp = UserDefaults.standard.double(forKey: expiryKey)
        expiresAt = timestamp > 0 ? Date(timeIntervalSince1970: timestamp) : .distantPast
        isAuthenticated = !token.isEmpty && expiresAt > Date() && normalizedURL(from: domain) != nil
        if !isAuthenticated && expiresAt <= Date() {
            clearCredentialOnly()
        }
    }

    func enforceExpiry() {
        if isAuthenticated && expiresAt <= Date() {
            clearCredentialOnly()
            errorMessage = "30 天免密登录已到期，请重新验证。"
        }
    }

    func login(domain rawDomain: String, token rawToken: String) async {
        let cleanToken = rawToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let baseURL = normalizedURL(from: rawDomain) else {
            errorMessage = "请输入有效的 HTTPS 域名，例如 https://db.dubin.cc.cd"
            return
        }
        guard !cleanToken.isEmpty else {
            errorMessage = "请输入访问口令"
            return
        }

        isLoading = true
        errorMessage = ""
        defer { isLoading = false }

        do {
            let healthURL = baseURL.appendingPathComponent("api/health")
            var request = URLRequest(url: healthURL)
            request.httpMethod = "GET"
            request.timeoutInterval = 15
            request.setValue(cleanToken, forHTTPHeaderField: "x-workbench-token")
            request.setValue("application/json", forHTTPHeaderField: "Accept")

            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                throw ShellError(message: "服务器响应无效")
            }
            if http.statusCode == 401 {
                throw ShellError(message: "访问口令不正确")
            }
            guard (200..<300).contains(http.statusCode) else {
                let payload = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                let message = payload?["error"] as? String ?? "连接失败（HTTP \(http.statusCode)）"
                throw ShellError(message: message)
            }

            self.domain = baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            self.token = cleanToken
            self.expiresAt = Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date().addingTimeInterval(30 * 86400)

            UserDefaults.standard.set(self.domain, forKey: domainKey)
            UserDefaults.standard.set(self.expiresAt.timeIntervalSince1970, forKey: expiryKey)
            try KeychainStore.save(cleanToken, account: tokenAccount)
            self.isAuthenticated = true
        } catch let error as ShellError {
            errorMessage = error.message
        } catch {
            errorMessage = "无法连接到服务器：\(error.localizedDescription)"
        }
    }

    func returnToSetup() {
        clearCredentialOnly()
        errorMessage = ""
    }

    private func clearCredentialOnly() {
        token = ""
        expiresAt = .distantPast
        isAuthenticated = false
        UserDefaults.standard.removeObject(forKey: expiryKey)
        KeychainStore.delete(account: tokenAccount)
    }

    private func normalizedURL(from input: String) -> URL? {
        var value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return nil }
        if !value.lowercased().hasPrefix("https://") {
            value = "https://" + value
        }
        guard var components = URLComponents(string: value),
              components.scheme?.lowercased() == "https",
              components.host?.isEmpty == false else { return nil }
        components.query = nil
        components.fragment = nil
        if components.path == "/" { components.path = "" }
        return components.url
    }
}

struct ShellError: Error {
    let message: String
}
