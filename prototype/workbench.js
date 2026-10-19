const demoModels = {
  demo_text: "文案助手（离线示例）",
  demo_reasoning: "分析助手（离线示例）",
  demo_media: "媒体工具（离线示例）",
  system: "固定规则检查",
  human: "由真人决定，不使用模型",
};
const businessSamples = {
  V01: ["登记这次短视频任务", "示例主播小舟；商品：无品牌白色陶瓷杯；排期：2026-11-01 10:00，上海时间。", "一份带资料清单的制作任务", "请检查主播资料、商品事实、参考图和排期是否齐全，不齐就停止。"],
  V02: ["把商品事实写成脚本", "陶瓷杯，白色，容量300毫升。仅为合成测试事实，不包含价格、优惠或功效。", "六段口播脚本，等待真人确认", "写一条30秒竖版视频脚本，分六段。只使用已有事实，不虚构卖点。"],
  H02: ["请人确认脚本", "待审示例脚本：介绍杯子、展示外观、说明容量、展示使用、总结信息、结束。", "通过、退回或拒绝的决定", "请核对商品事实、表达和六段脚本。这里的模拟决定不会成为正式批准。"],
  V03: ["把脚本拆成六个镜头", "已确认的示例脚本；每镜约5秒，按稳定镜头身份对应。", "六镜分镜：画面、旁白、提示词和计划时长", "生成六个镜头，不静默截断八镜结果。保留每镜画面说明。"],
  V04: ["逐镜制作图片", "六镜分镜＋主播参考图；原型没有真实图片文件。", "六张图片的位置和检查清单（演练不生成图片）", "每镜独立处理；结果不明确时先核查，不重复提交。"],
  V05: ["整理并锁定素材", "六张图、旁白、提示词及分镜引用；本轮只展示模拟清单。", "等待人确认的素材包", "核对六镜齐全、不重复且依赖一致；缺一项不继续。"],
  H05: ["请人确认素材包", "已锁定的六镜素材包示例，不是真实文件包。", "素材包决定；正式使用前仍需真实批准", "确认画面、旁白和提示词一致，不用文字假装素材已经生成。"],
  V06: ["按镜头提交视频任务", "已确认素材包、六镜请求和预算；原型不提交外部任务。", "六条模拟提交记录，不是提供方回执", "先完成授权和请求记录；未知结果只核查，不再提交。"],
  V07: ["取回并检查视频片段", "六条模拟任务记录，没有真实提供方任务ID。", "六段示例片段清单，不是可播放视频", "查询、下载分别恢复，不重新提交视频；终态停止查询。"],
  V08: ["检查旁白是否正确", "示例片段及已审台词；没有真实音轨或转写。", "旁白检查样例：正常、无需检查或待处理", "缺工具或缺记录不能算通过；没有对白才可以明确跳过。"],
  V09: ["按需统一音色", "六段片段和音色设置；默认保留原音。", "逐镜处理方式与原因", "统一音色关闭时保留原片，明确记录跳过，不伪装成换声成功。"],
  V10: ["合成并检查最终视频", "六个唯一镜头及批准素材包；本轮没有真实媒体。", "成片验收清单示例，不是可播放成片", "检查音轨、播放和实测时长。没有媒体不能宣称已完成30秒成片。"],
  H10: ["请人验收最终成片", "待验收成片示例，正式验收需要可播放文件。", "最终验收决定", "真人播放精确版本后决定；模拟同意不等于业务交付。"],
};

function initializeWorkbench() {
  state.undoStack = [];
  state.revision = 0;
  state.simulation = null;
  state.proposal = null;
  state.chatScope = "flow";
  state.chatMessages = [{role: "assistant", text: "告诉我想改哪里。支持改名称、提示词、输入、输出、模型、删除节点和关闭统一音色。先预览，再确认；这是离线指令演示，不是大模型对话。"}];
  state.title = "妆舟 01.1 视频生成流程";
  state.voiceEnabled = false;
  ensureBusinessFields();
  state.initialDraft = captureWorkbench();
}

function ensureBusinessFields() {
  for (const atom of state.atoms) {
    if (atom.business) continue;
    const sample = businessSamples[atom.id.split("-").at(-1)] || [atom.name, "请补充测试资料", "请说明希望得到什么", "请说明这个节点要做的事"];
    atom.business = {
      purpose: sample[0], input: sample[1], output: sample[2], prompt: sample[3],
      model: atom.human ? "human" : atom.modules.execute.executor.includes("文本") ? "demo_text" : atom.modules.execute.executor.includes("媒体") || atom.modules.execute.executor.includes("音频") ? "demo_media" : "system",
    };
  }
}

