const test = require("node:test");
const assert = require("node:assert/strict");
const contract = require("./relay-model.js");
const editor = require("./relay-editor.js");
const { harness, generated, storageKey, read } = require("./editor-test-helpers.cjs");
const generic = () => editor.generate("我提供会议记录，希望整理成纪要并输出清单。");
const ready = () => {
  const graph = generic();
  graph.nodes.find((node) => node.kind === "sign").gate.signer_uid = "fixture-reviewer";
  return graph;
};
const finish = (graph, decision = "approved") => {
  let run = editor.simulation(graph);
  for (let count = 0; count < 50 && ["running", "waiting"].includes(run.status); count += 1) run = editor.tick(graph, run, run.status === "waiting" ? decision : undefined);
  return run;
};

test("new studio is empty with permanent composer and no default panels", () => {
  const ui = harness();
  assert.equal(ui.element("#relay-cards").innerHTML, "");
  assert.equal(ui.element("#relay-chat-send").textContent, "生成流程");
  assert.equal(ui.element("#relay-scope-label").textContent, "整个流程");
  assert.equal(ui.element("#relay-empty").hidden, false);
  for (const panel of ["palette", "inspector-panel", "templates-panel", "conversation-panel", "simulation-panel"]) assert.equal(ui.element("#relay-" + panel).hidden, true);
  assert(ui.element("#app").innerHTML.includes('id="relay-composer"'));
  assert(!ui.element("#app").innerHTML.includes("确认流程目标"));
  assert.equal(editor.check(ui.graph()).simulationAllowed, false);
});

test("mock video generation preserves 13 business identities, 12 edges and 10 AI / 3 sign", () => {
  const ui = generated();
  const graph = ui.graph();
  assert.equal(graph.nodes.length, 13);
  assert.equal(graph.nodes.filter((node) => node.kind === "ai").length, 10);
  assert.equal(graph.nodes.filter((node) => node.kind === "sign").length, 3);
  assert.equal(graph.edges.length, 12);
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, 13);
  assert(graph.migration.atoms.degraded);
  assert.equal(graph.ui.generationMode, "deterministic_mock");
  assert.equal(ui.element("#relay-migration").hidden, false);
  assert.equal(ui.element("#relay-check").textContent, "检查流程");
  assert.equal(ui.calls(), 0);
});

test("mock text flow uses registered four-node graph and never fabricates a reviewer", () => {
  const graph = generic();
  assert.deepEqual(graph.nodes.map((node) => node.kind), ["text", "ai", "sign", "result"]);
  assert.equal(graph.nodes[2].gate.signer_uid, "");
  assert.equal(editor.check(graph).simulationAllowed, false);
  assert.equal(editor.simulation(graph).status, "needs_input");
  assert(editor.simulation(graph).records.every((record) => record.status === "not_started"));
});

test("generation clarifies missing information and refuses unsupported resources", () => {
  assert.throws(() => editor.generate("做视频"), /具体/);
  assert.throws(() => editor.generate("希望制作一个视频并且交付"), /资料/);
  assert.throws(() => editor.generate("我提供商品资料并希望分析一下"), /交付物/);
  assert.throws(() => editor.generate("我提供配方希望生成一台实体机器"), /离线演示支持/);
});

test("cancelled generation cannot apply a late timer", () => {
  const ui = harness();
  ui.send("我提供资料，请生成视频并交付。");
  assert.equal(ui.element("#relay-cancel-job").hidden, false);
  const late = [...ui.timers.values()][0];
  ui.click("#relay-cancel-job"); late(); ui.flush();
  assert.equal(ui.graph().nodes.length, 0);
  assert.equal(ui.element("#relay-chat-input").disabled, false);
  assert.equal(ui.calls(), 0);
});

test("manual edit during generation invalidates the captured generation", () => {
  const ui = harness();
  ui.send("我提供资料，请生成视频并交付。");
  const late = [...ui.timers.values()][0];
  ui.delegated({ addKind: "text" }); late(); ui.flush();
  assert.equal(ui.graph().nodes.length, 1);
});

