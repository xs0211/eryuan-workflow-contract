function initContractWorkbench() {
  const contract = RelayContract;
  const editor = RelayEditor;
  const storageKey = "eryuan-relay-desktop-draft-v1";
  const templateKey = "eryuan-relay-local-templates-v1";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const query = (selector) => document.querySelector(selector);
  ensureBusinessFields();
  const sampleGraph = contract.fromBusinessAtoms(state.atoms);
  const ui = { graph: editor.emptyDraft(), selected: null, panel: null, view: "business", stage: "execute", history: [], templates: [], connecting: null, report: null, proposal: null, simulation: null, saved: false, zoom: 1, notice: "", messages: [], attachments: [], job: null, epoch: 0, timer: null };
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const saved = JSON.parse(raw);
      ui.graph = contract.restore(raw); ui.saved = true;
      ui.messages = Array.isArray(saved.messages) ? saved.messages.filter((entry) => ["user", "assistant"].includes(entry?.role) && typeof entry.text === "string").slice(-100) : [];
      ui.attachments = Array.isArray(saved.attachments) ? saved.attachments.filter((entry) => typeof entry?.name === "string" && Number.isFinite(entry.size)).slice(0, 8) : [];
    } else {
      const legacy = JSON.parse(localStorage.getItem("eryuan-workbench-draft-v1") || "null");
      const shared = legacy ? null : JSON.parse(localStorage.getItem("eryuan-flow-studio-draft-v1") || "null");
      if (legacy?.payloadVersion === "WorkbenchDraft@1" && validateWorkbenchSnapshot(legacy.snapshot)) {
        ui.graph = contract.fromBusinessAtoms(legacy.snapshot.atoms);
        ui.graph.name = legacy.snapshot.title;
        ui.graph.ui = { ...ui.graph.ui, sourcePrompt: legacy.snapshot.sourcePrompt, legacySnapshot: structuredClone(legacy.snapshot) };
        ui.notice = "已保留旧草案和人工修改；旧连接及能力仍需核对，原存档未覆盖。";
      } else if (shared && validateDraftSnapshot(shared).ok) {
        const imported = structuredClone(shared.atoms);
        imported.forEach((atom) => { atom.business = { ...atom.business, prompt: atom.business?.prompt ?? atom.instruction ?? atom.modules.execute.action }; });
        ui.graph = contract.fromBusinessAtoms(imported);
        ui.graph.ui = { ...ui.graph.ui, sourcePrompt: shared.sourcePrompt, legacySnapshot: structuredClone(shared) };
        ui.notice = "已保留旧草案和人工说明；迁移不代表平台执行等价。";
      } else if (legacy || shared) ui.notice = "旧存档不兼容，未覆盖它；请先新建草案。";
    }
  } catch { ui.notice = "浏览器中的草案暂时无法读取，原存档没有被覆盖。"; }
  try {
    const entries = JSON.parse(localStorage.getItem(templateKey) || "[]");
    if (Array.isArray(entries)) ui.templates = entries.filter((entry) => entry?.doc?.schema === contract.schema && entry.doc.nodes?.length === 1 && entry.doc.edges?.length === 0);
  } catch { ui.notice = "卡片模板暂不可读，不影响创建流程。"; }
  const field = (label, name, value = "", type = "text") => `<label class="relay-field"><span>${escape(label)}</span><input name="${name}" type="${type}" value="${escape(value)}"></label>`;
  const area = (label, name, value = "") => `<label class="relay-field"><span>${escape(label)}</span><textarea name="${name}" rows="3">${escape(value)}</textarea></label>`;
  const select = (label, name, value, options) => `<label class="relay-field"><span>${escape(label)}</span><select name="${name}">${options.map(([option, text]) => `<option value="${escape(option)}" ${value === option ? "selected" : ""}>${escape(text)}</option>`).join("")}</select></label>`;
  const kinds = contract.definitions;
  const categories = [["input", "输入", ["text", "image", "file", "group_messages"]], ["ai", "AI处理", ["ai"]], ["human", "人", ["sign"]], ["output", "输出", ["group_send", "drive_save", "result"]]];
  const glyph = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${({ input: '<path d="M8 5h8M12 5v14M8 19h8"/>', ai: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M8 13h1M15 13h1M9 17h6"/>', human: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>', output: '<path d="M6 21V4h12l-3 4 3 4H6"/>', chat: '<path d="M4 5h16v12H9l-5 4V5Z"/>', templates: '<path d="M7 4h10v17l-5-4-5 4V4Z"/>', fit: '<path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/>', save: '<path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8"/>', undo: '<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12"/>', check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>' })[name] || ""}</svg>`;
  query("#app").innerHTML = `
    <div class="relay-app">
      <main class="relay-workspace">
        <section class="relay-board" aria-label="流程画布"><div class="relay-scroll" id="relay-scroll"><div class="relay-plane" id="relay-plane"><svg id="relay-edges" aria-label="步骤连线"></svg><div id="relay-cards"></div></div></div></section>
        <header class="studio-heading"><button id="relay-new" aria-label="新建流程" title="保留或保存当前修改后再新建">←</button><div><h1 id="relay-title"></h1><small id="relay-save-state"></small></div></header>
        <div class="studio-migration relay-migration" id="relay-migration" hidden><span>迁移草案有差异</span><button id="relay-migration-open">查看说明</button></div>
        <section class="studio-empty" id="relay-empty"><p class="studio-eyebrow">从一个想法开始</p><h2>把想法，变成清晰的工作流程</h2><p>在下方描述想完成的工作、能提供的资料和希望得到的结果。</p><button id="relay-manual">也可以手动搭建 →</button><button id="relay-example">填入一个视频示例</button></section>
        <nav class="relay-rail" aria-label="添加步骤">${categories.map(([key, label]) => `<button data-open-panel="${key}" aria-expanded="false">${glyph(key)}<span>${label}</span></button>`).join("")}</nav>
        <aside class="relay-palette relay-floating-panel" id="relay-palette" hidden><div class="relay-panel-head"><h2 id="relay-palette-title">添加步骤</h2><button data-close-panel aria-label="收起添加步骤">×</button></div>${categories.map(([key, label, entries]) => `<section id="relay-category-${key}" hidden><p>拖入画布，也可以点击加入。</p>${entries.map((kind) => `<button draggable="true" data-add-kind="${kind}" data-drag-kind="${kind}"><i class="relay-kind-dot ${kind}"></i>${kinds[kind].name}<small>空白</small></button>`).join("")}<h3>已配置样例</h3>${entries.map((kind) => `<button draggable="true" data-add-kind="${kind}" data-drag-kind="${kind}" data-preset="sample">${kinds[kind].name}<small>示例</small></button>`).join("")}</section>`).join("")}</aside>
        <aside class="relay-inspector relay-floating-panel" id="relay-inspector-panel" aria-label="步骤详情" hidden><div class="relay-panel-head"><button id="relay-back-business" hidden>← 步骤详情</button><span id="relay-inspector-caption">步骤详情</span><button data-close-panel aria-label="关闭步骤详情">×</button></div><div id="relay-inspector"></div></aside>
        <aside class="relay-templates-panel relay-floating-panel" id="relay-templates-panel" hidden><div class="relay-panel-head"><h2>我的卡片模板</h2><button data-close-panel aria-label="关闭模板">×</button></div><div id="relay-templates"></div><p class="relay-note">仅本地保存，不发布。</p></aside>
        <section class="studio-transcript relay-floating-panel" id="relay-conversation-panel" aria-label="对话与修改建议" hidden><div class="relay-panel-head"><h2>对话与修改建议</h2><button data-close-panel aria-label="收起对话记录">×</button></div><div id="relay-messages"></div><div id="relay-proposal"></div></section>
        <section class="studio-simulation relay-floating-panel" id="relay-simulation-panel" aria-label="模拟测试" hidden><div class="relay-panel-head"><h2>模拟测试</h2><button data-close-panel aria-label="收起模拟结果">×</button></div><p class="relay-note">使用合成样例；未调用真实模型或业务系统。模拟选择不生成真人批准。</p><div id="relay-simulation-results"></div></section>
        <nav class="relay-dock" id="relay-tools" aria-label="流程工具"><button id="relay-add-step" data-main-action data-open-panel="input">＋ 添加步骤</button><button id="relay-check" data-main-action>检查流程</button><button id="relay-simulate">模拟测试</button><button id="relay-save">保存草稿</button><button data-open-panel="templates">模板</button><span class="relay-divider"></span><button id="relay-undo">撤销</button><button id="relay-fit">适应画布</button><button id="relay-layout">整理</button><button id="relay-zoom-out" aria-label="缩小画布">−</button><span id="relay-zoom-label">100%</span><button id="relay-zoom-in" aria-label="放大画布">＋</button></nav>
        <form class="studio-composer" id="relay-composer"><div class="studio-scope"><span id="relay-scope-label">整个流程</span><button id="relay-clear-scope" type="button" aria-label="移除步骤标签，回到整个流程" hidden>×</button><button id="relay-history" type="button">对话记录</button></div><label class="studio-prompt-label" for="relay-chat-input">描述目标、资料和交付物</label><textarea id="relay-chat-input" rows="3" placeholder="想完成什么？能提供哪些资料？希望最后得到什么结果？"></textarea><div id="relay-attachments"></div><div class="studio-composer-actions"><button type="button" id="relay-attach">＋ 附件</button><input id="relay-attachment-input" type="file" multiple hidden><small id="relay-job-status" role="status">离线演示 · 不连接真实服务</small><button id="relay-cancel-job" type="button" data-main-action hidden>取消</button><button id="relay-chat-send" type="submit" data-main-action>生成流程</button></div></form>
        <div id="relay-connect-hint" class="relay-connect-hint"></div>
      </main><div id="relay-notice" role="status" aria-live="polite"></div>
      <dialog id="relay-dialog"><div class="relay-dialog-head"><h2 id="relay-dialog-title"></h2><button id="relay-dialog-close" aria-label="关闭">×</button></div><div id="relay-dialog-body"></div></dialog>
    </div>`;

  function notify(message) { ui.notice = message; query("#relay-notice").textContent = message; }
  function stopJob() { ui.epoch += 1; clearTimeout(ui.timer); ui.timer = null; ui.job = null; }
  function invalidate() { stopJob(); ui.report = null; ui.proposal = null; ui.simulation = null; ui.connecting = null; }
  function commit(graph, redraw = true) {
    ui.history.push(structuredClone(ui.graph));
    if (ui.history.length > 30) ui.history.shift();
    invalidate(); ui.graph = graph; ui.saved = false;
    if (!graph.nodes.some((node) => node.id === ui.selected)) { ui.selected = null; if (ui.panel === "inspector") ui.panel = null; }
    if (redraw) render(); else { refreshStatus(); renderCards(); renderConversation(); renderSimulation(); }
  }
  function log(role, text) { ui.messages.push({ role, text }); ui.messages = ui.messages.slice(-100); ui.saved = false; renderConversation(); refreshStatus(); }
  function openDialog(title, markup) { query("#relay-dialog-title").textContent = title; query("#relay-dialog-body").innerHTML = markup; if (!query("#relay-dialog").open) query("#relay-dialog").showModal(); }
  function closeDialog() { query("#relay-dialog").close(); }
  function openPanel(panel) { ui.panel = panel; syncPanels(); refreshStatus(); }
  function clearSelection() { ui.selected = null; ui.view = "business"; if (ui.panel === "inspector") ui.panel = null; render(); }
  function selectNode(id) { if (!ui.graph.nodes.some((node) => node.id === id)) return; ui.selected = id; ui.view = "business"; ui.panel = "inspector"; render(); }
  function syncPanels() {
    query("#relay-palette").hidden = !categories.some(([key]) => key === ui.panel);
    for (const [key, name] of categories) { query(`#relay-category-${key}`).hidden = ui.panel !== key; if (ui.panel === key) query("#relay-palette-title").textContent = `添加${name}`; }
    for (const panel of ["inspector", "templates", "conversation", "simulation"]) query(`#relay-${panel}-panel`).hidden = ui.panel !== panel;
    query("#relay-inspector-panel").classList.toggle("advanced", ui.view === "advanced");
    query("#relay-back-business").hidden = ui.view !== "advanced";
    query("#relay-inspector-caption").textContent = ui.view === "advanced" ? "高级编辑" : "步骤详情";
    for (const button of document.querySelectorAll("[data-open-panel]")) button.setAttribute("aria-expanded", String(button.dataset.openPanel === ui.panel));
  }
  function refreshStatus() {
    const empty = !ui.graph.nodes.length;
    const selected = ui.graph.nodes.find((node) => node.id === ui.selected);
    query("#relay-title").textContent = ui.graph.name || "未命名流程";
    query("#relay-save-state").textContent = ui.saved ? "草稿已保存在本浏览器" : "草稿 · 尚未保存";
    query("#relay-empty").hidden = !empty || ui.graph.ui?.editorMode === "manual";
    query(".relay-rail").hidden = empty && ui.graph.ui?.editorMode !== "manual";
    query("#relay-tools").hidden = empty && ui.graph.ui?.editorMode !== "manual";
    query("#relay-migration").hidden = !ui.graph.migration?.atoms?.degraded;
    query("#relay-scope-label").textContent = selected ? `正在修改：${selected.name}` : "整个流程";
    query("#relay-clear-scope").hidden = !selected;
    query("#relay-chat-send").textContent = empty ? "生成流程" : selected ? "准备修改这个步骤" : "准备修改流程";
    query("#relay-chat-input").placeholder = selected ? "告诉我这一步哪里要改，例如：名称改为…、处理说明改为…" : "想完成什么？能提供哪些资料？希望最后得到什么结果？";
    query("#relay-chat-input").disabled = Boolean(ui.job);
    query("#relay-chat-send").hidden = Boolean(ui.job);
    query("#relay-cancel-job").hidden = !ui.job;
    query("#relay-undo").disabled = !ui.history.length;
    query("#relay-job-status").textContent = ui.job?.label || "离线演示 · 不连接真实服务";
    const firstIssue = ui.report?.issues.find((issue) => issue.sev === "err");
    query("#relay-check").textContent = firstIssue ? "去修改第一个问题" : "检查流程";
    query("#relay-add-step").textContent = empty ? "＋ 添加第一个步骤" : "＋ 添加步骤";
    query("#relay-connect-hint").textContent = empty ? ui.graph.ui?.editorMode === "manual" ? "从左侧拖入一个步骤，或点击“添加第一个步骤”开始" : "" : ui.connecting ? "拖到兼容的输入点；按 Esc 取消" : "点击步骤查看；从输出点拖到输入点连接";
    const primary = ui.job ? "relay-cancel-job" : ui.proposal && ui.panel === "conversation" ? "relay-apply-proposal" : selected && ui.panel === "inspector" ? ui.view === "advanced" ? "relay-advanced-save" : "relay-edit-in-chat" : empty ? ui.graph.ui?.editorMode === "manual" ? "relay-add-step" : "relay-chat-send" : "relay-check";
    for (const button of document.querySelectorAll("[data-main-action]")) button.classList.toggle("relay-primary", button.id === primary);
  }
  function renderConversation() {
    query("#relay-messages").innerHTML = ui.messages.map((message) => `<div class="studio-message ${message.role}"><small>${message.role === "user" ? "你" : "离线助手"}</small><p>${escape(message.text)}</p></div>`).join("") || "<p class='relay-note'>描述需求后，修改建议会出现在这里；只有确认应用才改动草案。</p>";
    query("#relay-proposal").innerHTML = ui.proposal ? `<section class="studio-proposal"><h3>准备进行这些修改</h3><ul>${ui.proposal.changes.map((change) => `<li>${escape(change)}</li>`).join("")}</ul><button id="relay-apply-proposal" data-main-action>应用修改</button><button id="relay-discard-proposal">暂不修改</button></section>` : "";
    query("#relay-attachments").innerHTML = ui.attachments.map((file, index) => `<span>${escape(file.name)} · 仅记录名称<button type="button" data-remove-attachment="${index}" aria-label="移除附件 ${escape(file.name)}">×</button></span>`).join("");
  }
  function renderCards() {
    const issues = editor.check(ui.graph).issues;
    query("#relay-cards").innerHTML = ui.graph.nodes.map((node) => {
      const info = editor.describe(node);
      const errors = issues.filter((issue) => issue.node_id === node.id && issue.sev === "err");
      const status = ui.simulation?.records.find((record) => record.id === node.id);
      return `<article class="relay-card ${ui.selected === node.id ? "selected" : ""}" data-node="${escape(node.id)}" data-kind="${node.kind}" style="left:${Number.isFinite(node.x) ? node.x : 0}px;top:${Number.isFinite(node.y) ? node.y : 0}px;min-height:${Math.max(138, Math.max(node.inputs.length, node.outputs.length) * 23 + 50)}px"><div class="relay-card-head" data-drag-node="${escape(node.id)}"><i class="relay-kind-dot ${node.kind}"></i><button data-select-node="${escape(node.id)}">${escape(node.name)}</button><span>${node.kind === "sign" ? "真人" : node.kind === "ai" ? "AI" : "资料"}</span></div><p class="studio-card-task">${escape(info.task)}</p><div class="studio-card-summary"><p>需要 · ${escape(info.input)}</p><p>得到 · ${escape(info.output)}</p></div><div class="relay-card-ports"><div>${node.inputs.map((entry) => portButton(node, entry, "inputs")).join("")}</div><div>${node.outputs.map((entry) => portButton(node, entry, "outputs")).join("")}</div></div><footer class="${errors.length ? "needs-input" : ""}">${status ? `模拟：${simulationLabel(status.status)}` : errors.length ? "需要补充 · 点击查看" : "草案 · 待检查"}</footer></article>`;
    }).join("");
    const heights = new Map([...document.querySelectorAll(".relay-card")].map((card) => [card.dataset.node, card.offsetHeight]));
    query("#relay-plane").style.width = `${Math.max(360, ...ui.graph.nodes.map((node) => (Number.isFinite(node.x) ? node.x : 0) + 275))}px`;
    query("#relay-plane").style.height = `${Math.max(220, ...ui.graph.nodes.map((node) => (Number.isFinite(node.y) ? node.y : 0) + (heights.get(node.id) || 160) + 30))}px`;
    query("#relay-plane").style.zoom = ui.zoom;
    query("#relay-zoom-label").textContent = `${Math.round(ui.zoom * 100)}%`;
    query("#relay-cards").classList.toggle("connecting", Boolean(ui.connecting));
    requestAnimationFrame(drawConnections);
  }
  function portButton(node, entry, direction) {
    const source = ui.connecting && ui.graph.nodes.find((current) => current.id === ui.connecting.nodeId)?.outputs.find((port) => port.id === ui.connecting.portId);
    const compatible = source && direction === "inputs" && node.id !== ui.connecting.nodeId && entry.types.includes(source.types[0]);
    return `<button class="relay-port ${direction} ${compatible ? "compatible" : ""}" data-port-node="${escape(node.id)}" data-port-id="${escape(entry.id)}" data-direction="${direction}" aria-label="${escape(node.name)} ${direction === "outputs" ? "输出" : "输入"} ${escape(entry.name)}" title="${escape(entry.name)}：${entry.types.map((type) => contract.typeNames[type]).join("、")}"><i class="relay-port-dot ${entry.types[0]}"></i><span>${escape(entry.name)}</span></button>`;
  }
  function fitCanvas() {
    const viewport = query("#relay-scroll");
    const plane = query("#relay-plane");
    if (!viewport.clientWidth || !viewport.clientHeight) return;
    ui.zoom = Math.max(0.25, Math.min(1, (viewport.clientWidth - 210) / parseFloat(plane.style.width), (viewport.clientHeight - 430) / parseFloat(plane.style.height)));
    renderCards(); viewport.scrollLeft = 0; viewport.scrollTop = 0;
  }
  function render() { renderCards(); renderInspector(); renderConversation(); renderSimulation(); renderTemplates(); syncPanels(); refreshStatus(); if (ui.notice) notify(ui.notice); }
  function drawConnections() {
    const plane = query("#relay-plane");
    if (!plane) return;
    const bounds = plane.getBoundingClientRect();
    const buttons = [...document.querySelectorAll(".relay-port")];
    const endpoint = (nodeId, portId, direction) => {
      const button = buttons.find((entry) => entry.dataset.portNode === nodeId && entry.dataset.portId === portId && entry.dataset.direction === direction);
      return button?.querySelector("i")?.getBoundingClientRect();
    };
    query("#relay-edges").innerHTML = ui.graph.edges.map((edge) => {
      const start = endpoint(edge.from, edge.fromPort, "outputs");
      const end = endpoint(edge.to, edge.toPort, "inputs");
      if (!start || !end) return "";
      const startX = (start.left + start.width / 2 - bounds.left) / ui.zoom;
      const startY = (start.top + start.height / 2 - bounds.top) / ui.zoom;
      const endX = (end.left + end.width / 2 - bounds.left) / ui.zoom;
      const endY = (end.top + end.height / 2 - bounds.top) / ui.zoom;
      const offset = Math.max(55, Math.abs(endX - startX) / 2);
      return `<path data-edge="${escape(edge.id)}" class="${edge.fromPort === "rejected" ? "rejected" : ""}" d="M ${startX} ${startY} C ${startX + offset} ${startY}, ${endX - offset} ${endY}, ${endX} ${endY}"><title>${escape(edge.label || edge.id)}</title></path>`;
    }).join("");
  }

  function configFields(node) {
    const params = node.params || {};
    let content = "";
    if (node.kind === "ai") {
      content = area("要怎么处理", "prompt_p2", node.prompts?.p2) + select("由谁处理", "exec_kind", node.exec?.kind, [["platform", "平台模型"], ["org_agent", "组织中的 Agent"], ["agent", "我的 Agent"], ["expert", "专家"], ["a2a", "旧版 Agent（需核实）"]]);
      content += `<details><summary>处理者与工具的高级设置</summary><p class="relay-note">这些只是配置引用；尚未连接授权目录，填写不代表已获授权。</p>${field("模型（留空使用平台默认）", "exec_model", node.exec?.model)}${field("提供方", "exec_provider", node.exec?.provider)}${field("处理者编号", "exec_ref", node.exec?.ref)}${field("组织机器人编号", "exec_bot_uid", node.exec?.bot_uid)}${field("运行设备编号", "exec_runtime_id", node.exec?.runtime?.id)}${area("角色与前提", "prompt_p1", node.prompts?.p1)}${area("交付要求", "prompt_p3", node.prompts?.p3)}${field("技能编号（逗号分隔）", "skills", node.skills?.join(","))}${field("连接器编号（逗号分隔）", "connectors", node.connectors?.join(","))}${field("处理超时（秒）", "timeout_sec", node.timeout_sec, "number")}${field("排队超时（秒，可留空）", "queue_timeout_sec", node.queue_timeout_sec, "number")}<p class="relay-note">三段提示词不是业务五段；1.1 的数值上限尚待核对。</p></details>`;
    } else if (node.kind === "sign") {
      content = field("请谁确认（账号编号）", "gate_signer_uid", node.gate?.signer_uid) + field("显示姓名", "gate_signer_name", node.gate?.signer_name) + field("多久内确认（小时）", "gate_ttl_hours", node.gate?.ttl_hours, "number") + area("确认时需要看什么", "param_content", params.content) + select("确认范围", "gate_sign_mode", node.gate?.sign_mode || "", [["", "使用平台默认"], ["both", "按平台双侧规则"], ["assignee", "仅指定人"]]) + select("是否需要确认意见", "gate_require_conclusion", String(node.gate?.require_conclusion !== false), [["true", "需要"], ["false", "不强制"]]) + `<p class="relay-note">这里只配置审核人，不会代签。通过与驳回可分别接线；到期不等于驳回。</p>`;
    } else if (["text", "image", "file"].includes(node.kind)) {
      content = select("什么时候填资料", "param_source", params.source, [["static", "编辑时准备"], ["runtime", "开始前填写"]]) + field("资料编号", "param_key", params.key) + field("给使用者看的名称", "param_label", params.label) + select("是否必须提供", "param_required", String(params.required !== false), [["true", "必须"], ["false", "可选"]]);
      if (node.kind === "text") content += area("文字内容", "param_content", params.content);
      if (node.kind === "file") content += select("文件用途", "param_mode", params.mode, [["read", "读取内容"], ["static", "原文件传递"]]);
      if (node.kind !== "text") content += `<p class="relay-note">文件空间尚未接入；此处不上传、不编造文件引用。已有附件配置会原样保留。</p>`;
    } else if (node.kind === "group_messages") {
      content = field("读取哪个群（编号）", "param_group_no", params.group_no) + select("消息范围", "param_range", params.range, [["last_n", "最近若干条"], ["24h", "最近 24 小时"], ["7d", "最近 7 天"], ["since_last_run", "上次运行后"]]) + field("最多读取多少条", "param_limit", params.limit, "number") + select("只看提到我的消息", "param_only_at_me", String(params.only_at_me), [["false", "否"], ["true", "是"]]);
    } else if (node.kind === "group_send") {
      content = field("发送到哪个群（编号）", "param_group_no", params.group_no) + field("标题", "param_title", params.title) + area("正文（也可从上游接入）", "param_text", params.text);
    } else if (node.kind === "drive_save") {
      content = field("文件空间编号", "param_drive_space_id", params.drive_space_id) + field("文件夹编号", "param_folder_id", params.folder_id) + field("文件夹名称（展示）", "param_folder_path", params.folder_path) + field("文件名", "param_filename", params.filename) + select("遇到同名文件", "param_on_conflict", params.on_conflict, [["rename", "改名保存"], ["overwrite", "覆盖（实际执行需授权）"]]);
    } else if (node.kind === "result") content = select("交付结果", "param_outcome", params.outcome, [["success", "成功交付"], ["failed", "未完成"]]) + field("完成条件", "param_close_when", params.close_when);
    return content;
  }

  function portSettings(node) {
    return `<details class="relay-advanced"><summary>输入、输出与连线（技术设置）</summary>${["inputs", "outputs"].map((direction) => `<h3>${direction === "inputs" ? "需要的资料" : "交付的内容"}</h3>${node[direction].map((port) => `<div class="relay-port-setting"><span>${escape(port.name)}<small>${port.types.map((type) => contract.typeNames[type]).join("、")} · ${contract.systemPort(node, direction, port.id) ? "系统口（只可改名）" : "自定义"}</small></span><button data-edit-port="${escape(port.id)}" data-port-direction="${direction}">编辑</button></div>`).join("")}${(direction === "inputs" ? kinds[node.kind].customInputs : kinds[node.kind].customOutputs)?.length ? `<button data-new-port="${direction}">＋ 增加${direction === "inputs" ? "输入" : "输出"}</button>` : ""}`).join("")}<h3>关联连线</h3>${ui.graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).map((edge) => `<div class="relay-edge-setting"><span>${escape(ui.graph.nodes.find((entry) => entry.id === edge.from)?.name || edge.from)} → ${escape(ui.graph.nodes.find((entry) => entry.id === edge.to)?.name || edge.to)}</span><button data-remove-edge="${escape(edge.id)}">移除</button></div>`).join("") || "<p>尚未连接</p>"}</details>`;
  }
  function renderInspector() {
    const node = ui.graph.nodes.find((entry) => entry.id === ui.selected);
    if (!node) { query("#relay-inspector").innerHTML = ""; return; }
    const info = editor.describe(node);
    const issues = editor.check(ui.graph).issues.filter((issue) => issue.node_id === node.id && issue.sev === "err");
    const nextNames = ui.graph.edges.filter((edge) => edge.from === node.id).map((edge) => `${node.kind === "sign" ? edge.fromPort === "approved" ? "通过后：" : "退回后：" : ""}${ui.graph.nodes.find((entry) => entry.id === edge.to)?.name || "待修复连接"}`);
    if (ui.view === "business") {
      query("#relay-inspector").innerHTML = `<div class="relay-inspector-head"><h2>${escape(node.name)}</h2><p>${issues.length ? escape(issues[0].msg) : "这是可编辑的计划，尚未实际执行。"}</p></div><dl class="studio-business">${[["主要任务", info.task], ["需要什么", info.input], ["会得到什么", info.output], ["输出格式", info.format], ["处理方式", info.processor], ["下一步", nextNames.join("；") || "暂无后续步骤，可继续连线或作为交付点"]].map(([label, value]) => `<dt>${label}</dt><dd>${escape(value)}</dd>`).join("")}</dl><button id="relay-edit-in-chat" data-main-action>在对话中修改这个步骤</button><button id="relay-advanced-open">高级编辑 →</button><div class="relay-inspector-actions"><button id="relay-save-template">存为模板</button><button id="relay-remove-node" class="relay-danger">删除步骤</button></div>`;
      return;
    }
    const stage = editor.stagesFor(node)[ui.stage];
    const allowedActors = node.kind === "sign" && ui.stage === "execute" ? [["human", editor.actors.human]] : node.kind === "sign" && ui.stage === "review" ? [["approval_validator", editor.actors.approval_validator]] : Object.entries(editor.actors).filter(([key]) => !["human", "approval_validator"].includes(key));
    query("#relay-inspector").innerHTML = `<h2>${escape(node.name)}</h2><nav class="studio-stage-tabs" aria-label="原子内部五阶段">${editor.stageKeys.map((key) => `<button data-stage="${key}" aria-pressed="${ui.stage === key}">${editor.stageNames[key]}</button>`).join("")}</nav><form id="relay-stage-form"><h3>${editor.stageNames[ui.stage]}</h3>${area("这一步要做什么", "stage_action", stage.action)}${area("需要什么输入", "stage_input", stage.input)}${field("输出什么格式", "stage_outputFormat", stage.outputFormat)}${select("由谁处理", "stage_executor", stage.executor, allowedActors)}${field("需要什么能力（描述或已登记引用）", "stage_capability", stage.capability)}${field("模型（仅配置引用，尚未授权）", "stage_model", stage.model)}${select("遇到问题怎么办", "stage_onFailure", stage.onFailure, Object.entries(editor.failureActions))}<p class="relay-note">五阶段属于同一个原子。真人作决定与平台核验分开；这里的编辑不会调用工具。</p></form><details class="relay-advanced"><summary>模型、审核人及工具的技术设置</summary><form id="relay-node-form">${field("步骤名称", "name", node.name)}${configFields(node)}<button type="submit">保存技术配置</button></form>${select("模拟情景（不影响真实系统）", "simulation_scenario", node.params.simulationScenario || "normal", [["normal", "正常合成样例"], ["missing", "缺少资料"], ["failure", "处理失败"]])}</details>${portSettings(node)}<details class="relay-advanced"><summary>原始合同与版本详情</summary><pre>${escape(JSON.stringify({ kind: node.kind, id: node.id, original: node.params.businessContract || null }, null, 2))}</pre><p>这些是本地设计配置；不代表资源已授权或平台已执行。</p></details><div class="studio-advanced-footer"><button id="relay-advanced-save" data-main-action>保存并返回画布</button></div>`;
  }
  function renderTemplates() {
    query("#relay-templates").innerHTML = ui.templates.map((entry, index) => `<button draggable="true" data-drag-template="${index}" data-insert-template="${index}">${escape(entry.name)}</button>`).join("") || "<p>选中一个步骤后，可将它存为模板。</p>";
  }
  function showCheck() {
    ui.report = editor.check(ui.graph);
    const errors = ui.report.issues.filter((issue) => issue.sev === "err");
    openDialog(errors.length ? "需要补充" : "可以继续", `<p>${errors.length ? "流程停在检查阶段，没有执行任何步骤。草稿仍可保存。" : "结构检查完成，可以做合成样例模拟；不代表真实运行已就绪。"}</p>${ui.report.issues.map((issue) => `<div class="relay-issue ${issue.sev}"><strong>${escape(ui.graph.nodes.find((node) => node.id === issue.node_id)?.name || "整个流程")}</strong><p>${escape(issue.msg)}</p>${ui.graph.nodes.some((node) => node.id === issue.node_id) ? `<button data-resolve-node="${escape(issue.node_id)}">去修改 →</button>` : ""}</div>`).join("")}<p class="relay-note">检查只看结构。授权、真实审批、模型和媒体服务仍未开放。</p>`);
    refreshStatus();
  }
  function simulationLabel(status) { return ({ pending: "等待", processing: "处理中", waiting: "等你选择", passed: "模拟通过", needs_input: "需要补充", failed: "失败", skipped: "未选中分支", cancelled: "已取消", not_started: "未执行", completed: "模拟完成" })[status] || status; }
  function renderSimulation() {
    if (!ui.simulation) { query("#relay-simulation-results").innerHTML = ""; return; }
    const waiting = ui.simulation.records.find((record) => record.status === "waiting");
    query("#relay-simulation-results").innerHTML = `<h3>${simulationLabel(ui.simulation.status)}</h3>${ui.simulation.records.map((record) => `<div class="studio-sim-record" data-sim-node="${escape(record.id)}" data-sim-status="${record.status}"><strong>${escape(ui.graph.nodes.find((node) => node.id === record.id)?.name || record.id)}</strong><span>${simulationLabel(record.status)}</span><p>${escape(record.output)}</p></div>`).join("")}${waiting ? '<div class="studio-sim-decisions"><button data-sim-decision="approved">模拟同意（非正式批准）</button><button data-sim-decision="rejected">模拟退回</button></div>' : ""}`;
  }
  function saveDraft() {
    try {
      const payload = { ...contract.snapshot(ui.graph), messages: ui.messages, attachments: ui.attachments };
      localStorage.setItem(storageKey, JSON.stringify(payload)); ui.saved = true; refreshStatus(); notify("草稿已保存在本浏览器；未上传、未运行、未发布。"); return true;
    } catch { ui.saved = false; refreshStatus(); notify("浏览器未允许保存，请不要关闭页面；修改尚未持久化。"); return false; }
  }
  function advanceSimulation(decision) {
    if (!ui.simulation || !ui.job || ui.job.kind !== "simulation") return;
    const epoch = ui.epoch;
    try {
      ui.simulation = editor.tick(ui.graph, ui.simulation, decision);
      renderSimulation(); renderCards();
      if (ui.simulation.status === "running") ui.timer = setTimeout(() => { if (ui.epoch === epoch) advanceSimulation(); }, 360);
      else if (ui.simulation.status !== "waiting") { stopJob(); refreshStatus(); }
    } catch (error) { stopJob(); notify(error.message); refreshStatus(); }
  }
  function startSimulation() {
    ui.report = editor.check(ui.graph);
    if (!ui.report.simulationAllowed) { showCheck(); return; }
    stopJob(); ui.proposal = null;
    ui.simulation = editor.simulation(ui.graph);
    ui.job = { kind: "simulation", label: "正在模拟 · 不调用真实服务" };
    ui.panel = "simulation"; render(); advanceSimulation();
  }
  function sendMessage() {
    if (ui.job) return;
    const message = query("#relay-chat-input").value.trim();
    if (!message) { notify("先写下想完成的工作、能提供的资料和想得到的结果。"); query("#relay-chat-input").focus(); return; }
    log("user", message);
    if (!ui.graph.nodes.length) {
      stopJob();
      const epoch = ui.epoch;
      const base = editor.signature(ui.graph);
      ui.job = { kind: "generation", label: "正在理解需求（离线模拟）" }; refreshStatus();
      ui.timer = setTimeout(() => {
        if (epoch !== ui.epoch || base !== editor.signature(ui.graph)) return;
        ui.job.label = "正在安排步骤（离线模拟）"; refreshStatus();
        ui.timer = setTimeout(() => {
          if (epoch !== ui.epoch || base !== editor.signature(ui.graph)) return;
          try {
            const graph = editor.generate(message, sampleGraph, ui.attachments);
            commit(graph); ui.selected = null; ui.panel = null;
            query("#relay-chat-input").value = "";
            log("assistant", `已按离线样例整理出 ${graph.nodes.length} 个步骤。下一步点击“检查流程”，或选中步骤继续修改；这不是模型真实生成。`);
            render(); requestAnimationFrame(fitCanvas);
          } catch (error) { stopJob(); log("assistant", error.message); openPanel("conversation"); notify(error.message); }
        }, 360);
      }, 240);
    } else {
      try {
        ui.proposal = editor.propose(ui.graph, message, ui.selected);
        if (ui.attachments.length) {
          const node = ui.proposal.graph.nodes.find((entry) => entry.id === ui.selected);
          if (node) node.params.referenceAttachments = structuredClone(ui.attachments); else ui.proposal.graph.ui = { ...ui.proposal.graph.ui, referenceAttachments: structuredClone(ui.attachments) };
          ui.proposal.changes.push("记录附件名称与大小；未读取文件内容、未上传、未绑定真实产物");
        }
        query("#relay-chat-input").value = ""; renderConversation(); openPanel("conversation");
      } catch (error) { log("assistant", error.message); openPanel("conversation"); }
    }
  }
  function editPortDialog(direction, portId) {
    const node = ui.graph.nodes.find((entry) => entry.id === ui.selected);
    const existing = node[direction].find((entry) => entry.id === portId);
    const system = existing && contract.systemPort(node, direction, portId);
    const allowed = direction === "inputs" ? kinds[node.kind].customInputs : kinds[node.kind].customOutputs;
    openDialog(existing ? "编辑端口" : "增加端口", `<form id="relay-port-form">${field("名称", "port_name", existing?.name)}${!system ? `<fieldset><legend>接受的内容${direction === "outputs" ? "（只选一种）" : "（可多选）"}</legend>${(allowed || []).map((type) => `<label><input type="${direction === "outputs" ? "radio" : "checkbox"}" name="port_type" value="${type}" ${existing?.types.includes(type) ? "checked" : ""}>${contract.typeNames[type]}</label>`).join("")}</fieldset>${direction === "inputs" ? select("是否必须接入", "port_required", String(existing?.required !== false), [["true", "必须"], ["false", "可选"]]) : ""}` : "<p>系统端口的编号、类型和必填规则由契约固定，不能删除。</p>"}${direction === "outputs" && node.kind === "ai" ? area("这份输出要包含什么", "port_prompt", existing?.prompt) : ""}<button class="relay-primary" type="submit">保存端口</button>${existing && !system ? '<button id="relay-delete-port" type="button" class="relay-danger">删除端口及关联连线</button>' : ""}</form>`);
    query("#relay-port-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      try {
        let graph;
        let removedEdges = 0;
        if (existing) {
          const update = { name: String(data.get("port_name")).trim() };
          if (!system) { update.types = data.getAll("port_type"); if (direction === "inputs") update.required = data.get("port_required") === "true"; }
          if (data.has("port_prompt")) update.prompt = data.get("port_prompt");
          ({ graph, removedEdges } = contract.editPort(ui.graph, node.id, direction, portId, update));
        } else {
          graph = contract.addPort(ui.graph, node.id, direction, String(data.get("port_name")).trim(), data.getAll("port_type"), data.get("port_required") !== "false");
          if (data.has("port_prompt")) graph.nodes.find((entry) => entry.id === node.id)[direction].at(-1).prompt = data.get("port_prompt");
        }
        commit(graph); closeDialog(); notify(removedEdges ? `端口已更新，已移除 ${removedEdges} 条不兼容连线。可撤销。` : "端口已保存，编号保持稳定；旧检查已失效。");
      } catch (error) { notify(error.message); }
    });
    query("#relay-delete-port")?.addEventListener("click", () => {
      try { const result = contract.editPort(ui.graph, node.id, direction, portId, { remove: true }); commit(result.graph); closeDialog(); notify(`已移除端口及 ${result.removedEdges} 条连线，可撤销。`); } catch (error) { notify(error.message); }
    });
  }

  function updateNodeForm(form, redraw = true) {
    const next = structuredClone(ui.graph);
    const node = next.nodes.find((entry) => entry.id === ui.selected);
    const data = new FormData(form);
    node.name = String(data.get("name")).trim() || kinds[node.kind].name;
    for (const [key, value] of data) {
      if (key.startsWith("param_")) {
        const name = key.slice(6);
        node.params[name] = ["required", "only_at_me"].includes(name) ? value === "true" : name === "limit" ? Number(value) : value;
      }
      if (key.startsWith("prompt_")) node.prompts[key.slice(7)] = value;
    }
    if (node.kind === "ai") {
      const kind = data.get("exec_kind");
      node.exec = { ...node.exec, kind };
      ["model", "provider", "ref", "bot_uid"].forEach((key) => { const value = data.get(`exec_${key}`); if (value) node.exec[key] = value; else delete node.exec[key]; });
      if (data.get("exec_runtime_id")) node.exec.runtime = { ...node.exec.runtime, id: data.get("exec_runtime_id") }; else delete node.exec.runtime;
      if (kind === "platform") ["ref", "bot_uid", "runtime", "materialized"].forEach((key) => delete node.exec[key]);
      ["skills", "connectors"].forEach((key) => { node[key] = [...new Set(String(data.get(key) || "").split(/[,，\n]/).map((value) => value.trim()).filter(Boolean))]; });
      node.timeout_sec = Number(data.get("timeout_sec"));
      if (data.get("queue_timeout_sec") !== "") node.queue_timeout_sec = Number(data.get("queue_timeout_sec")); else delete node.queue_timeout_sec;
    }
    if (node.kind === "sign") {
      node.gate = { ...node.gate, signer_uid: String(data.get("gate_signer_uid")).trim(), signer_name: data.get("gate_signer_name"), ttl_hours: Number(data.get("gate_ttl_hours")), require_conclusion: data.get("gate_require_conclusion") === "true" };
      delete node.gate.ttl_minutes;
      if (data.get("gate_sign_mode")) node.gate.sign_mode = data.get("gate_sign_mode"); else delete node.gate.sign_mode;
    }
    if (node.kind === "ai") { node.params.editorTask = node.prompts.p2; node.params.editorStages = editor.stagesFor(node); node.params.editorStages.execute.action = node.prompts.p2; }
    commit(next, redraw);
    if (redraw) notify("步骤已修改，旧检查已失效。请再检查并保存草案。");
    else renderCards();
  }

  function addNode(kind, preset, position) {
    const next = structuredClone(ui.graph);
    const node = contract.createNode(kind, contract.newId("node_", next.nodes.map((entry) => entry.id)), position || canvasPosition());
    if (preset === "sample") {
      node.name += "示例";
      if (kind === "ai") node.prompts.p2 = "根据提供的资料整理重点；缺少事实时先提醒，不编造内容。";
      if (kind === "text") node.params.content = "合成示例：白色陶瓷杯，容量300毫升。";
      node.params.editorTask = kind === "sign" ? "请真人核对内容后作决定" : "按示例要求处理资料";
    }
    node.params.editorStages = editor.stagesFor(node);
    next.nodes.push(node); next.ui = { ...next.ui, editorMode: "manual" };
    commit(next); selectNode(node.id); requestAnimationFrame(fitCanvas);
    notify("步骤已加入。可以在下方描述修改，也可以打开高级编辑。");
  }
  function canvasPosition(event) {
    const viewport = query("#relay-scroll").getBoundingClientRect();
    const plane = query("#relay-plane").getBoundingClientRect();
    return { x: Math.max(0, ((event?.clientX ?? viewport.left + viewport.width / 2) - plane.left) / ui.zoom - 112), y: Math.max(0, ((event?.clientY ?? viewport.top + (viewport.height - 220) / 2) - plane.top) / ui.zoom - 50) };
  }
  function newDraft(manual) {
    const proceed = () => {
      commit(editor.emptyDraft()); ui.graph.ui.editorMode = manual ? "manual" : "new";
      ui.selected = null; ui.messages = []; ui.attachments = []; ui.view = "business"; ui.panel = manual ? "input" : null;
      closeDialog(); render(); requestAnimationFrame(fitCanvas);
    };
    if (!ui.graph.nodes.length) { proceed(); return; }
    openDialog("保留修改，还是新建草稿？", '<p>新建会切换到空画布，当前图会保留在撤销记录中；需要长期保留时先保存。不会默默覆盖你的步骤。</p><button id="relay-keep-edits">保留我的修改</button><button id="relay-new-confirm">生成新草稿</button>');
    query("#relay-keep-edits").onclick = closeDialog;
    query("#relay-new-confirm").onclick = proceed;
  }
  function stageInput(form) {
    const data = new FormData(form);
    const fields = Object.fromEntries([...data].filter(([key]) => key.startsWith("stage_")).map(([key, value]) => [key.slice(6), value]));
    try { commit(editor.updateStage(ui.graph, ui.selected, ui.stage, fields), false); }
    catch (error) { notify(error.message); renderInspector(); }
  }
  query("#app").addEventListener("submit", (event) => {
    if (!["relay-node-form", "relay-stage-form", "relay-composer"].includes(event.target.id)) return;
    event.preventDefault();
    if (event.target.id === "relay-node-form") updateNodeForm(event.target);
    else if (event.target.id === "relay-stage-form") stageInput(event.target);
    else sendMessage();
  });
  query("#app").addEventListener("input", (event) => {
    const nodeForm = event.target.closest("#relay-node-form");
    const stageForm = event.target.closest("#relay-stage-form");
    if (nodeForm) updateNodeForm(nodeForm, false);
    else if (stageForm) stageInput(stageForm);
    else if (event.target.name === "simulation_scenario") { const next = structuredClone(ui.graph); next.nodes.find((node) => node.id === ui.selected).params.simulationScenario = event.target.value; commit(next, false); }
  });
  let ignorePortClick = false;
  query("#app").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) { const card = event.target.closest(".relay-card"); if (card) selectNode(card.dataset.node); return; }
    try {
      if (button.dataset.openPanel) openPanel(ui.panel === button.dataset.openPanel ? null : button.dataset.openPanel);
      if (button.dataset.closePanel !== undefined) { if (ui.panel === "inspector") clearSelection(); else openPanel(null); }
      if (button.dataset.selectNode) { ui.proposal = null; selectNode(button.dataset.selectNode); }
      if (button.dataset.resolveNode) { closeDialog(); selectNode(button.dataset.resolveNode); }
      if (button.dataset.addKind) addNode(button.dataset.addKind, button.dataset.preset);
      if (button.dataset.stage) { ui.stage = button.dataset.stage; renderInspector(); refreshStatus(); }
      if (button.dataset.portNode && !ignorePortClick) {
        if (button.dataset.direction === "outputs") { ui.connecting = { nodeId: button.dataset.portNode, portId: button.dataset.portId }; renderCards(); refreshStatus(); }
        else if (ui.connecting) { commit(contract.connect(ui.graph, ui.connecting.nodeId, ui.connecting.portId, button.dataset.portNode, button.dataset.portId)); notify("已连接这两个步骤。旧检查已失效。"); }
        else notify("请从一个输出点拖到这里，或先点击输出点。");
      }
      if (button.dataset.editPort) editPortDialog(button.dataset.portDirection, button.dataset.editPort);
      if (button.dataset.newPort) editPortDialog(button.dataset.newPort);
      if (button.dataset.removeEdge) { const next = structuredClone(ui.graph); next.edges = next.edges.filter((edge) => edge.id !== button.dataset.removeEdge); commit(next); }
      if (button.dataset.insertTemplate !== undefined) insertTemplate(Number(button.dataset.insertTemplate));
      if (button.dataset.removeAttachment !== undefined) { ui.attachments.splice(Number(button.dataset.removeAttachment), 1); ui.proposal = null; ui.saved = false; renderConversation(); refreshStatus(); }
      if (button.dataset.simDecision) advanceSimulation(button.dataset.simDecision);
      if (button.id === "relay-advanced-open") { ui.view = "advanced"; renderInspector(); syncPanels(); refreshStatus(); }
      if (button.id === "relay-edit-in-chat") { query("#relay-chat-input").focus(); notify("下方已标记当前步骤，描述修改后会先给你确认。"); }
      if (button.id === "relay-advanced-save" && saveDraft()) clearSelection();
      if (button.id === "relay-apply-proposal") {
        const proposal = ui.proposal;
        const graph = editor.applyProposal(ui.graph, proposal);
        commit(graph); log("assistant", "已应用刚才确认的修改，可在工具栏撤销。"); openPanel(null);
      }
      if (button.id === "relay-discard-proposal") { ui.proposal = null; renderConversation(); refreshStatus(); }
      if (button.id === "relay-remove-node") {
        ui.proposal = editor.propose(ui.graph, "删除这个步骤", ui.selected); renderConversation(); openPanel("conversation");
      }
      if (button.id === "relay-save-template") {
        const node = ui.graph.nodes.find((entry) => entry.id === ui.selected);
        const doc = contract.cardTemplate(node);
        const errors = contract.validate(doc).filter((issue) => issue.sev === "err" && issue.code !== "required_port_unconnected");
        if (errors.length) throw new Error(`请先补充这一步：${errors[0].msg}`);
        const entries = [...ui.templates, { id: contract.newId("local_tpl_", ui.templates.map((entry) => entry.id)), name: node.name, doc }];
        localStorage.setItem(templateKey, JSON.stringify(entries)); ui.templates = entries; renderTemplates(); notify("模板已保存在本浏览器，没有发布。");
      }
    } catch (error) { notify(error.message || "没有完成修改，请检查输入。"); }
  });
  function insertTemplate(index, position) {
    const template = ui.templates[index];
    if (!template) throw new Error("这个模板已不存在，请重新选择。");
    const next = structuredClone(ui.graph);
    const node = contract.instantiate(template.doc, next, template.id);
    Object.assign(node, position || canvasPosition()); next.nodes.push(node);
    commit(next); selectNode(node.id); requestAnimationFrame(fitCanvas);
    notify("已加入模板副本；没有复制旧连线或运行状态。");
  }
  query("#relay-dialog-close").onclick = closeDialog;
  query("#relay-new").onclick = () => newDraft(false);
  query("#relay-manual").onclick = () => newDraft(true);
  query("#relay-example").onclick = () => { query("#relay-chat-input").value = "我提供主播排期、商品资料和参考图片，希望制作一条六镜30秒视频，脚本、素材和成片由真人确认后交付，不自动发布。"; query("#relay-chat-input").focus(); };
  query("#relay-clear-scope").onclick = () => { ui.proposal = null; clearSelection(); };
  query("#relay-history").onclick = () => openPanel(ui.panel === "conversation" ? null : "conversation");
  query("#relay-back-business").onclick = () => { ui.view = "business"; renderInspector(); syncPanels(); refreshStatus(); };
  query("#relay-save").onclick = saveDraft;
  query("#relay-check").onclick = () => {
    const issue = ui.report?.binding === editor.signature(ui.graph) && ui.report.issues.find((entry) => entry.sev === "err" && ui.graph.nodes.some((node) => node.id === entry.node_id));
    if (issue) selectNode(issue.node_id); else showCheck();
  };
  query("#relay-simulate").onclick = startSimulation;
  query("#relay-cancel-job").onclick = () => { if (ui.simulation) ui.simulation = editor.cancel(ui.simulation); stopJob(); render(); notify("已取消；没有创建实际流程运行或外部任务。"); };
  query("#relay-undo").onclick = () => { if (!ui.history.length) return; invalidate(); ui.graph = ui.history.pop(); ui.saved = false; ui.selected = null; ui.panel = null; render(); requestAnimationFrame(fitCanvas); notify("已撤销修改，请重新检查。"); };
  query("#relay-fit").onclick = () => { openPanel(null); fitCanvas(); };
  query("#relay-zoom-in").onclick = () => { ui.zoom = Math.min(1.5, ui.zoom + 0.1); renderCards(); };
  query("#relay-zoom-out").onclick = () => { ui.zoom = Math.max(0.25, ui.zoom - 0.1); renderCards(); };
  query("#relay-layout").onclick = () => {
    const next = structuredClone(ui.graph);
    const heights = new Map([...document.querySelectorAll(".relay-card")].map((card) => [card.dataset.node, card.offsetHeight]));
    const columns = [0, 0, 0, 0];
    next.nodes.forEach((node, index) => { const column = index % 4; node.x = 30 + column * 300; node.y = 40 + columns[column]; columns[column] += Math.max(205, (heights.get(node.id) || 160) + 45); });
    commit(next); openPanel(null); requestAnimationFrame(fitCanvas); notify("只整理卡片位置，配置和连线未变，可撤销。");
  };
  query("#relay-migration-open").onclick = () => openDialog("迁移说明", `<ul>${(ui.graph.migration?.atoms?.notes || []).map((note) => `<li>${escape(note)}</li>`).join("")}</ul><p>这是本地草案，不是原站源码导出或已部署版本；原始业务五段仍保留，实际能力尚待平台核验。</p>`);
  query("#relay-attach").onclick = () => query("#relay-attachment-input").click();
  query("#relay-attachment-input").addEventListener("change", (event) => {
    ui.attachments = [...(event.target.files || [])].slice(0, 8).map((file) => ({ name: file.name, size: file.size, type: file.type || "unknown", status: "metadata_only_not_uploaded" }));
    ui.proposal = null; ui.saved = false; renderConversation(); refreshStatus();
    notify("仅记录附件名称和大小；本轮不读取内容、不上传，也不会假装资料已验证。");
  });
  query("#app").addEventListener("dragstart", (event) => {
    const resource = event.target.closest("[data-drag-kind], [data-drag-template]");
    if (!resource) return;
    const payload = resource.dataset.dragKind ? { kind: resource.dataset.dragKind, preset: resource.dataset.preset || "" } : { template: Number(resource.dataset.dragTemplate) };
    event.dataTransfer.setData("application/x-eryuan-node", JSON.stringify(payload)); event.dataTransfer.effectAllowed = "copy";
  });
  query("#relay-scroll").addEventListener("dragover", (event) => { if ([...(event.dataTransfer.types || [])].includes("application/x-eryuan-node")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } });
  query("#relay-scroll").addEventListener("drop", (event) => {
    const raw = event.dataTransfer.getData("application/x-eryuan-node");
    if (!raw) return; event.preventDefault();
    try { const data = JSON.parse(raw); if (data.kind) addNode(data.kind, data.preset, canvasPosition(event)); else if (Number.isInteger(data.template)) insertTemplate(data.template, canvasPosition(event)); }
    catch { notify("无法添加这个步骤，请从左侧已提供的列表重新选择。"); }
  });
  query("#relay-cards").addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const port = event.target.closest("[data-port-node]");
    const handle = event.target.closest("[data-drag-node]");
    if (!port && !handle) return;
    if (port && port.dataset.direction !== "outputs") return;
    const startX = event.clientX; const startY = event.clientY;
    const before = structuredClone(ui.graph);
    const node = !port && ui.graph.nodes.find((entry) => entry.id === handle.dataset.dragNode);
    const origin = node && { x: node.x, y: node.y };
    const card = handle?.closest(".relay-card");
    let moved = false;
    const move = (current) => {
      if (!moved && Math.abs(current.clientX - startX) + Math.abs(current.clientY - startY) < 5) return;
      if (!moved && port) { ui.connecting = { nodeId: port.dataset.portNode, portId: port.dataset.portId }; renderCards(); refreshStatus(); }
      moved = true;
      if (port) {
        drawConnections();
        const bounds = query("#relay-plane").getBoundingClientRect();
        const start = { x: (startX - bounds.left) / ui.zoom, y: (startY - bounds.top) / ui.zoom };
        const end = { x: (current.clientX - bounds.left) / ui.zoom, y: (current.clientY - bounds.top) / ui.zoom };
        query("#relay-edges").innerHTML += `<path class="studio-pending-edge" d="M ${start.x} ${start.y} L ${end.x} ${end.y}"/>`;
      } else { node.x = Math.max(0, origin.x + (current.clientX - startX) / ui.zoom); node.y = Math.max(0, origin.y + (current.clientY - startY) / ui.zoom); card.style.left = `${node.x}px`; card.style.top = `${node.y}px`; drawConnections(); }
    };
    const finish = (current) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish);
      if (!moved) return;
      if (port) {
        ignorePortClick = true; setTimeout(() => { ignorePortClick = false; }, 0);
        const target = current.type !== "pointercancel" && document.elementFromPoint(current.clientX, current.clientY)?.closest("[data-port-node]");
        try {
          if (target?.dataset.direction === "inputs") commit(contract.connect(ui.graph, port.dataset.portNode, port.dataset.portId, target.dataset.portNode, target.dataset.portId));
          else notify("连接已取消，请把输出点拖到一个输入点。");
        } catch (error) { notify(error.message); }
        ui.connecting = null; renderCards(); refreshStatus();
      } else {
        const next = structuredClone(ui.graph); ui.graph = before;
        if (current.type !== "pointercancel") commit(next); else renderCards();
      }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { ui.connecting = null; if (ui.panel === "inspector") clearSelection(); else { openPanel(null); renderCards(); } } });
  window.addEventListener("resize", fitCanvas);
  render(); requestAnimationFrame(fitCanvas);
}
