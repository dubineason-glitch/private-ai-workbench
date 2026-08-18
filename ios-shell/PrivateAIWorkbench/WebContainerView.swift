import Foundation
import SwiftUI
import UIKit
import WebKit

struct WebContainerView: UIViewRepresentable {
    let domain: String
    let token: String
    let expiresAt: Date
    let openSettings: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(domain: domain, openSettings: openSettings)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.defaultWebpagePreferences.allowsContentJavaScript = true

        let controller = WKUserContentController()
        let expiryMs = Int64(expiresAt.timeIntervalSince1970 * 1000)
        let script = """
        (function() {
          try {
            localStorage.setItem('private-ai-workbench-token', \(jsString(token)));
            localStorage.setItem('private-ai-workbench-token-expires-at', '\(expiryMs)');
            window.__PRIVATE_AI_SHELL__ = { native: true, platform: 'ios', version: '1.0.0' };
          } catch (e) {}
        })();
        """
        controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        config.userContentController = controller

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        context.coordinator.webView = webView

        if let url = URL(string: domain) {
            webView.load(URLRequest(url: url, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 20))
        }
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate {
        let allowedHost: String?
        let openSettings: () -> Void
        weak var webView: WKWebView?

        init(domain: String, openSettings: @escaping () -> Void) {
            self.allowedHost = URL(string: domain)?.host?.lowercased()
            self.openSettings = openSettings
        }

        @objc func refresh(_ sender: UIRefreshControl) {
            webView?.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { sender.endRefreshing() }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if url.scheme?.lowercased() == "workbench" {
                if url.host == "shell-settings" {
                    DispatchQueue.main.async { self.openSettings() }
                }
                decisionHandler(.cancel)
                return
            }

            if let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme) {
                let host = url.host?.lowercased()
                if let allowedHost, host != allowedHost {
                    UIApplication.shared.open(url)
                    decisionHandler(.cancel)
                    return
                }
                decisionHandler(.allow)
                return
            }

            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            decisionHandler(.allow)
        }
    }
}

private func jsString(_ value: String) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: [value]),
          let json = String(data: data, encoding: .utf8),
          json.count >= 2 else { return "''" }
    return String(json.dropFirst().dropLast())
}
