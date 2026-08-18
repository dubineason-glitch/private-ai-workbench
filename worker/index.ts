interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  AI: Ai;
  APP_TOKEN: string;
  AI_PROVIDER?: string;
  WORKERS_AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

type Role = "media" | "health" | "daily" | "interior" | "journal";
type HealthSignal = "none" | "caution" | "urgent";
type AIProvider = "workers-ai" | "openai-responses" | "openai-compatible";
type EventCategory = "work" | "study" | "life" | "health" | "inspiration" | "other";
type EventStatus = "pending" | "completed" | "deleted";

type MemoryExtraction = {
  kind: "preference" | "fact" | "goal" | "project" | "metric_context" | "note";
  content: string;
  importance: 1 | 2 | 3 | 4 | 5;
};

type MetricExtraction = {
  name: string;
  value: string;
  unit: string;
  note: string;
};

type CalendarActionExtraction = {
  action: "create" | "complete" | "delete";
  event_id: string;
  title: string;
  note: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  category: EventCategory;
};

type CalendarEventRow = {
  id: string;
  title: string;
  note: string;
  start_at: string;
  end_at: string;
  all_day: number;
  category: EventCategory;
  status: EventStatus;
  source: string;
  timezone: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

type AIResult = {
  role: Role;
  title: string;
  reply: string;
  summary: string;
  tags: string[];
  health_signal: HealthSignal;
  memory_items: MemoryExtraction[];
  metrics: MetricExtraction[];
  calendar_actions: CalendarActionExtraction[];
};

type AISettings = {
  provider: AIProvider;
  base_url: string;
  model: string;
  api_key_cipher: string;
  updated_at?: string;
};

type AISettingsPublic = {
  provider: AIProvider;
  base_url: string;
  model: string;
  has_api_key: boolean;
  updated_at?: string;
};

type AISavePayload = {
  provider?: unknown;
  base_url?: unknown;
  model?: unknown;
  api_key?: unknown;
  clear_api_key?: unknown;
};

type AIContext = {
  recent: unknown[];
  memories: unknown[];
  metrics: unknown[];
  calendar: unknown[];
  now: string;
  timezone: string;
};

const ROLE_VALUES: Role[] = ["media", "health", "daily", "interior", "journal"];
const PROVIDERS: AIProvider[] = ["workers-ai", "openai-responses", "openai-compatible"];
const EVENT_CATEGORIES: EventCategory[] = ["work", "study", "life", "health", "inspiration", "other"];
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const DEFAULT_WORKERS_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_OPENAI_MODEL = "gpt-5.6";
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

const schema = {
  type: "object",
  properties: {
    role: { type: "string", enum: ROLE_VALUES },
    title: { type: "string" },
    reply: { type: "string" },
    summary: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    health_signal: { type: "string", enum: ["none", "caution", "urgent"] },
    memory_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["preference", "fact", "goal", "project", "metric_context", "note"],
          },
          content: { type: "string" },
          importance: { type: "integer", enum: [1, 2, 3, 4, 5] },
        },
        required: ["kind", "content", "importance"],
        additionalProperties: false,
      },
    },
    metrics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          unit: { type: "string" },
          note: { type: "string" },
        },
        required: ["name", "value", "unit", "note"],
        additionalProperties: false,
      },
    },
    calendar_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "complete", "delete"] },
          event_id: { type: "string" },
          title: { type: "string" },
          note: { type: "string" },
          start_at: { type: "string" },
          end_at: { type: "string" },
          all_day: { type: "boolean" },
          category: { type: "string", enum: EVENT_CATEGORIES },
        },
        required: ["action", "event_id", "title", "note", "start_at", "end_at", "all_day", "category"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "role",
    "title",
    "reply",
    "summary",
    "tags",
    "health_signal",
    "memory_items",
    "metrics",
    "calendar_actions",
  ],
  additionalProperties: false,
};