test("all nine kinds can be added to the same manual graph", () => {
  const ui = harness();
  ui.click("#relay-manual");
  for (const kind of contract.kinds) ui.delegated({ addKind: kind });
  const graph = ui.graph();
  assert.deepEqual(graph.nodes.map((node) => node.kind), contract.kinds);
  assert.equal(graph.schema, contract.schema);
  assert.equal(ui.element("#relay-empty").hidden, true);
  assert.equal(ui.calls(), 0);
});

test("floating panels remain exclusive without mutating the saved graph", () => {
  const ui = generated(); const before = ui.graph();
  for (const category of ["input", "ai", "human", "output"]) {
    ui.delegated({ openPanel: category });
    assert.equal(ui.element("#relay-palette").hidden, false);
    for (const other of ["input", "ai", "human", "output"]) assert.equal(ui.element("#relay-category-" + other).hidden, other !== category);
    assert.equal(ui.element("#relay-inspector-panel").hidden, true);
  }
  ui.delegated({ openPanel: "output" });
  assert.equal(ui.element("#relay-palette").hidden, true);
  assert.deepEqual(ui.graph(), before);
});

test("business drawer precedes nested editable five-stage menu and keeps composer", () => {
  const ui = generated();
  ui.delegated({ selectNode: "01.1-V02" });
  assert.equal(ui.element("#relay-inspector-panel").hidden, false);
  assert(ui.element("#relay-scope-label").textContent.includes("生成脚本"));
  assert(ui.element("#relay-inspector").innerHTML.includes("主要任务"));
  assert(!ui.element("#relay-inspector").innerHTML.includes('name="exec_model"'));
  ui.delegated({}, "relay-advanced-open");
  assert.equal((ui.element("#relay-inspector").innerHTML.match(/data-stage=/g) || []).length, 5);
  assert.equal((ui.element("#relay-inspector").innerHTML.match(/id="relay-stage-form"/g) || []).length, 1);
  assert(!ui.element("#relay-inspector").innerHTML.includes("<details open"));
  ui.click("#relay-back-business");
  assert(!ui.element("#relay-inspector").innerHTML.includes('id="relay-stage-form"'));
  ui.click("#relay-clear-scope");
  assert.equal(ui.element("#relay-scope-label").textContent, "整个流程");
  assert.equal(ui.element("#relay-inspector-panel").hidden, true);
});

test("node chat proposes a scoped diff, applies only explicitly, and supports undo", () => {
  const ui = generated(); const before = ui.graph();
  ui.delegated({ selectNode: "01.1-V02" });
  ui.send('处理说明改为<script>alert("x")</script>');
  assert.deepEqual(ui.graph(), before);
  assert(ui.element("#relay-proposal").innerHTML.includes("仅更新"));
  ui.delegated({}, "relay-apply-proposal");
  const after = ui.graph();
  assert.equal(after.nodes[1].prompts.p2, '<script>alert("x")</script>');
  assert.deepEqual(after.edges, before.edges);
  assert.deepEqual(after.nodes.filter((node) => node.id !== "01.1-V02"), before.nodes.filter((node) => node.id !== "01.1-V02"));
  ui.delegated({ selectNode: "01.1-V02" });
  assert(ui.element("#relay-inspector").innerHTML.includes("&lt;script&gt;"));
  ui.click("#relay-undo"); assert.deepEqual(ui.graph(), before);
  assert.equal(ui.calls(), 0);
});

test("stale proposals reject changes after any graph edit", () => {
  const graph = ready(); const proposal = editor.propose(graph, "名称改为测试");
  const altered = structuredClone(graph); altered.nodes[0].x += 1;
  assert.throws(() => editor.applyProposal(altered, proposal), /草案在建议/);
  assert.equal(editor.applyProposal(graph, proposal).name, "测试");
});

