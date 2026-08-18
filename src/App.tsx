import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getSavedToken, saveToken } from "./api";
import type { Entry, MemoryItem, Overview, Role } from "./types";

const ROLES: Record<
  Role,
  { name: string; short: string; icon: string; desc: string; accent: string }
> = {
  media: {
    name: "新媒体运营助手",
    short: "运营",
    icon: "◈",
    desc: "选题、标题、脚本、账号策略与复盘",
    accent: "amber",
  },
  health: {
    name: "健康咨询师",
    short: "健康",
    icon: "✚",
    desc: "睡眠、饮食、运动、症状与长期趋势",
    accent: "sage",
  },
  daily: {
    name: "日常助理",
    short: "日常",
    icon: "⌁",
    desc: "计划、任务、决策、生活事务与提醒线索",
    accent: "blue",
  },
  interior: {
    name: "软装学习伙伴",
    short: "软装",
    icon: "◇",
    desc: "风格、配色、材质、案例与学习笔记",
    accent: "rose",
  },
  journal: {
    name: "随笔记录员",
    short: "随笔",
    icon: "✎",
    desc: "想法、灵感、心情与碎片化记录",
    accent: "ink",
  },
};

const roleKeys = Object.keys(ROLES) as Role[];

type View = "home" | "chat" | "memory" | "settings";

function roleName(role: Role) {
  return ROLES[role]?.name || role;
}

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