function captureWorkbench() {
  return structuredClone({
    atoms: state.atoms, edgeDefinitions, dependencyEdges, externalInputBindings,
    sourcePrompt: $("#prompt-input")?.value || "", title: state.title, voiceEnabled: state.voiceEnabled,
  });
}

function rememberUndo() {
  if (!state.undoStack) return;
  state.undoStack.push(captureWorkbench());
  if (state.undoStack.length > 25) state.undoStack.shift();
}

function applyWorkbenchSnapshot(snapshot) {
  state.atoms = structuredClone(snapshot.atoms);
  edgeDefinitions.splice(0, edgeDefinitions.length, ...structuredClone(snapshot.edgeDefinitions));
  dependencyEdges.splice(0, dependencyEdges.length, ...structuredClone(snapshot.dependencyEdges));
  externalInputBindings.splice(0, externalInputBindings.length, ...structuredClone(snapshot.externalInputBindings));
  $("#prompt-input").value = snapshot.sourcePrompt;
  state.title = snapshot.title;
  state.voiceEnabled = snapshot.voiceEnabled;
  if (!getAtom(state.selectedId)) state.selectedId = state.atoms[0].id;
  ensureBusinessFields();
}

function invalidateWorkbench() {
  state.saved = false;
  state.validationReport = null;
  state.simulation = null;
  state.revision += 1;
  state.proposal = null;
  updateDraftStatus(false);
  $("#validation-button-label").textContent = "修改后需检查";
  $("#validation-score").textContent = "待检查";
  $("#validation-list").innerHTML = "";
  $("#validation-hashes").innerHTML = "";
  $("#validation-summary").textContent = "草案已修改，旧结果已失效。点击检查获取当前结果。";
  renderMatrix();
  renderAssistant();
  renderSimulation();
  renderNextStep();
  $$(".node-demo-result").forEach((element) => { element.textContent = "草案已修改，旧模拟结果已失效。"; });
  $$(".stage-result p").forEach((element) => { element.textContent = "草案已修改，请重新模拟。"; });
  $$(".business-stage > summary > small").forEach((element) => { element.textContent = "尚未模拟"; });
}

function refreshWorkbench() {
  ensureBusinessFields();
  $("#project-title").textContent = state.title;
  renderCanvas();
  renderMatrix();
  renderInspector();
  updateDraftStatus(state.saved);
  renderAssistant();
  renderSimulation();
  renderNextStep();
  $("#flow-node-count").textContent = state.atoms.length;
}

function undoWorkbench() {
  const snapshot = state.undoStack.pop();
  if (!snapshot) return toast("还没有可以撤销的修改", "warning");
  applyWorkbenchSnapshot(snapshot);
  invalidateWorkbench();
  refreshWorkbench();
  toast("已恢复上一次修改前的完整草案");
}

function inspectRequiredBindings() {
  const errors = [];
  const allEdges = [...edgeDefinitions, ...dependencyEdges];
  for (const atom of state.atoms) {
    if (atom.business && ["prompt", "input", "output"].some((key) => !atom.business[key]?.trim())) errors.push(atom.name + " 还缺处理要求、输入资料或输出要求");
    const ids = [...atom.inputs, ...atom.outputs].map((port) => port.portId);
    if (new Set(ids).size !== ids.length) errors.push(atom.id + " 有重复的输入输出标识");
    for (const input of atom.inputs) {
      const incoming = allEdges.filter((edge) => edge.to.atomId === atom.id && edge.to.portId === input.portId);
      const external = externalInputBindings.some((binding) => binding.atomId === atom.id && binding.portId === input.portId);
      if (input.required && !incoming.length && !external) errors.push(atom.id + "." + input.portId + " 尚未连接资料来源");
      if (["one", "zero_or_one"].includes(input.cardinality) && incoming.length > 1) errors.push(atom.id + "." + input.portId + " 单值输入不能连接多个来源");
    }
  }
  for (const id of ["01.1-H02", "01.1-H05", "01.1-H10"]) {
    if (!getAtom(id)?.human) errors.push(id + " 真人确认不能从可执行计划中省略");
  }
  return errors;
}