const systemPrompt = `你是“私人 AI 工作台”的统一智能中枢。用户只有一个入口，你必须自行判断最合适的主角色，并持续使用此前的结构化记忆保持连续性。

五个角色：
1. media = 新媒体运营助手：选题、标题、短视频脚本、文案、账号定位、发布节奏、数据复盘、品牌表达。输出要可直接执行，不堆营销套话。
2. health = 健康咨询师：睡眠、饮食、运动、身体症状、用药一般信息、生活方式、健康趋势。不得把自己当医生或下确诊结论；出现急症/危险信号时明确建议线下就医或急救。
3. daily = 日常助理：计划、待办、购买决策、生活事务、出行准备、日常安排、信息整理。优先给出最少步骤、可执行方案。
4. interior = 软装学习伙伴：室内设计、软装、风格、色彩、材质、家具、灯光、陈设、案例分析、学习路径。回答应兼顾审美判断与可落地尺寸/材质/预算逻辑。
5. journal = 随笔记录员：想法、灵感、情绪、日记、碎片记录、人生观察。保持克制，不把普通随笔强行任务化或心理诊断化。

自动归属：
- 跨多个领域时，只选当前最需要解决的问题作为主角色。
- 不为分类改变用户原意。
- 默认中文，跟随用户语言。

长期记忆：
- 只提取未来会再次影响回答的信息：稳定偏好、长期目标、项目状态、反复出现的习惯/约束、持续追踪事实。
- 一次性闲聊、临时天气、无后续价值的细节不要进入 memory_items。
- 不臆造事实。
- importance 1-5：5=长期高影响；3=普通长期信息；1-2 仅在确有复用价值时使用。
- 数值型进度/健康/运营指标可放 metrics；没有就返回空数组。

日历与日程：
- 你可以读取上下文中的 calendar（近期日程），用它回答“今天/明天/这周有什么安排”等问题。
- 只有当用户明确表达“安排、提醒、加入日历、记到日程”等意图，并且日期/时间足够明确时，才输出 calendar_actions 的 create。
- create 时 event_id 必须为空字符串；title 简洁；start_at/end_at 使用 ISO 8601，必须带时区偏移；如果用户只给日期没有时间，可设 all_day=true，并使用当天 00:00 到次日 00:00 的区间。
- category 只能是 work/study/life/health/inspiration/other，按语义自动分类。
- complete/delete 只能引用上下文中真实存在的 event_id；如果无法唯一判断是哪条日程，不要执行，直接在 reply 中追问。
- 用户只是查询或讨论日程时不要产生变更动作。
- 不要在 reply 中虚构“已经成功写入/删除/完成”；实际执行结果会由系统在界面中单独显示。

输出：
- title 简短，像时间线标题。
- reply 是完整直接的最终答复，避免空泛套话。
- summary 1-2 句，供长期回顾。
- tags 2-5 个短标签。
- health_signal 只能是 none/caution/urgent。
- memory_items、metrics、calendar_actions 都可为空。
- 必须严格输出符合给定 JSON Schema 的 JSON，不要加 Markdown 代码块或额外文字。`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    try {
      if (url.pathname.startsWith("/api/")) {
        if (!isAuthorized(request, env)) {
          return json({ error: "访问口令不正确" }, 401, request);
        }

        if (url.pathname === "/api/health" && request.method === "GET") {
          const settings = await getAISettings(env);
          return json(
            {
              ok: true,
              provider: settings.provider,
              model: settings.model,
              configured: settings.provider === "workers-ai" || Boolean(await getProviderApiKey(env, settings)),
            },
            200,
            request,
          );
        }

        if (url.pathname === "/api/chat" && request.method === "POST") {
          return await handleChat(request, env);
        }

        if (url.pathname === "/api/overview" && request.method === "GET") {
          return await handleOverview(request, env);
        }

        if (url.pathname === "/api/history" && request.method === "GET") {
          return await handleHistory(request, env, url);
        }

        if (url.pathname === "/api/memories" && request.method === "GET") {
          return await handleMemories(request, env, url);
        }

        if (url.pathname === "/api/metrics" && request.method === "GET") {
          return await handleMetrics(request, env, url);
        }

        if (url.pathname === "/api/events" && request.method === "GET") {
          return await handleEventsList(request, env, url);
        }

        if (url.pathname === "/api/events" && request.method === "POST") {
          return await handleEventCreate(request, env);
        }

        const eventRoute = url.pathname.match(/^\/api\/events\/([^/]+)(?:\/(complete|reopen|restore))?$/);
        if (eventRoute) {
          const eventId = decodeURIComponent(eventRoute[1]);
          const action = eventRoute[2] || "";
          if (!action && request.method === "PUT") return await handleEventUpdate(request, env, eventId);
          if (!action && request.method === "DELETE") return await handleEventDelete(request, env, eventId);
          if (action === "complete" && request.method === "POST") return await handleEventStatus(request, env, eventId, "completed");
          if ((action === "reopen" || action === "restore") && request.method === "POST") return await handleEventStatus(request, env, eventId, "pending");
        }

        if (url.pathname === "/api/settings/ai" && request.method === "GET") {
          return await handleGetAISettings(request, env);
        }

        if (url.pathname === "/api/settings/ai" && request.method === "PUT") {
          return await handleSaveAISettings(request, env);
        }

        if (url.pathname === "/api/settings/ai/test" && request.method === "POST") {
          return await handleTestAISettings(request, env);
        }

        if (url.pathname === "/api/export" && request.method === "GET") {
          return await handleExport(request, env);
        }

        return json({ error: "API 路径不存在" }, 404, request);
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "request_failed",
          path: url.pathname,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return json(
        { error: error instanceof Error ? friendlyServerError(error.message) : "服务器处理失败，请稍后重试" },
        500,
        request,
      );
    }
  },
};

