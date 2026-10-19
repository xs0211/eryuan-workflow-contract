const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const contract = require("./relay-model.js");
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
const graphOf = (...nodes) => ({ schema: contract.schema, nodes, edges: [] });
const codes = (graph) => contract.validate(graph).filter((issue) => issue.sev === "err").map((issue) => issue.code);
const node = (kind, id = kind) => contract.createNode(kind, id);

test("exactly nine registered kinds and four transport types", () => {
  assert.deepEqual(contract.kinds, ["text", "image", "file", "group_messages", "ai", "sign", "group_send", "drive_save", "result"]);
  assert.deepEqual(contract.types, ["text", "image", "file", "msg"]);
  assert.throws(() => node("video"), /unknown_kind/);
  assert.throws(() => node("__proto__"), /unknown_kind/);
});

test("all defaults use contract system ports, not legacy schemaRef ports", () => {
  for (const kind of contract.kinds) {
    const current = node(kind);
    assert.equal(current.kind, kind);
    assert.equal(Object.hasOwn(current, "type"), false);
    assert(!codes(graphOf(current)).some((code) => /port_(types|name|id)|system_port/.test(code)));
    assert(current.inputs.concat(current.outputs).every((port) => port.locked && port.id && port.types.length));
  }
});

test("valid typed fan-in and fan-out are permitted by V4", () => {
  let graph = graphOf(node("text", "first"), node("text", "second"), node("ai"), node("result"));
  graph = contract.connect(graph, "first", "out", "ai", "material");
  graph = contract.connect(graph, "second", "out", "ai", "material");
  graph = contract.connect(graph, "first", "out", "result", "in");
  assert.deepEqual(codes(graph), []);
  assert.equal(graph.edges.length, 3);
});

test("mismatch uses the exact contract wording and does not connect", () => {
  const graph = graphOf(node("image"), node("ai"));
  assert.throws(() => contract.connect(graph, "image", "out", "ai", "material"), { message: "类型不匹配：图片 不能接到「AI 处理」的素材口，它只接受 文本、消息" });
  assert.equal(graph.edges.length, 0);
});

test("system identity, type and required cannot be bypassed with locked=false", () => {
  const graph = graphOf(node("sign"));
  graph.nodes[0].inputs[0].locked = false;
  assert.throws(() => contract.editPort(graph, "sign", "inputs", "content", { remove: true }), /system_port_altered/);
  assert.throws(() => contract.editPort(graph, "sign", "inputs", "content", { types: ["msg"] }), /system_port_altered/);
  assert.throws(() => contract.editPort(graph, "sign", "inputs", "content", { required: false }), /system_port_altered/);
  graph.nodes[0].inputs[0].required = false;
  assert(codes(graph).includes("system_port_altered"));
  assert(codes(graph).includes("required_port_unconnected"));
});

test("system rename retains id and connected edges", () => {
  const graph = contract.connect(graphOf(node("text"), node("ai")), "text", "out", "ai", "material");
  const changed = contract.editPort(graph, "ai", "inputs", "material", { name: "商品说明" });
  assert.equal(changed.graph.nodes[1].inputs[0].id, "material");
  assert.deepEqual(changed.graph.edges, graph.edges);
});

test("custom rename updates local prompt references only", () => {
  let graph = contract.addPort(graphOf(node("ai"), node("ai", "other")), "ai", "inputs", "商品", ["text"]);
  graph.nodes[0].prompts.p2 = "读 {{ 商品 }}，不是商品二";
  graph.nodes[1].prompts.p2 = "读 {{商品}}";
  const changed = contract.editPort(graph, "ai", "inputs", "in_1", { name: "商品事实" });
  assert.equal(changed.graph.nodes[0].prompts.p2, "读 {{商品事实}}，不是商品二");
  assert.equal(changed.graph.nodes[1].prompts.p2, "读 {{商品}}");
  assert.throws(() => contract.editPort(graph, "ai", "inputs", "in_1", { id: "in_new" }), /port_id_immutable/);
});

test("custom type changes and deletion remove affected edges", () => {
  let graph = contract.addPort(graphOf(node("text"), node("ai")), "ai", "inputs", "附加资料", ["text"]);
  graph = contract.connect(graph, "text", "out", "ai", "in_1");
  const changed = contract.editPort(graph, "ai", "inputs", "in_1", { types: ["file"] });
  assert.equal(changed.removedEdges, 1);
  assert.equal(changed.graph.edges.length, 0);
  const removed = contract.editPort(graph, "ai", "inputs", "in_1", { remove: true });
  assert.equal(removed.removedEdges, 1);
  assert(!removed.graph.nodes[1].inputs.some((port) => port.id === "in_1"));
});

test("renaming a port does not silently remove an existing invalid draft edge", () => {
  const graph = graphOf(node("image"), node("ai"));
  graph.edges.push({ id: "invalid", from: "image", fromPort: "out", to: "ai", toPort: "material", type: "image" });
  const changed = contract.editPort(graph, "ai", "inputs", "material", { name: "待补资料" });
  assert.equal(changed.graph.edges.length, 1);
  assert.equal(changed.removedEdges, 0);
  assert(codes(changed.graph).includes("port_type_mismatch"));
});