function modelSelect(model, human, key = "model") {
  return `<select name="${key}" ${human ? "disabled" : ""}>${Object.entries(demoModels).filter(([id]) => human ? id === "human" : id !== "human").map(([id, label]) => `<option value="${id}" ${id === model ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function capabilityName(value) {
  const labels = {"text.generate": "写文案", "image.generate": "生成图片", "image.edit": "修改图片", "video.submit": "提交视频", "video.poll": "查询视频", "media.download": "取回片段", "media.probe": "检查媒体", "audio.extract": "提取音轨", "speech.transcribe": "识别旁白", "voice.convert": "转换音色", "human.review": "真人决定", "hash.compute": "核对文件", "file.read": "读取文件", "source.lookup": "查询资料", "storage.put": "保存文件", "storage.get": "取回文件", "media.compose": "合成视频", "duration.measure": "测量时长", "quota.reserve": "检查预算", "idempotency.ledger": "防止重复提交", "audio.original_fallback": "保留原音"};
  return labels[value] || "额外能力（技术详情中查看）";
}

function businessSummaryMarkup(atom) {
  const business = atom.business;
  const allowed = [...new Set([...(atoms.find((item) => item.id === atom.id)?.capabilities || []), ...atom.capabilities])];
  return `<div class="business-note">示例资料，可修改。编辑会即时写入当前草案；点击顶部“保存草案”后才保留到下次打开。这里没有真实文件或模型调用。</div>
    <form id="business-editor" class="business-form">
      <label>节点名称<input name="name" required maxlength="60" value="${escapeHtml(atom.name)}"></label>
      <label>希望它做什么<textarea name="prompt" rows="3" required maxlength="2000">${escapeHtml(business.prompt)}</textarea></label>
      <label>准备什么资料<textarea name="input" rows="3" required maxlength="3000">${escapeHtml(business.input)}</textarea></label>
      <label>希望得到什么<textarea name="output" rows="2" required maxlength="1000">${escapeHtml(business.output)}</textarea></label>
      <label>由谁来处理${modelSelect(business.model, atom.human)}</label>
      <fieldset><legend>可以借助的能力（仅配置，不调用）</legend>${allowed.map((capability) => `<label class="check-option"><input type="checkbox" name="capability" value="${escapeHtml(capability)}" ${atom.capabilities.includes(capability) ? "checked" : ""} ${atom.human ? "disabled" : ""}>${escapeHtml(capabilityName(capability))}</label>`).join("") || "暂无能力绑定"}</fieldset>
      ${atom.human ? '<p class="business-note">正式批准只能由有权限的真人完成，AI和模拟测试都不能代签。</p>' : ""}
      <button class="button primary" type="submit">完成节点编辑</button>
    </form>
    <div class="business-actions"><button class="button" data-test-node>模拟测试这个节点</button><button class="button ghost" data-chat-node>和这个节点聊聊</button></div>
    <section class="node-demo-result">${nodeSimulationMarkup(atom)}</section>
    <details class="technical-details"><summary>技术详情与连接</summary><h4>输入</h4>${atom.inputs.map(portMarkup).join("")}<button class="small-action" data-add-port="input">增加输入</button><h4>输出</h4>${atom.outputs.map(portMarkup).join("")}<button class="small-action" data-add-port="output">增加输出</button></details>`;
}

function nodeSimulationMarkup(atom) {
  const record = state.simulation?.records.find((item) => item.atomId === atom.id);
  if (!record) return "<p class='muted'>还没有模拟结果。先保存设置，再测试。</p>";
  return `<strong>模拟结果 · ${escapeHtml(record.summary)}</strong><p>${escapeHtml(record.output)}</p>`;
}

function businessAdvancedMarkup(atom) {
  const labels = {input: "接收", check: "检查", execute: "处理", review: "确认", output: "交付"};
  const record = state.simulation?.records.find((item) => item.atomId === atom.id);
  return `<p class="business-note">五步属于同一个节点。先看做什么和模拟结果，底层合同放在技术详情中。</p>${Object.entries(labels).map(([key, label], index) => {
    const module = atom.modules[key];
    const result = record?.steps[index];
    return `<details class="business-stage" ${index === 0 ? "open" : ""}><summary><span>${index + 1}</span>${label}<small>${result ? escapeHtml(result.status) : "尚未模拟"}</small></summary>
      <form data-stage-form="${key}" class="business-form">
        <label>这一步怎么做<textarea name="action" rows="3" required maxlength="2000">${escapeHtml(module.action)}</textarea></label>
        <label>交给谁${key === "execute" ? modelSelect(atom.business.model, atom.human) : `<input value="${escapeHtml(module.executor)}" readonly>`}</label>
        <p>使用：${module.capabilities.map(capabilityName).map(escapeHtml).join("、") || "平台固定规则，不调用额外工具"}</p>
        <p><b>进入这一步：</b>${escapeHtml(index === 0 ? atom.business.input : "前一步的结果；不满足条件就停止")}</p>
        <div class="stage-result"><b>执行结果（仅模拟）</b><p>${escapeHtml(result?.output || "未测试，不显示虚构的运行结果")}</p></div>
        <button class="button" type="submit">完成这一步编辑</button>
        <details class="technical-details"><summary>技术详情</summary><p>模块：${key} · 执行者：${escapeHtml(module.executor)}</p><p>失败出口：${escapeHtml(module.onFailure)}</p><p>证据要求：${escapeHtml(module.evidence)}</p><p>正式执行：not_run；模拟结果不作审批或外部回执。</p></details>
      </form></details>`;
  }).join("")}<button class="button primary" data-test-node>模拟测试这个节点</button>`;
}

function applyEditorForm(atom, form, moduleKey = null) {
  const values = new FormData(form);
  if (!form.dataset.editing) { rememberUndo(); form.dataset.editing = "true"; }
  if (moduleKey) {
    atom.modules[moduleKey].action = String(values.get("action") ?? "");
  } else {
    atom.name = String(values.get("name") ?? "");
    for (const key of ["prompt", "input", "output"]) atom.business[key] = String(values.get(key) ?? "");
    if (!atom.human) {
      const allowed = new Set([...(atoms.find((item) => item.id === atom.id)?.capabilities || []), ...atom.capabilities]);
      atom.capabilities = values.getAll("capability").map(String).filter((capability) => allowed.has(capability));
      atom.modules.execute.capabilities = [...atom.capabilities];
    }
    atom.modules.execute.instruction = atom.business.prompt;
    if (atom.outputs[0]) atom.outputs[0].label = atom.business.output;
  }
  if ((!moduleKey || moduleKey === "execute") && !atom.human) {
    const model = values.get("model");
    if (model !== "human" && Object.hasOwn(demoModels, model)) atom.business.model = model;
  }
  atom.modules.execute.modelRef = {id: atom.business.model, mode: "demo_only"};
  invalidateWorkbench();
  renderCanvas();
  $("#inspector-name").textContent = atom.name || "未命名节点";
}

function bindBusinessEditor(atom) {
  const bindForm = (form, moduleKey = null) => {
    if (!form) return;
    const apply = () => applyEditorForm(atom, form, moduleKey);
    form.addEventListener("input", apply);
    form.addEventListener("change", apply);
    form.addEventListener("submit", (event) => {
      event.preventDefault(); apply(); refreshWorkbench(); toast("修改已进入草案；顶部保存可保留到下次打开");
    });
  };
  bindForm($("#business-editor"));
  $$('[data-stage-form]').forEach((stageForm) => bindForm(stageForm, stageForm.dataset.stageForm));
  $$('[data-test-node]').forEach((button) => button.addEventListener("click", () => startSimulation(atom.id)));
  $$('[data-chat-node]').forEach((button) => button.addEventListener("click", () => {
    state.chatScope = atom.id; closeInspector(); renderAssistant(); $("#chat-input").focus();
  }));
}

function syncAssistantScope() {
  const select = $("#chat-scope");
  if (!select) return;
  if (state.chatScope !== "flow" && !getAtom(state.chatScope)) state.chatScope = "flow";
  select.innerHTML = '<option value="flow">整条流程</option>' + state.atoms.map((atom) => `<option value="${escapeHtml(atom.id)}" ${state.chatScope === atom.id ? "selected" : ""}>${escapeHtml(atom.name)}</option>`).join("");
}

function makeChatProposal(text, scope) {
  const normalized = text.trim();
  const target = scope === "flow" ? null : getAtom(scope);
  const base = {revision: state.revision, scope, text};
  if (scope !== "flow" && !target) return {error: "这个节点已不存在，请重新选择。"};
  const renamed = normalized.match(/^(?:把)?(?:流程名称|流程名|名称|节点名称|节点名)(?:(?:改为|改成)\s*[：:]?|[：:])\s*(.+)$/);
  if (renamed) return {...base, kind: target ? "renameNode" : "renameFlow", value: renamed[1], summary: `名称改为「${renamed[1]}」`};
  if (scope === "flow" && /^(?:关闭|取消)统一音色[。！! ]*$/.test(normalized)) return {...base, kind: "voiceOff", summary: "保留音色节点，但关闭换声，保留原音。"};
  const removed = normalized.match(/^删除\s*(\S+?)\s*(?:节点)?$/);
  if (scope === "flow" && removed) {
    const atom = state.atoms.find((item) => item.id === removed[1] || item.id === `01.1-${removed[1]}` || item.name === removed[1]);
    if (!atom) return {error: "没有找到该节点。可用「删除 V09」这样的格式。"};
    if (state.atoms.length <= 1) return {error: "至少保留一个节点。"};
    return {...base, kind: "removeNode", value: atom.id, summary: `删除「${atom.name}」及相连边，不自动绕过审批或补接连接。缺少必要步骤时，草案会显示待修复。`};
  }
  const modified = normalized.match(/^(提示词|输入|输出|模型|能力)(?:(?:改为|改成)\s*[：:]?|[：:])\s*([\s\S]+)$/);
  if (modified && target) {
    const fields = {提示词: "prompt", 输入: "input", 输出: "output", 模型: "model", 能力: "capabilities"};
    let value = modified[2];
    if (modified[1] === "能力") {
      if (target.human) return {error: "真人决定能力不能替换或由AI代签。"};
      const allowed = atoms.find((item) => item.id === target.id)?.capabilities || [];
      const names = value.split(/[、，,]/).map((item) => item.trim()).filter(Boolean);
      const selected = names.map((name) => allowed.find((capability) => name === capability || name === capabilityName(capability)));
      if (!selected.length || selected.some((item) => !item)) return {error: "这里只能选择该节点已有的示例能力：" + allowed.map(capabilityName).join("、")};
      value = [...new Set(selected)];
    }
    if (modified[1] === "模型") {
      if (target.human) return {error: "真人决定不能换成模型代签。"};
      value = Object.keys(demoModels).find((id) => id !== "human" && (demoModels[id] === value || demoModels[id].split("（")[0] === value || id === value));
      if (!value) return {error: "模型尚未接入。请选择文案助手、分析助手或媒体工具的离线示例。"};
    }
    return {...base, kind: "editNode", field: fields[modified[1]], value, summary: `修改「${target.name}」的${modified[1]}为：${modified[2]}`};
  }
  return {error: target ? "还不能理解这句话。试试「提示词改为：先列出缺失资料」「输入改为：白色陶瓷杯，300毫升」「模型改为：分析助手」。也可以直接用简易编辑。" : "目前是离线指令演示。试试「流程名称改为：杯子短视频」「关闭统一音色」「删除 V09」，或选择一个节点再修改参数。"};
}

function confirmChatProposal() {
  const proposal = state.proposal;
  if (!proposal || proposal.revision !== state.revision) { state.proposal = null; renderAssistant(); return toast("草案已变化，请重新提出修改", "warning"); }
  rememberUndo();
  const atom = getAtom(proposal.scope);
  if (proposal.kind === "renameFlow") state.title = proposal.value;
  if (proposal.kind === "renameNode") atom.name = proposal.value;
  if (proposal.kind === "voiceOff") state.voiceEnabled = false;
  if (proposal.kind === "editNode") {
    if (proposal.field === "capabilities") {
      atom.capabilities = [...proposal.value];
      atom.modules.execute.capabilities = [...proposal.value];
    } else atom.business[proposal.field] = proposal.value;
    if (proposal.field === "output" && atom.outputs[0]) atom.outputs[0].label = proposal.value;
    if (proposal.field === "prompt") atom.modules.execute.instruction = proposal.value;
    if (proposal.field === "model") atom.modules.execute.modelRef = {id: proposal.value, mode: "demo_only"};
  }
  if (proposal.kind === "removeNode") {
    state.atoms = state.atoms.filter((item) => item.id !== proposal.value);
    for (const edges of [edgeDefinitions, dependencyEdges]) {
      const remaining = edges.filter((edge) => edge.from.atomId !== proposal.value && edge.to.atomId !== proposal.value);
      edges.splice(0, edges.length, ...remaining);
    }
    const remaining = externalInputBindings.filter((binding) => binding.atomId !== proposal.value);
    externalInputBindings.splice(0, externalInputBindings.length, ...remaining);
    if (!getAtom(state.selectedId)) state.selectedId = state.atoms[0].id;
  }
  state.chatMessages.push({role: "assistant", text: "已修改草案。没有运行、发布或调用外部工具；可以撤销。"});
  invalidateWorkbench(); refreshWorkbench();
}

function renderAssistant() {
  if (!$("#chat-log")) return;
  syncAssistantScope();
  $("#chat-log").innerHTML = state.chatMessages.slice(-8).map((message) => `<p class="chat-message ${message.role}"><b>${message.role === "user" ? "你" : "草案助手"}</b>${escapeHtml(message.text)}</p>`).join("");
  $("#chat-proposal").innerHTML = state.proposal ? `<p>${escapeHtml(state.proposal.summary)}</p><button class="button primary" id="apply-proposal">确认修改草案</button><button class="button" id="discard-proposal">取消</button>` : "";
  if ($("#apply-proposal")) $("#apply-proposal").addEventListener("click", confirmChatProposal);
  if ($("#discard-proposal")) $("#discard-proposal").addEventListener("click", () => { state.proposal = null; renderAssistant(); });
  $("#chat-log").scrollTop = $("#chat-log").scrollHeight;
}

function startSimulation(scope = "flow") {
  const structuralErrors = [...edgeDefinitions, ...dependencyEdges].map(validateEdgeDefinition).filter(Boolean).concat(inspectRequiredBindings());
  if (structuralErrors.length) return toast("请先修复连接或缺少的步骤，再模拟测试", "warning");
  state.simulation = {mode: "synthetic_demo", realExecution: "not_run", revision: state.revision, scope, cursor: 0, queue: scope === "flow" ? state.atoms.map((atom) => atom.id) : [scope], records: [], waiting: null, status: "running", scenario: $("#demo-scenario").value, externalCalls: 0};
  advanceSimulation();
  $("#simulation-panel").classList.add("open");
}

function advanceSimulation() {
  const simulation = state.simulation;
  while (simulation && simulation.cursor < simulation.queue.length) {
    const atom = getAtom(simulation.queue[simulation.cursor]);
    if (!atom) { simulation.status = "blocked"; break; }
    const missing = simulation.scenario === "missing_image" && atom.id === "01.1-V01";
    const waiting = atom.human && !missing;
    const record = {atomId: atom.id, summary: missing ? "缺少主播图，演练停止" : waiting ? "等待模拟人工决定" : "示例步骤已演练", output: missing ? "后续节点未模拟，没有业务任务或文件被创建。" : atom.business.output, steps: []};
    for (const [index, key] of ["input", "check", "execute", "review", "output"].entries()) {
      const stopped = missing && index >= 2 || waiting && index >= 3;
      record.steps.push({key, status: stopped ? "未开始" : missing && index === 1 ? "模拟阻断" : waiting && index === 2 ? "等待模拟决定" : "模拟完成", output: stopped ? "前一步未通过，不继续。" : index === 0 ? atom.business.input : index === 4 ? atom.business.output : atom.modules[key].action + "（合成样例，不执行外部动作）"});
    }
    if (atom.id === "01.1-V09" && !state.voiceEnabled) { record.summary = "模拟跳过换声，保留原音"; record.output = "六镜均标记为跳过；没有发生音色转换。"; }
    simulation.records.push(record);
    if (missing) { simulation.status = "blocked"; break; }
    if (waiting) { simulation.waiting = atom.id; simulation.status = "waiting"; break; }
    simulation.cursor += 1;
  }
  if (simulation && simulation.cursor === simulation.queue.length) simulation.status = "demo_completed";
  renderSimulation(); renderInspector(); renderNextStep();
}

function simulateHumanDecision(approved) {
  const simulation = state.simulation;
  if (!simulation?.waiting || simulation.revision !== state.revision) return;
  const record = simulation.records.at(-1);
  record.summary = approved ? "演练：模拟同意，不是正式批准" : "演练：模拟退回，停止后续";
  for (const step of record.steps.slice(2)) { step.status = approved ? "模拟完成" : "模拟退回"; step.output = record.summary; }
  simulation.waiting = null;
  if (!approved) { simulation.status = "returned"; renderSimulation(); renderInspector(); renderNextStep(); return; }
  simulation.cursor += 1;
  simulation.status = "running";
  advanceSimulation();
}

function renderSimulation() {
  if (!$("#simulation-results")) return;
  const simulation = state.simulation;
  $("#simulation-results").innerHTML = simulation ? `<p class="business-note">${simulation.scope === "flow" ? "整条流程" : "单节点"} · ${simulation.status === "demo_completed" ? "演练结束" : simulation.status === "waiting" ? "等待模拟选择" : "当前演练记录"}。外部调用为0；未生成真实图片、视频或批准记录。</p>${simulation.records.map((record) => `<details class="simulation-record"><summary>${escapeHtml(getAtom(record.atomId)?.name || record.atomId)} · ${escapeHtml(record.summary)}</summary>${record.steps.map((step) => `<p><b>${{input: "接收", check: "检查", execute: "处理", review: "确认", output: "交付"}[step.key]} · ${step.status}</b><br>${escapeHtml(step.output)}</p>`).join("")}</details>`).join("")}${simulation.waiting ? '<div class="business-actions"><button class="button primary" id="demo-approve">演练：模拟同意</button><button class="button" id="demo-return">演练：模拟退回</button></div>' : ""}` : '<p class="business-note">尚未模拟，或草案已修改，旧演练结果已失效。</p>';
  if ($("#demo-approve")) $("#demo-approve").addEventListener("click", () => simulateHumanDecision(true));
  if ($("#demo-return")) $("#demo-return").addEventListener("click", () => simulateHumanDecision(false));
}

function nextStepDescription() {
  const simulation = state.simulation;
  if (simulation?.waiting) return {label: "演练停在人工确认", detail: "请在模拟面板中选择同意或退回。这个选择不是真人批准。", action: "继续查看演练", target: "simulation"};
  if (simulation?.status === "blocked") return {label: "演练已停止，没有继续后续步骤", detail: "补充主播参考图后，再用完整合成样例测试。不会创建真实媒体。", action: "查看停止原因", target: "simulation"};
  if (simulation?.status === "returned") return {label: "演练中已退回", detail: "修改对应节点，再重新模拟；不会沿用之前的决定。", action: "查看退回位置", target: "simulation"};
  if (simulation?.status === "demo_completed") return {label: "演练结束，不代表业务已完成", detail: "可以保存草案。真实模型、文件和真人批准仍未接入。", action: "保存草案", target: "save"};
  const issues = [...edgeDefinitions, ...dependencyEdges].map(validateEdgeDefinition).filter(Boolean).concat(inspectRequiredBindings());
  if (issues.length) return {label: "还有内容需要补齐", detail: issues[0], action: "查看需要补齐的内容", target: "validation"};
  return {label: "下一步：先调整脚本，再模拟一遍", detail: "点击一个节点修改资料、要求和处理方式；也可以在下方选择范围，用对话提出修改。", action: "编辑脚本节点", target: "01.1-V02"};
}

function renderNextStep() {
  const label = $("#next-step-title");
  if (!label) return;
  const next = nextStepDescription();
  label.textContent = next.label;
  $("#next-step-detail").textContent = next.detail;
  $("#next-step-action").textContent = next.action;
}

function generateWorkbenchDraft() {
  if (!/视频|分镜|妆舟/.test($("#prompt-input").value)) return toast("当前只提供视频流程模板；其他目标需要补充设计，不会假装已经识别", "warning");
  if (state.revision > 0 && !window.confirm("重新生成会替换当前人工编辑。确定覆盖吗？取消可保留当前草案；确认后仍可撤销。")) return;
  const prompt = $("#prompt-input").value;
  rememberUndo();
  applyWorkbenchSnapshot(state.initialDraft);
  $("#prompt-input").value = prompt;
  invalidateWorkbench(); refreshWorkbench();
  $("#new-flow-modal").classList.remove("open");
  toast("已载入可编辑的视频流程模板。未调用大模型或业务工具");
}

function validateWorkbenchSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.atoms) || !snapshot.atoms.length || snapshot.atoms.length > 100) return false;
  if (typeof snapshot.sourcePrompt !== "string" || typeof snapshot.title !== "string" || typeof snapshot.voiceEnabled !== "boolean") return false;
  const ids = new Set();
  for (const atom of snapshot.atoms) {
    if (!atom || typeof atom.id !== "string" || !/^[\w.-]+$/.test(atom.id) || ids.has(atom.id) || typeof atom.name !== "string" || !["intent", "assets", "generation", "delivery"].includes(atom.stage) || typeof atom.type !== "string" || typeof atom.icon !== "string" || !/^[a-z-]+$/.test(atom.icon) || !Array.isArray(atom.capabilities) || !atom.capabilities.every((item) => typeof item === "string")) return false;
    ids.add(atom.id);
    for (const ports of [atom.inputs, atom.outputs]) {
      if (!Array.isArray(ports) || ports.some((port) => !port || ![port.portId, port.label, port.schemaRef, port.cardinality].every((value) => typeof value === "string") || !/^[a-z][a-zA-Z0-9_-]*$/.test(port.portId) || !["one", "zero_or_one", "one_or_more", "bounded_many"].includes(port.cardinality) || typeof port.required !== "boolean")) return false;
    }
    for (const key of ["input", "check", "execute", "review", "output"]) {
      const module = atom.modules?.[key];
      if (!module || ![module.action, module.executor, module.evidence, module.onFailure].every((value) => typeof value === "string") || !Array.isArray(module.capabilities) || !module.capabilities.every((value) => typeof value === "string")) return false;
    }
    if (atom.business && (!["prompt", "input", "output", "model"].every((key) => typeof atom.business[key] === "string") || !Object.hasOwn(demoModels, atom.business.model))) return false;
  }
  for (const edges of [snapshot.edgeDefinitions, snapshot.dependencyEdges]) {
    if (!Array.isArray(edges) || edges.some((edge) => !edge || ![edge.id, edge.from?.atomId, edge.from?.portId, edge.to?.atomId, edge.to?.portId, edge.transform, edge.cardinality].every((value) => typeof value === "string") || ![edge.from.atomId, edge.to.atomId].every((value) => /^[\w.-]+$/.test(value)))) return false;
  }
  return Array.isArray(snapshot.externalInputBindings) && snapshot.externalInputBindings.every((binding) => binding && [binding.atomId, binding.portId, binding.source, binding.state].every((value) => typeof value === "string"));
}

