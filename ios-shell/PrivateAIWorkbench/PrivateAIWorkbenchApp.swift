import SwiftUI

@main
struct PrivateAIWorkbenchApp: App {
    @StateObject private var store = ShellStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .onChange(of: scenePhase) { phase in
                    if phase == .active {
                        store.enforceExpiry()
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: ShellStore

    var body: some View {
        Group {
            if store.isAuthenticated {
                WebContainerView(
                    domain: store.domain,
                    token: store.token,
                    expiresAt: store.expiresAt,
                    openSettings: { store.returnToSetup() }
                )
                .ignoresSafeArea()
            } else {
                SetupView()
            }
        }
        .animation(.easeInOut(duration: 0.18), value: store.isAuthenticated)
    }
}
