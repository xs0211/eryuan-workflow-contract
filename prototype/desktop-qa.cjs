const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const assetFiles = ["index.html", "styles.css", "workbench.css", "relay-ui.css", "workbench.js", "relay-model.js", "relay-editor.js", "relay-ui.js", "app.js"];
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
    visualReview: "pending_human_comparison", firstUseReview: "pending_human_walkthrough",
    platformExecution: "not_run", deployment: "not_run", originalSiteIntegration: "not_verified", A2: "blocked",
  };
}

async function runDesktopCases(page, audit, output, persist) {
  const readSaved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  const save = async () => { await page.locator("#relay-save").click(); return readSaved(); };
  const closePanels = async () => {
    const closeButton = page.locator("[data-close-panel]:visible");
    if (await closeButton.count()) await closeButton.first().click();
  };
  const selectNode = async (id) => { await closePanels(); await page.locator('[data-select-node="' + id + '"]').click(); };
  const categoryOf = (kind) => ["text", "image", "file", "group_messages"].includes(kind) ? "input" : kind === "ai" ? "ai" : kind === "sign" ? "human" : "output";
  const addKind = async (kind) => {
    await closePanels();
    await page.locator('.relay-rail [data-open-panel="' + categoryOf(kind) + '"]').click();
    await page.locator('[data-add-kind="' + kind + '"]:not([data-preset])').click();
  };
  const send = async (text) => { await page.locator("#relay-chat-input").fill(text); await page.locator("#relay-chat-send").click(); };
  const apply = () => page.locator("#relay-apply-proposal").click();
  const reset = async () => {
    await closePanels(); await page.locator("#relay-new").click();
    if (await page.locator("#relay-new-confirm").count()) await page.locator("#relay-new-confirm").click();
  };
  const advanced = async (id) => { await selectNode(id); await page.locator("#relay-advanced-open").click(); };
  const revealTechnical = () => page.locator("#relay-inspector > details > summary").filter({ hasText: "模型、审核人及工具" }).click();
  const waitForCards = (count) => page.waitForFunction((expected) => document.querySelectorAll(".relay-card").length === expected, count);
  const composerVisible = async () => {
    const box = await page.locator("#relay-composer").boundingBox();
    assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1440 && box.y + box.height <= 1000);
    assert(await page.locator("#relay-chat-input").isVisible());
    const drawer = await page.locator("#relay-inspector-panel:visible").boundingBox();
    if (drawer) assert(drawer.y + drawer.height < box.y, "Drawer must not cover permanent composer");
    return box;
  };
  const runCase = async (id, action) => {
    const entry = { id, status: "failed", startedAt: new Date().toISOString() };
    audit.cases.push(entry); persist();
    entry.actual = await action();
    entry.composerBounds = await composerVisible();
    entry.horizontalOverflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth);
    assert(entry.horizontalOverflow <= 0, id + ": horizontal overflow");
    assert(await page.locator(".relay-floating-panel:visible").count() <= 1, "Panels must be exclusive");
    const filename = id + ".png";
    await page.screenshot({ path: path.join(output, filename), fullPage: false });
    audit.screenshots.push({ caseId: id, file: filename, sha256: digest(fs.readFileSync(path.join(output, filename))) });
    entry.status = "passed"; entry.completedAt = new Date().toISOString(); persist();
  };
  const dragPort = async (from, fromPort, to, toPort) => {
    await closePanels();
    await page.locator('[data-node="' + from + '"]').hover();
    const outputPort = page.locator('[data-port-node="' + from + '"][data-port-id="' + fromPort + '"][data-direction="outputs"] i');
    const inputPort = page.locator('[data-port-node="' + to + '"][data-port-id="' + toPort + '"][data-direction="inputs"] i');
    const start = await outputPort.boundingBox(); const end = await inputPort.boundingBox();
    assert(start && end);
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + 15, start.y + 15, { steps: 3 });
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 15 });
    await page.mouse.up();
  };

  await runCase("01-empty-first-use", async () => {
    await page.locator("#relay-composer").waitFor();
    assert.equal(await page.locator(".relay-card").count(), 0);
    assert.equal(await page.locator(".relay-floating-panel:visible").count(), 0);
    assert.equal(await page.locator(".relay-primary:visible").count(), 1);
    assert.equal(await page.locator(".relay-primary:visible").textContent(), "生成流程");
    assert(await page.locator("#relay-empty").isVisible());
    assert.match(await page.locator("#relay-empty").textContent(), /下方描述.*资料.*结果/);
    assert.deepEqual(await page.locator(".relay-board").boundingBox(), { x: 0, y: 0, width: 1440, height: 1000 });
    return { empty: true, initialAction: "生成流程", humanTenSecondReview: "pending" };
  });

  await runCase("02-cancel-generation", async () => {
    await send("我提供商品资料，希望生成一个视频并交付。");
    await page.locator("#relay-cancel-job").click();
    await page.waitForTimeout(750);
    assert.equal(await page.locator(".relay-card").count(), 0);
    assert(!(await page.locator("#relay-chat-input").isDisabled()));
    return { cancelled: true, lateGenerationApplied: false };
  });

  await runCase("03-video-generation", async () => {
    await page.locator("#relay-example").click();
    await page.locator("#relay-chat-send").click();
    await waitForCards(13); await page.locator("#relay-fit").click();
    assert.equal(await page.locator('.relay-card[data-kind="ai"]').count(), 10);
    assert.equal(await page.locator('.relay-card[data-kind="sign"]').count(), 3);
    await page.waitForFunction(() => document.querySelectorAll("#relay-edges path[data-edge]").length === 12);
    assert(await page.locator("#relay-migration").isVisible());
    assert.equal(await page.locator(".relay-primary:visible").textContent(), "检查流程");
    const snapshot = await save();
    assert.equal(snapshot.graph.ui.generationMode, "deterministic_mock");
    assert.equal(snapshot.runnable, false);
    const cardBounds = await page.locator(".relay-card").evaluateAll((cards) => cards.map((card) => { const bounds = card.getBoundingClientRect(); return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }; }));
    assert(cardBounds.every((bounds) => bounds.left >= 90 && bounds.right <= 1350 && bounds.top >= 85 && bounds.bottom < 685), "Cards must fit above composer and floating tools");
    return { nodes: 13, ai: 10, sign: 3, edges: snapshot.graph.edges.length, cardBounds };
  });

  await runCase("04-business-drawer", async () => {
    await selectNode("01.1-V02");
    assert.match(await page.locator("#relay-scope-label").textContent(), /生成脚本/);
    assert(await page.locator("#relay-edit-in-chat").isVisible());
    assert.equal(await page.locator('#relay-inspector [name="exec_model"]').count(), 0);
    assert.equal(await page.locator("#relay-stage-form").count(), 0);
    const drawer = await page.locator("#relay-inspector-panel").boundingBox();
    assert.equal(drawer.width, 400);
    return { businessFirst: true, scope: "01.1-V02", drawer };
  });

  let beforeProposal;
  await runCase("05-change-preview", async () => {
    beforeProposal = (await save()).graph;
    await send("处理说明改为只使用用户确认过的商品事实，缺少资料先提醒。");
    assert(await page.locator("#relay-apply-proposal").isVisible());
    assert.match(await page.locator("#relay-proposal").textContent(), /仅更新/);
    assert.deepEqual((await save()).graph, beforeProposal);
    return { mutationBeforeConfirmation: false, scopedNode: "01.1-V02" };
  });

  await runCase("06-apply-undo-scope", async () => {
    await apply();
    const after = (await save()).graph;
    assert.match(after.nodes[1].prompts.p2, /用户确认/);
    assert.deepEqual(after.nodes.filter((node) => node.id !== "01.1-V02"), beforeProposal.nodes.filter((node) => node.id !== "01.1-V02"));
    assert.deepEqual(after.edges, beforeProposal.edges);
    await page.locator("#relay-undo").click();
    assert.deepEqual((await save()).graph, beforeProposal);
    await selectNode("01.1-V02"); await page.locator("#relay-clear-scope").click();
    assert.equal(await page.locator("#relay-scope-label").textContent(), "整个流程");
    assert.equal(await page.locator(".relay-floating-panel:visible").count(), 0);
    return { appliedOnlyToSelected: true, undone: true, restoredFlowScope: true };
  });

  await runCase("07-five-editable-stages", async () => {
    await advanced("01.1-V02");
    assert.equal(await page.locator("[data-stage]").count(), 5);
    assert.equal((await page.locator("#relay-inspector-panel").boundingBox()).width, 480);
    for (const stage of ["input", "check", "execute", "review", "output"]) {
      await page.locator('[data-stage="' + stage + '"]').click();
      assert.equal(await page.locator("#relay-stage-form").count(), 1);
      await page.locator('[name="stage_action"]').fill("QA " + stage + "：按已确认事实处理");
      await page.locator('[name="stage_input"]').fill("用户确认的样例资料");
      await page.locator('[name="stage_outputFormat"]').fill("JSON");
      await page.locator('[name="stage_onFailure"]').selectOption("block");
      await composerVisible();
    }
    const node = (await save()).graph.nodes[1];
    for (const stage of ["input", "check", "execute", "review", "output"]) assert.match(node.params.editorStages[stage].action, /^QA/);
    await page.locator("#relay-advanced-save").click();
    assert.equal(await page.locator("#relay-inspector-panel").isVisible(), false);
    return { editableStages: 5, saved: true };
  });

  await runCase("08-human-and-system-port-lock", async () => {
    await advanced("01.1-H02"); await page.locator('[data-stage="execute"]').click();
    assert.deepEqual(await page.locator('[name="stage_executor"] option').evaluateAll((items) => items.map((entry) => entry.value)), ["human"]);
    await page.locator('[data-stage="review"]').click();
    assert.deepEqual(await page.locator('[name="stage_executor"] option').evaluateAll((items) => items.map((entry) => entry.value)), ["approval_validator"]);
    await page.locator("#relay-inspector summary").filter({ hasText: "输入、输出与连线" }).click();
    await page.locator('[data-edit-port="content"]').click();
    assert.equal(await page.locator("#relay-delete-port").count(), 0);
    assert.equal(await page.locator('[name="port_type"]').count(), 0);
    await page.locator("#relay-dialog-close").click();
    return { humanExecute: "human", humanReview: "approval_validator", systemDeletionOffered: false };
  });

  await runCase("09-validation-blocked", async () => {
    await closePanels(); await page.locator("#relay-simulate").click();
    assert.equal(await page.locator("#relay-dialog-title").textContent(), "需要补充");
    assert.match(await page.locator("#relay-dialog-body").textContent(), /没有执行任何步骤/);
    assert.equal(await page.locator("[data-sim-status]").count(), 0);
    await page.locator('[data-resolve-node="01.1-H02"]').first().click();
    assert(await page.locator("#relay-inspector-panel").isVisible());
    return { simulationBlockedBeforeStart: true, issueTargetsNode: true };
  });

  await runCase("10-save-reload-new-protection", async () => {
    await closePanels(); const before = await save();
    await page.reload({ waitUntil: "load" }); await waitForCards(13);
    assert.deepEqual((await save()).graph, before.graph);
    assert.equal((await readSaved()).executionEvidence, "not_run");
    await page.locator("#relay-new").click();
    assert(await page.locator("#relay-keep-edits").isVisible());
    await page.locator("#relay-keep-edits").click();
    assert.deepEqual((await save()).graph, before.graph);
    return { fullSnapshotRestored: true, newDraftRequiresChoice: true };
  });

  await runCase("11-manual-drag-and-move", async () => {
    await reset(); await page.locator("#relay-manual").click();
    const dragResource = async (kind, point) => {
      await closePanels();
      await page.locator('.relay-rail [data-open-panel="' + categoryOf(kind) + '"]').click();
      await page.locator('[data-drag-kind="' + kind + '"]:not([data-preset])').dragTo(page.locator("#relay-scroll"), { targetPosition: point });
    };
    await dragResource("text", { x: 430, y: 230 });
    await dragResource("ai", { x: 900, y: 420 });
    const before = (await save()).graph;
    assert.equal(before.nodes.length, 2);
    await closePanels();
    const handle = page.locator('[data-drag-node="' + before.nodes[0].id + '"]');
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + 30, box.y + 10); await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 75, { steps: 10 }); await page.mouse.up();
    const after = (await save()).graph;
    assert.notEqual(after.nodes[0].x, before.nodes[0].x);
    assert.deepEqual(after.edges, before.edges);
    return { resourceDragAdded: 2, nodeMoveChangedPosition: true };
  });

  await runCase("12-port-drag-type-rejection", async () => {
    const before = (await save()).graph;
    const text = before.nodes.find((node) => node.kind === "text");
    const ai = before.nodes.find((node) => node.kind === "ai");
    await dragPort(text.id, "out", ai.id, "material");
    const linked = (await save()).graph;
    assert(linked.edges.some((edge) => edge.from === text.id && edge.fromPort === "out" && edge.to === ai.id && edge.toPort === "material"));
    await addKind("image");
    const withImage = (await save()).graph;
    await page.locator("#relay-layout").click(); await page.locator("#relay-fit").click();
    await dragPort(withImage.nodes.at(-1).id, "out", ai.id, "material");
    assert.match(await page.locator("#relay-notice").textContent(), /类型不匹配/);
    assert.equal((await save()).graph.edges.length, linked.edges.length);
    return { portBoundConnection: true, incompatibleImageRejected: true };
  });

  await runCase("13-nine-kinds-and-template", async () => {
    const existing = new Set((await save()).graph.nodes.map((node) => node.kind));
    for (const kind of kinds.filter((kind) => !existing.has(kind))) await addKind(kind);
    const graph = (await save()).graph;
    assert.deepEqual([...new Set(graph.nodes.map((node) => node.kind))].sort(), [...kinds].sort());
    const text = graph.nodes.find((node) => node.kind === "text");
    await page.locator("#relay-layout").click(); await page.locator("#relay-fit").click();
    await selectNode(text.id); await page.locator("#relay-save-template").click();
    await closePanels(); await page.locator('[data-open-panel="templates"]').click();
    await page.locator('[data-insert-template="0"]').click();
    const inserted = (await save()).graph.nodes.at(-1);
    assert.notEqual(inserted.id, text.id);
    assert.equal(inserted.outputs[0].id, "out");
    assert.equal(inserted.outputs[0].locked, true);
    return { kinds: 9, stableTemplateSystemPort: inserted.outputs[0].id };
  });

  await runCase("14-generic-flow-and-synthetic-human", async () => {
    await reset();
    await send("我提供会议记录，希望整理成文字纪要并输出行动清单。");
    await waitForCards(4);
    await selectNode("review"); await send("审核人：qa-reviewer-reference-only"); await apply();
    await closePanels(); await page.locator("#relay-check").click();
    assert.equal(await page.locator("#relay-dialog-title").textContent(), "可以继续");
    await page.locator("#relay-dialog-close").click();
    await page.locator("#relay-simulate").click();
    await page.locator('[data-sim-decision="approved"]').waitFor();
    assert.equal(await page.locator('[data-sim-node="delivery"]').getAttribute("data-sim-status"), "pending");
    await page.locator('[data-sim-decision="approved"]').click();
    await page.waitForFunction(() => document.querySelector("#relay-simulation-results").textContent.includes("模拟完成"));
    assert.equal(await page.locator('[data-sim-status="passed"]').count(), 4);
    const snapshot = await save();
    assert.equal(snapshot.executionEvidence, "not_run");
    assert.equal(snapshot.graph.nodes[2].gate.humanDecision, undefined);
    return { syntheticSteps: 4, explicitMockHuman: true, realDecisionWritten: false };
  });

  await runCase("15-failure-stops-downstream", async () => {
    await advanced("process"); await revealTechnical();
    await page.locator('[name="simulation_scenario"]').selectOption("failure");
    await page.locator("#relay-advanced-save").click();
    await page.locator("#relay-simulate").click();
    await page.locator('[data-sim-node="process"][data-sim-status="failed"]').waitFor();
    assert.equal(await page.locator('[data-sim-node="review"]').getAttribute("data-sim-status"), "not_started");
    assert.equal(await page.locator('[data-sim-node="delivery"]').getAttribute("data-sim-status"), "not_started");
    assert.match(await page.locator('[data-sim-node="process"]').textContent(), /流程停在这里/);
    return { failedAt: "process", downstreamNotStarted: ["review", "delivery"] };
  });

  await runCase("16-simulation-cancel", async () => {
    await closePanels(); await page.locator("#relay-simulate").click();
    await page.locator("#relay-cancel-job").click();
    await page.waitForTimeout(800);
    assert.match(await page.locator("#relay-simulation-results").textContent(), /已取消/);
    assert.equal(await page.locator('[data-sim-status="passed"]').count(), 0);
    return { cancellationPersistedInView: true, lateSuccesses: 0 };
  });

  await runCase("17-attachment-metadata-and-flow-scope", async () => {
    await closePanels(); await page.locator("#relay-clear-scope").isVisible().then(async (visible) => { if (visible) await page.locator("#relay-clear-scope").click(); });
    await page.locator("#relay-attachment-input").setInputFiles({ name: "synthetic-notes.txt", mimeType: "text/plain", buffer: Buffer.from("synthetic fixture, not customer data") });
    assert.match(await page.locator("#relay-attachments").textContent(), /仅记录名称/);
    await send("名称改为会议纪要草稿"); await apply();
    const snapshot = await save();
    assert.equal(snapshot.graph.name, "会议纪要草稿");
    assert.equal(snapshot.attachments[0].status, "metadata_only_not_uploaded");
    assert.equal(snapshot.graph.ui.referenceAttachments[0].name, "synthetic-notes.txt");
    return { metadataOnly: true, wholeFlowScope: true, uploaded: false };
  });
}

async function main() {
  const destination = path.join(__dirname, "qa", "workflow-dialog-v1.0");
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
    const referenceFile = "v4-authorized-materials/relay-canvas-simple-ui@20261019.html";
    const referenceBytes = fs.readFileSync(path.join(repository, referenceFile));
    const referenceHash = digest(referenceBytes);
    assert.equal(referenceHash, "2ead8b825c27ab0dcb13630effe01359a09d1477e3687f2c7424093bd7b23813", "Visual reference must match the owner's approved HTML");
    const referencePage = await context.newPage();
    await referencePage.setContent(referenceBytes.toString("utf8"), { waitUntil: "load" });
    const referenceScreenshot = "00-owner-reference-1440.png";
    await referencePage.screenshot({ path: path.join(output, referenceScreenshot), fullPage: false });
    audit.visualReference = { file: referenceFile, sha256: referenceHash, screenshot: referenceScreenshot, screenshotSha256: digest(fs.readFileSync(path.join(output, referenceScreenshot))) };
    await referencePage.close();
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