test("deleting Human never automatically bridges its downstream", () => {
  const graph = ready();
  const proposal = editor.propose(graph, "删除这个步骤", "review");
  assert.equal(graph.nodes.length, 4);
  const next = editor.applyProposal(graph, proposal);
  assert.equal(next.nodes.length, 3);
  assert(!next.edges.some((edge) => edge.to === "delivery"));
  assert.equal(editor.check(next).simulationAllowed, false);
  assert.throws(() => editor.propose(graph, "删除不存在"), /唯一/);
});

test("new draft requires keep/new decision and keeps undoable graph", () => {
  const ui = generated(); const before = ui.graph();
  ui.click("#relay-new");
  assert.equal(ui.element("#relay-dialog").open, true);
  ui.click("#relay-keep-edits");
  assert.deepEqual(ui.graph(), before);
  ui.click("#relay-new"); ui.click("#relay-new-confirm");
  assert.equal(ui.graph().nodes.length, 0);
  ui.click("#relay-manual");
  assert.equal(ui.element("#relay-dialog").open, false);
  ui.click("#relay-undo");
  ui.click("#relay-undo"); assert.deepEqual(ui.graph(), before);
});

test("all five editable stages persist action, input, format, capability and failure policy", () => {
  let graph = ready();
  for (const stage of editor.stageKeys) {
    graph = editor.updateStage(graph, "process", stage, { action: "执行" + stage, input: "输入" + stage, outputFormat: "JSON", capability: "registered-test-ref", model: "fixture-model", onFailure: "wait" });
    const restored = contract.restore(JSON.stringify(contract.snapshot(graph)));
    assert.equal(restored.nodes[1].params.editorStages[stage].action, "执行" + stage);
    assert.equal(restored.nodes[1].params.editorStages[stage].outputFormat, "JSON");
  }
  assert.equal(graph.nodes[1].prompts.p2, "执行execute");
  assert.equal(graph.nodes[1].params.editorInput, "输入input");
});

test("Human execute and review cannot be reassigned to model or the same actor", () => {
  const graph = ready();
  assert.throws(() => editor.updateStage(graph, "review", "execute", { executor: "model" }), /真人/);
  assert.throws(() => editor.updateStage(graph, "review", "review", { executor: "human" }), /平台/);
  graph.nodes[2].params.editorStages.review.executor = "human";
  assert.equal(editor.check(graph).simulationAllowed, false);
});

test("live advanced edits invalidate check before save, not only on submit", () => {
  const ui = generated();
  ui.delegated({ selectNode: "01.1-V02" }); ui.delegated({}, "relay-advanced-open");
  ui.click("#relay-check");
  assert.equal(ui.element("#relay-check").textContent, "去修改第一个问题");
  ui.input("relay-stage-form", { stage_action: "只使用商品资料", stage_input: "商品事实", stage_outputFormat: "JSON", stage_executor: "model", stage_onFailure: "block" });
  assert.equal(ui.element("#relay-check").textContent, "检查流程");
  const graph = ui.graph();
  assert.equal(graph.nodes[1].prompts.p2, "只使用商品资料");
  assert.equal(graph.nodes[1].params.editorStages.execute.input, "商品事实");
});

test("system ports stay undeletable in the advanced port dialog", () => {
  const ui = generated();
  ui.delegated({ selectNode: "01.1-V02" }); ui.delegated({}, "relay-advanced-open");
  ui.delegated({ editPort: "material", portDirection: "inputs" });
  const markup = ui.element("#relay-dialog-body").innerHTML;
  assert(markup.includes("不能删除"));
  assert(!markup.includes('id="relay-delete-port"'));
  assert(!markup.includes('name="port_type"'));
});

