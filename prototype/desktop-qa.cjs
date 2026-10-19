const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const assetFiles = ["index.html", "styles.css", "workbench.css", "relay-ui.css", "workbench.js", "relay-model.js", "relay-ui.js", "app.js"];
const storageKey = "eryuan-relay-desktop-draft-v1";
const kinds = ["text", "image", "file", "group_messages", "ai", "sign", "group_send", "drive_save", "result"];
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function targetURL(value) {
  if (!value) throw new Error("PROTOTYPE_URL is required; no server is started automatically");
  const target = new URL(value);
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.search || target.hash) throw new Error("Use an authorized HTTP(S) static preview without credentials, query or fragment");
  if (!target.pathname.endsWith("/") && !target.pathname.endsWith("/index.html")) throw new Error("Target must be a directory or index.html");
  return target;
}

function allowedAsset(target, request) {
  if (request.method !== "GET") return null;
  let current;
  try { current = new URL(request.url); } catch { return null; }
  if (current.username || current.password || current.search || current.hash || current.origin !== target.origin) return null;
  const base = new URL("./", target);
  const file = assetFiles.find((name) => current.href === new URL(name, base).href || (name === "index.html" && current.href === target.href));
  if (!file) return null;
  const expectedType = file.endsWith(".html") ? "document" : file.endsWith(".css") ? "stylesheet" : "script";
  return request.resourceType === expectedType ? file : null;
}

function safeURL(value) {
  try { const parsed = new URL(value); return parsed.origin + parsed.pathname; } catch { return "invalid_url"; }
}

function verifyResponse(status, bytes, expectedHash) {
  if (status !== 200) throw new Error(`Static asset HTTP ${status}; redirects are not followed`);
  const actual = digest(bytes);
  if (actual !== expectedHash) throw new Error("Served asset differs from the checked-out source");
  return actual;
}

function initialAudit() {
  return {
    status: "failed", browserStatus: "not_run", startedAt: new Date().toISOString(),
    viewport: { width: 1440, height: 1000 }, cases: [], screenshots: [],
    environment: { node: process.version, platform: process.platform, arch: process.arch },
    consoleErrors: null, pageErrors: null, network: null,
    scope: "Isolated desktop UI and guarded static-preview requests; not platform execution",
    platformExecution: "not_run", deployment: "not_run", originalSiteIntegration: "not_verified", A2: "blocked",
  };
}