export default function App() {
  const [token, setToken] = useState(getSavedToken());
  const [draftToken, setDraftToken] = useState(getSavedToken());
  const [view, setView] = useState<View>("home");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<Entry[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastReply, setLastReply] = useState<Entry | null>(null);
  const [activeRole, setActiveRole] = useState<Role | "all">("all");

  const totalEntries = useMemo(
    () =>
      overview
        ? roleKeys.reduce((sum, role) => sum + (overview.counts[role] || 0), 0)
        : 0,
    [overview],
  );

  async function refresh() {
    if (!getSavedToken()) return;
    setLoading(true);
    setError("");
    try {
      const [o, h, m] = await Promise.all([
        api.overview(),
        api.history(activeRole === "all" ? undefined : activeRole),
        api.memories(activeRole === "all" ? undefined : activeRole),
      ]);
      setOverview(o);
      setHistory(h.entries);
      setMemories(m.memories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeRole]);

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
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSending(false);
    }
  }

  function unlock(event: FormEvent) {
    event.preventDefault();
    const value = draftToken.trim();
    if (!value) return;
    saveToken(value);
    setToken(value);
  }

  async function exportData() {
    try {
      const data = await api.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `private-ai-workbench-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    }
  }

  if (!token) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <div className="brand-mark">AI</div>
          <p className="eyebrow">PRIVATE WORKBENCH</p>
          <h1>私人 AI 工作台</h1>
          <p className="muted">
            请输入你部署时设置的私人访问口令。口令只保存在当前设备。
          </p>
          <form onSubmit={unlock} className="lock-form">
            <input
              type="password"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              placeholder="访问口令"
              autoFocus
            />
            <button className="primary-button" type="submit">
              进入工作台
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark small">AI</div>
          <div>
            <strong>私人 AI 工作台</strong>
            <span>持续积累 · 自动归档</span>
          </div>
        </div>
        <nav>
          <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>
            <span>⌂</span> 总览
          </button>
          <button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>
            <span>◌</span> 对话
          </button>
          <button className={view === "memory" ? "active" : ""} onClick={() => setView("memory")}>
            <span>◎</span> 长期记忆
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <span>⚙</span> 设置
          </button>
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          单用户私有模式
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{view === "home" ? "TODAY" : view.toUpperCase()}</p>
            <h2>
              {view === "home" && "把生活与工作放进同一套长期记忆"}
              {view === "chat" && "直接说，它会自己判断该交给谁"}
              {view === "memory" && "可回看的长期信息与轨迹"}
              {view === "settings" && "数据与访问设置"}
            </h2>
          </div>
          <button className="ghost-button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "同步中" : "同步"}
          </button>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {view === "home" && (
          <>
            <section className="hero-grid">
              <div className="hero-panel">
                <p className="eyebrow">UNIFIED INBOX</p>
                <h1>今天想记什么，或解决什么？</h1>
                <p>
                  不用选择角色。系统会自动判断归属，并把值得长期保留的信息写入对应记忆。
                </p>
                <Composer
                  message={message}
                  setMessage={setMessage}
                  onSend={handleSend}
                  sending={sending}
                />
                <div className="microcopy">自动分类 · 长期记忆 · 结构化追踪</div>
              </div>
              <div className="stat-panel">
                <span>累计记录</span>
                <strong>{totalEntries}</strong>
                <small>条对话 / 记录</small>
                <div className="divider" />
                <span>长期记忆</span>
                <strong>
                  {overview
                    ? roleKeys.reduce(
                        (sum, role) => sum + (overview.memoryCounts[role] || 0),
                        0,
                      )
                    : 0}
                </strong>
                <small>条可复用信息</small>
              </div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">FIVE ROLES</p>
                  <h3>五个角色，一个入口</h3>
                </div>
              </div>
              <div className="role-grid">
                {roleKeys.map((role) => (
                  <button
                    key={role}
                    className={`role-card ${ROLES[role].accent}`}
                    onClick={() => {
                      setActiveRole(role);
                      setView("memory");
                    }}
                  >
                    <div className="role-icon">{ROLES[role].icon}</div>
                    <h4>{ROLES[role].name}</h4>
                    <p>{ROLES[role].desc}</p>
                    <div className="role-meta">
                      <span>{overview?.counts[role] || 0} 条记录</span>
                      <span>{overview?.memoryCounts[role] || 0} 条记忆</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">RECENT</p>
                  <h3>最近发生的事</h3>
                </div>
                <button className="text-button" onClick={() => setView("chat")}>
                  查看全部 →
                </button>
              </div>
              <Timeline entries={overview?.recent || []} />
            </section>
          </>
        )}

        {view === "chat" && (
          <section className="chat-layout">
            <div className="chat-column">
              <div className="auto-route-note">
                <span className="spark">✦</span>
                <div>
                  <strong>自动路由开启</strong>
                  <p>每条输入都会由 AI 判断主角色，再写入对应时间线和记忆。</p>
                </div>
              </div>
              {lastReply && (
                <article className="reply-card featured">
                  <div className="reply-head">
                    <span className={`role-pill ${ROLES[lastReply.role].accent}`}>
                      {ROLES[lastReply.role].icon} {roleName(lastReply.role)}
                    </span>
                    <span>{friendlyDate(lastReply.created_at)}</span>
                  </div>
                  <h3>{lastReply.title}</h3>
                  <div className="reply-text">{lastReply.assistant_text}</div>
                  {lastReply.health_signal !== "none" && (
                    <div className="health-note">
                      健康信息仅作一般性参考；如症状明显加重或出现危险信号，应及时就医。
                    </div>
                  )}
                </article>
              )}
              <div className="chat-composer-sticky">
                <Composer
                  message={message}
                  setMessage={setMessage}
                  onSend={handleSend}
                  sending={sending}
                  compact
                />
              </div>
              <div className="history-list">
                {history.map((entry) => (
                  <article className="reply-card" key={entry.id}>
                    <div className="reply-head">
                      <span className={`role-pill ${ROLES[entry.role].accent}`}>
                        {ROLES[entry.role].icon} {ROLES[entry.role].short}
                      </span>
                      <span>{friendlyDate(entry.created_at)}</span>
                    </div>
                    <h4>{entry.title}</h4>
                    <div className="user-quote">“{entry.user_text}”</div>
                    <div className="reply-text clamp">{entry.assistant_text}</div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {view === "memory" && (
          <section className="memory-layout">
            <div className="filter-row">
              <button
                className={activeRole === "all" ? "filter active" : "filter"}
                onClick={() => setActiveRole("all")}
              >
                全部
              </button>
              {roleKeys.map((role) => (
                <button
                  key={role}
                  className={activeRole === role ? "filter active" : "filter"}
                  onClick={() => setActiveRole(role)}
                >
                  {ROLES[role].short}
                </button>
              ))}
            </div>
            <div className="memory-grid">
              {memories.map((memory) => (
                <article className="memory-card" key={memory.id}>
                  <div className="reply-head">
                    <span className={`role-pill ${ROLES[memory.role].accent}`}>
                      {ROLES[memory.role].icon} {ROLES[memory.role].short}
                    </span>
                    <span>重要度 {memory.importance}/5</span>
                  </div>
                  <p>{memory.content}</p>
                  <footer>
                    <span>{memory.kind}</span>
                    <span>更新 {friendlyDate(memory.last_seen_at)}</span>
                  </footer>
                </article>
              ))}
              {!memories.length && !loading && (
                <div className="empty-state">还没有长期记忆。开始聊几条后，这里会自动出现。</div>
              )}
            </div>
          </section>
        )}

        {view === "settings" && (
          <section className="settings-grid">
            <article className="settings-card">
              <p className="eyebrow">ACCESS</p>
              <h3>私人访问口令</h3>
              <p className="muted">口令保存在当前设备的本地存储中，用于请求你的 Cloudflare API。</p>
              <input
                type="password"
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder="新的访问口令"
              />
              <button
                className="secondary-button"
                onClick={() => {
                  saveToken(draftToken);
                  setToken(draftToken.trim());
                }}
              >
                保存到此设备
              </button>
            </article>
            <article className="settings-card">
              <p className="eyebrow">DATA</p>
              <h3>导出全部数据</h3>
              <p className="muted">导出聊天、记忆与指标为 JSON，方便备份或未来迁移。</p>
              <button className="secondary-button" onClick={() => void exportData()}>
                导出 JSON 备份
              </button>
            </article>
            <article className="settings-card health-card">
              <p className="eyebrow">HEALTH</p>
              <h3>健康角色边界</h3>
              <p className="muted">
                健康角色用于信息整理、一般性建议与趋势追踪，不替代医生诊断；出现急症或危险信号时会优先建议线下就医。
              </p>
            </article>
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>⌂<span>总览</span></button>
        <button className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>◌<span>对话</span></button>
        <button className={view === "memory" ? "active" : ""} onClick={() => setView("memory")}>◎<span>记忆</span></button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>⚙<span>设置</span></button>
      </nav>
    </div>
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
        placeholder="例如：最近睡眠总是断断续续；帮我想3个短视频选题；我今天突然想到……"
        rows={compact ? 2 : 4}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <div className="composer-actions">
        <span>⌘ / Ctrl + Enter 发送</span>
        <button className="send-button" type="submit" disabled={sending || !message.trim()}>
          {sending ? "思考中…" : "发送 ↑"}
        </button>
      </div>
    </form>
  );
}

function Timeline({ entries }: { entries: Entry[] }) {
  if (!entries.length) {
    return <div className="empty-state">还没有记录。上面随便输入一句开始。</div>;
  }
  return (
    <div className="timeline">
      {entries.map((entry) => (
        <article key={entry.id}>
          <div className={`timeline-dot ${ROLES[entry.role].accent}`} />
          <div className="timeline-body">
            <div className="reply-head">
              <span>{roleName(entry.role)}</span>
              <span>{friendlyDate(entry.created_at)}</span>
            </div>
            <h4>{entry.title}</h4>
            <p>{entry.summary}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
