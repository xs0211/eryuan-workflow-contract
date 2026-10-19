const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const source = read('workbench.js') + '\n' + read('app.js').replace(/\ninit\(\);\s*$/, '');

function harness(storage = new Map(), storageDenied = false) {
  const elements = new Map();
  const notices = [];
  const control = {confirm: false, externalCalls: 0};
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, {
      value: selector === '#prompt-input' ? '制作六镜视频，不自动发布' : selector === '#demo-scenario' ? 'normal' : '',
      textContent: '', innerHTML: '', dataset: {}, style: {}, listeners: new Map(), fields: {},
      classList: {add() {}, remove() {}, toggle() {}, contains() { return false; }},
      addEventListener(name, handler) { this.listeners.set(name, handler); }, focus() {},
    });
    return elements.get(selector);
  };
  const forbidden = () => { control.externalCalls += 1; throw new Error('External calls forbidden'); };
  const context = vm.createContext({
    TextEncoder, structuredClone,
    document: {querySelector: element, querySelectorAll: () => [], addEventListener() {}},
    window: {confirm: () => control.confirm, addEventListener() {}},
    localStorage: {
      getItem: (key) => { if (storageDenied) throw new Error('denied'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (storageDenied) throw new Error('denied'); storage.set(key, value); },
    },
    FormData: class {
      constructor(form) { this.fields = form.fields; }
      get(key) { return this.fields[key] ?? null; }
      getAll(key) { return this.fields[key] || []; }
    },
    setTimeout() {}, clearTimeout() {}, requestAnimationFrame() {},
    fetch: forbidden, XMLHttpRequest: forbidden, WebSocket: forbidden,
    captureNotice: (message) => notices.push(message),
  });
  vm.runInContext(source + `
    renderCanvas = () => {}; renderMatrix = () => {}; renderInspector = () => {};
    renderAssistant = () => {}; renderSimulation = () => {}; renderResources = () => {};
    toast = captureNotice;
    initializeWorkbench();
    globalThis.audit = {
      state, edgeDefinitions, dependencyEdges, externalInputBindings, conversionDefinitions,
      getAtom, port, validateEdgeDefinition, inspectRequiredBindings, createValidationReport,
      bindEvents, bindBusinessEditor, invalidateWorkbench, captureWorkbench, saveWorkbenchDraft,
      restoreWorkbenchDraft, undoWorkbench, generateWorkbenchDraft, makeChatProposal,
      confirmChatProposal, startSimulation, simulateHumanDecision, deriveApprovedContentPackage,
      businessSummaryMarkup, businessAdvancedMarkup, validateWorkbenchSnapshot,
      applyEditorForm, nextStepDescription, init
    };`, context, {timeout: 3000});
  return {...context.audit, element, notices, control, storage};
}

test('13 nodes, all 15 declared edges and required sources are consistent', () => {
  const app = harness();
  assert.equal(app.state.atoms.length, 13);
  assert.equal(app.edgeDefinitions.length, 12);
  assert.equal(app.dependencyEdges.length, 3);
  assert.equal(app.inspectRequiredBindings().length, 0);
  for (const edge of [...app.edgeDefinitions, ...app.dependencyEdges]) assert.equal(app.validateEdgeDefinition(edge), null);
});

test('unknown transform and wrong HumanDecision schema are rejected', () => {
  const app = harness();
  assert.ok(app.validateEdgeDefinition({...app.edgeDefinitions[1], transform: 'not_registered'}));
  assert.ok(app.validateEdgeDefinition({...app.edgeDefinitions[2], from: app.edgeDefinitions[1].from}));
});

test('many source into one destination is rejected', () => {
  const app = harness();
  app.getAtom('01.1-V02').outputs[0].cardinality = 'one_or_more';
  assert.ok(app.validateEdgeDefinition(app.edgeDefinitions[1]));
});

test('six-shot collection into scalar port is rejected', () => {
  const app = harness();
  app.getAtom('01.1-V05').inputs.find((port) => port.portId === 'shotImages').cardinality = 'one';
  assert.ok(app.validateEdgeDefinition(app.edgeDefinitions[4]));
});