test("manual typed connection updates same graph; incompatible link leaves it unchanged", () => {
  const ui = harness();
  for (const kind of ["text", "result", "image"]) ui.delegated({ addKind: kind });
  const graph = ui.graph();
  ui.delegated({ portNode: graph.nodes[0].id, portId: "out", direction: "outputs" });
  ui.delegated({ portNode: graph.nodes[1].id, portId: "in", direction: "inputs" });
  const linked = ui.graph(); assert.equal(linked.edges.length, 1);
  ui.delegated({ addKind: "ai" });
  const withSign = ui.graph();
  ui.delegated({ portNode: graph.nodes[2].id, portId: "out", direction: "outputs" });
  ui.delegated({ portNode: withSign.nodes[3].id, portId: "material", direction: "inputs" });
  assert(ui.element("#relay-notice").textContent.includes("不匹配"));
  assert.deepEqual(ui.graph(), withSign);
});

test("save and reload preserve complete shared graph and conversation, never runtime evidence", () => {
  const ui = generated();
  ui.delegated({ addKind: "image" });
  const saved = ui.save();
  assert.equal(saved.graph.nodes.length, 14);
  assert.equal(saved.executionEvidence, "not_run");
  assert.equal(saved.runnable, false);
  assert(saved.messages.length >= 2);
  const restored = harness(ui.storage);
  assert.deepEqual(restored.graph(), saved.graph);
  assert.equal(restored.save().messages.length, saved.messages.length);
  assert(restored.element("#relay-save-state").textContent.includes("已保存"));
});

test("legacy workbench migration keeps full original and manual instructions", () => {
  const graph = generated().graph();
  const snapshot = { atoms: graph.nodes.map((node) => node.params.businessContract), sourcePrompt: "旧目标", title: "旧草稿", voiceEnabled: true, edgeDefinitions: [], dependencyEdges: [], externalInputBindings: [] };
  snapshot.atoms[1].business.prompt = "人工修改不得丢失";
  const raw = JSON.stringify({ payloadVersion: "WorkbenchDraft@1", snapshot });
  const storage = new Map([["eryuan-workbench-draft-v1", raw]]);
  const ui = harness(storage); const migrated = ui.graph();
  assert.equal(migrated.nodes[1].prompts.p2, snapshot.atoms[1].business.prompt);
  assert.deepEqual(migrated.ui.legacySnapshot, snapshot);
  assert.equal(storage.get("eryuan-workbench-draft-v1"), raw);
});

test("shared baseline migration and malformed archive preserve the untouched original", () => {
  const graph = generated().graph();
  const atoms = graph.nodes.map((node) => node.params.businessContract);
  atoms.forEach((atom) => delete atom.business);
  atoms[1].instruction = "共享基线人工说明";
  const draft = { payloadVersion: "PrototypeDraft@0.3", atoms, sourcePrompt: "旧目标", edgeDefinitions: [], dependencyEdges: [], externalInputBindings: [], validationReport: { intentHash: "fixture", planHash: "fixture", effectiveConfigHash: "fixture", hashAlgorithm: "prototype-fnv1a64-design-only", nonSecurityHash: true, runnable: false, validationItems: [] } };
  const raw = JSON.stringify(draft);
  const storage = new Map([["eryuan-flow-studio-draft-v1", raw]]);
  const ui = harness(storage); assert.equal(ui.graph().nodes[1].prompts.p2, atoms[1].instruction);
  assert.deepEqual(ui.graph().ui.legacySnapshot, draft);
  assert.equal(storage.get("eryuan-flow-studio-draft-v1"), raw);
  for (const corrupt of ['{"invalid"', JSON.stringify({ ...draft, payloadVersion: "unknown" })]) {
    const original = new Map([["eryuan-flow-studio-draft-v1", corrupt]]);
    assert.equal(harness(original).graph().nodes.length, 0);
    assert.equal(original.get("eryuan-flow-studio-draft-v1"), corrupt);
  }
});

test("storage denial does not claim a persisted draft or discard current edits", () => {
  const ui = harness(new Map(), true);
  ui.delegated({ addKind: "text" }); ui.click("#relay-save");
  assert(ui.element("#relay-notice").textContent.includes("未允许保存"));
  assert(!ui.element("#relay-save-state").textContent.includes("已保存"));
  assert(ui.element("#relay-cards").innerHTML.includes('data-kind="text"'));
});

