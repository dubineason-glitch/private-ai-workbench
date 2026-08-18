import fs from "node:fs";
import { execFileSync } from "node:child_process";

const DB_NAME = "private-ai-workbench";

function wrangler(args) {
  return execFileSync("npx", ["wrangler", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function listDatabases() {
  const out = wrangler(["d1", "list", "--json"]);
  return JSON.parse(out);
}

let dbs = listDatabases();
let db = dbs.find((item) => item.name === DB_NAME);
if (!db) {
  console.log(`Creating D1 database: ${DB_NAME}`);
  wrangler(["d1", "create", DB_NAME, "--location", "apac"]);
  dbs = listDatabases();
  db = dbs.find((item) => item.name === DB_NAME);
}

const databaseId = db?.uuid || db?.database_id;
if (!databaseId) {
  throw new Error("Unable to resolve D1 database ID");
}

const path = "wrangler.jsonc";
let config = fs.readFileSync(path, "utf8");
config = config.replace(/"database_id":\s*"[^"]+"/, `"database_id": "${databaseId}"`);
fs.writeFileSync(path, config);
console.log(`D1 ready: ${databaseId}`);