test('shotIndex and missing one_per_shot identity are rejected', () => {
  const app = harness();
  assert.ok(app.validateEdgeDefinition({...app.edgeDefinitions[3], identityKey: 'shotIndex'}));
  const edge = {...app.edgeDefinitions[7]}; delete edge.identityKey;
  assert.ok(app.validateEdgeDefinition(edge));
});

test('required ports and multiple scalar sources are checked', () => {
  const app = harness();
  app.getAtom('01.1-V02').inputs.push(app.port('extraInput', 'Missing reference', 'ImageAsset@1.0.0'));
  assert.ok(app.inspectRequiredBindings().some((message) => message.includes('extraInput')));
  app.edgeDefinitions.push({...app.edgeDefinitions[1], id: 'EXTRA'});
  assert.ok(app.inspectRequiredBindings().some((message) => message.includes('多个来源')));
});

test('Human stages remain separated and fake approvals cannot derive packages', () => {
  const app = harness();
  for (const atom of app.state.atoms.filter((item) => item.human)) {
    assert.equal(atom.modules.execute.executor, '指定真人审核人');
    assert.equal(atom.modules.review.executor, '平台审批校验器');
    assert.equal(atom.modules.input.capabilities.length, 0);
  }
  assert.equal(app.deriveApprovedContentPackage({}, {humanDecision: 'approved', validation: {valid: true}}, {}).approvedPackage, null);
});

test('prompt edits invalidate reports and saved state immediately', () => {
  const app = harness(); app.bindEvents(); app.saveWorkbenchDraft();
  app.element('#prompt-input').value = '新的六镜视频需求';
  app.element('#prompt-input').listeners.get('input')();
  assert.equal(app.state.validationReport, null);
  assert.equal(app.state.saved, false);
});

test('conversion rules affect plan and effective configuration fingerprints', () => {
  const app = harness(); const before = app.createValidationReport();
  app.conversionDefinitions.identity.cardinalities.push('extra');
  const after = app.createValidationReport();
  assert.notEqual(before.planHash, after.planHash);
  assert.notEqual(before.effectiveConfigHash, after.effectiveConfigHash);
  assert.equal(after.nonSecurityHash, true); assert.equal(after.runnable, false);
});

test('snapshot round trip restores atoms, edges, dependencies, bindings and prompt', () => {
  const app = harness();
  app.edgeDefinitions[1].id = 'CUSTOM-E02'; app.dependencyEdges[0].id = 'CUSTOM-D01';
  app.externalInputBindings[0].state = 'missing_custom_fixture';
  app.getAtom('01.1-V02').business.prompt = '保留人工编写的提示词';
  app.element('#prompt-input').value = '完整快照测试';
  const expected = JSON.stringify(app.captureWorkbench()); app.saveWorkbenchDraft();
  const restored = harness(app.storage);
  assert.equal(restored.restoreWorkbenchDraft(), true);
  assert.equal(JSON.stringify(restored.captureWorkbench()), expected);
  assert.equal(restored.state.validationReport, null);
});

test('broken JSON, unsupported versions and malformed stages are rejected', () => {
  for (const raw of ['{', JSON.stringify({payloadVersion: 'other'}), JSON.stringify({payloadVersion: 'WorkbenchDraft@1', snapshot: {atoms: [{}]}})]) {
    const app = harness(new Map([['eryuan-workbench-draft-v1', raw]]));
    assert.equal(app.restoreWorkbenchDraft(), false); assert.equal(app.state.atoms.length, 13);
  }
  const app = harness(); const snapshot = app.captureWorkbench(); snapshot.atoms[0].modules.review.executor = {};
  assert.equal(app.validateWorkbenchSnapshot(snapshot), false);
});

test('storage denial does not throw or report saved', () => {
  const app = harness(new Map(), true);
  assert.doesNotThrow(() => app.saveWorkbenchDraft());
  assert.equal(app.state.saved, false); assert.equal(app.restoreWorkbenchDraft(), false);
  assert.doesNotThrow(() => app.init());
});

