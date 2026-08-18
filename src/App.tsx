import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  api,
  clearSavedToken,
  getSavedToken,
  getTokenExpiry,
  isNativeShell,
  openNativeShellSettings,
  saveToken,
  verifyToken,
} from "./api";
import type {
  AISavePayload,
  AISettings,
  Entry,
  HealthResponse,
  MemoryItem,
  Metric,
  Overview,
  Role,
} from "./types";

const ROLES: Record<Role, { name: string; short: string; icon: string }> = {
  media: { name: "新媒体运营", short: "运营", icon: "◈" },
  health: { name: "健康咨询", short: "健康", icon: "＋" },
  daily: { name: "日常助理", short: "日常", icon: "⌁" },
  interior: { name: "软装学习", short: "软装", icon: "◇" },
  journal: { name: "随笔记录", short: "随笔", icon: "✎" },
};

const roleKeys = Object.keys(ROLES) as Role[];
type View = "home" | "chat" | "memory" | "settings";
type MemoryMode = "memory" | "metric";

const EMPTY_AI: AISettings = {
  provider: "workers-ai",
  base_url: "",
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  has_api_key: true,
};

function friendlyDate(input: string) {
  const normalized = input.includes(" ") ? input.replace(" ", "T") : input;
  const date = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function providerName(provider?: string) {
  if (provider === "openai-responses") return "OpenAI Responses";
  if (provider === "openai-compatible") return "OpenAI 兼容 API";
  return "Cloudflare Workers AI";
}

function parseTags(entry: Entry) {
  if (Array.isArray(entry.tags)) return entry.tags;
  try {
    return entry.tags_json ? (JSON.parse(entry.tags_json) as string[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [token, setToken] = useState(getSavedToken());
  const [draftToken, setDraftToken] = useState("");
  const [view, setView] = useState<View>("home");
  const [memoryMode, setMemoryMode] = useState<MemoryMode>("memory");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<Entry[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastReply, setLastReply] = useState<Entry | null>(null);
  const [activeRole, setActiveRole] = useState<Role | "all">("all");
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const [aiSettings, setAISettings] = useState<AISettings>(EMPTY_AI);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);

  const nativeShell = isNativeShell();

  const totalEntries = useMemo(
    () =>
      overview ? roleKeys.reduce((sum, role) => sum + (overview.counts[role] || 0), 0) : 0,
    [overview],
  );
  const totalMemories = useMemo(
    () =>
      overview
        ? roleKeys.reduce((sum, role) => sum + (overview.memoryCounts[role] || 0), 0)
        : 0,
    [overview],
  );

  async function refresh() {
    if (!getSavedToken()) return;
    setLoading(true);
    setError("");
    try {
      const role = activeRole === "all" ? undefined : activeRole;
      const [o, h, m, metricList, healthResult] = await Promise.all([
        api.overview(),
        api.history(role),
        api.memories(role),
        api.metrics(role),
        api.health(),
      ]);
      setOverview(o);
      setHistory(h.entries);
      setMemories(m.memories);
      setMetrics(metricList.metrics);
      setHealth(healthResult);
    } catch (e) {
      handleRequestError(e, "加载失败");
    } finally {
      setLoading(false);
    }
  }

  function handleRequestError(e: unknown, fallback: string) {
    const errorWithStatus = e as Error & { status?: number };
    const text = e instanceof Error ? e.message : fallback;
    if (errorWithStatus?.status === 401 || text === "访问口令不正确") {
      clearSavedToken();
      setToken("");
      setDraftToken("");
      setError("登录已失效，请重新验证访问口令。");
      return;
    }
    setError(text);
  }

  useEffect(() => {
    if (token) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeRole]);

  useEffect(() => {
    if (view === "settings" && token) void loadAISettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, token]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function applyToken(value: string) {
    const clean = value.trim();
    if (!clean || verifyingToken) return;
    setVerifyingToken(true);
    setError("");
    try {
      const result = await verifyToken(clean);
      saveToken(clean, 30);
      setToken(clean);
      setHealth(result);
      setDraftToken("");
      setNotice("已登录，本设备 30 天内免密");
    } catch (e) {
      clearSavedToken();
      setToken("");
      setError(e instanceof Error ? e.message : "访问口令验证失败");
    } finally {
      setVerifyingToken(false);
    }
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    await applyToken(draftToken);
  }

  async function handleSend(event?: FormEvent) {
    event?.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await api.chat(text);
      setMessage("");
      setLastReply(result.entry);
      setView("chat");
      await refresh();
    } catch (e) {
      handleRequestError(e, "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function loadAISettings() {
    try {
      const settings = await api.aiSettings();
      setAISettings(settings);
      setAiApiKey("");
    } catch (e) {
      handleRequestError(e, "AI 配置加载失败");
    }
  }

  function buildAISavePayload(): AISavePayload {
    return {
      provider: aiSettings.provider,
      base_url: aiSettings.base_url,
      model: aiSettings.model,
      ...(aiApiKey.trim() ? { api_key: aiApiKey.trim() } : {}),
    };
  }

  async function testAI() {
    setAiTesting(true);
    setError("");
    try {
      const result = await api.testAISettings(buildAISavePayload());
      setNotice(`${result.message} · ${result.model}`);
    } catch (e) {
      handleRequestError(e, "AI 连接测试失败");
    } finally {
      setAiTesting(false);
    }
  }

  async function saveAI() {
    setAiSaving(true);
    setError("");
    try {
      const saved = await api.saveAISettings(buildAISavePayload());
      setAISettings(saved);
      setAiApiKey("");
      setNotice("AI 配置已保存");
      const latestHealth = await api.health();
      setHealth(latestHealth);
    } catch (e) {
      handleRequestError(e, "AI 配置保存失败");
    } finally {
      setAiSaving(false);
    }
  }

  async function clearAIKey() {
    setAiSaving(true);
    try {
      const saved = await api.saveAISettings({
        provider: aiSettings.provider,
        base_url: aiSettings.base_url,
        model: aiSettings.model,
        clear_api_key: true,
      });
      setAISettings(saved);
      setAiApiKey("");
      setNotice("API key 已清除");
    } catch (e) {
      handleRequestError(e, "清除 API key 失败");
    } finally {
      setAiSaving(false);
    }
  }

  function changeProvider(provider: AISettings["provider"]) {
    if (provider === "workers-ai") {
      setAISettings({
        ...aiSettings,
        provider,
        base_url: "",
        model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      });
    } else if (provider === "openai-responses") {
      setAISettings({
        ...aiSettings,
        provider,
        base_url: "https://api.openai.com/v1",
        model: "gpt-5.6",
      });
    } else {
      setAISettings({ ...aiSettings, provider, base_url: aiSettings.base_url || "", model: "" });
    }
    setAiApiKey("");
  }

  async function exportData() {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `private-ai-workbench-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setNotice("数据备份已生成");
    } catch (e) {
      handleRequestError(e, "导出失败");
    }
  }

  function logout() {
    clearSavedToken();
    setToken("");
    setDraftToken("");
    setOverview(null);
  }

  if (!token) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="app-icon">AI</div>
          <h1>私人 AI 工作台</h1>
          <p>一个入口，自动归档工作、生活与长期记忆。</p>
          {error && <div className="inline-alert error">{error}</div>}
          <form onSubmit={unlock} className="login-form">
            <label>
              <span>访问口令</span>
              <input
                type="password"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder="请输入私人访问口令"
                autoComplete="current-password"
                autoFocus
              />
            </label>
            <button className="primary-button" type="submit" disabled={verifyingToken || !draftToken.trim()}>
              {verifyingToken ? "正在验证…" : "进入工作台"}
            </button>
          </form>
          <small>验证成功后，本设备 30 天内免密。</small>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <header className="app-header">
          <div>
            <div className="header-title">{view === "home" ? "工作台" : view === "chat" ? "AI" : view === "memory" ? "记忆" : "设置"}</div>
            {view === "home" && (
              <div className="header-subtitle">
                {health?.configured ? "AI 已就绪" : "AI 待配置"} · {health?.model || "正在同步"}
              </div>
            )}
          </div>
          <button className="icon-button" onClick={() => void refresh()} disabled={loading} aria-label="同步">
            {loading ? "…" : "↻"}
          </button>
        </header>

        {notice && <div className="toast">{notice}</div>}
        {error && <div className="inline-alert error top-alert">{error}</div>}

        {view === "home" && (
          <HomeView
            overview={overview}
            totalEntries={totalEntries}
            totalMemories={totalMemories}
            message={message}
            setMessage={setMessage}
            onSend={handleSend}
            sending={sending}
            onOpenChat={() => setView("chat")}
            onRole={(role) => {
              setActiveRole(role);
              setMemoryMode("memory");
              setView("memory");
            }}
          />
        )}

        {view === "chat" && (
          <ChatView
            history={history}
            lastReply={lastReply}
            message={message}
            setMessage={setMessage}
            onSend={handleSend}
            sending={sending}
          />
        )}

        {view === "memory" && (
          <MemoryView
            activeRole={activeRole}
            setActiveRole={setActiveRole}
            mode={memoryMode}
            setMode={setMemoryMode}
            memories={memories}
            metrics={metrics}
            loading={loading}
          />
        )}

        {view === "settings" && (
          <SettingsView
            nativeShell={nativeShell}
            health={health}
            aiSettings={aiSettings}
            setAISettings={setAISettings}
            aiApiKey={aiApiKey}
            setAiApiKey={setAiApiKey}
            onProviderChange={changeProvider}
            onTestAI={testAI}
            onSaveAI={saveAI}
            onClearAIKey={clearAIKey}
            aiTesting={aiTesting}
            aiSaving={aiSaving}
            tokenExpiry={getTokenExpiry()}
            onExport={() => void exportData()}
            onLogout={logout}
          />
        )}
      </main>

      <nav className="tab-bar" aria-label="主导航">
        <TabButton active={view === "home"} icon="⌂" label="首页" onClick={() => setView("home")} />
        <TabButton active={view === "chat"} icon="✦" label="AI" onClick={() => setView("chat")} />
        <TabButton active={view === "memory"} icon="◎" label="记忆" onClick={() => setView("memory")} />
        <TabButton active={view === "settings"} icon="⚙" label="设置" onClick={() => setView("settings")} />
      </nav>
    </div>
  );
}

function HomeView({
  overview,
  totalEntries,
  totalMemories,
  message,
  setMessage,
  onSend,
  sending,
  onOpenChat,
  onRole,
}: {
  overview: Overview | null;
  totalEntries: number;
  totalMemories: number;
  message: string;
  setMessage: (value: string) => void;
  onSend: (event?: FormEvent) => void;
  sending: boolean;
  onOpenChat: () => void;
  onRole: (role: Role) => void;
}) {
  return (
    <>
      <section className="capture-card">
        <h1>现在想处理什么？</h1>
        <p>直接说。系统会自己判断该交给哪个角色，并决定什么值得长期记住。</p>
        <Composer message={message} setMessage={setMessage} onSend={onSend} sending={sending} />
      </section>

      <section className="mini-stats" aria-label="数据概览">
        <div><strong>{totalEntries}</strong><span>累计记录</span></div>
        <div><strong>{totalMemories}</strong><span>长期记忆</span></div>
        <div><strong>{overview?.latestMetrics?.length || 0}</strong><span>近期指标</span></div>
      </section>

      <section className="role-strip">
        {roleKeys.map((role) => (
          <button key={role} onClick={() => onRole(role)}>
            <span>{ROLES[role].icon}</span>
            <span>{ROLES[role].short}</span>
            <small>{overview?.counts[role] || 0}</small>
          </button>
        ))}
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <h2>最近</h2>
          <button className="text-button" onClick={onOpenChat}>全部记录</button>
        </div>
        <div className="recent-list">
          {(overview?.recent || []).slice(0, 5).map((entry) => (
            <EntryRow key={entry.id} entry={entry} />
          ))}
          {!overview?.recent?.length && <EmptyState text="还没有记录。第一条输入会从这里开始。" />}
        </div>
      </section>

      {!!overview?.latestMetrics?.length && (
        <section className="content-section">
          <div className="section-title-row"><h2>最近指标</h2></div>
          <div className="metric-strip">
            {overview.latestMetrics.slice(0, 4).map((metric) => (
              <div className="metric-chip" key={metric.id}>
                <span>{metric.name}</span>
                <strong>{metric.value}{metric.unit ? ` ${metric.unit}` : ""}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function ChatView({
  history,
  lastReply,
  message,
  setMessage,
  onSend,
  sending,
}: {
  history: Entry[];
  lastReply: Entry | null;
  message: string;
  setMessage: (value: string) => void;
  onSend: (event?: FormEvent) => void;
  sending: boolean;
}) {
  return (
    <section className="chat-page">
      <div className="chat-list">
        {lastReply && <ReplyCard entry={lastReply} featured />}
        {history
          .filter((entry) => entry.id !== lastReply?.id)
          .map((entry) => <ReplyCard key={entry.id} entry={entry} />)}
        {!history.length && !lastReply && <EmptyState text="这里是完整对话时间线。直接在下方开始。" />}
      </div>
      <div className="chat-composer">
        <Composer compact message={message} setMessage={setMessage} onSend={onSend} sending={sending} />
      </div>
    </section>
  );
}

function MemoryView({
  activeRole,
  setActiveRole,
  mode,
  setMode,
  memories,
  metrics,
  loading,
}: {
  activeRole: Role | "all";
  setActiveRole: (role: Role | "all") => void;
  mode: MemoryMode;
  setMode: (mode: MemoryMode) => void;
  memories: MemoryItem[];
  metrics: Metric[];
  loading: boolean;
}) {
  return (
    <>
      <div className="segmented">
        <button className={mode === "memory" ? "active" : ""} onClick={() => setMode("memory")}>长期记忆</button>
        <button className={mode === "metric" ? "active" : ""} onClick={() => setMode("metric")}>指标</button>
      </div>

      <div className="filter-scroll">
        <button className={activeRole === "all" ? "active" : ""} onClick={() => setActiveRole("all")}>全部</button>
        {roleKeys.map((role) => (
          <button key={role} className={activeRole === role ? "active" : ""} onClick={() => setActiveRole(role)}>
            {ROLES[role].short}
          </button>
        ))}
      </div>

      {mode === "memory" ? (
        <div className="memory-list">
          {memories.map((memory) => (
            <article className="memory-card" key={memory.id}>
              <div className="card-meta">
                <span>{ROLES[memory.role].icon} {ROLES[memory.role].short}</span>
                <span>重要度 {memory.importance}/5</span>
              </div>
              <p>{memory.content}</p>
              <small>{memory.kind} · 更新于 {friendlyDate(memory.last_seen_at)}</small>
            </article>
          ))}
          {!memories.length && !loading && <EmptyState text="还没有长期记忆。系统只保存未来仍有用的信息。" />}
        </div>
      ) : (
        <div className="metric-list">
          {metrics.map((metric) => (
            <article className="metric-row" key={metric.id}>
              <div>
                <span>{metric.name}</span>
                <small>{ROLES[metric.role].short} · {friendlyDate(metric.recorded_at)}</small>
              </div>
              <strong>{metric.value}{metric.unit ? ` ${metric.unit}` : ""}</strong>
              {metric.note && <p>{metric.note}</p>}
            </article>
          ))}
          {!metrics.length && !loading && <EmptyState text="还没有可追踪指标。数字型健康、运营或进度信息会自动沉淀到这里。" />}
        </div>
      )}
    </>
  );
}

function SettingsView({
  nativeShell,
  health,
  aiSettings,
  setAISettings,
  aiApiKey,
  setAiApiKey,
  onProviderChange,
  onTestAI,
  onSaveAI,
  onClearAIKey,
  aiTesting,
  aiSaving,
  tokenExpiry,
  onExport,
  onLogout,
}: {
  nativeShell: boolean;
  health: HealthResponse | null;
  aiSettings: AISettings;
  setAISettings: (value: AISettings) => void;
  aiApiKey: string;
  setAiApiKey: (value: string) => void;
  onProviderChange: (provider: AISettings["provider"]) => void;
  onTestAI: () => void;
  onSaveAI: () => void;
  onClearAIKey: () => void;
  aiTesting: boolean;
  aiSaving: boolean;
  tokenExpiry: number;
  onExport: () => void;
  onLogout: () => void;
}) {
  const expiresText = tokenExpiry
    ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(tokenExpiry))
    : "—";

  return (
    <div className="settings-page">
      <section className="settings-section">
        <div className="settings-heading">
          <div><h2>AI 模型</h2><p>网页端修改后立即生效，不需要重新编译 IPA。</p></div>
          <span className={`status-badge ${health?.configured ? "ok" : "warn"}`}>
            {health?.configured ? "已就绪" : "待配置"}
          </span>
        </div>

        <label className="field">
          <span>提供商</span>
          <select value={aiSettings.provider} onChange={(e) => onProviderChange(e.target.value as AISettings["provider"])}>
            <option value="workers-ai">Cloudflare Workers AI</option>
            <option value="openai-responses">OpenAI Responses API</option>
            <option value="openai-compatible">OpenAI 兼容 API</option>
          </select>
        </label>

        {aiSettings.provider !== "workers-ai" && (
          <label className="field">
            <span>API 地址</span>
            <input
              value={aiSettings.base_url}
              onChange={(e) => setAISettings({ ...aiSettings, base_url: e.target.value })}
              placeholder={aiSettings.provider === "openai-responses" ? "https://api.openai.com/v1" : "https://example.com/v1"}
              inputMode="url"
            />
          </label>
        )}

        <label className="field">
          <span>模型名称</span>
          <input
            value={aiSettings.model}
            onChange={(e) => setAISettings({ ...aiSettings, model: e.target.value })}
            placeholder={aiSettings.provider === "workers-ai" ? "@cf/meta/..." : "例如 gpt-5.6"}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>

        {aiSettings.provider !== "workers-ai" && (
          <label className="field">
            <span>API key</span>
            <input
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder={aiSettings.has_api_key ? "已保存；留空表示不修改" : "请输入 API key"}
              autoComplete="off"
            />
            <small>密钥只发送到你的 Worker，并加密后存入 D1；前端不会读取已保存的明文。</small>
          </label>
        )}

        <div className="button-row">
          <button className="secondary-button" onClick={onTestAI} disabled={aiTesting || aiSaving || !aiSettings.model.trim()}>
            {aiTesting ? "测试中…" : "测试连接"}
          </button>
          <button className="primary-button" onClick={onSaveAI} disabled={aiSaving || aiTesting || !aiSettings.model.trim()}>
            {aiSaving ? "保存中…" : "保存"}
          </button>
        </div>
        {aiSettings.provider !== "workers-ai" && aiSettings.has_api_key && (
          <button className="danger-text" onClick={onClearAIKey} disabled={aiSaving}>清除已保存 API key</button>
        )}
      </section>

      <section className="settings-section compact-settings">
        <div className="settings-row">
          <div><strong>当前连接</strong><span>{location.origin}</span></div>
          {nativeShell && <button className="secondary-button small" onClick={openNativeShellSettings}>修改 App 连接</button>}
        </div>
        <div className="settings-row">
          <div><strong>免密登录</strong><span>有效至 {expiresText}</span></div>
          <button className="text-button danger" onClick={nativeShell ? openNativeShellSettings : onLogout}>{nativeShell ? "重新登录" : "退出"}</button>
        </div>
        <div className="settings-row">
          <div><strong>数据备份</strong><span>聊天、记忆、指标与非敏感 AI 配置</span></div>
          <button className="secondary-button small" onClick={onExport}>导出 JSON</button>
        </div>
      </section>

      <section className="settings-note">
        <strong>健康咨询边界</strong>
        <p>健康角色用于信息整理、一般性建议和趋势追踪，不替代医生诊断。出现急症或危险信号时会优先建议线下就医。</p>
      </section>
    </div>
  );
}

function ReplyCard({ entry, featured = false }: { entry: Entry; featured?: boolean }) {
  const tags = parseTags(entry);
  return (
    <article className={`reply-card ${featured ? "featured" : ""}`}>
      <div className="card-meta">
        <span>{ROLES[entry.role].icon} {ROLES[entry.role].name}</span>
        <span>{friendlyDate(entry.created_at)}</span>
      </div>
      <h3>{entry.title}</h3>
      <div className="user-message">{entry.user_text}</div>
      <div className="assistant-message">{entry.assistant_text}</div>
      {!!tags.length && <div className="tag-row">{tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>}
      {entry.health_signal !== "none" && (
        <div className="health-alert">健康信息仅作一般性参考；症状明显加重或出现危险信号时请及时就医。</div>
      )}
    </article>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  return (
    <article className="entry-row">
      <div className="entry-icon">{ROLES[entry.role].icon}</div>
      <div className="entry-content"><strong>{entry.title}</strong><p>{entry.summary}</p></div>
      <time>{friendlyDate(entry.created_at).split(" ")[0]}</time>
    </article>
  );
}

function Composer({
  message,
  setMessage,
  onSend,
  sending,
  compact = false,
}: {
  message: string;
  setMessage: (value: string) => void;
  onSend: (event?: FormEvent) => void;
  sending: boolean;
  compact?: boolean;
}) {
  return (
    <form className={`composer ${compact ? "compact" : ""}`} onSubmit={onSend}>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="直接输入问题、想法或记录…"
        rows={compact ? 2 : 3}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <div className="composer-footer">
        <span>自动判断归属</span>
        <button type="submit" disabled={sending || !message.trim()}>{sending ? "…" : "↑"}</button>
      </div>
    </form>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      <span className="tab-icon">{icon}</span><span>{label}</span>
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
