import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  CalendarActionResult,
  CalendarEvent,
  CalendarEventInput,
  Entry,
  EventCategory,
  HealthResponse,
  MemoryItem,
  Metric,
  Role,
} from "./types";

const ROLES: Record<Role, { name: string; short: string }> = {
  media: { name: "新媒体运营", short: "运营" },
  health: { name: "健康咨询", short: "健康" },
  daily: { name: "日常助理", short: "日常" },
  interior: { name: "软装学习", short: "软装" },
  journal: { name: "随笔记录", short: "随笔" },
};

const ROLE_KEYS = Object.keys(ROLES) as Role[];

const CATEGORY_META: Record<
  EventCategory,
  { label: string; className: string; color: string }
> = {
  work: { label: "工作", className: "cat-work", color: "#ff6fa8" },
  study: { label: "学习", className: "cat-study", color: "#9b78ff" },
  life: { label: "生活", className: "cat-life", color: "#58aef7" },
  health: { label: "健康", className: "cat-health", color: "#55c88a" },
  inspiration: { label: "灵感", className: "cat-inspiration", color: "#ff9c57" },
  other: { label: "其他", className: "cat-other", color: "#a8a4aa" },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_META) as EventCategory[];

type MainView = "chat" | "calendar";
type PanelView = "settings" | "memory" | "assistant" | null;
type MemoryMode = "memory" | "metric";

type EventDraft = {
  id?: string;
  title: string;
  note: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  category: EventCategory;
};