async function runDesktopCases(page, audit, output, persist) {
  const readSaved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const save = async () => { await page.locator("#relay-save").click(); return readSaved(); };
  const close = () => page.locator("#relay-dialog-close").click();
  const selectNode = (id) => page.locator(`[data-select-node="${id}"]`).click();
  const runCase = async (id, action) => {
    const entry = { id, status: "failed", startedAt: new Date().toISOString() };
    audit.cases.push(entry);
    persist();
    entry.actual = await action();
    entry.horizontalOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth);
    assert(entry.horizontalOverflow <= 0, `${id}: document overflows horizontally`);
    const filename = `${id}.png`;
    await page.screenshot({ path: path.join(output, filename), fullPage: true });
    audit.screenshots.push({ caseId: id, file: filename, sha256: digest(fs.readFileSync(path.join(output, filename))) });
    entry.status = "passed";
    entry.completedAt = new Date().toISOString();
    persist();
  };

  await runCase("01-default-canvas", async () => {
    await page.locator(".relay-card").first().waitFor();
    const count = await page.locator(".relay-card").count();
    assert.equal(count, 13);
    assert.equal(await page.locator('.relay-card[data-kind="ai"]').count(), 10);
    assert.equal(await page.locator('.relay-card[data-kind="sign"]').count(), 3);
    assert.deepEqual(await page.locator("[data-add-kind]").evaluateAll((buttons) => buttons.map((button) => button.dataset.addKind)), kinds);
    assert(await page.locator("#relay-migration").isVisible());
    assert(await page.getByRole("button", { name: "真实运行未开放", exact: true }).isDisabled());
    const saved = await save();
    assert.equal(saved.runnable, false);
    assert.equal(saved.executionEvidence, "not_run");
    assert.equal(saved.graph.edges.length, 12);
    for (const edge of saved.graph.edges) {
      const source = saved.graph.nodes.find((node) => node.id === edge.from);
      const target = saved.graph.nodes.find((node) => node.id === edge.to);
      assert(source?.outputs.some((port) => port.id === edge.fromPort));
      assert(target?.inputs.some((port) => port.id === edge.toPort));
    }
    await page.waitForFunction(() => document.querySelectorAll("#relay-edges path[data-edge]").length === 12);
    return { cards: count, ai: 10, sign: 3, portBoundEdges: saved.graph.edges.length, runnable: saved.runnable };
  });

  await runCase("02-node-configuration", async () => {
    await selectNode("01.1-V02");
    await page.locator('[name="prompt_p2"]').fill("只使用测试商品事实，缺资料时停止。QA 样例，不调用模型。");
    await page.locator('[name="exec_model"]').fill("qa-model-reference-only");
    await page.locator('#relay-node-form button[type="submit"]').click();
    const node = (await save()).graph.nodes.find((entry) => entry.id === "01.1-V02");
    assert.match(node.prompts.p2, /QA 样例/);
    assert.equal(node.exec.model, "qa-model-reference-only");
    await page.reload({ waitUntil: "load" });
    await selectNode("01.1-V02");
    assert.equal(await page.locator('[name="exec_model"]').inputValue(), node.exec.model);
    assert.equal(await page.locator('[name="prompt_p2"]').inputValue(), node.prompts.p2);
    return { restoredModelReference: node.exec.model, restoredPrompt: node.prompts.p2 };
  });

  await runCase("03-validation-blocked", async () => {
    await page.locator("#relay-check").click();
    assert.equal(await page.locator("#relay-dialog-title").textContent(), "先补齐这些内容");
    const errors = await page.locator("#relay-dialog .relay-issue.err").count();
    assert(errors > 0);
    assert.match(await page.locator("#relay-dialog-body").textContent(), /没有执行任何步骤/);
    assert.equal(await page.locator("#relay-dialog ol li").count(), 0);
    return { errors, downstreamResultsShown: 0 };
  });
  await close();

  await runCase("04-system-port-locked", async () => {
    await page.locator("#relay-inspector summary").filter({ hasText: "输入、输出与连接" }).click();
    await page.locator('[data-edit-port="material"][data-port-direction="inputs"]').click();
    assert.equal(await page.locator("#relay-delete-port").count(), 0);
    assert.equal(await page.locator('[name="port_type"]').count(), 0);
    assert.equal(await page.locator('[name="port_required"]').count(), 0);
    assert.match(await page.locator("#relay-dialog-body").textContent(), /不能删除/);
    return { deleteControls: 0, typeControls: 0, requiredControls: 0 };
  });
  await close();

  await runCase("05-card-template", async () => {
    const before = await save();
    const source = before.graph.nodes.find((node) => node.id === "01.1-V02");
    await page.locator("#relay-save-template").click();
    await page.locator("[data-insert-template]").last().click();
    const after = await save();
    const copy = after.graph.nodes.find((node) => !before.graph.nodes.some((entry) => entry.id === node.id));
    assert(copy);
    assert.notEqual(copy.id, source.id);
    assert.deepEqual(copy.inputs.map((port) => port.id), source.inputs.map((port) => port.id));
    assert.deepEqual(copy.outputs.map((port) => port.id), source.outputs.map((port) => port.id));
    assert.equal(after.graph.edges.length, before.graph.edges.length);
    return { newId: copy.id, originalId: source.id, inputIds: copy.inputs.map((port) => port.id), outputIds: copy.outputs.map((port) => port.id) };
  });
  await page.locator("#relay-undo").click();

  await runCase("06-migration-notice", async () => {
    assert(await page.locator("#relay-migration").isVisible());
    await page.locator("#relay-migration-open").click();
    const text = await page.locator("#relay-dialog-body").textContent();
    assert.match(text, /不是原站源码导出或已部署版本/);
    return { explanation: text };
  });
  await close();

  await runCase("07-add-all-kinds", async () => {
    const added = [];
    for (const kind of kinds) {
      const before = await page.locator(".relay-card").count();
      await page.locator(`[data-add-kind="${kind}"]`).click();
      assert.equal(await page.locator(".relay-card").count(), before + 1);
      assert.equal(await page.locator(".relay-card.selected").getAttribute("data-kind"), kind);
      added.push(kind);
      await page.locator("#relay-undo").click();
      assert.equal(await page.locator(".relay-card").count(), before);
    }
    return { addedAndUndone: added };
  });

  await runCase("08-valid-structure-control", async () => {
    for (const id of ["01.1-H02", "01.1-H05", "01.1-H10"]) {
      await selectNode(id);
      await page.locator('[name="gate_signer_uid"]').fill(`qa-reference-${id}`);
      await page.locator('[name="gate_signer_name"]').fill("测试审核人引用（不代表授权）");
      await page.locator('[name="gate_ttl_hours"]').fill("12");
      await page.locator('#relay-node-form button[type="submit"]').click();
    }
    await page.locator("#relay-check").click();
    assert.equal(await page.locator("#relay-dialog-title").textContent(), "连接检查完成");
    assert.equal(await page.locator("#relay-dialog .relay-issue.err").count(), 0);
    assert.equal(await page.locator("#relay-dialog ol li").count(), 13);
    assert.match(await page.locator("#relay-dialog-body").textContent(), /实际运行必须等待真人/);
    return { structureSteps: 13, humanReminderVisible: true, execution: "not_run" };
  });
  await close();

  await runCase("09-edit-invalidates-check", async () => {
    assert.equal(await page.locator("#relay-check").textContent(), "查看检查结果");
    await page.locator('[name="gate_signer_uid"]').fill("");
    assert.equal(await page.locator("#relay-check").textContent(), "检查连接");
    assert.match(await page.locator("#relay-save-state").textContent(), /未保存/);
    await page.locator("#relay-check").click();
    assert.equal(await page.locator("#relay-dialog-title").textContent(), "先补齐这些内容");
    assert.equal(await page.locator("#relay-dialog ol li").count(), 0);
    await close();
    const saved = await save();
    assert.equal(saved.runnable, false);
    assert.equal(saved.executionEvidence, "not_run");
    return { invalidDraftSaved: true, runnable: saved.runnable };
  });

  await runCase("10-custom-port-and-connection", async () => {
    await selectNode("01.1-V02");
    await page.locator("#relay-inspector summary").filter({ hasText: "输入、输出与连接" }).click();
    await page.locator('[data-new-port="inputs"]').click();
    await page.locator('[name="port_name"]').fill("测试附加资料");
    await page.locator('[name="port_type"][value="text"]').check();
    await page.locator('#relay-port-form button[type="submit"]').click();
    const before = await save();
    const custom = before.graph.nodes.find((node) => node.id === "01.1-V02").inputs.find((port) => port.name === "测试附加资料");
    assert(custom);
    await page.locator('[data-add-kind="image"]').click();
    const imageId = await page.locator(".relay-card.selected").getAttribute("data-node");
    await page.locator(`[data-port-node="${imageId}"][data-port-id="out"][data-direction="outputs"]`).click();
    await page.locator(`[data-port-node="01.1-V02"][data-port-id="${custom.id}"][data-direction="inputs"]`).click();
    assert.match(await page.locator("#relay-notice").textContent(), /类型不匹配/);
    assert.equal((await save()).graph.edges.length, before.graph.edges.length);
    await page.locator("#relay-undo").click();
    await page.locator('[data-add-kind="text"]').click();
    const textId = await page.locator(".relay-card.selected").getAttribute("data-node");
    await page.locator(`[data-port-node="${textId}"][data-port-id="out"][data-direction="outputs"]`).click();
    await page.locator(`[data-port-node="01.1-V02"][data-port-id="${custom.id}"][data-direction="inputs"]`).click();
    const connected = await save();
    const edge = connected.graph.edges.find((entry) => entry.from === textId && entry.to === "01.1-V02" && entry.toPort === custom.id);
    assert.equal(edge?.fromPort, "out");
    assert.equal(connected.graph.edges.length, before.graph.edges.length + 1);
    await selectNode("01.1-V02");
    await page.locator("#relay-inspector summary").filter({ hasText: "输入、输出与连接" }).click();
    await page.locator(`[data-edit-port="${custom.id}"][data-port-direction="inputs"]`).click();
    await page.locator("#relay-delete-port").click();
    const deleted = await save();
    assert(!deleted.graph.nodes.find((node) => node.id === "01.1-V02").inputs.some((port) => port.id === custom.id));
    assert(!deleted.graph.edges.some((entry) => entry.id === edge.id));
    return { customPortId: custom.id, rejectedImageConnection: true, validTextEdge: edge, removedWithPort: true };
  });
}