test("custom ports respect kind, count, unique names and reserved names", () => {
  assert.throws(() => contract.addPort(graphOf(node("text")), "text", "inputs", "更多", ["text"]));
  assert.throws(() => contract.addPort(graphOf(node("sign")), "sign", "outputs", "更多", ["text"]));
  assert.throws(() => contract.addPort(graphOf(node("ai")), "ai", "outputs", "图片", ["image"]));
  assert.throws(() => contract.addPort(graphOf(node("ai")), "ai", "inputs", "日期", ["text"]));
  let graph = graphOf(node("ai"));
  for (let index = 0; index < 6; index += 1) graph = contract.addPort(graph, "ai", "inputs", `输入${index}`, ["text"]);
  assert.equal(graph.nodes[0].inputs.length, 8);
  assert.throws(() => contract.addPort(graph, "ai", "inputs", "第九个", ["text"]));
  assert.throws(() => contract.addPort(graphOf(node("ai")), "ai", "outputs", "结果", ["text"]));
});

test("port deletion cannot silently satisfy a required input", () => {
  const graph = graphOf(node("result"));
  assert(codes(graph).includes("required_port_unconnected"));
  graph.nodes[0].inputs = [];
  assert(codes(graph).includes("system_port_missing"));
});

test("group_send inline text is the only system required-input exception", () => {
  const graph = graphOf(node("group_send"));
  graph.nodes[0].params.group_no = "synthetic-group";
  graph.nodes[0].params.text = "合成消息，不发送";
  assert.deepEqual(codes(graph), []);
  graph.nodes[0].params.text = "";
  assert(codes(graph).includes("required_port_unconnected"));
});

test("self edges, duplicates, cycles and nonexistent ports fail closed", () => {
  let graph = graphOf(node("ai", "first"), node("ai", "second"));
  assert.throws(() => contract.connect(graph, "first", "result", "first", "material"));
  assert.throws(() => contract.connect(graph, "first", "missing", "second", "material"));
  graph = contract.connect(graph, "first", "result", "second", "material");
  assert.throws(() => contract.connect(graph, "first", "result", "second", "material"));
  assert.throws(() => contract.connect(graph, "second", "result", "first", "material"));
});

test("contract codes distinguish reversed direction and reserved port names", () => {
  const graph = graphOf(node("ai", "first"), node("ai", "second"));
  graph.edges.push({ id: "reversed", from: "first", fromPort: "material", to: "second", toPort: "result", type: "text" });
  assert(codes(graph).includes("edge_direction"));
  graph.nodes[0].inputs[0].name = "日期";
  assert(codes(graph).includes("port_name_reserved"));
});

test("stale edge type warns; compatibility comes from the actual source", () => {
  const graph = contract.connect(graphOf(node("text"), node("ai")), "text", "out", "ai", "material");
  graph.edges[0].type = "image";
  assert(contract.validate(graph).some((issue) => issue.code === "edge_type_stale" && issue.sev === "warn"));
  assert.deepEqual(codes(graph), []);
});

test("runtime inputs enforce unique keys and reject reserved characters", () => {
  const graph = graphOf(node("text", "first"), node("image", "second"));
  graph.nodes.forEach((entry) => { entry.params.source = "runtime"; entry.params.key = "product"; });
  assert(codes(graph).includes("runtime_key_dup"));
  graph.nodes[1].params.key = "{{product}}";
  assert(codes(graph).includes("runtime_key_invalid"));
  graph.nodes[1].params.key = 42;
  assert.doesNotThrow(() => contract.validate(graph));
  assert(codes(graph).includes("runtime_key_required"));
});

test("AI config and resource placement are checked without claiming authorization", () => {
  const graph = graphOf(node("ai"), node("sign"));
  graph.nodes[1].exec = { kind: "platform" };
  graph.nodes[1].skills = ["sk-test"];
  graph.nodes[0].exec = { kind: "agent", ref: "test-agent" };
  assert(codes(graph).includes("exec_not_allowed"));
  assert(codes(graph).includes("resource_not_allowed"));
  assert(codes(graph).includes("exec_unbound"));
  graph.nodes[0].exec = { kind: "platform" };
  graph.nodes[0].skills = ["sk-test"];
  assert(contract.validate(graph).some((issue) => issue.code === "platform_ignores_resources" && issue.sev === "warn"));
});

test("platform file output is rejected even with a valid custom output port", () => {
  const graph = contract.addPort(graphOf(node("ai")), "ai", "outputs", "文件稿", ["file"]);
  assert(codes(graph).includes("platform_file_output"));
});

test("sign has independent approved/rejected outputs, no any-mode fallback", () => {
  const graph = graphOf(node("sign"));
  assert.deepEqual(graph.nodes[0].outputs.map((port) => port.id), ["approved", "rejected"]);
  assert.equal(graph.nodes[0].gate.sign_mode, undefined);
  graph.nodes[0].gate.sign_mode = "any";
  assert(codes(graph).includes("param_range"));
});

