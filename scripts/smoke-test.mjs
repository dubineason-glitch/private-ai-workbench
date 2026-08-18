const base = (process.env.DEPLOYMENT_URL || "").replace(/\/$/, "");
const token = process.env.APP_TOKEN || "";
if (!base) throw new Error("DEPLOYMENT_URL is empty");
if (!token) throw new Error("APP_TOKEN is empty");

async function fetchRetry(url, init = {}, attempts = 12) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { redirect: "follow", ...init });
      if (res.status < 500) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, Math.min(1200 * i, 5000)));
  }
  throw last || new Error(`Unable to fetch ${url}`);
}

const root = await fetchRetry(`${base}/`);
const rootText = await root.text();
if (!root.ok || !/id=["']root["']/.test(rootText)) {
  console.error(rootText.slice(0, 1200));
  throw new Error(`SPA smoke test failed: ${root.status}; root element not found`);
}
console.log(`✓ SPA: ${root.status}`);

const unauthorized = await fetchRetry(`${base}/api/health`, {
  headers: { "x-workbench-token": "definitely-wrong-token" },
});
if (unauthorized.status !== 401) {
  throw new Error(`Auth smoke test expected 401, got ${unauthorized.status}`);
}
console.log("✓ Auth rejection: 401");

const headers = { "x-workbench-token": token };
const health = await fetchRetry(`${base}/api/health`, { headers });
const healthText = await health.text();
if (!health.ok) throw new Error(`Health API failed: ${health.status} ${healthText}`);
const healthJson = JSON.parse(healthText);
if (healthJson.ok !== true) throw new Error(`Health API returned invalid payload: ${healthText}`);
console.log(`✓ API health: ${health.status} (${healthJson.provider} / ${healthJson.model})`);

const overview = await fetchRetry(`${base}/api/overview`, { headers });
const overviewText = await overview.text();
if (!overview.ok) throw new Error(`D1 overview failed: ${overview.status} ${overviewText}`);
const overviewJson = JSON.parse(overviewText);
if (!overviewJson.counts || !overviewJson.memoryCounts || !Array.isArray(overviewJson.latestMetrics)) {
  throw new Error(`D1 overview returned invalid payload: ${overviewText}`);
}
console.log(`✓ D1 overview: ${overview.status}`);

const settings = await fetchRetry(`${base}/api/settings/ai`, { headers });
const settingsText = await settings.text();
if (!settings.ok) throw new Error(`AI settings failed: ${settings.status} ${settingsText}`);
const settingsJson = JSON.parse(settingsText);
if (!settingsJson.provider || !settingsJson.model) {
  throw new Error(`AI settings returned invalid payload: ${settingsText}`);
}
console.log(`✓ AI settings: ${settingsJson.provider} / ${settingsJson.model}`);
const now = new Date();
const later = new Date(now.getTime() + 30 * 60 * 1000);
const testTitle = `__smoke_calendar_${Date.now()}`;
const created = await fetchRetry(`${base}/api/events`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({
    title: testTitle,
    note: "deployment smoke test",
    start_at: now.toISOString(),
    end_at: later.toISOString(),
    all_day: false,
    category: "other",
    timezone: "UTC",
  }),
});
const createdText = await created.text();
if (!created.ok) throw new Error(`Calendar create failed: ${created.status} ${createdText}`);
const createdJson = JSON.parse(createdText);
if (!createdJson.event?.id) throw new Error(`Calendar create returned invalid payload: ${createdText}`);
const testEventId = createdJson.event.id;
console.log(`✓ Calendar create: ${testEventId}`);

const completed = await fetchRetry(`${base}/api/events/${encodeURIComponent(testEventId)}/complete`, {
  method: "POST",
  headers,
});
if (!completed.ok) throw new Error(`Calendar complete failed: ${completed.status} ${await completed.text()}`);
console.log("✓ Calendar complete");

const deleted = await fetchRetry(`${base}/api/events/${encodeURIComponent(testEventId)}`, {
  method: "DELETE",
  headers,
});
if (!deleted.ok) throw new Error(`Calendar delete failed: ${deleted.status} ${await deleted.text()}`);
console.log("✓ Calendar soft delete");
console.log(`\nDEPLOYMENT_OK=${base}`);