test('regeneration cancel preserves edits; confirmed replace is fully undoable', () => {
  const app = harness();
  app.getAtom('01.1-V02').inputs.push(app.port('manualPort', '人工输入', 'ImageAsset@1.0.0'));
  app.invalidateWorkbench();
  app.generateWorkbenchDraft();
  assert.ok(app.getAtom('01.1-V02').inputs.some((port) => port.portId === 'manualPort'));
  app.control.confirm = true; app.generateWorkbenchDraft();
  assert.equal(app.getAtom('01.1-V02').inputs.some((port) => port.portId === 'manualPort'), false);
  app.undoWorkbench();
  assert.ok(app.getAtom('01.1-V02').inputs.some((port) => port.portId === 'manualPort'));
});

test('node chat previews before applying and supports undo', () => {
  const app = harness(); const atom = app.getAtom('01.1-V02'); const original = atom.business.prompt;
  app.state.proposal = app.makeChatProposal('提示词改为：先列出缺失资料', atom.id);
  assert.equal(atom.business.prompt, original);
  app.confirmChatProposal(); assert.equal(atom.business.prompt, '先列出缺失资料');
  app.undoWorkbench(); assert.equal(app.getAtom(atom.id).business.prompt, original);
});

test('stale proposal and unsupported chat text cannot mutate draft', () => {
  const app = harness(); const proposal = app.makeChatProposal('名称改为：过期修改', '01.1-V02');
  app.invalidateWorkbench(); app.state.proposal = proposal; app.confirmChatProposal();
  assert.notEqual(app.getAtom('01.1-V02').name, '过期修改');
  assert.ok(app.makeChatProposal('现在直接付费发布', 'flow').error);
});

test('model and capability changes are scoped; AI cannot replace Human', () => {
  const app = harness();
  assert.ok(app.makeChatProposal('模型改为：分析助手', '01.1-H02').error);
  assert.ok(app.makeChatProposal('能力改为：video.submit', '01.1-V02').error);
  app.state.proposal = app.makeChatProposal('模型改为：分析助手', '01.1-V02'); app.confirmChatProposal();
  assert.equal(app.getAtom('01.1-V02').business.model, 'demo_reasoning');
  app.state.proposal = app.makeChatProposal('能力改为：写文案', '01.1-V02'); app.confirmChatProposal();
  assert.equal(app.getAtom('01.1-V02').modules.execute.capabilities[0], 'text.generate');
});

test('simple editor saves actual node configuration and invalidates simulation', () => {
  const app = harness(); const atom = app.getAtom('01.1-V02');
  const form = app.element('#business-editor');
  form.fields = {name: '新的脚本节点', prompt: '新的指令', input: '新的商品事实', output: '新的输出说明', model: 'demo_reasoning', capability: ['text.generate']};
  app.bindBusinessEditor(atom); form.listeners.get('submit')({preventDefault() {}});
  assert.equal(atom.name, '新的脚本节点'); assert.equal(atom.business.input, '新的商品事实');
  assert.equal(atom.outputs[0].label, '新的输出说明'); assert.equal(atom.modules.execute.modelRef.id, 'demo_reasoning');
  assert.equal(app.state.validationReport, null);
});

test('typing applies changes before global save, without submitting node form', () => {
  const app = harness(); const atom = app.getAtom('01.1-V02');
  const form = app.element('#business-editor');
  form.fields = {name: atom.name, prompt: '实时编辑指令', input: '实时修改的输入', output: '新的脚本', model: 'demo_reasoning', capability: ['text.generate']};
  app.bindBusinessEditor(atom);
  form.listeners.get('input')();
  form.fields.input = '第二次编辑的输入'; form.listeners.get('input')();
  assert.equal(app.state.undoStack.length, 1);
  app.saveWorkbenchDraft();
  const restored = harness(app.storage); restored.restoreWorkbenchDraft();
  assert.equal(restored.getAtom(atom.id).business.input, '第二次编辑的输入');
  assert.equal(restored.getAtom(atom.id).modules.execute.modelRef.id, 'demo_reasoning');
});

test('advanced execute model edits update the actual module binding', () => {
  const app = harness(); const form = app.element('#stage-execute');
  form.fields = {action: '先检查事实再写脚本', model: 'demo_reasoning'};
  const atom = app.getAtom('01.1-V02');
  app.applyEditorForm(atom, form, 'execute');
  assert.equal(atom.modules.execute.action, '先检查事实再写脚本');
  assert.equal(atom.modules.execute.modelRef.id, 'demo_reasoning');
  assert.equal(atom.business.model, 'demo_reasoning');
});

