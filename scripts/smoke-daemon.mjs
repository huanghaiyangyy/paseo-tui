import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { createPaseoApi } from "@getpaseo/client";
import { resolveWsUrl } from "../dist/client/paseo.js";

const url = resolveWsUrl(process.env.PASEO_HOST);
const daemon = new DaemonClient({
  url,
  clientId: `paseo-tui-smoke-${Date.now()}`,
  clientType: "cli",
  password: process.env.PASEO_PASSWORD,
  connectTimeoutMs: 5000,
  reconnect: { enabled: false },
});

console.log("connecting", url);
await daemon.connect();
const api = createPaseoApi(daemon);
const snap = await api.providers.waitForReady({ cwd: process.cwd(), timeoutMs: 20000 });
const entries = snap.entries ?? [];
console.log(`providers: ${entries.length}`);
for (const e of entries) {
  const models = (e.models ?? []).map((m) => m.id).slice(0, 8);
  console.log(`- ${e.provider} status=${e.status} enabled=${e.enabled} models=${models.join(",")}`);
}
const recent = await daemon.fetchRecentProviderSessions({
  cwd: process.cwd(),
  limit: 20,
});
const n = recent.entries?.length ?? 0;
console.log(`recentSessions: ${n}`);
if (n) {
  console.log("first", JSON.stringify(recent.entries[0], null, 2));
} else {
  console.log("(smoke) no external provider sessions for this cwd");
}
await daemon.close();
console.log("smoke ok");