function friendlyServerError(message: string) {
  if (message.includes("API key")) return message;
  if (message.includes("模型")) return message;
  if (message.includes("AI 配置")) return message;
  if (message.includes("请求失败")) return message;
  if (message.includes("日程")) return message;
  return "服务器处理失败，请稍后重试";
}

function isAuthorized(request: Request, env: Env) {
  if (!env.APP_TOKEN) return false;
  const token = request.headers.get("x-workbench-token") || "";
  return token.length > 0 && safeEqual(token, env.APP_TOKEN);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function handleChat(request: Request, env: Env) {
  const body = (await request.json().catch(() => null)) as {
    message?: unknown;
    now?: unknown;
    timezone?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const now = normalizeDateTime(typeof body?.now === "string" ? body.now : new Date().toISOString());
  const timezone = sanitizeTimezone(typeof body?.timezone === "string" ? body.timezone : "UTC");
  if (!message) return json({ error: "请输入内容" }, 400, request);
  if (message.length > 12000) {
    return json({ error: "单条输入过长，请控制在 12000 字符以内" }, 413, request);
  }

  const [context, settings] = await Promise.all([loadContext(env.DB, now, timezone), getAISettings(env)]);
  const aiResult = await callAI(env, settings, message, context);
  const calendarActions = await applyCalendarActions(env.DB, aiResult.calendar_actions, timezone);

  const entryId = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO entries
    (id, role, title, user_text, assistant_text, summary, tags_json, health_signal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      entryId,
      aiResult.role,
      aiResult.title.slice(0, 160),
      message,
      aiResult.reply,
      aiResult.summary,
      JSON.stringify(aiResult.tags.slice(0, 8)),
      aiResult.health_signal,
    )
    .run();

  let memoriesAdded = 0;
  for (const memory of aiResult.memory_items.slice(0, 8)) {
    const content = String(memory.content || "").trim().slice(0, 700);
    if (!content) continue;
    const existing = await env.DB.prepare(
      `SELECT id, importance FROM memories WHERE role = ? AND content = ? LIMIT 1`,
    )
      .bind(aiResult.role, content)
      .first<{ id: string; importance: number }>();

    if (existing) {
      await env.DB.prepare(
        `UPDATE memories SET last_seen_at = datetime('now'), importance = ? WHERE id = ?`,
      )
        .bind(Math.max(existing.importance, memory.importance), existing.id)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO memories (id, role, kind, content, importance) VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), aiResult.role, memory.kind, content, memory.importance)
        .run();
      memoriesAdded += 1;
    }
  }

  let metricsAdded = 0;
  for (const metric of aiResult.metrics.slice(0, 8)) {
    const name = String(metric.name || "").trim();
    const value = String(metric.value || "").trim();
    if (!name || !value) continue;
    await env.DB.prepare(
      `INSERT INTO metrics (id, role, name, value, unit, note) VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        aiResult.role,
        name.slice(0, 120),
        value.slice(0, 120),
        String(metric.unit || "").trim().slice(0, 50),
        String(metric.note || "").trim().slice(0, 300),
      )
      .run();
    metricsAdded += 1;
  }

  const entry = await env.DB.prepare(`SELECT * FROM entries WHERE id = ?`).bind(entryId).first();
  return json(
    { entry, memories_added: memoriesAdded, metrics_added: metricsAdded, calendar_actions: calendarActions },
    200,
    request,
  );
}

async function loadContext(db: D1Database, now: string, timezone: string): Promise<AIContext> {
  const upcomingEnd = new Date(new Date(now).getTime() + 45 * 86400000).toISOString();
  const recentStart = new Date(new Date(now).getTime() - 2 * 86400000).toISOString();
  const [recent, memories, metrics, calendar] = await Promise.all([
    db.prepare(
      `SELECT role, title, user_text, summary, created_at
       FROM entries ORDER BY created_at DESC LIMIT 12`,
    ).all(),
    db.prepare(
      `SELECT role, kind, content, importance, last_seen_at
       FROM memories ORDER BY importance DESC, last_seen_at DESC LIMIT 30`,
    ).all(),
    db.prepare(
      `SELECT role, name, value, unit, note, recorded_at
       FROM metrics ORDER BY recorded_at DESC LIMIT 20`,
    ).all(),
    db.prepare(
      `SELECT id, title, note, start_at, end_at, all_day, category, status, timezone
       FROM calendar_events
       WHERE status != 'deleted' AND end_at >= ? AND start_at <= ?
       ORDER BY start_at ASC LIMIT 60`,
    ).bind(recentStart, upcomingEnd).all(),
  ]);

  return {
    recent: recent.results,
    memories: memories.results,
    metrics: metrics.results,
    calendar: calendar.results,
    now,
    timezone,
  };
}

async function callAI(
  env: Env,
  settings: AISettings,
  message: string,
  context: AIContext,
): Promise<AIResult> {
  if (settings.provider === "workers-ai") {
    return callWorkersAI(env, settings.model, message, context);
  }

  const apiKey = await getProviderApiKey(env, settings);
  if (!apiKey) throw new Error("当前 AI 配置缺少 API key，请先到设置中填写并测试");

  if (settings.provider === "openai-responses") {
    return callOpenAIResponses(settings, apiKey, message, context);
  }

  return callOpenAICompatible(settings, apiKey, message, context);
}

function buildContextText(context: AIContext) {
  return `当前时间：${context.now}\n用户时区：${context.timezone}\n下面是用户此前的结构化上下文与近期日程，只用于保持连续性；如与本次明确输入冲突，以本次输入为准。\n${JSON.stringify(context)}`;
}

async function callWorkersAI(
  env: Env,
  model: string,
  message: string,
  context: AIContext,
): Promise<AIResult> {
  const result = await env.AI.run(model as any, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "system", content: buildContextText(context) },
      { role: "user", content: message },
    ],
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  } as any);

  const raw = (result as any)?.response;
  const parsed = parseAIResult(raw);
  return parsed;
}

async function callOpenAIResponses(
  settings: AISettings,
  apiKey: string,
  message: string,
  context: AIContext,
): Promise<AIResult> {
  const base = normalizeBaseUrl(settings.base_url || DEFAULT_OPENAI_BASE);
  const response = await fetch(`${base}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      store: false,
      input: [
        { role: "system", content: systemPrompt },
        { role: "system", content: buildContextText(context) },
        { role: "user", content: message },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "private_ai_workbench_response",
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    console.error(JSON.stringify({ message: "openai_responses_error", status: response.status, payload }));
    throw new Error(payload?.error?.message || `OpenAI 请求失败 (${response.status})`);
  }
  return parseAIResult(extractResponsesOutputText(payload));
}

async function callOpenAICompatible(
  settings: AISettings,
  apiKey: string,
  message: string,
  context: AIContext,
): Promise<AIResult> {
  const base = normalizeBaseUrl(settings.base_url);
  const url = `${base}/chat/completions`;
  const baseBody = {
    model: settings.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "system", content: buildContextText(context) },
      { role: "user", content: message },
    ],
  };

  let response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...baseBody, response_format: { type: "json_object" } }),
  });

  if (response.status === 400) {
    const firstText = await response.text();
    console.warn(JSON.stringify({ message: "compatible_json_mode_retry", status: 400, body: firstText.slice(0, 600) }));
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(baseBody),
    });
  }

  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    throw new Error(payload?.error?.message || `兼容 API 请求失败 (${response.status})`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("兼容 API 未返回有效文本");
  return parseAIResult(text);
}