test('empty edited input stays in draft but blocks simulation', () => {
  const app = harness(); const atom = app.getAtom('01.1-V02');
  const form = app.element('#business-editor');
  form.fields = {name: atom.name, prompt: '测试', input: '  ', output: '测试脚本', model: 'demo_text', capability: ['text.generate']};
  app.applyEditorForm(atom, form);
  assert.equal(app.state.simulation, null);
  assert.match(app.nextStepDescription().label, /补齐/);
  app.startSimulation(); assert.equal(app.state.simulation, null);
});

test('next-step guidance distinguishes editing, human waiting and demo completion', () => {
  const app = harness(); assert.equal(app.nextStepDescription().target, '01.1-V02');
  app.startSimulation(); assert.match(app.nextStepDescription().label, /人工确认/);
  for (let index = 0; index < 3; index += 1) app.simulateHumanDecision(true);
  assert.match(app.nextStepDescription().label, /不代表业务已完成/);
  assert.equal(app.nextStepDescription().target, 'save');
});

test('business renderer escapes user text and keeps Human model read-only', () => {
  const app = harness(); const atom = app.getAtom('01.1-V02');
  atom.business.prompt = '<img src=x onerror=alert(1)>';
  assert.ok(app.businessSummaryMarkup(atom).includes('&lt;img'));
  assert.equal(app.businessSummaryMarkup(atom).includes('<img src=x'), false);
  assert.match(app.businessSummaryMarkup(app.getAtom('01.1-H02')), /select name="model" disabled/);
});

test('scenario picker is available outside the desktop-only toolbar', () => {
  const html = read('index.html');
  assert.match(html, /class="sample-choice">模拟测试用什么资料？<select id="demo-scenario"/);
  assert.equal((html.match(/id="demo-scenario"/g) || []).length, 1);
});

test('flow deletion updates edges but never silently bypasses Human gate', () => {
  const app = harness(); app.state.proposal = app.makeChatProposal('删除 H02', 'flow'); app.confirmChatProposal();
  assert.equal(app.getAtom('01.1-H02'), undefined);
  assert.equal(app.edgeDefinitions.some((edge) => edge.from.atomId === '01.1-H02' || edge.to.atomId === '01.1-H02'), false);
  assert.ok(app.inspectRequiredBindings().some((message) => message.includes('H02')));
  app.startSimulation(); assert.equal(app.state.simulation, null);
});

test('flow demo pauses at each Human and produces no real approval or calls', () => {
  const app = harness(); app.startSimulation();
  for (const id of ['01.1-H02', '01.1-H05', '01.1-H10']) {
    assert.equal(app.state.simulation.waiting, id); app.simulateHumanDecision(true);
  }
  assert.equal(app.state.simulation.status, 'demo_completed');
  assert.equal(app.state.simulation.records.length, 13);
  assert.equal(app.state.simulation.realExecution, 'not_run');
  assert.equal(app.control.externalCalls, 0);
  assert.match(app.state.simulation.records.find((record) => record.atomId === '01.1-V09').summary, /跳过/);
});

test('missing image stops demo before downstream nodes', () => {
  const app = harness(); app.element('#demo-scenario').value = 'missing_image'; app.startSimulation();
  assert.equal(app.state.simulation.status, 'blocked'); assert.equal(app.state.simulation.records.length, 1);
  assert.equal(app.state.simulation.records[0].steps[2].status, '未开始');
});

test('simulated return stops flow and editing invalidates all demo results', () => {
  const app = harness(); app.startSimulation(); app.simulateHumanDecision(false);
  assert.equal(app.state.simulation.status, 'returned'); assert.equal(app.state.simulation.records.length, 3);
  app.invalidateWorkbench(); assert.equal(app.state.simulation, null);
});

test('HTML uses local assets, connection denial and explicit simulation labels', () => {
  const html = read('index.html');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /模拟测试，不是正式运行/);
  for (const id of ['chat-form', 'chat-scope', 'chat-input', 'simulate-flow', 'simulation-results']) assert.ok(html.includes(`id="${id}"`));
  for (const match of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) assert.ok(fs.existsSync(path.join(__dirname, match[1])));
});