function saveWorkbenchDraft() {
  try {
    const snapshot = captureWorkbench();
    const report = createValidationReport();
    localStorage.setItem("eryuan-workbench-draft-v1", JSON.stringify({payloadVersion: "WorkbenchDraft@1", snapshot, report, executionEvidence: "not_run", savedAt: new Date().toISOString()}));
    state.saved = true; updateDraftStatus(true); toast("草案已保存在这个浏览器，没有实际运行");
  } catch { state.saved = false; updateDraftStatus(false); toast("浏览器未允许保存，修改仅保留在当前页面。可下载草案备份", "warning"); }
}

function restoreWorkbenchDraft() {
  try {
    const raw = localStorage.getItem("eryuan-workbench-draft-v1");
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (saved.payloadVersion !== "WorkbenchDraft@1" || !validateWorkbenchSnapshot(saved.snapshot)) throw new Error("invalid draft");
    applyWorkbenchSnapshot(saved.snapshot);
    state.saved = true; state.validationReport = null; state.revision += 1;
    return true;
  } catch { toast("未载入不兼容或不可读的存档，当前示例不受影响", "warning"); return false; }
}

function bindWorkbenchEvents() {
  $("#next-step-action").addEventListener("click", () => {
    const next = nextStepDescription();
    if (next.target === "simulation") return $("#simulation-panel").classList.add("open");
    if (next.target === "validation") return openValidation();
    if (next.target === "save") return saveWorkbenchDraft();
    state.selectedId = getAtom(next.target)?.id || state.atoms[0].id;
    state.inspectorTab = "summary";
    renderInspector(); openInspector();
  });
  $("#simulate-flow").addEventListener("click", () => startSimulation());
  $("#close-simulation").addEventListener("click", () => $("#simulation-panel").classList.remove("open"));
  $("#chat-scope").addEventListener("change", (event) => { state.chatScope = event.target.value; state.proposal = null; renderAssistant(); });
  $("#chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("#chat-input").value.trim();
    if (!text) return;
    state.chatMessages.push({role: "user", text});
    const proposal = makeChatProposal(text, state.chatScope);
    state.proposal = proposal.error ? null : proposal;
    state.chatMessages.push({role: "assistant", text: proposal.error || "请确认下面的修改预览；确认前不会改变草案。"});
    $("#chat-input").value = "";
    renderAssistant();
  });
  $("#chat-toggle").addEventListener("click", () => {
    const collapsed = $("#workflow-chat").classList.toggle("collapsed");
    $("#chat-toggle").setAttribute("aria-expanded", String(!collapsed));
    $("#chat-toggle").textContent = collapsed ? "展开对话" : "收起对话";
  });
  $("#export-draft").addEventListener("click", () => {
    const payload = {payloadVersion: "WorkbenchDraft@1", snapshot: captureWorkbench(), executionEvidence: "not_run"};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {type: "application/json"}));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "workflow-draft.json"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
