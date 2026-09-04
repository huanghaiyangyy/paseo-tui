import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWsUrl } from "./client/paseo.js";

describe("resolveWsUrl", () => {
  it("defaults to local daemon", () => {
    const prevWs = process.env.PASEO_WS_URL;
    const prevHost = process.env.PASEO_HOST;
    delete process.env.PASEO_WS_URL;
    delete process.env.PASEO_HOST;
    try {
      assert.equal(resolveWsUrl(), "ws://127.0.0.1:6767/ws");
    } finally {
      if (prevWs === undefined) delete process.env.PASEO_WS_URL;
      else process.env.PASEO_WS_URL = prevWs;
      if (prevHost === undefined) delete process.env.PASEO_HOST;
      else process.env.PASEO_HOST = prevHost;
    }
  });

  it("accepts full ws URL", () => {
    assert.equal(
      resolveWsUrl("ws://example.com:9000/ws"),
      "ws://example.com:9000/ws",
    );
  });

  it("appends /ws to bare ws host", () => {
    assert.equal(resolveWsUrl("ws://example.com:9000"), "ws://example.com:9000/ws");
  });

  it("maps host:port", () => {
    assert.equal(resolveWsUrl("localhost:7000"), "ws://localhost:7000/ws");
  });

  it("maps bare host with default port", () => {
    assert.equal(resolveWsUrl("localhost"), "ws://localhost:6767/ws");
  });
});