const EMPTY_AI: AISettings = {
  provider: "workers-ai",
  base_url: "",
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  has_api_key: true,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function eventDateKey(event: CalendarEvent) {
  return dateKey(new Date(event.start_at));
}

function monthTitle(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function monthQueryRange(month: Date) {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  start.setDate(start.getDate() - 8);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  end.setDate(end.getDate() + 8);
  return { start: start.toISOString(), end: end.toISOString() };
}

function calendarCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
}

function friendlyDateTime(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function friendlyTime(event: CalendarEvent) {
  if (Boolean(event.all_day)) return "全天";
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  return `${pad(start.getHours())}:${pad(start.getMinutes())} – ${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function providerName(provider?: string) {
  if (provider === "openai-responses") return "OpenAI Responses";
  if (provider === "openai-compatible") return "兼容 API";
  return "Workers AI";
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "还没睡吗？";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function makeDraft(date: string, event?: CalendarEvent): EventDraft {
  if (event) {
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    return {
      id: event.id,
      title: event.title,
      note: event.note || "",
      date: eventDateKey(event),
      startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
      allDay: Boolean(event.all_day),
      category: event.category,
    };
  }

  const now = new Date();
  const nextHour = Math.min(Math.max(now.getHours() + 1, 9), 21);
  return {
    title: "",
    note: "",
    date,
    startTime: `${pad(nextHour)}:00`,
    endTime: `${pad(Math.min(nextHour + 1, 23))}:00`,
    allDay: false,
    category: "life",
  };
}

function draftToPayload(draft: EventDraft): CalendarEventInput {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let start: Date;
  let end: Date;

  if (draft.allDay) {
    start = new Date(`${draft.date}T00:00:00`);
    end = new Date(start);
    end.setDate(end.getDate() + 1);
  } else {
    start = new Date(`${draft.date}T${draft.startTime}:00`);
    end = new Date(`${draft.date}T${draft.endTime}:00`);
    if (end <= start) end = new Date(start.getTime() + 3600000);
  }

  return {
    title: draft.title.trim(),
    note: draft.note.trim(),
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    all_day: draft.allDay,
    category: draft.category,
    timezone,
  };
}

export default function App() {
  const [token, setToken] = useState(getSavedToken());
  const [draftToken, setDraftToken] = useState("");
  const [view, setView] = useState<MainView>("chat");
  const [panel, setPanel] = useState<PanelView>(null);
  const [history, setHistory] = useState<Entry[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastCalendarActions, setLastCalendarActions] = useState<CalendarActionResult[]>([]);
  const [lastActionEntryId, setLastActionEntryId] = useState("");

  const [calendarMonth, setCalendarMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [eventSaving, setEventSaving] = useState(false);
  const [undoEvent, setUndoEvent] = useState<CalendarEvent | null>(null);

  const [memoryMode, setMemoryMode] = useState<MemoryMode>("memory");
  const [activeRole, setActiveRole] = useState<Role | "all">("all");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  const [aiSettings, setAISettings] = useState<AISettings>(EMPTY_AI);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const nativeShell = isNativeShell();

  const sortedHistory = useMemo(
    () => [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [history],
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      if (event.status === "deleted") continue;
      const key = eventDateKey(event);
      const list = map.get(key) || [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.start_at.localeCompare(b.start_at));
    }
    return map;
  }, [events]);

  const selectedEvents = eventsByDate.get(selectedDate) || [];

  function handleRequestError(e: unknown, fallback: string) {
    const errorWithStatus = e as Error & { status?: number };
    const text = e instanceof Error ? e.message : fallback;
    if (errorWithStatus?.status === 401 || text === "访问口令不正确") {
      clearSavedToken();
      setToken("");
      setDraftToken("");
      setError("登录已失效，请重新输入访问口令。");
      return;
    }
    setError(text);
  }

  async function refreshChat() {
    if (!getSavedToken()) return;
    setLoading(true);
    setError("");
    try {
      const [historyResult, healthResult] = await Promise.all([api.history(), api.health()]);
      setHistory(historyResult.entries);
      setHealth(healthResult);
    } catch (e) {
      handleRequestError(e, "加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function loadCalendar(month = calendarMonth) {
    if (!getSavedToken()) return;
    const range = monthQueryRange(month);
    setCalendarLoading(true);
    try {
      const result = await api.events(range.start, range.end);
      setEvents(result.events);
    } catch (e) {
      handleRequestError(e, "日历加载失败");
    } finally {
      setCalendarLoading(false);
    }
  }

  async function loadMemoryData(role = activeRole) {
    const selectedRole = role === "all" ? undefined : role;
    try {
      const [memoryResult, metricResult] = await Promise.all([
        api.memories(selectedRole),
        api.metrics(selectedRole),
      ]);
      setMemories(memoryResult.memories);
      setMetrics(metricResult.metrics);
    } catch (e) {
      handleRequestError(e, "记忆加载失败");
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

  useEffect(() => {
    if (!token) return;
    void refreshChat();
    void loadCalendar(calendarMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (token) void loadCalendar(calendarMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarMonth]);

  useEffect(() => {
    if (panel === "settings" && token) void loadAISettings();
    if (panel === "memory" && token) void loadMemoryData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel, token]);

  useEffect(() => {
    if (panel === "memory" && token) void loadMemoryData(activeRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRole]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!undoEvent) return;
    const timer = window.setTimeout(() => setUndoEvent(null), 5000);
    return () => window.clearTimeout(timer);
  }, [undoEvent]);

  useEffect(() => {
    if (view !== "chat" || panel) return;
    const timer = window.setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    return () => window.clearTimeout(timer);
  }, [view, panel, sortedHistory.length, sending]);

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
      setNotice("已登录 · 30 天免密");
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
      setLastCalendarActions(result.calendar_actions || []);
      setLastActionEntryId(result.entry.id);
      await refreshChat();
      if (result.calendar_actions?.some((item) => item.ok)) await loadCalendar(calendarMonth);
    } catch (e) {
      handleRequestError(e, "发送失败");
    } finally {
      setSending(false);
    }
  }

  function openCalendarForEvent(event: CalendarEvent) {
    const date = new Date(event.start_at);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedDate(dateKey(date));
    setView("calendar");
    setPanel(null);
  }

  async function saveEventDraft() {
    if (!eventDraft || !eventDraft.title.trim() || eventSaving) return;
    setEventSaving(true);
    setError("");
    try {
      const payload = draftToPayload(eventDraft);
      const result = eventDraft.id
        ? await api.updateEvent(eventDraft.id, payload)
        : await api.createEvent(payload);
      setEventDraft(null);
      const event = result.event;
      const date = new Date(event.start_at);
      setSelectedDate(dateKey(date));
      setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      await loadCalendar(new Date(date.getFullYear(), date.getMonth(), 1));
      setNotice(eventDraft.id ? "日程已更新" : "已加入日历");
    } catch (e) {
      handleRequestError(e, "保存日程失败");
    } finally {
      setEventSaving(false);
    }
  }

  async function deleteEvent(event: CalendarEvent) {
    try {
      await api.deleteEvent(event.id);
      setUndoEvent(event);
      await loadCalendar(calendarMonth);
    } catch (e) {
      handleRequestError(e, "删除日程失败");
    }
  }

  async function undoDelete() {
    if (!undoEvent) return;
    try {
      await api.restoreEvent(undoEvent.id);
      setUndoEvent(null);
      await loadCalendar(calendarMonth);
      setNotice("已恢复日程");
    } catch (e) {
      handleRequestError(e, "恢复日程失败");
    }
  }

  async function toggleComplete(event: CalendarEvent) {
    try {
      if (event.status === "completed") {
        await api.reopenEvent(event.id);
        setNotice("已恢复为待办");
      } else {
        await api.completeEvent(event.id);
        setNotice("已完成");
      }
      await loadCalendar(calendarMonth);
    } catch (e) {
      handleRequestError(e, "更新日程失败");
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
      setHealth(await api.health());
      setNotice("AI 配置已保存");
    } catch (e) {
      handleRequestError(e, "AI 配置保存失败");
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
      a.download = `yuy-workbench-${new Date().toISOString().slice(0, 10)}.json`;
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
    setPanel(null);
    setHistory([]);
  }

  if (!token) {
    return (
      <div className="login-screen">
        <div className="login-orb login-orb-one" />
        <div className="login-orb login-orb-two" />
        <form className="login-card" onSubmit={unlock}>
          <div className="yuy-login-brand">
            <img className="yuy-logo-img large" src="/yuy-app-icon-exact.png" alt="小玉 YUY" />
            <div className="login-copy">
              <p className="eyebrow">YUY PERSONAL AI</p>
              <h1>小玉 YUY</h1>
              <p>你的私人 AI、日历与长期记忆。温柔陪伴，也认真帮你把事情做好。</p>
            </div>
          </div>
          {error && <div className="alert error">{error}</div>}
          <label className="field">
            <span>访问口令</span>
            <input
              type="password"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              placeholder="输入私人访问口令"
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <button className="primary-button" type="submit" disabled={!draftToken.trim() || verifyingToken}>
            {verifyingToken ? "正在验证…" : "进入小玉"}
          </button>
          <small>验证成功后，本设备 30 天内免密。</small>
        </form>
      </div>
    );
  }

  if (panel === "settings") {
    return (
      <SettingsPanel
        onBack={() => setPanel(null)}
        nativeShell={nativeShell}
        health={health}
        aiSettings={aiSettings}
        setAISettings={setAISettings}
        aiApiKey={aiApiKey}
        setAiApiKey={setAiApiKey}
        onProviderChange={changeProvider}
        onTestAI={testAI}
        onSaveAI={saveAI}
        aiTesting={aiTesting}
        aiSaving={aiSaving}
        onOpenMemory={() => setPanel("memory")}
        onExport={() => void exportData()}
        onLogout={logout}
        notice={notice}
        error={error}
      />
    );
  }

  if (panel === "assistant") {
    return (
      <AssistantPanel
        onBack={() => setPanel(null)}
        onChoose={(role) => {
          setPanel(null);
          setView("chat");
          const prompts: Record<Role, string> = {
            media: "小玉，请切换到新媒体运营助手，帮我处理今天的内容与运营工作。",
            health: "小玉，请作为健康咨询助手，帮我整理今天的身体状态和需要关注的事项。",
            daily: "小玉，请作为日常助理，帮我安排今天最重要的事情。",
            interior: "小玉，请作为软装学习伙伴，陪我学习和整理今天的设计灵感。",
            journal: "小玉，请作为随笔记录员，帮我记录和整理今天的想法。",
          };
          setMessage(prompts[role]);
        }}
      />
    );
  }

  if (panel === "memory") {
    return (
      <MemoryPanel
        onBack={() => setPanel(null)}
        mode={memoryMode}
        setMode={setMemoryMode}
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        memories={memories}
        metrics={metrics}
      />
    );
  }

  return (
    <div className="app-shell yuy-reference-shell">
      {notice && <div className="toast">{notice}</div>}
      {error && <div className="alert error floating-alert">{error}</div>}

      <main className={view === "chat" ? "main chat-main" : "main calendar-main"}>
        {view === "chat" ? (
          <ChatView
            history={sortedHistory}
            loading={loading}
            message={message}
            setMessage={setMessage}
            onSend={handleSend}
            sending={sending}
            chatEndRef={chatEndRef}
            lastCalendarActions={lastCalendarActions}
            lastActionEntryId={lastActionEntryId}
            onCalendarEvent={openCalendarForEvent}
            onOpenSettings={() => setPanel("settings")}
          />
        ) : (
          <CalendarView
            month={calendarMonth}
            setMonth={setCalendarMonth}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            eventsByDate={eventsByDate}
            selectedEvents={selectedEvents}
            loading={calendarLoading}
            onNew={() => setEventDraft(makeDraft(selectedDate))}
            onEdit={(event) => setEventDraft(makeDraft(selectedDate, event))}
            onDelete={(event) => void deleteEvent(event)}
            onToggleComplete={(event) => void toggleComplete(event)}
          />
        )}
      </main>

      <nav
        className={`yuy-reference-tabs ${view === "calendar" ? "calendar-active" : "chat-active"}`}
        aria-label="主导航"
      >
        <button className="yuy-tab-hit tab-chat" aria-label="聊天" onClick={() => { setPanel(null); setView("chat"); }} />
        <button className="yuy-tab-hit tab-calendar" aria-label="日程" onClick={() => { setPanel(null); setView("calendar"); }} />
        <button className="yuy-tab-hit tab-plus" aria-label="小玉助手" onClick={() => setPanel("assistant")} />
        <button className="yuy-tab-hit tab-discover" aria-label="发现" onClick={() => setPanel("memory")} />
        <button className="yuy-tab-hit tab-me" aria-label="我的" onClick={() => setPanel("settings")} />
      </nav>
      {eventDraft && (
        <EventEditor
          draft={eventDraft}
          setDraft={setEventDraft}
          onClose={() => setEventDraft(null)}
          onSave={() => void saveEventDraft()}
          saving={eventSaving}
        />
      )}

      {undoEvent && (
        <div className="undo-bar">
          <span>已删除「{undoEvent.title}」</span>
          <button onClick={() => void undoDelete()}>撤销</button>
        </div>
      )}
    </div>
  );
}

function ChatView({
  history,
  loading,
  message,
  setMessage,
  onSend,
  sending,
  chatEndRef,
  lastCalendarActions,
  lastActionEntryId,
  onCalendarEvent,
  onOpenSettings,
}: {
  history: Entry[];
  loading: boolean;
  message: string;
  setMessage: (value: string) => void;
  onSend: (event?: FormEvent) => void;
  sending: boolean;
  chatEndRef: RefObject<HTMLDivElement | null>;
  lastCalendarActions: CalendarActionResult[];
  lastActionEntryId: string;
  onCalendarEvent: (event: CalendarEvent) => void;
  onOpenSettings: () => void;
}) {
  return (
    <section className="chat-page yuy-reference-chat">
      <div className="chat-scroll">
        <div className="yuy-reference-chat-header">
          <img src="/yuy-chat-header-tight.png" alt="YUY 小玉" />
          <button className="yuy-header-bell-hit" onClick={onOpenSettings} aria-label="设置" />
        </div>

        {history.map((entry) => (
          <div className="conversation-pair reference-pair" key={entry.id}>
            <div className="message-row user-row reference-user-row">
              <div className="user-message-stack">
                <div className="message-bubble user-bubble">{entry.user_text}</div>
                <time className="bubble-time user-time">{friendlyDateTime(entry.created_at)}</time>
              </div>
              <div className="user-avatar"><img src="/yuy-user-avatar-exact.png" alt="" /></div>
            </div>
            <div className="message-row ai-row reference-ai-row">
              <div className="ai-avatar"><img src="/yuy-dog-avatar-tight.png" alt="小玉伙伴" /></div>
              <div className="ai-stack">
                <div className="message-bubble ai-bubble">{entry.assistant_text}</div>
                <div className="message-meta reference-meta">
                  <span>{ROLES[entry.role].short}</span>
                  <time>{friendlyDateTime(entry.created_at)}</time>
                </div>
                {entry.health_signal !== "none" && (
                  <div className={`health-inline ${entry.health_signal}`}>
                    {entry.health_signal === "urgent" ? "这条信息包含需要尽快线下处理的健康风险。" : "这条健康信息建议结合实际情况持续观察。"}
                  </div>
                )}
                {entry.id === lastActionEntryId && lastCalendarActions.length > 0 && (
                  <div className="calendar-action-list">
                    {lastCalendarActions.map((action, index) => (
                      <button
                        key={`${action.action}-${index}`}
                        className={action.ok ? "calendar-action-card ok" : "calendar-action-card failed"}
                        onClick={() => action.ok && action.event && onCalendarEvent(action.event)}
                        disabled={!action.ok || !action.event}
                      >
                        <span className="calendar-action-icon">{action.ok ? "✓" : "!"}</span>
                        <span>
                          <strong>{action.message}</strong>
                          {action.event && <small>{friendlyDateTime(action.event.start_at)} · {CATEGORY_META[action.event.category].label}</small>}
                        </span>
                        {action.ok && action.event && <span>›</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {sending && (
          <div className="message-row ai-row typing-row">
            <div className="ai-avatar"><img src="/yuy-dog-avatar-tight.png" alt="小玉伙伴" /></div>
            <div className="typing-bubble"><i /><i /><i /></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <form className="composer yuy-composer-v51" onSubmit={onSend}>
        <span className="composer-leading" aria-hidden="true">
          <img src="/yuy-composer-flower.png" alt="" />
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="和小玉聊点什么吧..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button
          type="submit"
          className={`send-button ${message.trim() ? "has-text" : "idle"}`}
          disabled={sending}
          aria-label={message.trim() ? "发送" : "语音"}
        >
          {message.trim() ? "↑" : <img src="/yuy-composer-mic.png" alt="" />}
        </button>
      </form>
    </section>
  );
}

function CalendarView({
  month,
  setMonth,
  selectedDate,
  setSelectedDate,
  eventsByDate,
  selectedEvents,
  loading,
  onNew,
  onEdit,
  onDelete,
  onToggleComplete,
}: {
  month: Date;
  setMonth: (month: Date) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedEvents: CalendarEvent[];
  loading: boolean;
  onNew: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
  onToggleComplete: (event: CalendarEvent) => void;
}) {
  const cells = calendarCells(month);
  const today = dateKey(new Date());
  const selected = new Date(`${selectedDate}T12:00:00`);
  const selectedWeekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(selected);
  const selectedLabel = `${selected.getMonth() + 1}月${selected.getDate()}日 · ${selectedWeekday}`;

  return (
    <section className="calendar-page yuy-reference-calendar">
      <div className="yuy-reference-calendar-header">
        <img src="/yuy-calendar-header-exact.png" alt="日程" />
        <button className="yuy-calendar-add-hit" onClick={onNew} aria-label="新建日程" />
      </div>
      <div className="month-card yuy-month-card yuy-exact-month-card">
        <div className="month-toolbar">
          <button onClick={() => setMonth(addMonths(month, -1))} aria-label="上个月">‹</button>
          <strong>{monthTitle(month)}</strong>
          <button onClick={() => setMonth(addMonths(month, 1))} aria-label="下个月">›</button>
        </div>
        <div className="weekday-row">
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="month-grid">
          {cells.map((day) => {
            const key = dateKey(day);
            const dayEvents = eventsByDate.get(key) || [];
            const uniqueCats = [...new Set(dayEvents.map((event) => event.category))].slice(0, 4);
            const isCurrentMonth = day.getMonth() === month.getMonth();
            const isToday = key === today;
            const isSelected = key === selectedDate;
            return (
              <button
                key={key}
                className={`day-cell ${!isCurrentMonth ? "muted" : ""} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedDate(key)}
              >
                <span className="day-number">{day.getDate()}</span>
                <span className="event-dots">
                  {uniqueCats.map((category) => (
                    <i key={category} style={{ background: CATEGORY_META[category].color }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="agenda-section">
        <div className="agenda-heading reference-agenda-heading">
          <h2>{selectedLabel}{selectedDate === today ? " · 今天" : ""}</h2>
          <span className="agenda-expand">展开全部⌄</span>
        </div>

        {loading && !selectedEvents.length && <div className="empty-card">正在同步日历…</div>}
        {!loading && !selectedEvents.length && (
          <button className="empty-card add-empty" onClick={onNew}>
            <span>＋</span>
            <strong>这天还没有安排</strong>
            <small>点这里添加，或直接在聊天里告诉小玉。</small>
          </button>
        )}

        <div className="agenda-list">
          {selectedEvents.map((event) => (
            <SwipeableEventCard
              key={event.id}
              event={event}
              onEdit={() => onEdit(event)}
              onDelete={() => onDelete(event)}
              onToggleComplete={() => onToggleComplete(event)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function SwipeableEventCard({
  event,
  onEdit,
  onDelete,
  onToggleComplete,
}: {
  event: CalendarEvent;
  onEdit: () => void;
  onDelete: () => void;
  onToggleComplete: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const moved = useRef(false);

  function pointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    startX.current = e.clientX;
    startOffset.current = offset;
    moved.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function pointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const delta = e.clientX - startX.current;
    if (Math.abs(delta) > 5) moved.current = true;
    const next = Math.max(-96, Math.min(96, startOffset.current + delta));
    setOffset(next);
  }

  function pointerUp() {
    if (offset <= -76) {
      setOffset(0);
      onDelete();
      return;
    }
    if (offset >= 76) {
      setOffset(0);
      onToggleComplete();
      return;
    }
    if (offset < -34) setOffset(-68);
    else if (offset > 34) setOffset(68);
    else setOffset(0);
  }

  return (
    <div className={`swipe-shell ${event.status === "completed" ? "completed" : ""}`}>
      <button className="swipe-action left" onClick={onToggleComplete}>
        <span>{event.status === "completed" ? "↺" : "✓"}</span>
        <small>{event.status === "completed" ? "恢复" : "完成"}</small>
      </button>
      <button className="swipe-action right" onClick={onDelete}>
        <span>⌫</span>
        <small>删除</small>
      </button>
      <div
        className="event-card reference-event-card"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => setOffset(0)}
        onClick={() => {
          if (!moved.current && Math.abs(offset) < 8) onEdit();
        }}
      >
        <span className="reference-event-flower" style={{ color: CATEGORY_META[event.category].color }}>✿</span>
        <div className="reference-event-time">{event.status === "completed" ? "✓ " : ""}{friendlyTime(event).split(" – ")[0]}</div>
        <div className="reference-event-title">{event.title}</div>
        <span className={`category-pill ${CATEGORY_META[event.category].className}`}>
          {CATEGORY_META[event.category].label}
        </span>
      </div>
    </div>
  );
}

function EventEditor({
  draft,
  setDraft,
  onClose,
  onSave,
  saving,
}: {
  draft: EventDraft;
  setDraft: (draft: EventDraft) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bottom-sheet event-editor">
        <div className="sheet-handle" />
        <div className="sheet-toolbar">
          <button onClick={onClose}>取消</button>
          <strong>{draft.id ? "编辑日程" : "新建日程"}</strong>
          <button className="pink-text" onClick={onSave} disabled={!draft.title.trim() || saving}>
            {saving ? "保存中" : "保存"}
          </button>
        </div>

        <label className="field large-field">
          <span>标题</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            placeholder="要做什么？"
            autoFocus
          />
        </label>

        <div className="field">
          <span>分类</span>
          <div className="category-picker">
            {CATEGORY_KEYS.map((category) => (
              <button
                key={category}
                className={draft.category === category ? `active ${CATEGORY_META[category].className}` : ""}
                onClick={() => setDraft({ ...draft, category })}
              >
                <i style={{ background: CATEGORY_META[category].color }} />
                {CATEGORY_META[category].label}
              </button>
            ))}
          </div>
        </div>

        <div className="editor-row">
          <label className="field">
            <span>日期</span>
            <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
          </label>
          <label className="toggle-field">
            <span>全天</span>
            <input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft({ ...draft, allDay: e.target.checked })} />
          </label>
        </div>

        {!draft.allDay && (
          <div className="editor-row two">
            <label className="field">
              <span>开始</span>
              <input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
            </label>
            <label className="field">
              <span>结束</span>
              <input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
            </label>
          </div>
        )}

        <label className="field">
          <span>备注</span>
          <textarea
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder="地点、准备事项或补充说明（可选）"
            rows={3}
          />
        </label>
      </div>
    </div>
  );
}

function AssistantPanel({
  onBack,
  onChoose,
}: {
  onBack: () => void;
  onChoose: (role: Role) => void;
}) {
  return (
    <div className="panel-page yuy-assistant-page">
      <header className="panel-header">
        <button className="back-button" onClick={onBack}>‹</button>
        <strong>小玉助手</strong>
        <span className="panel-spacer" />
      </header>
      <main className="panel-content">
        <section className="yuy-assistant-hero">
          <img src="/yuy-hero.png" alt="小玉和伙伴" />
          <div>
            <p className="eyebrow">YUY PERSONAL AI</p>
            <h1>今天想让小玉<br />怎么陪你？</h1>
            <p>选择一个方向，我会把对应提示直接带回聊天窗口。</p>
          </div>
        </section>
        <section className="yuy-role-grid">
          {(Object.keys(ROLES) as Role[]).map((role, index) => (
            <button key={role} onClick={() => onChoose(role)}>
              <span className={`yuy-role-flower f${index + 1}`}>✿</span>
              <div><strong>{ROLES[role].name}</strong><small>{ROLES[role].short}模式</small></div>
              <span>›</span>
            </button>
          ))}
        </section>
      </main>
    </div>
  );
}

function SettingsPanel({
  onBack,
  nativeShell,
  health,
  aiSettings,
  setAISettings,
  aiApiKey,
  setAiApiKey,
  onProviderChange,
  onTestAI,
  onSaveAI,
  aiTesting,
  aiSaving,
  onOpenMemory,
  onExport,
  onLogout,
  notice,
  error,
}: {
  onBack: () => void;
  nativeShell: boolean;
  health: HealthResponse | null;
  aiSettings: AISettings;
  setAISettings: (settings: AISettings) => void;
  aiApiKey: string;
  setAiApiKey: (value: string) => void;
  onProviderChange: (provider: AISettings["provider"]) => void;
  onTestAI: () => void;
  onSaveAI: () => void;
  aiTesting: boolean;
  aiSaving: boolean;
  onOpenMemory: () => void;
  onExport: () => void;
  onLogout: () => void;
  notice: string;
  error: string;
}) {
  const expiry = getTokenExpiry();
  const expiryText = expiry
    ? new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(new Date(expiry))
    : "—";

  return (
    <div className="panel-page">
      <header className="panel-header">
        <button className="back-button" onClick={onBack}>‹</button>
        <strong>设置</strong>
        <span className="panel-spacer" />
      </header>
      {notice && <div className="toast">{notice}</div>}
      {error && <div className="alert error panel-alert">{error}</div>}
      <main className="panel-content">
        <section className="settings-hero">
          <img className="yuy-logo-img medium" src="/yuy-app-icon-exact.png" alt="小玉 YUY" />
          <div>
            <h1>小玉 YUY 工作台</h1>
            <p>{health?.configured ? "AI 已连接" : "AI 需要配置"} · {providerName(health?.provider)}</p>
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-title">
            <div><p className="eyebrow">AI</p><h2>模型与 API</h2></div>
            <span className={`status-dot-label ${health?.configured ? "ok" : "warn"}`}>{health?.configured ? "可用" : "待配置"}</span>
          </div>

          <label className="field">
            <span>AI 提供商</span>
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
                placeholder="https://api.openai.com/v1"
                inputMode="url"
              />
            </label>
          )}

          <label className="field">
            <span>模型名称</span>
            <input
              value={aiSettings.model}
              onChange={(e) => setAISettings({ ...aiSettings, model: e.target.value })}
              placeholder="模型名称"
            />
          </label>

          {aiSettings.provider !== "workers-ai" && (
            <label className="field">
              <span>API Key {aiSettings.has_api_key ? "· 已保存" : ""}</span>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={aiSettings.has_api_key ? "留空则继续使用已保存 Key" : "输入 API Key"}
                autoComplete="off"
              />
            </label>
          )}

          <div className="settings-actions">
            <button className="secondary-button" onClick={onTestAI} disabled={aiTesting || aiSaving}>{aiTesting ? "测试中…" : "测试连接"}</button>
            <button className="primary-button compact" onClick={onSaveAI} disabled={aiSaving || aiTesting}>{aiSaving ? "保存中…" : "保存"}</button>
          </div>
        </section>

        <section className="settings-list-card">
          <button onClick={onOpenMemory}>
            <span className="settings-row-icon pink">◎</span>
            <span><strong>长期记忆与指标</strong><small>查看 AI 自动沉淀的长期信息</small></span>
            <b>›</b>
          </button>
          <button onClick={onExport}>
            <span className="settings-row-icon blue">⇩</span>
            <span><strong>导出全部数据</strong><small>聊天、日程、记忆、指标 JSON 备份</small></span>
            <b>›</b>
          </button>
          {nativeShell && (
            <button onClick={openNativeShellSettings}>
              <span className="settings-row-icon purple">⌁</span>
              <span><strong>App 连接</strong><small>修改服务器域名或重新验证口令</small></span>
              <b>›</b>
            </button>
          )}
        </section>

        <section className="settings-list-card">
          <div className="static-settings-row">
            <span className="settings-row-icon green">✓</span>
            <span><strong>30 天免密</strong><small>当前登录有效至 {expiryText}</small></span>
          </div>
          <button className="danger-row" onClick={onLogout}>
            <span className="settings-row-icon red">↗</span>
            <span><strong>退出登录</strong><small>清除此设备上的访问口令</small></span>
            <b>›</b>
          </button>
        </section>

        <p className="settings-footnote">业务界面和 AI 功能都从服务器更新；iOS 壳无需随网页版本反复安装。</p>
      </main>
    </div>
  );
}

function MemoryPanel({
  onBack,
  mode,
  setMode,
  activeRole,
  setActiveRole,
  memories,
  metrics,
}: {
  onBack: () => void;
  mode: MemoryMode;
  setMode: (mode: MemoryMode) => void;
  activeRole: Role | "all";
  setActiveRole: (role: Role | "all") => void;
  memories: MemoryItem[];
  metrics: Metric[];
}) {
  return (
    <div className="panel-page">
      <header className="panel-header">
        <button className="back-button" onClick={onBack}>‹</button>
        <strong>长期记忆</strong>
        <span className="panel-spacer" />
      </header>
      <main className="panel-content memory-panel-content">
        <div className="segmented-control">
          <button className={mode === "memory" ? "active" : ""} onClick={() => setMode("memory")}>记忆</button>
          <button className={mode === "metric" ? "active" : ""} onClick={() => setMode("metric")}>指标</button>
        </div>
        <div className="chip-scroll">
          <button className={activeRole === "all" ? "active" : ""} onClick={() => setActiveRole("all")}>全部</button>
          {ROLE_KEYS.map((role) => (
            <button key={role} className={activeRole === role ? "active" : ""} onClick={() => setActiveRole(role)}>{ROLES[role].short}</button>
          ))}
        </div>

        {mode === "memory" ? (
          <div className="memory-stack">
            {memories.map((item) => (
              <article className="memory-item" key={item.id}>
                <div className="memory-meta"><span>{ROLES[item.role].short}</span><span>重要度 {item.importance}/5</span></div>
                <p>{item.content}</p>
                <small>{item.kind} · 更新于 {friendlyDateTime(item.last_seen_at)}</small>
              </article>
            ))}
            {!memories.length && <div className="empty-card">还没有长期记忆。聊天中稳定的偏好、目标和项目状态会自动出现在这里。</div>}
          </div>
        ) : (
          <div className="memory-stack">
            {metrics.map((item) => (
              <article className="metric-item" key={item.id}>
                <div><span>{item.name}</span><small>{ROLES[item.role].short} · {friendlyDateTime(item.recorded_at)}</small></div>
                <strong>{item.value}{item.unit ? ` ${item.unit}` : ""}</strong>
                {item.note && <p>{item.note}</p>}
              </article>
            ))}
            {!metrics.length && <div className="empty-card">还没有可追踪指标。睡眠、体重、运营数据等数字信息会自动沉淀。</div>}
          </div>
        )}
      </main>
    </div>
  );
}