function parseAIResult(raw: unknown): AIResult {
  let value = raw;
  if (typeof value === "string") {
    const clean = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    value = JSON.parse(clean);
  }
  const parsed = value as Partial<AIResult> | null;
  if (!parsed || !ROLE_VALUES.includes(parsed.role as Role)) throw new Error("AI 模型返回了无效角色");
  if (typeof parsed.reply !== "string" || typeof parsed.title !== "string") throw new Error("AI 模型返回结构不完整");
  return {
    role: parsed.role as Role,
    title: parsed.title,
    reply: parsed.reply,
    summary: typeof parsed.summary === "string" ? parsed.summary : parsed.reply.slice(0, 160),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String).slice(0, 8) : [],
    health_signal: ["none", "caution", "urgent"].includes(String(parsed.health_signal))
      ? (parsed.health_signal as HealthSignal)
      : "none",
    memory_items: Array.isArray(parsed.memory_items) ? (parsed.memory_items as MemoryExtraction[]) : [],
    metrics: Array.isArray(parsed.metrics) ? (parsed.metrics as MetricExtraction[]) : [],
    calendar_actions: Array.isArray(parsed.calendar_actions)
      ? (parsed.calendar_actions as CalendarActionExtraction[]).slice(0, 6)
      : [],
  };
}

function extractResponsesOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text) return payload.output_text;
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") throw new Error(content.refusal || "模型拒绝了该请求");
    }
  }
  throw new Error("未从 OpenAI Responses 响应中取得文本结果");
}

async function handleOverview(request: Request, env: Env) {
  const [entryCounts, memoryCounts, recent, latestMetrics] = await Promise.all([
    env.DB.prepare(`SELECT role, COUNT(*) AS count FROM entries GROUP BY role`).all<{ role: Role; count: number }>(),
    env.DB.prepare(`SELECT role, COUNT(*) AS count FROM memories GROUP BY role`).all<{ role: Role; count: number }>(),
    env.DB.prepare(`SELECT * FROM entries ORDER BY created_at DESC LIMIT 6`).all(),
    env.DB.prepare(`SELECT * FROM metrics ORDER BY recorded_at DESC LIMIT 6`).all(),
  ]);

  const counts = Object.fromEntries(ROLE_VALUES.map((role) => [role, 0])) as Record<Role, number>;
  const memories = Object.fromEntries(ROLE_VALUES.map((role) => [role, 0])) as Record<Role, number>;
  for (const row of entryCounts.results) counts[row.role] = Number(row.count);
  for (const row of memoryCounts.results) memories[row.role] = Number(row.count);

  return json(
    { counts, memoryCounts: memories, recent: recent.results, latestMetrics: latestMetrics.results },
    200,
    request,
  );
}

async function handleHistory(request: Request, env: Env, url: URL) {
  const role = parseRole(url.searchParams.get("role"));
  const result = role
    ? await env.DB.prepare(`SELECT * FROM entries WHERE role = ? ORDER BY created_at DESC LIMIT 120`).bind(role).all()
    : await env.DB.prepare(`SELECT * FROM entries ORDER BY created_at DESC LIMIT 120`).all();
  return json({ entries: result.results }, 200, request);
}

async function handleMemories(request: Request, env: Env, url: URL) {
  const role = parseRole(url.searchParams.get("role"));
  const result = role
    ? await env.DB.prepare(
        `SELECT * FROM memories WHERE role = ? ORDER BY importance DESC, last_seen_at DESC LIMIT 240`,
      ).bind(role).all()
    : await env.DB.prepare(
        `SELECT * FROM memories ORDER BY importance DESC, last_seen_at DESC LIMIT 240`,
      ).all();
  return json({ memories: result.results }, 200, request);
}

async function handleMetrics(request: Request, env: Env, url: URL) {
  const role = parseRole(url.searchParams.get("role"));
  const result = role
    ? await env.DB.prepare(
        `SELECT * FROM metrics WHERE role = ? ORDER BY recorded_at DESC LIMIT 360`,
      ).bind(role).all()
    : await env.DB.prepare(`SELECT * FROM metrics ORDER BY recorded_at DESC LIMIT 360`).all();
  return json({ metrics: result.results }, 200, request);
}


type CalendarActionResult = {
  action: "create" | "complete" | "delete";
  ok: boolean;
  event?: CalendarEventRow;
  message: string;
};

type CalendarPayload = {
  title: string;
  note: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  category: EventCategory;
  timezone: string;
};

async function handleEventsList(request: Request, env: Env, url: URL) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 2, 1).toISOString();
  const start = normalizeDateTime(url.searchParams.get("start") || defaultStart);
  const end = normalizeDateTime(url.searchParams.get("end") || defaultEnd);
  if (new Date(end).getTime() <= new Date(start).getTime()) {
    return json({ error: "日程查询时间范围不正确" }, 400, request);
  }

  const result = await env.DB.prepare(
    `SELECT * FROM calendar_events
     WHERE status != 'deleted' AND end_at > ? AND start_at < ?
     ORDER BY start_at ASC, created_at ASC
     LIMIT 600`,
  ).bind(start, end).all<CalendarEventRow>();

  return json({ events: result.results }, 200, request);
}

async function handleEventCreate(request: Request, env: Env) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "日程内容格式不正确" }, 400, request);
  const payload = normalizeCalendarPayload(body, "UTC");
  const event = await insertCalendarEvent(env.DB, payload, "manual");
  return json({ event }, 201, request);
}

