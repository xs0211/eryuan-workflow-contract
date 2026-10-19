const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const BASE_URL = process.env.PROTOTYPE_URL || "http://127.0.0.1:4174/";
const OUT_DIR = process.env.QA_OUT_DIR || path.join(__dirname, "qa");

async function assertNoPageErrors(page, errors) {
  if (errors.length) {
    throw new Error(`Page errors:\n${errors.join("\n")}`);
  }
}

async function desktopFlow(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`desktop: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`desktop console: ${message.text()}`);
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#new-flow-modal.open").waitFor();
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-01-prompt.png"), fullPage: true });

  await page.locator("#generate-button").click();
  await page.waitForFunction(() => !document.querySelector("#new-flow-modal")?.classList.contains("open"));
  await page.waitForTimeout(400);
  await page.locator(".flow-node").first().waitFor();
  const conversionAudit = await page.evaluate(() => {
    const edge = (overrides) => ({
      id: "TEST",
      from: { atomId: "01.1-V02", portId: "scriptProposal" },
      to: { atomId: "01.1-H02", portId: "scriptProposal" },
      type: "artifact",
      cardinality: "one",
      transform: "identity",
      ...overrides,
    });
    const sourceAtom = getAtom("01.1-V05");
    sourceAtom.outputs.push(port("testMultiOutput", "测试多值输出", "ShotImage@1.0.0", "one_or_more", false, "human_added"));
    const targetAtom = getAtom("01.1-V10");
    targetAtom.inputs.push(port("testSingle", "测试单值输入", "ShotImage@1.0.0", "one", true, "human_added"));
    const multipleSourceToOne = validateEdgeDefinition(edge({
      id: "TEST-MULTI-SOURCE",
      from: { atomId: "01.1-V05", portId: "testMultiOutput" },
      to: { atomId: "01.1-V10", portId: "testSingle" },
      transform: "identity",
    }));
    sourceAtom.outputs = sourceAtom.outputs.filter((item) => item.portId !== "testMultiOutput");
    targetAtom.inputs = targetAtom.inputs.filter((item) => item.portId !== "testSingle");

    const requiredAtom = getAtom("01.1-V02");
    requiredAtom.inputs.push(port("testRequired", "未绑定必填输入", "DocumentAsset@1.0.0", "one", true, "human_added"));
    const requiredInputErrors = validateRequiredInputBindings();
    requiredAtom.inputs = requiredAtom.inputs.filter((item) => item.portId !== "testRequired");

    const sixEdgesToOne = Array.from({ length: 6 }, (_, index) => ({
      ...edgeDefinitions.find((item) => item.id === "E08"),
      id: `TEST-SIX-${index + 1}`,
    }));
    return {
      validIdentity: validateEdgeDefinition(edge({})),
      unknownTransform: validateEdgeDefinition(edge({ transform: "unknown_transform" })),
      wrongHumanSource: validateEdgeDefinition(edge({
        to: { atomId: "01.1-V03", portId: "approvedScript" },
        transform: "validated_human_decision",
      })),
      multiToOne: validateEdgeDefinition(edge({
        from: { atomId: "01.1-V04", portId: "shotImage" },
        to: { atomId: "01.1-V05", portId: "shotImages" },
        cardinality: "one",
        transform: "collect_six_unique_shot_images",
        identityKey: "shotId",
      })),
      missingIdentityKey: validateEdgeDefinition(edge({
        from: { atomId: "01.1-V04", portId: "shotImage" },
        to: { atomId: "01.1-V05", portId: "shotImages" },
        cardinality: "fan_in_6",
        transform: "collect_six_unique_shot_images",
      })),
      shotIndexIdentity: validateEdgeDefinition(edge({
        id: "TEST-SHOT-INDEX",
        from: { atomId: "01.1-V04", portId: "shotImage" },
        to: { atomId: "01.1-V05", portId: "shotImages" },
        cardinality: "fan_in_6",
        transform: "collect_six_unique_shot_images",
        identityKey: "shotIndex",
      })),
      missingOnePerShotIdentity: validateEdgeDefinition({
        ...edgeDefinitions.find((item) => item.id === "E08"),
        identityKey: undefined,
      }),
      multipleSourceToOne,
      sixToOneErrors: validateConnectionTopology(sixEdgesToOne),
      requiredInputErrors,
      onePerShot: validateEdgeDefinition(edgeDefinitions.find((item) => item.id === "E08")),
      storyboardDependency: validateEdgeDefinition(dependencyEdges.find((item) => item.id === "D02")),
      approvalDependency: validateEdgeDefinition(dependencyEdges.find((item) => item.id === "D03")),
    };
  });
  if (conversionAudit.validIdentity !== null) throw new Error(`Valid identity edge failed: ${conversionAudit.validIdentity}`);
  if (!conversionAudit.unknownTransform?.includes("未注册")) throw new Error("Unknown transform was not rejected");
  if (!conversionAudit.wrongHumanSource?.includes("源 Schema")) throw new Error("Wrong HumanDecision source was not rejected");
  if (!conversionAudit.multiToOne?.includes("数量语义")) throw new Error("Multi-value to one was not rejected");
  if (!conversionAudit.missingIdentityKey?.includes("identityKey")) throw new Error("Missing identityKey was not rejected");
  if (!conversionAudit.shotIndexIdentity?.includes("稳定键")) throw new Error("shotIndex was accepted as an unstable identity key");
  if (!conversionAudit.missingOnePerShotIdentity?.includes("identityKey")) throw new Error("one_per_shot without identityKey was accepted");
  if (!conversionAudit.multipleSourceToOne?.includes("多值源端口")) throw new Error("A multi-value source was accepted as one value");
  if (!conversionAudit.sixToOneErrors.some((error) => error.includes("单值输入"))) throw new Error("Six connections into one single-value port were accepted");
  if (!conversionAudit.requiredInputErrors.some((error) => error.includes("testRequired"))) throw new Error("Unbound required input was not reported");
  if (conversionAudit.onePerShot !== null || conversionAudit.storyboardDependency !== null || conversionAudit.approvalDependency !== null) {
    throw new Error(`Expected mappings failed: ${JSON.stringify(conversionAudit)}`);
  }
  const approvalAudit = await page.evaluate(() => {
    const identity = {
      artifactId: "frozen-001",
      artifactType: "FrozenContentPackageCandidate",
      artifactVersion: "1.0.0",
      artifactHash: "sha256:candidate",
    };
    const candidate = { ...identity, manifestHash: "sha256:manifest", status: "published" };
    const decision = {
      humanDecision: "approved",
      decisionTransactionId: "decision-001",
      reviewedArtifact: identity,
      invalidatedAt: null,
      validation: { valid: true },
    };
    return {
      approved: deriveApprovedContentPackage(getAtom("01.1-H05"), decision, candidate),
      returned: deriveApprovedContentPackage(getAtom("01.1-H05"), { ...decision, humanDecision: "returned" }, candidate),
      invalid: deriveApprovedContentPackage(getAtom("01.1-H05"), { ...decision, validation: { valid: false } }, candidate),
      stale: deriveApprovedContentPackage(getAtom("01.1-H05"), { ...decision, invalidatedAt: "2026-10-19T00:00:00Z" }, candidate),
      mismatch: deriveApprovedContentPackage(getAtom("01.1-H05"), decision, { ...candidate, artifactHash: "sha256:other" }),
      auditOnly: deriveApprovedContentPackage(getAtom("01.1-H05"), decision, { ...candidate, status: "audit_only" }),
      wrongType: (() => {
        const wrongIdentity = { ...identity, artifactType: "ShotVideo" };
        return deriveApprovedContentPackage(getAtom("01.1-H05"), {
          ...decision,
          reviewedArtifact: wrongIdentity,
        }, { ...candidate, ...wrongIdentity });
      })(),
    };
  });
  const approvedPackage = approvalAudit.approved.approvedPackage;
  if (approvalAudit.approved.status !== "ready"
    || approvedPackage?.schemaRef !== "ApprovedContentPackage@1.0.0"
    || approvedPackage.artifactIdentity.artifactType !== "ApprovedContentPackage"
    || approvedPackage.artifactIdentity.artifactId === approvedPackage.sourceCandidate.artifactId
    || approvedPackage.artifactIdentity.artifactHash === approvedPackage.sourceCandidate.artifactHash) {
    throw new Error(`Valid H05 approval did not derive an approved package: ${JSON.stringify(approvalAudit)}`);
  }
  for (const reason of [
    "decision_not_approved",
    "decision_not_validated",
    "decision_invalidated",
    "candidate_identity_mismatch",
    "candidate_not_published",
    "candidate_type_mismatch",
  ]) {
    if (!Object.values(approvalAudit).some((result) => result.status === "blocked" && result.reason === reason && result.approvedPackage === null)) {
      throw new Error(`H05 negative case was not blocked as ${reason}: ${JSON.stringify(approvalAudit)}`);
    }
  }
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-02-canvas.png"), fullPage: true });

  await page.locator('.flow-node[data-atom-id="01.1-V02"]').click();
  await page.locator("#inspector:not(.hidden)").waitFor();
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-03-inspector.png"), fullPage: true });

  const simpleViewAudit = await page.evaluate(() => ({
    nodeIdLabels: document.querySelectorAll(".flow-node .node-id").length,
    description: document.querySelector(".node-description")?.textContent || "",
    instruction: document.querySelector("[data-node-instruction]")?.value || "",
    params: document.querySelectorAll("[data-node-param]").length,
    technicalOpen: [...document.querySelectorAll("#inspector-body .technical-details")].some((item) => item.open),
    visibleInspectorText: document.querySelector("#inspector-body")?.innerText || "",
  }));
  if (simpleViewAudit.nodeIdLabels !== 0
    || !simpleViewAudit.description
    || !simpleViewAudit.instruction
    || simpleViewAudit.params < 3
    || simpleViewAudit.technicalOpen
    || /Schema|HumanDecision|ShotImage@|ApprovedContentPackage/.test(simpleViewAudit.visibleInspectorText)) {
    throw new Error(`Simple node view is not business-readable: ${JSON.stringify(simpleViewAudit)}`);
  }

  await page.locator("[data-node-instruction]").fill(
    "输入改为 已确认排期、商品资料、主播照片。输出改为 视频脚本、镜头清单。能力改为 文案生成、图片理解。执行模型改为 审稿助手。"
  );
  await page.locator("[data-apply-node-config]").click();
  const inlineEditAudit = await page.evaluate(() => ({
    inputs: getAtom("01.1-V02").inputs.map((item) => item.label),
    outputs: getAtom("01.1-V02").outputs.map((item) => item.label),
    capabilities: getAtom("01.1-V02").capabilities,
    model: getAtom("01.1-V02").modules.execute.model,
    manual: state.hasManualEdits,
  }));
  if (inlineEditAudit.inputs.join("|") !== "已确认排期|商品资料|主播照片"
    || inlineEditAudit.outputs.join("|") !== "视频脚本|镜头清单"
    || inlineEditAudit.capabilities.join("|") !== "文案生成|图片理解"
    || inlineEditAudit.model !== "审稿助手"
    || inlineEditAudit.manual !== true) {
    throw new Error(`Inline natural-language editing failed: ${JSON.stringify(inlineEditAudit)}`);
  }
  await page.locator("#undo-button").click();
  const inlineUndoAudit = await page.evaluate(() => ({
    instruction: getAtom("01.1-V02").instruction,
    inputs: getAtom("01.1-V02").inputs.map((item) => item.label),
    capabilities: getAtom("01.1-V02").capabilities,
    model: getAtom("01.1-V02").modules.execute.model,
  }));
  if (inlineUndoAudit.instruction.includes("输入改为")
    || inlineUndoAudit.inputs.includes("已确认排期")
    || inlineUndoAudit.capabilities.includes("文案生成")
    || inlineUndoAudit.model === "审稿助手") {
    throw new Error(`Inline edit undo did not restore data: ${JSON.stringify(inlineUndoAudit)}`);
  }

  await page.locator("[data-test-node]").click();
  await page.waitForFunction(() => {
    const result = state.runResults["01.1-V02"];
    return result?.status === "success" && state.runInProgress === false;
  });
  const atomRunAudit = await page.evaluate(() => ({
    status: state.runResults["01.1-V02"]?.status,
    consoleOpen: !document.querySelector("#run-console")?.classList.contains("hidden"),
    consoleText: document.querySelector("#run-console")?.innerText || "",
    nodeLabel: document.querySelector('.flow-node[data-atom-id="01.1-V02"] .node-run-label')?.textContent,
  }));
  if (atomRunAudit.status !== "success"
    || !atomRunAudit.consoleOpen
    || !atomRunAudit.consoleText.includes("真实模型")
    || !atomRunAudit.consoleText.includes("0")
    || atomRunAudit.nodeLabel !== "演示通过") {
    throw new Error(`Atom dry-run failed: ${JSON.stringify(atomRunAudit)}`);
  }
  await page.locator("#close-run-console").click();

  await page.locator("#close-inspector").click();
  await page.locator("#flow-chat-toggle").click();
  await page.locator("#flow-chat-panel.open").waitFor();
  await page.locator("#flow-chat-input").fill("停用旁白检测");
  await page.locator('#flow-chat-form button[type="submit"]').click();
  await page.waitForFunction(() => getAtom("01.1-V08")?.disabled === true);
  const chatDisableAudit = await page.evaluate(() => ({
    disabled: getAtom("01.1-V08").disabled,
    manual: state.hasManualEdits,
    message: [...document.querySelectorAll(".chat-message")].at(-1)?.textContent || "",
  }));
  if (!chatDisableAudit.disabled || !chatDisableAudit.manual || !chatDisableAudit.message.includes("停用")) {
    throw new Error(`Flow chat did not disable named node: ${JSON.stringify(chatDisableAudit)}`);
  }

  await page.locator("#run-button").click();
  await page.waitForFunction(() => !state.runInProgress && state.runResults["01.1-V10"]?.status === "skipped");
  const blockedFlowAudit = await page.evaluate(() => ({
    v08: state.runResults["01.1-V08"]?.status,
    v09: state.runResults["01.1-V09"]?.status,
    v10: state.runResults["01.1-V10"]?.status,
    consoleText: document.querySelector("#run-console")?.innerText || "",
  }));
  if (blockedFlowAudit.v08 !== "blocked"
    || blockedFlowAudit.v09 !== "skipped"
    || blockedFlowAudit.v10 !== "skipped"
    || !blockedFlowAudit.consoleText.includes("真实模型、媒体和业务调用均为 0")) {
    throw new Error(`Flow dry-run did not fail closed: ${JSON.stringify(blockedFlowAudit)}`);
  }

  await page.locator("#close-run-console").click();
  await page.locator("#flow-chat-input").fill("启用旁白检测");
  await page.locator('#flow-chat-form button[type="submit"]').click();
  await page.waitForFunction(() => getAtom("01.1-V08")?.disabled === false);
  await page.locator("#chat-scope-select").selectOption("01.1-V02");
  await page.locator("#flow-chat-input").fill("把当前节点模型改为 文本执行 Agent");
  await page.locator('#flow-chat-form button[type="submit"]').click();
  await page.waitForFunction(() => getAtom("01.1-V02")?.modules.execute.model === "文本执行 Agent");
  const nodeChatAudit = await page.evaluate(() => ({
    scope: state.chatScope,
    model: getAtom("01.1-V02").modules.execute.model,
    selected: state.selectedId,
    message: [...document.querySelectorAll(".chat-message")].at(-1)?.textContent || "",
  }));
  if (nodeChatAudit.scope !== "01.1-V02"
    || nodeChatAudit.model !== "文本执行 Agent"
    || nodeChatAudit.selected !== "01.1-V02"
    || !nodeChatAudit.message.includes("执行模型")) {
    throw new Error(`Node-scoped chat edit failed: ${JSON.stringify(nodeChatAudit)}`);
  }
  await page.locator("#undo-button").click();
  await page.locator("#close-flow-chat").click();

  await page.locator("#run-button").click();
  await page.waitForFunction(() => {
    const results = Object.values(state.runResults);
    return !state.runInProgress
      && results.length === 13
      && results.every((result) => result.status === "success");
  });
  const completeFlowAudit = await page.evaluate(() => ({
    statuses: Object.values(state.runResults).map((result) => result.status),
    title: document.querySelector("#run-console-status")?.textContent || "",
    total: document.querySelector("#run-console-progress")?.textContent || "",
  }));
  if (completeFlowAudit.statuses.length !== 13
    || completeFlowAudit.statuses.some((status) => status !== "success")
    || !completeFlowAudit.title.includes("真实模型、媒体和业务调用均为 0")
    || completeFlowAudit.total !== "13 / 13") {
    throw new Error(`Complete flow dry-run failed: ${JSON.stringify(completeFlowAudit)}`);
  }
  await page.locator("#close-run-console").click();

  await page.locator('[data-add-port="output"]').click();
  await page.locator(".port-dialog").waitFor();
  await page.locator("#port-label").fill("角色参考图");
  await page.locator('[data-cancel-port]').click();

  await page.locator('[data-inspector-tab="advanced"]').click();
  await page.locator(".module.open").waitFor();
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-04-advanced.png"), fullPage: true });

  await page.locator('.flow-node[data-atom-id="01.1-H02"]').click();
  await page.locator('[data-inspector-tab="advanced"]').click();
  const humanModuleExecutors = await page.evaluate(() => ({
    execute: document.querySelector('[data-executor-module="execute"]')?.value,
    review: document.querySelector('[data-executor-module="review"]')?.value,
  }));
  if (humanModuleExecutors.execute !== "指定真人审核人") {
    throw new Error(`H02 execute must use human reviewer: ${JSON.stringify(humanModuleExecutors)}`);
  }
  if (humanModuleExecutors.review !== "平台审批校验器") {
    throw new Error(`H02 review must use platform validator: ${JSON.stringify(humanModuleExecutors)}`);
  }
  await page.locator('[data-module-toggle="review"]').click();
  await page.locator('[data-module="review"] .technical-details summary').click();
  await page.locator('[data-executor-module="review"]').selectOption("规则审核器");
  await page.evaluate(() => renderInspector());
  await page.locator('[data-module-toggle="review"]').click();
  await page.locator('[data-module="review"] .technical-details summary').click();
  const platformReviewerOption = page.locator('[data-executor-module="review"] option[value="平台审批校验器"]');
  if (await platformReviewerOption.count() !== 1) {
    throw new Error("Platform approval validator disappeared after reopening Human review configuration");
  }
  await page.locator('[data-executor-module="review"]').selectOption("平台审批校验器");

  await page.locator('[data-view-mode="matrix"]').click();
  await page.locator("#matrix-body tr").first().waitFor();
  const matrixRows = await page.locator("#matrix-body tr").count();
  if (matrixRows !== 13) throw new Error(`Expected 13 matrix rows, got ${matrixRows}`);
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-05-matrix.png"), fullPage: true });
  const stateAudit = await page.evaluate(() => {
    const oldPlanHash = createValidationReport().planHash;
    const originalName = getAtom("01.1-V02").name;
    getAtom("01.1-V02").name = "生成脚本方案-刷新验证";
    markUnsaved();
    const newPlanHash = createValidationReport().planHash;
    const refreshedText = $('tr[data-atom-id="01.1-V02"] strong')?.textContent;
    getAtom("01.1-V02").name = originalName;

    state.resourceCategory = "material";
    state.selectedId = "01.1-V02";
    addResource(0);
    addResource(0);
    const addedIds = state.atoms.filter((atom) => atom.id.startsWith("DRAFT-")).map((atom) => atom.id);
    state.atoms = state.atoms.filter((atom) => !atom.id.startsWith("DRAFT-"));
    state.selectedId = "01.1-V02";
    closeOverlays();
    renderCanvas();
    renderMatrix();
    renderInspector();
    markUnsaved();
    return { refreshedText, addedIds, oldPlanHash, newPlanHash };
  });
  if (stateAudit.refreshedText !== "生成脚本方案-刷新验证") {
    throw new Error(`Matrix did not refresh after edit: ${JSON.stringify(stateAudit)}`);
  }
  if (stateAudit.addedIds.length !== 2 || new Set(stateAudit.addedIds).size !== 2) {
    throw new Error(`Draft atom IDs collided: ${JSON.stringify(stateAudit)}`);
  }
  if (stateAudit.oldPlanHash === stateAudit.newPlanHash) {
    throw new Error(`Edit did not change the plan hash: ${JSON.stringify(stateAudit)}`);
  }
  const reportBindingAudit = await page.evaluate(() => {
    const before = createValidationReport();
    conversionDefinitions.identity.cardinalities.push("fan_in_6");
    const after = createValidationReport();
    conversionDefinitions.identity.cardinalities.pop();

    state.saved = true;
    state.validationReport = after;
    updateDraftStatus(true);
    const input = document.querySelector("#prompt-input");
    const originalPrompt = input.value;
    input.value = `${originalPrompt} 补充测试`;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const promptInvalidation = {
      saved: state.saved,
      report: state.validationReport,
      status: document.querySelector("#draft-status").textContent,
    };
    input.value = originalPrompt;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return {
      before,
      after,
      promptInvalidation,
    };
  });
  if (reportBindingAudit.before.planHash === reportBindingAudit.after.planHash
    || reportBindingAudit.before.effectiveConfigHash === reportBindingAudit.after.effectiveConfigHash) {
    throw new Error(`Conversion registry edits did not change bound hashes: ${JSON.stringify(reportBindingAudit)}`);
  }
  if (reportBindingAudit.promptInvalidation.saved
    || reportBindingAudit.promptInvalidation.report !== null
    || !reportBindingAudit.promptInvalidation.status.includes("待确认")) {
    throw new Error(`Prompt edit did not invalidate saved state/report: ${JSON.stringify(reportBindingAudit)}`);
  }

  await page.locator("#validation-button").click();
  await page.locator("#validation-panel.open").waitFor();
  await page.waitForTimeout(250);
  const validationCount = await page.locator(".validation-item").count();
  if (validationCount < 6) throw new Error(`Expected validation items, got ${validationCount}`);
  await page.screenshot({ path: path.join(OUT_DIR, "desktop-06-validation.png"), fullPage: true });

  await page.keyboard.press("Escape");
  await page.locator('[data-view-mode="canvas"]').click();
  const snapshotProbe = await page.evaluate(() => {
    getAtom("01.1-V02").outputs.push({
      portId: "restoreProbe",
      label: "存档恢复探针",
      schemaRef: "ArtifactReference@1.0.0",
      cardinality: "zero_or_one",
      required: false,
      origin: "qa_probe",
    });
    edgeDefinitions[0].snapshotProbe = "edge";
    dependencyEdges[0].snapshotProbe = "dependency";
    externalInputBindings[0].snapshotProbe = "binding";
    markUnsaved();
    return {
      atoms: state.atoms.length,
      edgeProbe: edgeDefinitions[0].snapshotProbe,
      dependencyProbe: dependencyEdges[0].snapshotProbe,
      bindingProbe: externalInputBindings[0].snapshotProbe,
    };
  });
  await page.locator("#save-button").click();
  const savedDraft = await page.evaluate(() => JSON.parse(localStorage.getItem("eryuan-flow-studio-draft-v1")));
  const saved = savedDraft?.executionReadiness;
  if (saved !== "not_run") throw new Error(`Unexpected saved execution readiness: ${saved}`);
  for (const field of ["intentHash", "planHash", "effectiveConfigHash"]) {
    if (!savedDraft?.[field]?.startsWith("prototype-fnv1a64:")) {
      throw new Error(`Missing report binding ${field}`);
    }
  }
  if (savedDraft?.validationReport?.nonSecurityHash !== true || savedDraft?.validationReport?.runnable !== false) {
    throw new Error("Validation report boundary is not explicit");
  }
  if (savedDraft?.validationReport?.hashAlgorithm !== "prototype-fnv1a64-design-only") {
    throw new Error("Validation report hash mode is not explicit");
  }
  if (savedDraft?.validationReport?.validationItems?.some(([status]) => status === "passed")) {
    throw new Error("Validation report contains an unqualified passed state");
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".flow-node").first().waitFor();
  const restored = await page.evaluate(() => ({
    nodes: document.querySelectorAll(".flow-node").length,
    status: document.querySelector("#draft-status")?.textContent,
    prompt: document.querySelector("#prompt-input")?.value,
    edgeProbe: edgeDefinitions[0]?.snapshotProbe,
    dependencyProbe: dependencyEdges[0]?.snapshotProbe,
    bindingProbe: externalInputBindings[0]?.snapshotProbe,
    atomProbe: getAtom("01.1-V02")?.outputs.some((item) => item.portId === "restoreProbe"),
    reportRestored: validateValidationReportSnapshot(state.validationReport),
  }));
  if (restored.nodes !== 13
    || restored.status !== "已保存"
    || !restored.prompt
    || restored.edgeProbe !== "edge"
    || restored.dependencyProbe !== "dependency"
    || restored.bindingProbe !== "binding"
    || restored.atomProbe !== true
    || restored.reportRestored !== true) {
    throw new Error(`Saved draft did not restore: ${JSON.stringify(restored)}`);
  }
  const archiveAudit = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem("eryuan-flow-studio-draft-v1"));
    const missingModule = structuredClone(draft);
    delete missingModule.atoms[0].modules.review;
    const missingEdge = structuredClone(draft);
    missingEdge.edgeDefinitions[0].to = null;
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const deniedRead = readStorage("probe");
    Storage.prototype.getItem = originalGetItem;
    return {
      missingModule: validateDraftSnapshot(missingModule),
      missingEdge: validateDraftSnapshot(missingEdge),
      deniedRead,
    };
  });
  if (archiveAudit.missingModule.ok || archiveAudit.missingEdge.ok || archiveAudit.deniedRead.ok) {
    throw new Error(`Incomplete archive or blocked storage was accepted: ${JSON.stringify(archiveAudit)}`);
  }

  await page.locator("#new-flow-button").click();
  await page.locator("#new-flow-modal.open").waitFor();
  await page.locator("#generate-button").click();
  await page.locator("#generation-conflict:not(.hidden)").waitFor();
  const conflictNewAudit = await page.evaluate(() => ({
    modalOpen: document.querySelector("#new-flow-modal")?.classList.contains("open"),
    hasManualEdits: state.hasManualEdits,
  }));
  if (!conflictNewAudit.modalOpen || !conflictNewAudit.hasManualEdits) {
    throw new Error(`Manual-edit regeneration conflict was not shown: ${JSON.stringify(conflictNewAudit)}`);
  }
  await page.locator("#generate-new-draft").click();
  await page.waitForFunction(() => !document.querySelector("#new-flow-modal")?.classList.contains("open"));
  const regenerated = await page.evaluate(() => ({
    atomProbe: getAtom("01.1-V02")?.outputs.some((item) => item.portId === "restoreProbe"),
    undoDepth: state.undoStack.length,
  }));
  if (regenerated.atomProbe !== false || regenerated.undoDepth < 1) {
    throw new Error(`Regeneration did not create a recoverable draft: ${JSON.stringify(regenerated)}`);
  }
  await page.locator("#undo-button").click();
  const undone = await page.evaluate(() => ({
    atomProbe: getAtom("01.1-V02")?.outputs.some((item) => item.portId === "restoreProbe"),
    edgeProbe: edgeDefinitions[0]?.snapshotProbe,
    dependencyProbe: dependencyEdges[0]?.snapshotProbe,
    bindingProbe: externalInputBindings[0]?.snapshotProbe,
    status: document.querySelector("#draft-status")?.textContent,
  }));
  if (!undone.atomProbe
    || undone.edgeProbe !== "edge"
    || undone.dependencyProbe !== "dependency"
    || undone.bindingProbe !== "binding") {
    throw new Error(`Undo did not restore the pre-regeneration draft: ${JSON.stringify(undone)}`);
  }
  await page.waitForTimeout(250);

  await page.locator("#new-flow-button").click();
  await page.locator("#generate-button").click();
  await page.locator("#generation-conflict:not(.hidden)").waitFor();
  await page.locator("#generate-overwrite").click();
  await page.waitForFunction(() => !document.querySelector("#new-flow-modal")?.classList.contains("open"));
  const overwriteAudit = await page.evaluate(() => ({
    atomProbe: getAtom("01.1-V02")?.outputs.some((item) => item.portId === "restoreProbe"),
    nodes: state.atoms.length,
  }));
  if (overwriteAudit.atomProbe || overwriteAudit.nodes !== 13) {
    throw new Error(`Confirmed overwrite did not regenerate the flow: ${JSON.stringify(overwriteAudit)}`);
  }

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    app: document.querySelector("#app").scrollWidth - document.querySelector("#app").clientWidth,
    offenders: [...document.querySelectorAll("body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          id: element.id,
          className: typeof element.className === "string" ? element.className : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.right > window.innerWidth + 1 || item.left < -1)
      .slice(0, 12),
  }));
  if (overflow.body > 1) throw new Error(`Desktop body horizontal overflow: ${JSON.stringify(overflow)}`);

  await assertNoPageErrors(page, errors);
  await context.close();
  return {
    matrixRows,
    validationCount,
    humanModuleExecutors,
    simpleViewAudit,
    inlineEditAudit,
    inlineUndoAudit,
    atomRunAudit,
    chatDisableAudit,
    blockedFlowAudit,
    nodeChatAudit,
    completeFlowAudit,
    conversionAudit,
    approvalAudit,
    stateAudit,
    reportBindingAudit,
    snapshotProbe,
    archiveAudit,
    regenerated,
    undone,
    conflictNewAudit,
    overwriteAudit,
    overflow,
    saved,
    restored,
  };
}

async function mobileFlow(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`mobile: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`mobile console: ${message.text()}`);
  });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.setItem("eryuan-flow-studio-welcomed", "1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".flow-node").first().waitFor();
  await page.locator('.flow-node[data-atom-id="01.1-H02"]').click();
  await page.locator("#inspector:not(.hidden)").waitFor();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT_DIR, "mobile-01-inspector.png"), fullPage: true });
  const inspectorOverflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    app: document.querySelector("#app").scrollWidth - document.querySelector("#app").clientWidth,
    inspectorWidth: Math.round(document.querySelector("#inspector").getBoundingClientRect().width || 0),
  }));
  if (inspectorOverflow.body > 1 || inspectorOverflow.app > 1 || inspectorOverflow.inspectorWidth <= 0) {
    throw new Error(`Mobile open-inspector overflow: ${JSON.stringify(inspectorOverflow)}`);
  }

  await page.locator("#flow-chat-toggle").click();
  await page.locator("#flow-chat-panel.open").waitFor();
  const chatOverflow = await page.evaluate(() => {
    const rect = document.querySelector("#flow-chat-panel")?.getBoundingClientRect();
    return {
      body: document.body.scrollWidth - document.body.clientWidth,
      left: Math.round(rect?.left || 0),
      right: Math.round(rect?.right || 0),
      width: Math.round(rect?.width || 0),
    };
  });
  if (chatOverflow.body > 1 || chatOverflow.left < 0 || chatOverflow.right > 390) {
    throw new Error(`Mobile chat overflow: ${JSON.stringify(chatOverflow)}`);
  }
  await page.locator("#close-flow-chat").click();
  await page.locator("#run-button").click();
  await page.waitForFunction(() => !state.runInProgress && Object.keys(state.runResults).length === 13);
  const runOverflow = await page.evaluate(() => {
    const rect = document.querySelector("#run-console")?.getBoundingClientRect();
    return {
      body: document.body.scrollWidth - document.body.clientWidth,
      left: Math.round(rect?.left || 0),
      right: Math.round(rect?.right || 0),
      width: Math.round(rect?.width || 0),
    };
  });
  if (runOverflow.body > 1 || runOverflow.left < 0 || runOverflow.right > 390) {
    throw new Error(`Mobile run console overflow: ${JSON.stringify(runOverflow)}`);
  }
  await page.screenshot({ path: path.join(OUT_DIR, "mobile-02-run-console.png"), fullPage: true });
  await page.locator("#close-run-console").click();
  await page.locator('[data-view-mode="matrix"]').click();
  await page.locator("#matrix-view:not(.hidden)").waitFor();
  await page.screenshot({ path: path.join(OUT_DIR, "mobile-03-matrix.png"), fullPage: true });

  const matrixOverflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    app: document.querySelector("#app").scrollWidth - document.querySelector("#app").clientWidth,
  }));
  if (matrixOverflow.body > 1 || matrixOverflow.app > 1) {
    throw new Error(`Mobile horizontal overflow: ${JSON.stringify(matrixOverflow)}`);
  }

  await assertNoPageErrors(page, errors);
  await context.close();
  return { inspectorOverflow, chatOverflow, runOverflow, matrixOverflow };
}

