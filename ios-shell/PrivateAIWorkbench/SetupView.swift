import SwiftUI

struct SetupView: View {
    @EnvironmentObject private var store: ShellStore
    @State private var domain = ""
    @State private var token = ""
    @FocusState private var focusedField: Field?

    enum Field { case domain, token }

    private let pink = Color(red: 0.85, green: 0.44, blue: 0.62)
    private let softPink = Color(red: 0.98, green: 0.90, blue: 0.93)

    var body: some View {
        NavigationStack {
            ZStack {
                Color(uiColor: .systemGroupedBackground).ignoresSafeArea()
                Circle()
                    .fill(pink.opacity(0.12))
                    .frame(width: 320, height: 320)
                    .blur(radius: 4)
                    .offset(x: 150, y: -330)
                Circle()
                    .fill(softPink.opacity(0.42))
                    .frame(width: 280, height: 280)
                    .offset(x: -150, y: 380)

                ScrollView {
                    VStack(spacing: 0) {
                        Spacer(minLength: 56)

                        ZStack(alignment: .topTrailing) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 24, style: .continuous)
                                    .fill(
                                        LinearGradient(
                                            colors: [Color.white, softPink, Color(red: 0.92, green: 0.88, blue: 0.98)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                VStack(spacing: 1) {
                                    Text("YUY")
                                        .font(.system(size: 20, weight: .heavy, design: .rounded))
                                        .foregroundStyle(pink)
                                    Text("小玉")
                                        .font(.system(size: 11, weight: .bold, design: .rounded))
                                        .foregroundStyle(Color(red: 0.50, green: 0.42, blue: 0.62))
                                }
                            }
                            .frame(width: 78, height: 78)
                            .overlay(
                                RoundedRectangle(cornerRadius: 24, style: .continuous)
                                    .stroke(pink.opacity(0.18), lineWidth: 1)
                            )
                            .shadow(color: pink.opacity(0.18), radius: 24, y: 12)

                            Image(systemName: "flower.fill")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(Color(red: 0.96, green: 0.74, blue: 0.34))
                                .offset(x: 4, y: -5)
                        }

                        Text("小玉 YUY")
                            .font(.system(size: 31, weight: .bold, design: .rounded))
                            .padding(.top, 24)

                        Text("输入工作台域名和访问口令。验证一次后，小玉会长期加载服务器上的最新界面。")
                            .font(.system(size: 14))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .lineSpacing(4)
                            .padding(.top, 10)
                            .padding(.horizontal, 18)

                        VStack(spacing: 14) {
                            fieldTitle("工作台地址")
                            TextField("https://db.dubin.cc.cd", text: $domain)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.URL)
                                .autocorrectionDisabled()
                                .focused($focusedField, equals: .domain)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .token }
                                .padding(.horizontal, 15)
                                .frame(height: 52)
                                .background(Color(uiColor: .secondarySystemBackground).opacity(0.9))
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(pink.opacity(0.12), lineWidth: 1)
                                )

                            fieldTitle("访问口令")
                                .padding(.top, 2)
                            SecureField("私人访问口令", text: $token)
                                .textContentType(.password)
                                .focused($focusedField, equals: .token)
                                .submitLabel(.go)
                                .onSubmit { Task { await connect() } }
                                .padding(.horizontal, 15)
                                .frame(height: 52)
                                .background(Color(uiColor: .secondarySystemBackground).opacity(0.9))
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(pink.opacity(0.12), lineWidth: 1)
                                )

                            if !store.errorMessage.isEmpty {
                                Text(store.errorMessage)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(12)
                                    .background(Color.red.opacity(0.07))
                                    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                            }

                            Button {
                                Task { await connect() }
                            } label: {
                                HStack(spacing: 8) {
                                    if store.isLoading { ProgressView().tint(.white) }
                                    Text(store.isLoading ? "正在验证…" : "连接并进入")
                                }
                                .fontWeight(.semibold)
                                .frame(maxWidth: .infinity)
                                .frame(height: 52)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(.white)
                            .background(
                                LinearGradient(
                                    colors: [Color(red: 0.92, green: 0.63, blue: 0.75), pink],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .shadow(color: pink.opacity(0.22), radius: 18, y: 8)
                            .disabled(store.isLoading || domain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || token.isEmpty)
                        }
                        .padding(.top, 34)

                        Label("口令保存在 Keychain，验证后 30 天免密", systemImage: "lock.shield.fill")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                            .padding(.top, 17)

                        Spacer(minLength: 40)
                    }
                    .frame(maxWidth: 440)
                    .padding(.horizontal, 22)
                    .frame(maxWidth: .infinity)
                }
            }
            .onAppear {
                if domain.isEmpty { domain = store.domain }
            }
        }
    }

    @ViewBuilder
    private func fieldTitle(_ text: String) -> some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func connect() async {
        focusedField = nil
        await store.login(domain: domain, token: token)
        if store.isAuthenticated { token = "" }
    }
}
