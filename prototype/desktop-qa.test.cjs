const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assetFiles, targetURL, allowedAsset, safeURL, verifyResponse, initialAudit, visibleBounds, assertDisjointCards, createAuditRun } = require("./desktop-qa.cjs");

const target = targetURL("https://preview.example.test/prototype/");
const request = (url, method = "GET", resourceType = "script") => ({ url, method, resourceType });

test("desktop QA target is explicit and supports directory or index.html", () => {
  assert.throws(() => targetURL(), /required/);
  assert.equal(targetURL(target.href).href, target.href);
  assert.equal(targetURL(target.href + "index.html").pathname, "/prototype/index.html");
});

test("desktop QA rejects credentials, query, fragments and non-HTTP targets", () => {
  for (const value of ["file:///tmp/index.html", "data:text/html,hi", "https://user:secret@example.test/", "https://example.test/?token=secret", "https://example.test/#state", "https://example.test/app"]) assert.throws(() => targetURL(value));
});

test("all nine exact assets have matching browser resource kinds", () => {
  for (const file of assetFiles) {
    const type = file.endsWith(".html") ? "document" : file.endsWith(".css") ? "stylesheet" : "script";
    assert.equal(allowedAsset(target, request(target.href + file, "GET", type)), file);
  }
  assert.equal(allowedAsset(target, request(target.href, "GET", "document")), "index.html");
});

test("index.html target resolves scripts within the same directory", () => {
  const index = targetURL(target.href + "index.html");
  assert.equal(allowedAsset(index, request(target.href + "relay-ui.js")), "relay-ui.js");
});

test("API, other directories, external origins and lookalike hosts are blocked", () => {
  for (const value of [target.href + "api/run", target.href + "unknown.js", "https://preview.example.test/app.js", "https://preview.example.test.evil.test/prototype/app.js", "http://preview.example.test/prototype/app.js", "https://other.example.test/prototype/app.js"]) assert.equal(allowedAsset(target, request(value)), null);
});

test("POST, XHR and fetch are denied even when using an allowed filename", () => {
  for (const method of ["POST", "PUT", "DELETE", "PATCH", "HEAD"]) assert.equal(allowedAsset(target, request(target.href + "app.js", method)), null);
  for (const type of ["fetch", "xhr", "ping", "eventsource", "websocket", "image"]) assert.equal(allowedAsset(target, request(target.href + "app.js", "GET", type)), null);
});

test("static requests cannot carry credentials or query payloads", () => {
  for (const value of [target.href + "app.js?submit=1", target.href + "app.js#state", "https://user:secret@preview.example.test/prototype/app.js", target.href + "%61pp.js", "not a url"]) assert.equal(allowedAsset(target, request(value)), null);
});

test("network evidence omits credentials, query and fragment", () => {
  assert.equal(safeURL("https://user:secret@preview.example.test/api?token=hidden#secret"), "https://preview.example.test/api");
  assert.equal(safeURL("invalid"), "invalid_url");
});

test("only exact 200 asset bytes can be fulfilled", () => {
  const bytes = Buffer.from("test asset");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.equal(verifyResponse(200, bytes, hash), hash);
  assert.throws(() => verifyResponse(200, Buffer.from("old deployed asset"), hash), /differs/);
});

test("redirects, missing assets and server errors cannot masquerade as this source", () => {
  for (const status of [201, 204, 301, 302, 307, 308, 401, 403, 404, 500]) assert.throws(() => verifyResponse(status, Buffer.from(""), ""), /Static asset HTTP/);
});

test("fresh audit fails closed with unmeasured browser values, not synthetic zeros", () => {
  const audit = initialAudit();
  assert.equal(audit.status, "failed");
  assert.equal(audit.browserStatus, "not_run");
  assert.equal(audit.network, null);
  assert.equal(audit.consoleErrors, null);
  assert.equal(audit.pageErrors, null);
  assert.deepEqual(audit.screenshots, []);
  assert.equal(audit.platformExecution, "not_run");
  assert.equal(audit.A2, "blocked");
});

test("a new audit cannot inherit previous passed cases or counters", () => {
  const old = initialAudit();
  old.status = "passed";
  old.cases.push({ id: "stale", status: "passed" });
  old.network = { forwardedNonStaticRequests: 0 };
  const current = initialAudit();
  assert.equal(current.status, "failed");
  assert.deepEqual(current.cases, []);
  assert.equal(current.network, null);
});

test("absent or hidden optional drawer never asks for boundingBox", async () => {
  let boundingReads = 0;
  const locator = { isVisible: async () => false, boundingBox: async () => { boundingReads += 1; throw new Error("Would time out"); } };
  assert.equal(await visibleBounds(locator), null);
  assert.equal(boundingReads, 0);
});

test("visible drawer still returns measured geometry", async () => {
  const bounds = { x: 1018, y: 84, width: 400, height: 616 };
  assert.deepEqual(await visibleBounds({ isVisible: async () => true, boundingBox: async () => bounds }), bounds);
});

test("missing bounds after visible check fail rather than silently skip", async () => {
  await assert.rejects(() => visibleBounds({ isVisible: async () => true, boundingBox: async () => null }), /lost its measurable bounds/);
});

test("separated card geometry is a valid connection fixture", () => {
  const boxes = [{ x: 30, y: 40, width: 224, height: 160 }, { x: 330, y: 40, width: 224, height: 160 }];
  assert.deepEqual(assertDisjointCards(boxes), boxes);
});

test("overlapping cards fail before drag assertions can misdiagnose a port", () => {
  assert.throws(() => assertDisjointCards([{ x: 30, y: 40, width: 224, height: 160 }, { x: 230, y: 80, width: 224, height: 160 }]), /overlap/);
});

test("unmeasured or missing connection fixture cannot pass geometry checks", () => {
  assert.throws(() => assertDisjointCards([]), /at least two/);
  assert.throws(() => assertDisjointCards([{ x: 0, y: 0, width: 0, height: 160 }, { x: 300, y: 0, width: 224, height: 160 }]), /must be measured/);
});

test("each QA attempt preserves its failed audit and copies the previous latest record", (context) => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "relay-audit-test-"));
  context.after(() => fs.rmSync(destination, { recursive: true, force: true }));
  const original = JSON.stringify({ status: "failed", error: "original timeout", browserStatus: "failed" });
  fs.writeFileSync(path.join(destination, "audit.json"), original);
  const first = createAuditRun(destination);
  assert.equal(fs.readFileSync(path.join(first.output, "prior-audit.json"), "utf8"), original);
  first.audit.error = "fixture overlap"; first.persist();
  const failed = fs.readFileSync(path.join(first.output, "audit.json"), "utf8");
  const second = createAuditRun(destination);
  assert.notEqual(first.output, second.output);
  second.audit.status = "passed"; second.persist();
  assert.equal(fs.readFileSync(path.join(first.output, "audit.json"), "utf8"), failed);
  assert.equal(fs.readFileSync(path.join(second.output, "prior-audit.json"), "utf8"), failed);
  assert.equal(JSON.parse(fs.readFileSync(path.join(destination, "audit.json"), "utf8")).artifactDirectory, second.audit.artifactDirectory);
});