async function storageDeniedFlow(browser, errors) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`storage-denied: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`storage-denied console: ${message.text()}`);
  });
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("blocked", "SecurityError");
    };
  });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.locator(".flow-node").first().waitFor();
  const result = await page.evaluate(() => ({
    nodes: document.querySelectorAll(".flow-node").length,
    storageDenied: state.storageDenied,
    modalOpen: document.querySelector("#new-flow-modal")?.classList.contains("open"),
  }));
  if (result.nodes !== 13 || result.storageDenied !== true || result.modalOpen !== true) {
    throw new Error(`Storage-denied initialization was not fail-soft: ${JSON.stringify(result)}`);
  }
  await assertNoPageErrors(page, errors);
  await context.close();
  return result;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const errors = [];
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_EXECUTABLE || undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const desktop = await desktopFlow(browser, errors);
    const mobile = await mobileFlow(browser, errors);
    const storageDenied = await storageDeniedFlow(browser, errors);
    const summary = {
      status: "passed",
      baseUrl: BASE_URL,
      desktop,
      mobile,
      storageDenied,
      screenshots: fs.readdirSync(OUT_DIR).filter((file) => file.endsWith(".png")).sort(),
    };
    fs.writeFileSync(path.join(OUT_DIR, "audit.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  fs.mkdirSync(process.env.QA_OUT_DIR || path.join(__dirname, "qa"), { recursive: true });
  fs.writeFileSync(
    path.join(process.env.QA_OUT_DIR || path.join(__dirname, "qa"), "audit.json"),
    `${JSON.stringify({
      status: "failed",
      baseUrl: process.env.PROTOTYPE_URL || "http://127.0.0.1:4174/",
      generatedAt: new Date().toISOString(),
      error: error.stack || error.message,
    }, null, 2)}\n`
  );
  console.error(error.stack || error.message);
  process.exit(1);
});
