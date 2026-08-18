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
    await new Promise((r) => setTimeout(r, Math.min(1500 * i, 6000)));
  }
  throw last || new Error(`Unable to fetch ${url}`);
}

const root = await fetchRetry(`${base}/`);
const rootText = await root.text();
if (!root.ok || !/id=["']root["']/.test(rootText)) {
  console.error(rootText.slice(0, 1200));
  throw new Error(`SPA smoke test failed: ${root.status}; index.html/root element not found`);
}
console.log(`✓ SPA: ${root.status} ${base}/`);

const health = await fetchRetry(`${base}/api/health`, {
  headers: { "x-workbench-token": token },
});
const healthText = await health.text();
if (!health.ok) throw new Error(`Health API failed: ${health.status} ${healthText}`);
const healthJson = JSON.parse(healthText);
if (healthJson.ok !== true) throw new Error(`Health API returned invalid payload: ${healthText}`);
console.log(`✓ API health: ${health.status} (${healthJson.provider || "provider?"} / ${healthJson.model || "model?"})`);

const overview = await fetchRetry(`${base}/api/overview`, {
  headers: { "x-workbench-token": token },
});
const overviewText = await overview.text();
if (!overview.ok) throw new Error(`D1 overview failed: ${overview.status} ${overviewText}`);
const overviewJson = JSON.parse(overviewText);
if (!overviewJson.counts || !overviewJson.memoryCounts) {
  throw new Error(`D1 overview returned invalid payload: ${overviewText}`);
}
console.log(`✓ D1 overview: ${overview.status}`);
console.log(`\nDEPLOYMENT_OK=${base}`);
