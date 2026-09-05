import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRequire } from "node:module";
import { resolveAppVersion, DEFAULT_LIST_AGENTS_OPTIONS } from "./paseo.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };

describe("resolveAppVersion", () => {
  it("uses package.json version by default", () => {
    assert.equal(resolveAppVersion(), pkg.version);
  });

  it("allows explicit override", () => {
    assert.equal(resolveAppVersion("9.9.9"), "9.9.9");
    assert.equal(resolveAppVersion(" 1.2.3 "), "1.2.3");
  });

  it("is at least the daemon all-providers floor", () => {
    const version = resolveAppVersion();
    const [maj, min, pat] = version.split(".").map((p) => Number.parseInt(p, 10));
    assert.ok(Number.isFinite(maj) && Number.isFinite(min) && Number.isFinite(pat));
    // Daemon requires >= 0.1.45 to show non-legacy providers (grok-gateway, …).
    const atLeast =
      maj! > 0 || (maj === 0 && min! > 1) || (maj === 0 && min === 1 && pat! >= 45);
    assert.equal(atLeast, true, `appVersion ${version} must be >= 0.1.45`);
  });
});

describe("DEFAULT_LIST_AGENTS_OPTIONS", () => {
  it("lists active agents with a large page", () => {
    assert.equal(DEFAULT_LIST_AGENTS_OPTIONS.scope, "active");
    assert.equal(DEFAULT_LIST_AGENTS_OPTIONS.page.limit, 100);
  });
});