test("local template insertion keeps locked system IDs and does not copy edges", () => {
  const ui = harness();
  ui.delegated({ addKind: "text" }); ui.delegated({}, "relay-save-template");
  ui.delegated({ insertTemplate: "0" });
  const graph = ui.graph();
  assert.equal(graph.nodes.length, 2);
  assert.notEqual(graph.nodes[0].id, graph.nodes[1].id);
  assert.equal(graph.nodes[1].outputs[0].id, "out");
  assert.equal(graph.edges.length, 0);
  assert(contract.systemPort(graph.nodes[1], "outputs", "out"));
});

test("positive simulation progresses visibly and waits for explicit synthetic Human choice", () => {
  const graph = ready(); const original = structuredClone(graph);
  let run = editor.simulation(graph); let steps = 0;
  while (run.status === "running" && steps++ < 20) run = editor.tick(graph, run);
  assert.equal(run.status, "waiting");
  assert.equal(run.records.find((record) => record.id === "delivery").status, "pending");
  assert.deepEqual(editor.tick(graph, run), run);
  run = editor.tick(graph, run, "approved");
  while (run.status === "running") run = editor.tick(graph, run);
  assert.equal(run.status, "completed");
  assert(run.records.every((record) => record.status === "passed"));
  assert.equal(run.executionEvidence, "not_run");
  assert(run.records[2].output.includes("不是真实产物"));
  assert.deepEqual(graph, original);
});

test("negative simulation stops all downstream rather than claiming later successes", () => {
  for (const scenario of ["failure", "missing"]) {
    const graph = ready(); graph.nodes[1].params.simulationScenario = scenario;
    const run = finish(graph);
    assert.equal(run.status, scenario === "failure" ? "failed" : "needs_input");
    assert(run.records.slice(2).every((record) => record.status === "not_started"));
  }
});

test("rejected branch remains separate from approved branch", () => {
  let graph = ready();
  graph.nodes.push(contract.createNode("result", "return"));
  graph = contract.connect(graph, "review", "rejected", "return", "in");
  const run = finish(graph, "rejected");
  assert.equal(run.status, "completed");
  assert.equal(run.records.find((record) => record.id === "delivery").status, "skipped");
  assert.equal(run.records.find((record) => record.id === "return").status, "passed");
});

test("cancelled or stale simulation never resumes; disabled and unknown scenarios block", () => {
  const graph = ready(); const run = editor.simulation(graph);
  const cancelled = editor.cancel(run);
  assert.equal(editor.tick(graph, cancelled).status, "cancelled");
  graph.nodes[0].name = "Changed";
  assert.throws(() => editor.tick(graph, run), /失效/);
  graph.nodes[0].params.disabled = true;
  assert.equal(editor.simulation(graph).status, "needs_input");
  delete graph.nodes[0].params.disabled;
  graph.nodes[0].params.simulationScenario = "unknown";
  assert.equal(editor.simulation(graph).status, "needs_input");
});

test("UI simulation uses bounded timers, explicit Human, cancellation, and zero network stubs", () => {
  const graph = ready();
  const storage = new Map([[storageKey, JSON.stringify(contract.snapshot(graph))]]);
  const ui = harness(storage);
  ui.click("#relay-simulate"); ui.flush();
  assert(ui.element("#relay-simulation-results").innerHTML.includes("等你选择"));
  ui.delegated({ simDecision: "approved" }); ui.flush();
  assert(ui.element("#relay-simulation-results").innerHTML.includes("模拟完成"));
  assert.equal(ui.calls(), 0);
  ui.click("#relay-simulate"); ui.click("#relay-cancel-job"); ui.flush();
  assert(ui.element("#relay-simulation-results").innerHTML.includes("已取消"));
  assert.equal(ui.save().executionEvidence, "not_run");
});