async function main() {
  const destination = path.join(__dirname, "qa", "desktop");
  fs.mkdirSync(destination, { recursive: true });
  const audit = initialAudit();
  const persist = () => fs.writeFileSync(path.join(destination, "audit.json"), JSON.stringify(audit, null, 2) + "\n");
  persist();
  let browser;
  let context;
  try {
    if (process.env.DESKTOP_QA_AUTHORIZED !== "1") throw new Error("Run only in an explicitly authorized browser environment; set DESKTOP_QA_AUTHORIZED=1 there, not to bypass a denied browser action");
    const target = targetURL(process.env.PROTOTYPE_URL);
    audit.target = target.href;
    const repository = path.resolve(__dirname, "..");
    audit.commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repository, encoding: "utf8" }).trim();
    audit.dirty = Boolean(execFileSync("git", ["status", "--porcelain", "--untracked-files=normal", "--", "prototype"], { cwd: repository, encoding: "utf8" }).trim());
    assert.equal(audit.dirty, false, "Commit the prototype and QA script before collecting versioned browser evidence");
    audit.sourceHashes = Object.fromEntries([...assetFiles, "desktop-qa.cjs"].map((file) => [file, digest(fs.readFileSync(path.join(__dirname, file)))]));
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: audit.viewport, deviceScaleFactor: 1, serviceWorkers: "block", acceptDownloads: false });
    assert.equal(typeof context.routeWebSocket, "function", "Playwright >= 1.48 is required");
    audit.browserVersion = browser.version();
    audit.browserStatus = "running";
    audit.consoleErrors = [];
    audit.pageErrors = [];
    audit.network = { observation: "incomplete", requests: [], websocketAttempts: [], verifiedAssets: [], forwardedNonStaticRequests: null };
    const verified = new Set();
    await context.route("**/*", async (route) => {
      const request = route.request();
      const details = { url: request.url(), method: request.method(), resourceType: request.resourceType() };
      const asset = allowedAsset(target, details);
      const entry = { ...details, url: safeURL(details.url), asset, status: "blocked" };
      audit.network.requests.push(entry);
      if (!asset) { await route.abort("blockedbyclient"); return; }
      try {
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 10000 });
        entry.httpStatus = response.status();
        const bytes = await response.body();
        entry.sha256 = verifyResponse(response.status(), bytes, audit.sourceHashes[asset]);
        await route.fulfill({ response, body: bytes });
        entry.status = "verified_static";
        verified.add(asset);
      } catch (error) {
        entry.status = "failed";
        entry.error = error.message.replaceAll(repository, "<repository>");
        await route.abort("blockedbyclient").catch(() => {});
      }
    });
    await context.routeWebSocket("**/*", async (socket) => {
      audit.network.websocketAttempts.push({ url: safeURL(socket.url()), status: "blocked" });
      await socket.close({ code: 1008, reason: "Static-only QA" });
    });
    context.on("page", (observed) => {
      observed.on("console", (message) => { if (message.type() === "error") audit.consoleErrors.push(message.text()); });
      observed.on("pageerror", (error) => audit.pageErrors.push(error.message));
    });
    const output = path.join(destination, crypto.randomUUID());
    fs.mkdirSync(output);
    audit.artifactDirectory = path.basename(output);
    persist();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(target.href, { waitUntil: "load", timeout: 20000 });
    await runDesktopCases(page, audit, output, persist);
    await context.close();
    context = null;
    audit.network.verifiedAssets = [...verified].sort();
    assert.deepEqual(audit.network.verifiedAssets, [...assetFiles].sort(), "All served assets must match this checkout");
    assert.equal(audit.network.requests.filter((entry) => entry.status !== "verified_static").length, 0, "Unexpected, failed or non-static request");
    assert.equal(audit.network.websocketAttempts.length, 0, "Unexpected WebSocket attempt");
    assert.deepEqual(audit.consoleErrors, []);
    assert.deepEqual(audit.pageErrors, []);
    audit.network.observation = "complete_for_tested_interactions";
    audit.network.forwardedNonStaticRequests = 0;
    audit.browserStatus = "passed";
    audit.status = "passed";
  } catch (error) {
    audit.error = String(error.message).replaceAll(path.resolve(__dirname, ".."), "<repository>");
    if (audit.browserStatus === "running") audit.browserStatus = "failed";
    process.exitCode = 1;
  } finally {
    try { if (context) await context.close(); if (browser) await browser.close(); }
    catch { audit.status = "failed"; audit.browserStatus = "failed"; audit.cleanupError = "Browser cleanup failed"; process.exitCode = 1; }
    audit.completedAt = new Date().toISOString();
    persist();
    console.log(JSON.stringify({ status: audit.status, browser: audit.browserStatus, cases: audit.cases.length, platformExecution: audit.platformExecution }));
  }
}

module.exports = { assetFiles, targetURL, allowedAsset, safeURL, verifyResponse, initialAudit };
if (require.main === module) main().catch(() => { process.exitCode = 1; });
