interface Env {
  DB: D1Database;
  AI: Ai;
  APP_TOKEN: string;
  AI_PROVIDER?: "workers-ai" | "openai";
  WORKERS_AI_MODEL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

type Role = "media" | "health" | "daily" | "interior" | "journal";
type HealthSignal = "none" | "caution" | "urgent";

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

type AIResult = {
  role: Role;
  title: string;
  reply: string;
  summary: string;
  tags: string[];
  health_signal: HealthSignal;
  memory_items: MemoryExtraction[];
  metrics: MetricExtraction[];
};

const ROLE_VALUES: Role[] = ["media", "health", "daily", "interior", "journal"];
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

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
  ],
  additionalProperties: false,
};

const systemPrompt = `你是一个“私人 AI 工作台”的统一智能中枢。用户不会手动选择角色，你必须先判断输入的主归属，然后以对应角色回答，并提取值得长期积累的信息。

五个角色：
1. media = 新媒体运营助手：选题、标题、短视频脚本、文案、账号定位、内容运营、发布节奏、数据复盘、品牌表达。
2. health = 健康咨询师：睡眠、饮食、运动、身体症状、用药一般信息、生活方式、健康数据趋势。你不能把自己当医生，不能下确诊结论。出现明显急症/危险信号时应明确建议尽快线下就医或急救。
3. daily = 日常助理：计划、待办、购买决策、生活事务、出行准备、日常安排、信息整理、一般问题处理。
4. interior = 软装学习伙伴：室内设计、软装、风格、色彩、材质、家具、灯光、陈设、案例分析、学习路径与笔记。
5. journal = 随笔记录员：想法、灵感、情绪、日记、碎片记录、人生观察。回答应克制，不要把普通随笔强行变成任务管理或心理诊断。

自动归属规则：
- 如果一条输入跨多个领域，只选“当前最需要解决的问题”作为主角色。
- 不要为了分类而改变用户原意。
- 回答语言跟随用户，默认中文。

长期记忆规则：
- 只提取未来可能再次有用的信息：稳定偏好、长期目标、正在推进的项目状态、反复出现的习惯/约束、可持续追踪的事实。
- 一次性闲聊、临时天气、无后续价值的细节不要写入 memory_items。
- 不得臆造用户事实。
- importance 1-5：5 表示会显著影响未来多次回答；3 表示普通长期信息；1-2 仅在确实有复用价值时使用。
- 用户如果提供数值型进度/健康/运营指标，可放入 metrics；name/value/unit/note 都必须是简洁字符串，没有合适指标就返回空数组。

健康安全：
- health_signal=urgent：可能存在急危重症信号，需要明确建议立即寻求当地急救/线下急诊。
- health_signal=caution：建议较快就医、咨询专业人员，或存在需注意的风险。
- 其他情况为 none。
- 健康回答要说明局限，但不要每次堆砌冗长免责声明。

输出要求：
- title：简短、像时间线标题。
- reply：给用户的完整、有用回答；避免空泛套话。
- summary：1-2 句，用于长期时间线回顾。
- tags：2-5 个简短标签。
- memory_items 与 metrics 可以为空数组。`;

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
          const provider = resolveProvider(env);
          const model = provider === "openai"
            ? env.OPENAI_MODEL || "gpt-5.6-luna"
            : env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
          return json({ ok: true, provider, model }, 200, request);
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

        if (url.pathname === "/api/export" && request.method === "GET") {
          return await handleExport(request, env);
        }

        return json({ error: "API 路径不存在" }, 404, request);
      }

      return new Response("Not Found", { status: 404 });
    } catch (error) {
      console.error(JSON.stringify({
        message: "request_failed",
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      }));
      return json({ error: "服务器处理失败，请稍后重试" }, 500, request);
    }
  },
};

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
  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return json({ error: "请输入内容" }, 400, request);
  if (message.length > 12000) return json({ error: "单条输入过长，请控制在 12000 字符以内" }, 413, request);

  const context = await loadContext(env.DB);
  const aiResult = await callAI(env, message, context);

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
    const content = memory.content.trim().slice(0, 700);
    if (!content) continue;
    const existing = await env.DB.prepare(
      `SELECT id, importance FROM memories WHERE role = ? AND content = ? LIMIT 1`,
    )
      .bind(aiResult.role, content)
      .first<{ id: string; importance: number }>();

    if (existing) {
      await env.DB.prepare(
        `UPDATE memories
         SET last_seen_at = datetime('now'), importance = ?
         WHERE id = ?`,
      )
        .bind(Math.max(existing.importance, memory.importance), existing.id)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO memories (id, role, kind, content, importance)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(crypto.randomUUID(), aiResult.role, memory.kind, content, memory.importance)
        .run();
      memoriesAdded += 1;
    }
  }

  let metricsAdded = 0;
  for (const metric of aiResult.metrics.slice(0, 8)) {
    if (!metric.name.trim() || !metric.value.trim()) continue;
    await env.DB.prepare(
      `INSERT INTO metrics (id, role, name, value, unit, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        aiResult.role,
        metric.name.trim().slice(0, 120),
        metric.value.trim().slice(0, 120),
        metric.unit.trim().slice(0, 50),
        metric.note.trim().slice(0, 300),
      )
      .run();
    metricsAdded += 1;
  }

  const entry = await env.DB.prepare(`SELECT * FROM entries WHERE id = ?`).bind(entryId).first();
  return json({ entry, memories_added: memoriesAdded, metrics_added: metricsAdded }, 200, request);
}

async function loadContext(db: D1Database) {
  const recent = await db.prepare(
    `SELECT role, title, user_text, summary, created_at
     FROM entries ORDER BY created_at DESC LIMIT 12`,
  ).all();

  const memories = await db.prepare(
    `SELECT role, kind, content, importance, last_seen_at
     FROM memories
     ORDER BY importance DESC, last_seen_at DESC
     LIMIT 30`,
  ).all();

  const metrics = await db.prepare(
    `SELECT role, name, value, unit, note, recorded_at
     FROM metrics ORDER BY recorded_at DESC LIMIT 20`,
  ).all();

  return {
    recent: recent.results,
    memories: memories.results,
    metrics: metrics.results,
  };
}

async function callAI(
  env: Env,
  message: string,
  context: { recent: unknown[]; memories: unknown[]; metrics: unknown[] },
): Promise<AIResult> {
  const provider = resolveProvider(env);
  if (provider === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("AI_PROVIDER=openai，但尚未配置 OPENAI_API_KEY");
    return callOpenAI(env, message, context);
  }
  return callWorkersAI(env, message, context);
}

function resolveProvider(env: Env): "workers-ai" | "openai" {
  return env.AI_PROVIDER === "openai" ? "openai" : "workers-ai";
}

function buildContextText(context: { recent: unknown[]; memories: unknown[]; metrics: unknown[] }) {
  return `下面是用户此前的结构化上下文。它只用于保持连续性；如果与用户本次明确输入冲突，以本次输入为准。\n${JSON.stringify(context)}`;
}

async function callWorkersAI(
  env: Env,
  message: string,
  context: { recent: unknown[]; memories: unknown[]; metrics: unknown[] },
): Promise<AIResult> {
  const model = env.WORKERS_AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
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
  const parsed = (typeof raw === "string" ? JSON.parse(raw) : raw) as AIResult;
  if (!parsed || !ROLE_VALUES.includes(parsed.role)) throw new Error("Workers AI 返回了无效结构");
  return parsed;
}

async function callOpenAI(
  env: Env,
  message: string,
  context: { recent: unknown[]; memories: unknown[]; metrics: unknown[] },
): Promise<AIResult> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-5.6-luna",
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

  const payload = (await response.json()) as any;
  if (!response.ok) {
    console.error(JSON.stringify({ message: "openai_error", status: response.status, payload }));
    throw new Error(payload?.error?.message || "OpenAI 请求失败");
  }

  const outputText = extractOutputText(payload);
  const parsed = JSON.parse(outputText) as AIResult;
  if (!ROLE_VALUES.includes(parsed.role)) throw new Error("OpenAI 返回了无效角色");
  return parsed;
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text) return payload.output_text;
  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") throw new Error(content.refusal || "模型拒绝了该请求");
    }
  }
  throw new Error("未从模型响应中取得文本结果");
}

async function handleOverview(request: Request, env: Env) {
  const entryCounts = await env.DB.prepare(
    `SELECT role, COUNT(*) AS count FROM entries GROUP BY role`,
  ).all<{ role: Role; count: number }>();
  const memoryCounts = await env.DB.prepare(
    `SELECT role, COUNT(*) AS count FROM memories GROUP BY role`,
  ).all<{ role: Role; count: number }>();
  const recent = await env.DB.prepare(
    `SELECT * FROM entries ORDER BY created_at DESC LIMIT 8`,
  ).all();

  const counts = Object.fromEntries(ROLE_VALUES.map((role) => [role, 0])) as Record<Role, number>;
  const memories = Object.fromEntries(ROLE_VALUES.map((role) => [role, 0])) as Record<Role, number>;
  for (const row of entryCounts.results) counts[row.role] = Number(row.count);
  for (const row of memoryCounts.results) memories[row.role] = Number(row.count);

  return json({ counts, memoryCounts: memories, recent: recent.results }, 200, request);
}

async function handleHistory(request: Request, env: Env, url: URL) {
  const role = parseRole(url.searchParams.get("role"));
  const result = role
    ? await env.DB.prepare(`SELECT * FROM entries WHERE role = ? ORDER BY created_at DESC LIMIT 100`).bind(role).all()
    : await env.DB.prepare(`SELECT * FROM entries ORDER BY created_at DESC LIMIT 100`).all();
  return json({ entries: result.results }, 200, request);
}

async function handleMemories(request: Request, env: Env, url: URL) {
  const role = parseRole(url.searchParams.get("role"));
  const result = role
    ? await env.DB.prepare(
        `SELECT * FROM memories WHERE role = ? ORDER BY importance DESC, last_seen_at DESC LIMIT 200`,
      ).bind(role).all()
    : await env.DB.prepare(
        `SELECT * FROM memories ORDER BY importance DESC, last_seen_at DESC LIMIT 200`,
      ).all();
  return json({ memories: result.results }, 200, request);
}

async function handleMetrics(request: Request, env: Env, url: URL) {
  const role = parseRole(url.searchParams.get("role"));
  const result = role
    ? await env.DB.prepare(
        `SELECT * FROM metrics WHERE role = ? ORDER BY recorded_at DESC LIMIT 300`,
      ).bind(role).all()
    : await env.DB.prepare(`SELECT * FROM metrics ORDER BY recorded_at DESC LIMIT 300`).all();
  return json({ metrics: result.results }, 200, request);
}

async function handleExport(request: Request, env: Env) {
  const [entries, memories, metrics] = await Promise.all([
    env.DB.prepare(`SELECT * FROM entries ORDER BY created_at ASC`).all(),
    env.DB.prepare(`SELECT * FROM memories ORDER BY created_at ASC`).all(),
    env.DB.prepare(`SELECT * FROM metrics ORDER BY recorded_at ASC`).all(),
  ]);
  return json(
    {
      exported_at: new Date().toISOString(),
      version: 1,
      entries: entries.results,
      memories: memories.results,
      metrics: metrics.results,
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
  const allowed = origin === "capacitor://localhost" || origin === "http://localhost" || origin === "https://localhost";
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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
