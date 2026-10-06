import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import api from "@/data/api";
import { DataError } from "@/data/types";

interface Seen {
  method: string;
  path: string;
  body: unknown;
}
const project = { id: "p-1", title: "Trip", format: "square", slideCount: 7, rev: 3, updatedAt: "2026-10-05T10:00:00Z", doc: { v: 1, background: { type: "color", value: "#ffffff" }, elements: [] } };

let seen: Seen[];
let reply: (s: Seen) => { status: number; body: unknown } | "network";
const real = globalThis.fetch;

beforeEach(() => {
  seen = [];
  reply = () => ({ status: 200, body: {} });
  globalThis.fetch = (async (path: string, init?: RequestInit) => {
    const s = { method: init?.method ?? "GET", path, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    seen.push(s);
    const r = reply(s);
    if (r === "network") throw new TypeError("offline");
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = real;
});

describe("the project calls", () => {
  it("duplicating posts to the project's duplicate route and gives back a summary of the copy", async () => {
    reply = () => ({ status: 200, body: { project: { ...project, id: "p-2", title: "Trip copy" } } });
    const copy = await api.duplicateProject("p-1");
    assert.deepEqual(seen, [{ method: "POST", path: "/api/projects/p-1/duplicate", body: {} }]);
    assert.deepEqual(copy, { id: "p-2", title: "Trip copy", format: "square", slideCount: 7, updatedAt: "2026-10-05T10:00:00Z" });
    assert.equal("doc" in copy, false, "a summary doesn't carry the whole document");
  });

  it("deleting is a DELETE on the project, and restoring is a POST on its restore route", async () => {
    await api.deleteProject("p-1");
    await api.restoreProject("p-1");
    assert.deepEqual(seen.map((s) => `${s.method} ${s.path}`), ["DELETE /api/projects/p-1", "POST /api/projects/p-1/restore"]);
  });

  it("renaming reads the project's revision first and then saves the title against it", async () => {
    reply = (s) => (s.method === "GET" ? { status: 200, body: { project } } : { status: 200, body: { rev: 4 } });
    await api.renameProject("p-1", "New name");
    assert.deepEqual(seen.map((s) => `${s.method} ${s.path}`), ["GET /api/projects/p-1", "PATCH /api/projects/p-1"]);
    assert.deepEqual(seen[1].body, { rev: 3, title: "New name" });
  });

  it("renaming is a conflict if someone saved in between, and says so", async () => {
    reply = (s) => (s.method === "GET" ? { status: 200, body: { project } } : { status: 409, body: { error: { code: "REV_CONFLICT", message: "This project was changed somewhere else." } } });
    await assert.rejects(api.renameProject("p-1", "x"), (e: DataError) => e instanceof DataError && e.code === "REV_CONFLICT");
  });

  it("an id is made safe for the address", async () => {
    await api.deleteProject("a/b?c");
    assert.equal(seen[0].path, "/api/projects/a%2Fb%3Fc");
  });

  it("a refusal from the server comes back as a DataError with its code and words", async () => {
    reply = () => ({ status: 404, body: { error: { code: "NOT_FOUND", message: "That project doesn't exist." } } });
    await assert.rejects(api.deleteProject("nope"), (e: DataError) => e.code === "NOT_FOUND" && e.message === "That project doesn't exist.");
  });

  it("no connection is NETWORK, not a crash", async () => {
    reply = () => "network";
    await assert.rejects(api.restoreProject("p-1"), (e: DataError) => e.code === "NETWORK");
  });

  it("a save carries the slide count and format to the server as given", async () => {
    await api.saveProject("p-1", { rev: 3, slideCount: 40, format: "story_9_16" });
    assert.deepEqual(seen[0], { method: "PATCH", path: "/api/projects/p-1", body: { rev: 3, slideCount: 40, format: "story_9_16" } });
  });
});
