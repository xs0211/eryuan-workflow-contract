const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { assetFiles, targetURL, allowedAsset, safeURL, verifyResponse, initialAudit } = require("./desktop-qa.cjs");

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

test("all eight exact assets have matching browser resource kinds", () => {
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