async function handleEventUpdate(request: Request, env: Env, eventId: string) {
  const existing = await getCalendarEvent(env.DB, eventId);
  if (!existing || existing.status === "deleted") return json({ error: "日程不存在" }, 404, request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "日程内容格式不正确" }, 400, request);
  const payload = normalizeCalendarPayload(body, existing.timezone || "UTC");

  await env.DB.prepare(
    `UPDATE calendar_events
     SET title = ?, note = ?, start_at = ?, end_at = ?, all_day = ?, category = ?, timezone = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(
    payload.title,
    payload.note,
    payload.start_at,
    payload.end_at,
    payload.all_day ? 1 : 0,
    payload.category,
    payload.timezone,
    eventId,
  ).run();

  const event = await getCalendarEvent(env.DB, eventId);
  return json({ event }, 200, request);
}

async function handleEventDelete(request: Request, env: Env, eventId: string) {
  const existing = await getCalendarEvent(env.DB, eventId);
  if (!existing || existing.status === "deleted") return json({ error: "日程不存在" }, 404, request);
  await env.DB.prepare(
    `UPDATE calendar_events SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`,
  ).bind(eventId).run();
  const event = await getCalendarEvent(env.DB, eventId);
  return json({ event }, 200, request);
}

async function handleEventStatus(
  request: Request,
  env: Env,
  eventId: string,
  status: "pending" | "completed",
) {
  const existing = await getCalendarEvent(env.DB, eventId);
  if (!existing) return json({ error: "日程不存在" }, 404, request);
  const completedAt = status === "completed" ? new Date().toISOString() : null;
  await env.DB.prepare(
    `UPDATE calendar_events
     SET status = ?, completed_at = ?, updated_at = datetime('now')
     WHERE id = ?`,
  ).bind(status, completedAt, eventId).run();
  const event = await getCalendarEvent(env.DB, eventId);
  return json({ event }, 200, request);
}

async function applyCalendarActions(
  db: D1Database,
  actions: CalendarActionExtraction[],
  fallbackTimezone: string,
): Promise<CalendarActionResult[]> {
  const results: CalendarActionResult[] = [];

  for (const action of actions.slice(0, 6)) {
    try {
      if (action.action === "create") {
        const payload = normalizeCalendarPayload(action as unknown as Record<string, unknown>, fallbackTimezone);
        const event = await insertCalendarEvent(db, payload, "ai");
        results.push({ action: "create", ok: true, event, message: `已加入日历：${event.title}` });
        continue;
      }

      const eventId = String(action.event_id || "").trim();
      if (!eventId) {
        results.push({ action: action.action, ok: false, message: "未找到可操作的日程" });
        continue;
      }
      const existing = await getCalendarEvent(db, eventId);
      if (!existing || existing.status === "deleted") {
        results.push({ action: action.action, ok: false, message: "对应日程已不存在" });
        continue;
      }

      if (action.action === "complete") {
        await db.prepare(
          `UPDATE calendar_events SET status = 'completed', completed_at = ?, updated_at = datetime('now') WHERE id = ?`,
        ).bind(new Date().toISOString(), eventId).run();
        const event = await getCalendarEvent(db, eventId);
        results.push({ action: "complete", ok: true, event: event || undefined, message: `已完成：${existing.title}` });
        continue;
      }

      if (action.action === "delete") {
        await db.prepare(
          `UPDATE calendar_events SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`,
        ).bind(eventId).run();
        const event = await getCalendarEvent(db, eventId);
        results.push({ action: "delete", ok: true, event: event || undefined, message: `已删除：${existing.title}` });
      }
    } catch (error) {
      results.push({
        action: action.action,
        ok: false,
        message: error instanceof Error ? error.message : "日程操作失败",
      });
    }
  }

  return results;
}

function normalizeCalendarPayload(body: Record<string, unknown>, fallbackTimezone: string): CalendarPayload {
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  if (!title) throw new Error("日程标题不能为空");

  const allDay = body.all_day === true || body.all_day === 1 || body.all_day === "1";
  const startAt = normalizeDateTime(typeof body.start_at === "string" ? body.start_at : "");
  let endAt = normalizeDateTime(typeof body.end_at === "string" ? body.end_at : "");
  const startMs = new Date(startAt).getTime();
  let endMs = new Date(endAt).getTime();
  if (endMs <= startMs) {
    endMs = startMs + (allDay ? 86400000 : 3600000);
    endAt = new Date(endMs).toISOString();
  }

  const categoryRaw = typeof body.category === "string" ? body.category : "life";
  const category = EVENT_CATEGORIES.includes(categoryRaw as EventCategory)
    ? (categoryRaw as EventCategory)
    : "other";
  const timezone = sanitizeTimezone(
    typeof body.timezone === "string" && body.timezone.trim() ? body.timezone : fallbackTimezone,
  );

  return {
    title,
    note: typeof body.note === "string" ? body.note.trim().slice(0, 1200) : "",
    start_at: startAt,
    end_at: endAt,
    all_day: allDay,
    category,
    timezone,
  };
}

function normalizeDateTime(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new Error("日程时间格式不正确");
  return date.toISOString();
}

function sanitizeTimezone(value: string) {
  const clean = value.trim().slice(0, 80);
  return clean && /^[A-Za-z0-9_+\-/]+$/.test(clean) ? clean : "UTC";
}

async function insertCalendarEvent(db: D1Database, payload: CalendarPayload, source: "manual" | "ai") {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO calendar_events
     (id, title, note, start_at, end_at, all_day, category, status, source, timezone)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).bind(
    id,
    payload.title,
    payload.note,
    payload.start_at,
    payload.end_at,
    payload.all_day ? 1 : 0,
    payload.category,
    source,
    payload.timezone,
  ).run();
  const event = await getCalendarEvent(db, id);
  if (!event) throw new Error("日程创建失败");
  return event;
}

async function getCalendarEvent(db: D1Database, id: string) {
  return db.prepare(`SELECT * FROM calendar_events WHERE id = ? LIMIT 1`).bind(id).first<CalendarEventRow>();
}

async function handleGetAISettings(request: Request, env: Env) {
  const settings = await getAISettings(env);
  return json(await publicAISettings(env, settings), 200, request);
}

async function handleSaveAISettings(request: Request, env: Env) {
  const body = (await request.json().catch(() => null)) as AISavePayload | null;
  if (!body) return json({ error: "AI 配置格式不正确" }, 400, request);

  const current = await getAISettings(env);
  const next = await normalizeIncomingSettings(env, body, current);

  await env.DB.prepare(
    `INSERT INTO ai_settings (id, provider, base_url, model, api_key_cipher, updated_at)
     VALUES (1, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       provider=excluded.provider,
       base_url=excluded.base_url,
       model=excluded.model,
       api_key_cipher=excluded.api_key_cipher,
       updated_at=datetime('now')`,
  )
    .bind(next.provider, next.base_url, next.model, next.api_key_cipher)
    .run();

  const saved = await getAISettings(env);
  return json(await publicAISettings(env, saved), 200, request);
}

async function handleTestAISettings(request: Request, env: Env) {
  const body = (await request.json().catch(() => null)) as AISavePayload | null;
  if (!body) return json({ error: "AI 配置格式不正确" }, 400, request);

  const current = await getAISettings(env);
  const candidate = await normalizeIncomingSettings(env, body, current);
  const transientApiKey = typeof body.api_key === "string" && body.api_key.trim()
    ? body.api_key.trim()
    : await getProviderApiKey(env, candidate);

  await testProvider(env, candidate, transientApiKey || "");
  return json(
    { ok: true, provider: candidate.provider, model: candidate.model, message: "连接成功，模型可用" },
    200,
    request,
  );
}

async function getAISettings(env: Env): Promise<AISettings> {
  const row = await env.DB.prepare(
    `SELECT provider, base_url, model, api_key_cipher, updated_at FROM ai_settings WHERE id = 1 LIMIT 1`,
  ).first<AISettings>();

  if (row && PROVIDERS.includes(row.provider)) {
    return {
      provider: row.provider,
      base_url: row.base_url || defaultBaseUrl(row.provider),
      model: row.model || defaultModel(row.provider, env),
      api_key_cipher: row.api_key_cipher || "",
      updated_at: row.updated_at,
    };
  }

  const legacyProvider: AIProvider = env.AI_PROVIDER === "openai" ? "openai-responses" : "workers-ai";
  return {
    provider: legacyProvider,
    base_url: defaultBaseUrl(legacyProvider),
    model: defaultModel(legacyProvider, env),
    api_key_cipher: "",
  };
}

async function normalizeIncomingSettings(env: Env, body: AISavePayload, current: AISettings): Promise<AISettings> {
  const providerRaw = typeof body.provider === "string" ? body.provider : current.provider;
  if (!PROVIDERS.includes(providerRaw as AIProvider)) throw new Error("AI 配置中的提供商不受支持");
  const provider = providerRaw as AIProvider;

  const model = (typeof body.model === "string" ? body.model : current.model).trim() || defaultModel(provider, env);
  if (model.length > 160) throw new Error("AI 模型名称过长");

  let baseUrl = typeof body.base_url === "string" ? body.base_url.trim() : current.base_url;
  if (provider === "workers-ai") {
    baseUrl = "";
  } else {
    baseUrl = normalizeBaseUrl(baseUrl || defaultBaseUrl(provider));
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:") throw new Error("AI API 地址必须使用 HTTPS");
  }

  let cipher = current.api_key_cipher || "";
  if (body.clear_api_key === true) cipher = "";
  if (typeof body.api_key === "string" && body.api_key.trim()) {
    cipher = await encryptSecret(body.api_key.trim(), env.APP_TOKEN);
  }

  return { provider, base_url: baseUrl, model, api_key_cipher: cipher };
}

async function publicAISettings(env: Env, settings: AISettings): Promise<AISettingsPublic> {
  return {
    provider: settings.provider,
    base_url: settings.base_url,
    model: settings.model,
    has_api_key: settings.provider === "workers-ai" || Boolean(await getProviderApiKey(env, settings)),
    updated_at: settings.updated_at,
  };
}

function defaultBaseUrl(provider: AIProvider) {
  return provider === "openai-responses" ? DEFAULT_OPENAI_BASE : "";
}

function defaultModel(provider: AIProvider, env: Env) {
  if (provider === "workers-ai") return env.WORKERS_AI_MODEL || DEFAULT_WORKERS_MODEL;
  if (provider === "openai-responses") return env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  return "";
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

async function getProviderApiKey(env: Env, settings: AISettings) {
  if (settings.provider === "workers-ai") return "";
  if (settings.api_key_cipher) {
    try {
      return await decryptSecret(settings.api_key_cipher, env.APP_TOKEN);
    } catch (error) {
      console.error("api_key_decrypt_failed", error);
      throw new Error("AI API key 无法解密；如果你刚更换过访问口令，请重新保存 API key");
    }
  }
  if (settings.provider === "openai-responses" && env.OPENAI_API_KEY) return env.OPENAI_API_KEY;
  return "";
}

async function testProvider(env: Env, settings: AISettings, apiKey: string) {
  if (settings.provider === "workers-ai") {
    const result = await env.AI.run(settings.model as any, {
      messages: [{ role: "user", content: "只回复 OK" }],
      max_tokens: 16,
    } as any);
    if (!result) throw new Error("Workers AI 模型测试失败");
    return;
  }

  if (!apiKey) throw new Error("请先填写 API key");

  if (settings.provider === "openai-responses") {
    const response = await fetch(`${normalizeBaseUrl(settings.base_url || DEFAULT_OPENAI_BASE)}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: settings.model, input: "只回复 OK", store: false }),
    });
    const payload = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) throw new Error(payload?.error?.message || `OpenAI 测试失败 (${response.status})`);
    return;
  }

  const response = await fetch(`${normalizeBaseUrl(settings.base_url)}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      messages: [{ role: "user", content: "只回复 OK" }],
      max_tokens: 24,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) throw new Error(payload?.error?.message || `兼容 API 测试失败 (${response.status})`);
}

async function encryptSecret(secret: string, appToken: string) {
  const key = await deriveEncryptionKey(appToken);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(secret);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptSecret(value: string, appToken: string) {
  const [ivPart, dataPart] = value.split(".");
  if (!ivPart || !dataPart) throw new Error("Invalid encrypted value");
  const key = await deriveEncryptionKey(appToken);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivPart) },
    key,
    base64ToBytes(dataPart),
  );
  return new TextDecoder().decode(decrypted);
}

async function deriveEncryptionKey(appToken: string) {
  const material = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`private-ai-workbench:v1:${appToken}`),
  );
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function handleExport(request: Request, env: Env) {
  const [entries, memories, metrics, calendarEvents, aiSettings] = await Promise.all([
    env.DB.prepare(`SELECT * FROM entries ORDER BY created_at ASC`).all(),
    env.DB.prepare(`SELECT * FROM memories ORDER BY created_at ASC`).all(),
    env.DB.prepare(`SELECT * FROM metrics ORDER BY recorded_at ASC`).all(),
    env.DB.prepare(`SELECT * FROM calendar_events ORDER BY start_at ASC`).all(),
    getAISettings(env),
  ]);
  return json(
    {
      exported_at: new Date().toISOString(),
      version: 3,
      entries: entries.results,
      memories: memories.results,
      metrics: metrics.results,
      calendar_events: calendarEvents.results,
      ai_settings: await publicAISettings(env, aiSettings),
    },
    200,
    request,
  );
}

function parseRole(value: string | null): Role | null {
  return value && ROLE_VALUES.includes(value as Role) ? (value as Role) : null;
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin") || "";
  const allowed =
    origin === "capacitor://localhost" ||
    origin === "http://localhost" ||
    origin === "https://localhost";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-workbench-token",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(data: unknown, status = 200, request?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...(request ? corsHeaders(request) : {}),
      "Cache-Control": "no-store",
    },
  });
}
