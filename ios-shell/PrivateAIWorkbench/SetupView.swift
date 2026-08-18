import SwiftUI

struct SetupView: View {
    @EnvironmentObject private var store: ShellStore
    @State private var domain = ""
    @State private var token = ""
    @FocusState private var focusedField: Field?

    enum Field { case domain, token }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    Spacer(minLength: 52)

                    Text("AI")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(width: 76, height: 76)
                        .background(Color.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                        .shadow(color: .black.opacity(0.13), radius: 20, y: 12)

                    Text("私人 AI 工作台")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .padding(.top, 24)

                    Text("这个 App 只是一层安全外壳。网页功能以后在线更新，不需要反复安装 IPA。")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                        .padding(.top, 10)
                        .padding(.horizontal, 18)

                    VStack(spacing: 14) {
                        VStack(alignment: .leading, spacing: 7) {
                            Text("工作台地址").font(.caption).foregroundStyle(.secondary)
                            TextField("https://db.dubin.cc.cd", text: $domain)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.URL)
                                .autocorrectionDisabled()
                                .focused($focusedField, equals: .domain)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .token }
                                .padding(.horizontal, 14)
                                .frame(height: 50)
                                .background(Color(uiColor: .secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }

                        VStack(alignment: .leading, spacing: 7) {
                            Text("访问口令").font(.caption).foregroundStyle(.secondary)
                            SecureField("私人访问口令", text: $token)
                                .textContentType(.password)
                                .focused($focusedField, equals: .token)
                                .submitLabel(.go)
                                .onSubmit { Task { await connect() } }
                                .padding(.horizontal, 14)
                                .frame(height: 50)
                                .background(Color(uiColor: .secondarySystemBackground))
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }

                        if !store.errorMessage.isEmpty {
                            Text(store.errorMessage)
                                .font(.caption)
                                .foregroundStyle(.red)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(12)
                                .background(Color.red.opacity(0.07))
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
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
                            .frame(height: 50)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color(uiColor: .systemBackground))
                        .background(Color.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .disabled(store.isLoading || domain.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || token.isEmpty)
                    }
                    .padding(.top, 34)

                    Label("验证成功后使用 Keychain 保存口令，30 天内免密登录", systemImage: "lock.shield")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 16)

                    Spacer(minLength: 40)
                }
                .frame(maxWidth: 440)
                .padding(.horizontal, 22)
                .frame(maxWidth: .infinity)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .onAppear {
                if domain.isEmpty { domain = store.domain }
            }
        }
    }

    private func connect() async {
        focusedField = nil
        await store.login(domain: domain, token: token)
        if store.isAuthenticated { token = "" }
    }
}