test("parameter ranges, attachments and enums retain their contract boundaries", () => {
  const graph = graphOf(node("group_messages"), node("drive_save"), node("image"));
  graph.nodes[0].params.limit = 201;
  graph.nodes[1].params.on_conflict = "version";
  graph.nodes[2].attachments = Array(5).fill("synthetic");
  assert(codes(graph).includes("attachments_too_many"));
  assert(codes(graph).filter((code) => code === "param_range").length >= 2);
});

test("templates preserve port identities and unknown params but strip runtime state", () => {
  const source = node("ai");
  source.exec = { kind: "agent", ref: "demo", runtime: { id: "demo-device" }, bot_uid: "temporary-bot", materialized: true };
  source.session_key = "do-not-copy";
  source.runId = "old-run";
  source.params.extension = { value: "retain" };
  const template = contract.cardTemplate(source);
  const card = template.nodes[0];
  assert.equal(card.id, "n1");
  assert.equal(card.x, 0);
  assert.equal(card.session_key, undefined);
  assert.equal(card.runId, undefined);
  assert.equal(card.exec.bot_uid, undefined);
  assert.equal(card.exec.materialized, undefined);
  assert.deepEqual(card.inputs, source.inputs);
  assert.deepEqual(card.params.extension, { value: "retain" });
  assert.deepEqual(template.edges, []);
});

test("organization templates keep organizational bot bindings", () => {
  const source = node("ai");
  source.exec = { kind: "org_agent", ref: "demo", bot_uid: "org-demo" };
  assert.equal(contract.cardTemplate(source).nodes[0].exec.bot_uid, "org-demo");
});

test("template insertion is a deep copy and suffixes duplicate runtime keys", () => {
  const source = node("text");
  source.params.source = "runtime";
  source.params.key = "brief";
  const graph = graphOf(source);
  const template = contract.cardTemplate(source);
  const inserted = contract.instantiate(template, graph, "local_1");
  assert.equal(inserted.params.key, "brief_2");
  assert.equal(inserted.atom.tpl, "local_1");
  assert.equal(inserted.outputs[0].id, "out");
  inserted.params.content = "changed";
  assert.equal(template.nodes[0].params.content, "");
  assert.throws(() => contract.instantiate({ ...template, edges: [{}] }, graph, "bad"), /tpl_not_single_card/);
});

test("drafts with errors can round-trip, unknown fields survive, reports do not authorize", () => {
  const graph = graphOf(node("sign"));
  graph.extension = { unrecognized: true };
  graph.nodes[0].params.extra = ["retain"];
  const payload = contract.snapshot(graph);
  assert.equal(payload.runnable, false);
  assert.equal(payload.executionEvidence, "not_run");
  assert.deepEqual(contract.restore(JSON.stringify(payload)), graph);
  assert(codes(graph).length > 0);
});

test("corrupt snapshots fail before mutating state", () => {
  assert.throws(() => contract.restore("{"));
  assert.throws(() => contract.restore(JSON.stringify({ format: "unknown" })));
  const payload = contract.snapshot(graphOf(node("ai")));
  payload.graph.nodes[0].inputs = "not-an-array";
  assert.throws(() => contract.restore(JSON.stringify(payload)), /damaged_snapshot/);
});

test("diagram check blocks errors and never fabricates execution or approval", () => {
  const blocked = contract.diagramCheck(graphOf(node("sign")));
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.steps, []);
  const valid = contract.diagramCheck(graphOf(node("text")));
  assert.equal(valid.status, "structure_checked");
  assert.equal(valid.steps[0].status, "structure_only");
  assert.equal(valid.runnable, false);
  assert.equal(valid.executionEvidence, "not_run");
});

test("actual thirteen business definitions map to ten AI and three sign cards", () => {
  const context = vm.createContext({ structuredClone, TextEncoder });
  vm.runInContext(read("workbench.js") + "\n" + read("app.js").replace(/\ninit\(\);\s*$/, "") + "\nglobalThis.businessAtoms = atoms;", context);
  const graph = contract.fromBusinessAtoms(context.businessAtoms);
  assert.equal(graph.nodes.length, 13);
  assert.equal(graph.nodes.filter((entry) => entry.kind === "ai").length, 10);
  assert.equal(graph.nodes.filter((entry) => entry.kind === "sign").length, 3);
  assert.equal(graph.edges.length, 12);
  assert(graph.migration.atoms.degraded);
  assert(graph.nodes.every((entry) => entry.params.businessContract.modules));
  assert.equal(graph.nodes.find((entry) => entry.id === "01.1-H02").params.businessContract.modules.review.executor, "平台审批校验器");
  graph.nodes = graph.nodes.filter((entry) => entry.id !== "01.1-H02");
  assert(codes(graph).includes("business_gate_missing"));
});

test("unknown and malformed ports produce issues instead of running", () => {
  const graph = graphOf(node("ai"));
  graph.nodes[0].inputs = null;
  graph.edges.push(null);
  assert.doesNotThrow(() => contract.validate(graph));
  assert(codes(graph).includes("ports_invalid"));
  assert(codes(graph).includes("edge_id_invalid"));
});
