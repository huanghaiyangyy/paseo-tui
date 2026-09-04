import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  footerConnectionLabel,
  isReconnectEnabled,
  reconnectDelayMs,
  reconnectOptions,
} from "./reconnect.js";
import { formatConnectError } from "./reconnect.js";

describe("isReconnectEnabled", () => {
  it("defaults to enabled", () => {
    assert.equal(isReconnectEnabled({}), true);
    assert.equal(isReconnectEnabled({ PASEO_RECONNECT: "" }), true);
    assert.equal(isReconnectEnabled({ PASEO_RECONNECT: "1" }), true);
  });

  it("disables on 0/false/off/no", () => {
    for (const v of ["0", "false", "off", "no", "FALSE", " Off "]) {
      assert.equal(isReconnectEnabled({ PASEO_RECONNECT: v }), false, v);
    }
  });
});

describe("reconnectOptions", () => {
  it("uses 1s base and 30s max", () => {
    const opts = reconnectOptions({});
    assert.equal(opts.enabled, true);
    assert.equal(opts.baseDelayMs, 1_000);
    assert.equal(opts.maxDelayMs, 30_000);
  });
});

describe("reconnectDelayMs", () => {
  it("matches 1s, 2s, 4s capped at max", () => {
    assert.equal(reconnectDelayMs(0), 1_000);
    assert.equal(reconnectDelayMs(1), 2_000);
    assert.equal(reconnectDelayMs(2), 4_000);
    assert.equal(reconnectDelayMs(3), 8_000);
    assert.equal(reconnectDelayMs(4), 16_000);
    assert.equal(reconnectDelayMs(5), 30_000);
    assert.equal(reconnectDelayMs(10), 30_000);
  });
});

describe("footerConnectionLabel", () => {
  it("maps connected / reconnecting / disconnected", () => {
    assert.equal(
      footerConnectionLabel({
        status: "connected",
        reconnectEnabled: true,
        everConnected: true,
      }),
      "connected",
    );
    assert.equal(
      footerConnectionLabel({
        status: "disconnected",
        reconnectEnabled: true,
        everConnected: true,
      }),
      "reconnecting",
    );
    assert.equal(
      footerConnectionLabel({
        status: "connecting",
        reconnectEnabled: true,
        everConnected: true,
      }),
      "reconnecting",
    );
    assert.equal(
      footerConnectionLabel({
        status: "disconnected",
        reconnectEnabled: false,
        everConnected: true,
      }),
      "disconnected",
    );
    assert.equal(
      footerConnectionLabel({
        status: "connecting",
        reconnectEnabled: true,
        everConnected: false,
      }),
      "connecting",
    );
    assert.equal(
      footerConnectionLabel({
        status: "disconnected",
        reconnectEnabled: true,
        everConnected: true,
        stopping: true,
      }),
      "disconnected",
    );
  });
});

describe("formatConnectError", () => {
  it("mentions timeout and reconnect guidance", () => {
    const msg = formatConnectError(
      new Error("Connection timed out"),
      "ws://127.0.0.1:6767/ws",
      true,
    );
    assert.match(msg, /timed out/i);
    assert.match(msg, /PASEO_RECONNECT=0/);
    assert.match(msg, /6767/);
  });

  it("mentions refused when ECONNREFUSED", () => {
    const msg = formatConnectError(
      new Error("connect ECONNREFUSED 127.0.0.1:6767"),
      "ws://127.0.0.1:6767/ws",
      false,
    );
    assert.match(msg, /refused/i);
    assert.match(msg, /PASEO_RECONNECT=0/);
  });
});