test("attachments record metadata only and cannot authorize real input", () => {
  const ui = generated();
  ui.element("#relay-attachment-input").listeners.change({ target: { files: [{ name: "example.txt", size: 12, type: "text/plain" }] } });
  ui.send("名称改为附件测试"); ui.delegated({}, "relay-apply-proposal");
  const saved = ui.save();
  assert.equal(saved.attachments[0].status, "metadata_only_not_uploaded");
  assert.equal(saved.graph.ui.referenceAttachments[0].name, "example.txt");
  assert.equal(ui.calls(), 0);
});

test("fit and tidy preserve configurations and connections; tidy is undoable", () => {
  const ui = generated(); const before = ui.graph();
  ui.element("#relay-scroll").clientWidth = 1440;
  ui.element("#relay-scroll").clientHeight = 1000;
  ui.click("#relay-fit"); assert.deepEqual(ui.graph(), before);
  ui.click("#relay-layout"); const after = ui.graph();
  const withoutPosition = (nodes) => nodes.map(({ x, y, ...rest }) => rest);
  assert.deepEqual(withoutPosition(after.nodes), withoutPosition(before.nodes));
  assert.deepEqual(after.edges, before.edges);
  ui.click("#relay-undo"); assert.deepEqual(ui.graph(), before);
});

test("page keeps CSP and local model/editor/UI load order; no network execution path", () => {
  const html = read("index.html");
  assert(html.includes("connect-src 'none'"));
  assert(html.indexOf('src="./relay-model.js"') < html.indexOf('src="./relay-editor.js"'));
  assert(html.indexOf('src="./relay-editor.js"') < html.indexOf('src="./relay-ui.js"'));
  for (const file of ["relay-editor.js", "relay-ui.js"]) assert(!/\b(fetch|XMLHttpRequest|WebSocket)\s*\(/.test(read(file)));
});

test("scoped conversation edits input, output, model and capability without changing typed ports", () => {
  let graph = ready();
  const ports = structuredClone(graph.nodes[1].inputs);
  for (const message of ["输入说明改为商品资料", "输出格式改为JSON", "模型改为fixture-model", "能力改为fixture-capability"]) graph = editor.applyProposal(graph, editor.propose(graph, message, "process"));
  assert.equal(graph.nodes[1].params.editorInput, "商品资料");
  assert.equal(graph.nodes[1].params.outputFormat, "JSON");
  assert.equal(graph.nodes[1].exec.model, "fixture-model");
  assert.equal(graph.nodes[1].params.editorStages.execute.capability, "fixture-capability");
  assert.deepEqual(graph.nodes[1].inputs, ports);
  assert.throws(() => editor.propose(graph, "模型改为fixture", "review"), /真人/);
  assert.throws(() => editor.propose(graph, "能力改为tool", "review"), /代签/);
});

test("manual drop only accepts registered payloads and does not load remote resources", () => {
  const ui = harness();
  const drop = (payload) => ui.element("#relay-scroll").listeners.drop({ preventDefault() {}, clientX: 300, clientY: 200, dataTransfer: { getData: () => JSON.stringify(payload) } });
  drop({ kind: "ai" });
  assert.equal(ui.graph().nodes.length, 1);
  drop({ kind: "unregistered" });
  assert.equal(ui.graph().nodes.length, 1);
  drop({ template: 999 });
  assert.equal(ui.graph().nodes.length, 1);
  assert.equal(ui.calls(), 0);
});

test("editing during simulation cancels pending callbacks and removes stale results", () => {
  const ui = harness(new Map([[storageKey, JSON.stringify(contract.snapshot(ready()))]]));
  ui.click("#relay-simulate");
  const late = [...ui.timers.values()][0];
  ui.delegated({ selectNode: "process" }); ui.delegated({}, "relay-advanced-open");
  ui.input("relay-stage-form", { stage_action: "New task", stage_input: "New input", stage_outputFormat: "JSON", stage_executor: "model", stage_onFailure: "block" });
  late(); ui.flush();
  assert.equal(ui.element("#relay-cancel-job").hidden, true);
  assert.equal(ui.element("#relay-check").textContent, "检查流程");
  assert(!ui.element("#relay-cards").innerHTML.includes("模拟通过"));
  assert.equal(ui.calls(), 0);
});
