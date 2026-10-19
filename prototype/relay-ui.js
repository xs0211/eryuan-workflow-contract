function initContractWorkbench() {
  const contract = RelayContract;
  const storageKey = "eryuan-relay-desktop-draft-v1";
  const templateKey = "eryuan-relay-local-templates-v1";
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const query = (selector) => document.querySelector(selector);
  ensureBusinessFields();
  const ui = { graph: contract.fromBusinessAtoms(state.atoms), selected: null, panel: null, history: [], templates: [], connecting: null, report: null, saved: false, zoom: 1, notice: "", chat: "" };
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) { ui.graph = contract.restore(saved); ui.saved = true; }
    else {
      const legacy = JSON.parse(localStorage.getItem("eryuan-workbench-draft-v1") || "null");
      const sharedDraft = legacy ? null : JSON.parse(localStorage.getItem("eryuan-flow-studio-draft-v1") || "null");
      if (legacy?.payloadVersion === "WorkbenchDraft@1" && validateWorkbenchSnapshot(legacy.snapshot)) {
        ui.graph = contract.fromBusinessAtoms(legacy.snapshot.atoms);
        ui.graph.name = legacy.snapshot.title;
        ui.graph.ui.sourcePrompt = legacy.snapshot.sourcePrompt;
        ui.graph.ui.legacySnapshot = structuredClone(legacy.snapshot);
        ui.graph.migration.atoms.notes.push("已保留旧草案完整快照与人工说明。旧自定义端口、依赖和模型需逐项重新映射；当前连线只是新契约的参考骨架，旧存档未覆盖。");
        ui.notice = "已载入旧草案的名称与人工说明；端口映射需检查。原存档保持不变。";
      } else if (sharedDraft && validateDraftSnapshot(sharedDraft).ok) {
        const importedAtoms = structuredClone(sharedDraft.atoms);
        for (const atom of importedAtoms) {
          atom.business = {
            ...atom.business,
            prompt: atom.business?.prompt ?? atom.instruction ?? atom.modules.execute.action,
          };
        }
        ui.graph = contract.fromBusinessAtoms(importedAtoms);
        ui.graph.ui.sourcePrompt = sharedDraft.sourcePrompt;
        ui.graph.ui.legacySnapshot = structuredClone(sharedDraft);
        ui.graph.ui.legacyStorageKey = "eryuan-flow-studio-draft-v1";
        ui.graph.migration.atoms.notes.push("已保留共享基线草案的完整快照和人工处理说明。旧端口、依赖、停用状态、执行模型和能力仍需逐项核对；旧报告和演示结果不作为当前执行证据。");
        ui.notice = "已载入旧草案的人工说明；连接与执行配置需检查。原存档保持不变。";
      } else if (legacy || sharedDraft) ui.notice = "旧草案格式不兼容，未覆盖原存档；当前显示初始样例。";
    }
  } catch { ui.notice = "未能读取草案，已载入原始样例；原存档没有被覆盖。"; }
  try {
    const savedTemplates = JSON.parse(localStorage.getItem(templateKey) || "[]");
    if (Array.isArray(savedTemplates)) ui.templates = savedTemplates.filter((entry) => entry?.doc?.schema === contract.schema && entry.doc.nodes?.length === 1 && entry.doc.edges?.length === 0);
  } catch { ui.notice = "本地模板暂不可读，不影响编辑当前草案。"; }
  const original = structuredClone(ui.graph);
  const field = (label, name, value = "", type = "text") => `<label class="relay-field"><span>${escape(label)}</span><input name="${name}" type="${type}" value="${escape(value)}"></label>`;
  const area = (label, name, value = "") => `<label class="relay-field"><span>${escape(label)}</span><textarea name="${name}" rows="3">${escape(value)}</textarea></label>`;
  const select = (label, name, value, options) => `<label class="relay-field"><span>${escape(label)}</span><select name="${name}">${options.map(([option, text]) => `<option value="${escape(option)}" ${value === option ? "selected" : ""}>${escape(text)}</option>`).join("")}</select></label>`;
  const kinds = contract.definitions;
  const categories = [["input", "输入", ["text", "image", "file", "group_messages"]], ["ai", "AI 处理", ["ai"]], ["human", "人", ["sign"]], ["output", "输出", ["group_send", "drive_save", "result"]]];
  const stageNames = { intent: "理解与脚本", assets: "制作画面", generation: "生成视频", delivery: "合成验收" };
  const glyph = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${({ input: '<path d="M8 5h8M12 5v14M8 19h8"/>', ai: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M8 13h1M15 13h1M9 17h6"/>', human: '<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>', output: '<path d="M6 21V4h12l-3 4 3 4H6"/>', chat: '<path d="M4 5h16v12H9l-5 4V5Z"/>', templates: '<path d="M7 4h10v17l-5-4-5 4V4Z"/>', fit: '<path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/>', save: '<path d="M5 3h12l4 4v14H3V3h2ZM7 3v6h10V3M7 21v-8h10v8"/>', undo: '<path d="m8 5-5 5 5 5M3 10h11a6 6 0 0 1 0 12"/>', check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>' })[name] || ""}</svg>`;
  query("#app").innerHTML = `
    <div class="relay-app">
      <main class="relay-workspace">
        <section class="relay-board" aria-label="流程画布"><div class="relay-scroll" id="relay-scroll"><div class="relay-plane" id="relay-plane"><div id="relay-stages"></div><svg id="relay-edges" aria-label="端口连线"></svg><div id="relay-cards"></div></div></div></section>
        <header class="relay-board-heading"><small>妆舟 · 流程草案</small><h1 id="relay-title"></h1><div class="relay-next"><p id="relay-next-hint">已放入视频制作样例。先确认目标，再逐步修改。</p><button id="relay-start" class="relay-primary">确认流程目标 →</button><button id="relay-goal-open" class="relay-text-button">修改目标</button></div></header>
        <div class="relay-status-area"><span class="relay-status" id="relay-save-state"></span><section class="relay-migration" id="relay-migration"><span>这条流程迁移时有改动，请检查</span><button id="relay-migration-open">说明</button></section></div>
        <nav class="relay-rail" aria-label="添加步骤">${categories.map(([key, label]) => `<button data-open-panel="${key}" aria-expanded="false" aria-controls="relay-palette">${glyph(key)}<span>${label}</span></button>`).join("")}</nav>
        <aside class="relay-palette relay-floating-panel" id="relay-palette" aria-label="添加步骤选项" hidden><div class="relay-panel-head"><h2 id="relay-palette-title">添加步骤</h2><button data-close-panel aria-label="收起添加步骤">×</button></div>${categories.map(([key, label, entries]) => `<section id="relay-category-${key}" hidden><p>选择一种${label}方式，加入当前草案。</p>${entries.map((kind) => `<button data-add-kind="${kind}"><i class="relay-kind-dot ${kind}"></i>${kinds[kind].name}<span>＋</span></button>`).join("")}</section>`).join("")}</aside>
        <aside class="relay-inspector relay-floating-panel" id="relay-inspector-panel" aria-label="步骤设置" hidden><div class="relay-panel-head"><span>步骤设置</span><button data-close-panel aria-label="关闭步骤设置">×</button></div><div id="relay-inspector"></div></aside>
        <aside class="relay-templates-panel relay-floating-panel" id="relay-templates-panel" aria-label="卡片模板" hidden><div class="relay-panel-head"><h2>我的卡片模板</h2><button data-close-panel aria-label="关闭卡片模板">×</button></div><div id="relay-templates"></div><p class="relay-note">只保存在本浏览器，不发布到平台。</p></aside>
        <section class="relay-chat relay-floating-panel" id="relay-chat-panel" aria-label="与流程对话" hidden><div class="relay-panel-head"><h2>与流程对话</h2><button data-close-panel aria-label="关闭流程对话">×</button></div><p>当前为离线说明编辑，不是 AI 自动改流程。先选范围，再确认写入。</p><select id="relay-chat-scope" aria-label="对话范围"><option value="flow">整个流程的目标</option><option value="node">选中步骤的处理说明</option></select><p id="relay-chat-target"></p><textarea id="relay-chat-input" rows="4" placeholder="例如：只使用商品资料里的事实，缺少资料时先提醒我。"></textarea><button id="relay-chat-apply">确认写入说明</button></section>
        <nav class="relay-dock" aria-label="画布工具"><button data-open-panel="chat" aria-expanded="false" aria-controls="relay-chat-panel">${glyph("chat")}<span>与流程对话</span></button><button data-open-panel="templates" aria-expanded="false" aria-controls="relay-templates-panel">${glyph("templates")}<span>模板</span></button><button id="relay-check">检查连接</button><span class="relay-divider"></span><button id="relay-zoom-out" aria-label="缩小画布">−</button><span id="relay-zoom-label">100%</span><button id="relay-zoom-in" aria-label="放大画布">＋</button><button id="relay-layout" title="只整理卡片位置，不修改配置和连线，可撤销">整理布局</button><button id="relay-fit" title="显示完整流程" aria-label="显示完整流程">${glyph("fit")}</button><span class="relay-divider"></span><button id="relay-undo">${glyph("undo")}<span>撤销</span></button><button id="relay-save">${glyph("save")}<span>保存草案</span></button><button disabled title="未接入运行服务，也未获得执行授权">运行未开放</button></nav>
        <div id="relay-connect-hint" class="relay-connect-hint">点击步骤查看；拖动标题整理布局</div>
      </main><div id="relay-notice" role="status" aria-live="polite"></div>
      <dialog id="relay-dialog"><div class="relay-dialog-head"><h2 id="relay-dialog-title"></h2><button id="relay-dialog-close" aria-label="关闭">×</button></div><div id="relay-dialog-body"></div></dialog>
    </div>`;

  function notify(message) {
    ui.notice = message;
    query("#relay-notice").textContent = message;
  }

  function refreshStatus() {
    query("#relay-save-state").textContent = ui.saved ? "已保存在本浏览器 · 未运行" : "有未保存修改 · 未运行";
    query("#relay-undo").disabled = !ui.history.length;
    query("#relay-title").textContent = ui.graph.name || "未命名流程";
    query("#relay-check").textContent = ui.report ? "查看检查结果" : "检查连接";
    query("#relay-migration").hidden = !ui.graph.migration?.atoms?.degraded;
    const stage = ui.graph.ui?.guideStage || "goal";
    query("#relay-start").textContent = stage === "goal" ? "确认流程目标 →" : stage === "review" ? "确认流程拆解 →" : "检查并补齐缺项 →";
    query("#relay-next-hint").textContent = stage === "goal" ? "已放入视频制作样例。先确认目标，再逐步修改。" : stage === "review" ? "目标已记录。接下来确认每个阶段做什么。" : "点击检查中的缺项，直接进入对应步骤补充。";
    query("#relay-goal-open").hidden = stage === "goal";
  }

  function syncPanels() {
    query("#relay-palette").hidden = !categories.some(([key]) => key === ui.panel);
    for (const [key, label] of categories) {
      query(`#relay-category-${key}`).hidden = ui.panel !== key;
      if (ui.panel === key) query("#relay-palette-title").textContent = `添加${label}`;
    }
    for (const key of ["inspector", "templates", "chat"]) query(`#relay-${key}-panel`).hidden = ui.panel !== key;
    for (const button of document.querySelectorAll("[data-open-panel]")) button.setAttribute("aria-expanded", String(button.dataset.openPanel === ui.panel));
    query("#relay-chat-target").textContent = ui.selected ? `选中步骤：${ui.graph.nodes.find((node) => node.id === ui.selected)?.name || "已移除"}` : "未选步骤；可先修改整个流程的目标，或点击画布选中步骤。";
  }

  function openPanel(panel) {
    ui.panel = panel;
    syncPanels();
  }

  function selectNode(nodeId) {
    if (!ui.graph.nodes.some((node) => node.id === nodeId)) return;
    ui.selected = nodeId;
    openPanel("inspector");
    renderCards(); renderInspector();
  }

  function commit(graph, redraw = true) {
    ui.history.push(structuredClone(ui.graph));
    if (ui.history.length > 30) ui.history.shift();
    ui.graph = graph;
    ui.saved = false;
    ui.report = null;
    ui.connecting = null;
    if (redraw) render(); else refreshStatus();
  }

  function openDialog(title, markup) {
    query("#relay-dialog-title").textContent = title;
    query("#relay-dialog-body").innerHTML = markup;
    if (!query("#relay-dialog").open) query("#relay-dialog").showModal();
  }

  function closeDialog() { query("#relay-dialog").close(); }

  function portButton(node, entry, direction) {
    return `<button class="relay-port ${direction}" data-port-node="${escape(node.id)}" data-port-id="${escape(entry.id)}" data-direction="${direction}" title="${direction === "outputs" ? "从这里连出" : "把资料接到这里"}：${escape(entry.types.map((type) => contract.typeNames[type]).join("、"))}"><i class="relay-port-dot ${entry.types[0]}"></i><span>${escape(entry.name)}</span><small>${entry.required ? "必需" : ""}</small></button>`;
  }

  function renderCards() {
    const issues = contract.validate(ui.graph);
    query("#relay-cards").innerHTML = ui.graph.nodes.map((node) => {
      const errors = issues.filter((entry) => entry.node_id === node.id && entry.sev === "err");
      const business = node.params?.businessContract;
      return `<article class="relay-card ${ui.selected === node.id ? "selected" : ""}" data-node="${escape(node.id)}" data-kind="${node.kind}" style="left:${Number.isFinite(node.x) ? node.x : 0}px;top:${Number.isFinite(node.y) ? node.y : 0}px"><div class="relay-card-head" data-drag-node="${escape(node.id)}"><i class="relay-kind-dot ${node.kind}"></i><button data-select-node="${escape(node.id)}">${escape(node.name)}</button><span>${node.kind === "sign" ? "真人" : node.kind === "ai" ? "AI" : "资料"}</span></div><p>${escape(business?.business?.purpose || (node.kind === "sign" ? "请指定一个人，确认后才能继续。" : "点击补充资料和处理方式。"))}</p><div class="relay-card-ports"><div>${node.inputs.map((entry) => portButton(node, entry, "inputs")).join("")}</div><div>${node.outputs.map((entry) => portButton(node, entry, "outputs")).join("")}</div></div><footer class="${errors.length ? "needs-input" : ""}">${errors.length ? `还需补齐 ${errors.length} 项` : "可编辑 · 尚未执行"}</footer></article>`;
    }).join("");
    const cardHeights = new Map([...document.querySelectorAll(".relay-card")].map((card) => [card.dataset.node, card.offsetHeight]));
    const width = Math.max(300, ...ui.graph.nodes.map((node) => (Number.isFinite(node.x) ? node.x : 0) + 264));
    const height = Math.max(220, ...ui.graph.nodes.map((node) => (Number.isFinite(node.y) ? node.y : 0) + (cardHeights.get(node.id) || 175) + 25));
    query("#relay-stages").innerHTML = Object.entries(stageNames).map(([stage, name]) => {
      const nodes = ui.graph.nodes.filter((node) => node.params?.businessContract?.stage === stage);
      return nodes.length ? `<div class="relay-stage-label" style="left:${Math.min(...nodes.map((node) => node.x))}px;top:${Math.max(0, Math.min(...nodes.map((node) => node.y)) - 40)}px">${escape(name)}</div>` : "";
    }).join("");
    query("#relay-plane").style.width = `${width}px`;
    query("#relay-plane").style.height = `${height}px`;
    query("#relay-plane").style.zoom = ui.zoom;
    query("#relay-zoom-label").textContent = `${Math.round(ui.zoom * 100)}%`;
    requestAnimationFrame(drawConnections);
  }

  function fitCanvas() {
    const viewport = query("#relay-scroll");
    const plane = query("#relay-plane");
    if (!viewport.clientWidth || !viewport.clientHeight) return;
    ui.zoom = Math.max(0.25, Math.min(1, (viewport.clientWidth - 210) / parseFloat(plane.style.width), (viewport.clientHeight - 270) / parseFloat(plane.style.height)));
    renderCards();
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  }

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

  function renderInspector() {
    const node = ui.graph.nodes.find((entry) => entry.id === ui.selected);
    if (!node) { query("#relay-inspector").innerHTML = "<h2>选择一个步骤</h2><p>从左侧添加，或点击画布上的卡片。</p>"; return; }
    const business = node.params?.businessContract;
    const issues = contract.validate(ui.graph).filter((entry) => entry.node_id === node.id);
    query("#relay-inspector").innerHTML = `<div class="relay-inspector-head"><small>${escape(kinds[node.kind].name)}</small><h2>${escape(node.name)}</h2><p>${escape(issues[0]?.msg || "补充处理说明后，点击保存步骤。")}</p></div>${business?.business ? `<div class="relay-business-summary"><strong>这一步要完成什么</strong><p>${escape(business.business.purpose)}</p><details><summary>要准备什么、会得到什么</summary><p>需要：${escape(business.business.input)}</p><p>产出：${escape(business.business.output)}</p><p>这里展示业务样例，不代表资料或结果已生成。</p></details></div>` : ""}<form id="relay-node-form">${field("步骤名称", "name", node.name)}${configFields(node)}<button class="relay-primary" type="submit">保存步骤修改</button></form><details class="relay-advanced"><summary>输入、输出与连接</summary>${["inputs", "outputs"].map((direction) => `<h3>${direction === "inputs" ? "需要的资料" : "交付的内容"}</h3>${node[direction].map((entry) => `<div class="relay-port-setting"><span>${escape(entry.name)}<small>${entry.types.map((type) => contract.typeNames[type]).join("、")} · ${contract.systemPort(node, direction, entry.id) ? "系统口（只可改名）" : "自定义"}</small></span><button type="button" data-edit-port="${escape(entry.id)}" data-port-direction="${direction}">编辑</button></div>`).join("")}${(direction === "inputs" ? kinds[node.kind].customInputs : kinds[node.kind].customOutputs)?.length ? `<button data-new-port="${direction}" type="button">＋ 增加${direction === "inputs" ? "输入" : "输出"}</button>` : ""}`).join("")}<h3>关联连线</h3>${ui.graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).map((edge) => `<div class="relay-edge-setting"><small>${escape(ui.graph.nodes.find((entry) => entry.id === edge.from)?.name || edge.from)} → ${escape(ui.graph.nodes.find((entry) => entry.id === edge.to)?.name || edge.to)}</small><button data-remove-edge="${escape(edge.id)}" type="button">移除</button></div>`).join("") || "<p>尚未连接</p>"}</details>${business ? `<details class="relay-advanced"><summary>业务五段与兼容说明</summary><p class="relay-note">以下保留原业务合同，不代表平台已执行。五段不是五个独立节点。</p>${[["input", "接收"], ["check", "检查"], ["execute", "处理"], ["review", "核验"], ["output", "交付"]].map(([key, title]) => `<details><summary>${title}</summary><p>${escape(business.modules?.[key]?.action)}</p><p>处理者：${escape(business.modules?.[key]?.executor)}</p><p>结果：尚未执行</p><small>${escape(business.modules?.[key]?.evidence)}</small></details>`).join("")}</details>` : ""}<details class="relay-advanced"><summary>开发详情</summary><pre>${escape(JSON.stringify({ id: node.id, kind: node.kind, inputs: node.inputs, outputs: node.outputs, issues }, null, 2))}</pre><p>授权、资源版本、精确产物审批和真实执行仍待平台验证。</p></details><div class="relay-inspector-actions"><button id="relay-save-template">存为卡片模板</button><button id="relay-remove-node" class="relay-danger">删除步骤</button></div>`;
  }

  function render() {
    refreshStatus(); renderCards(); renderInspector();
    syncPanels();
    query("#relay-templates").innerHTML = ui.templates.map((entry, index) => `<button data-insert-template="${index}">${escape(entry.name)}</button>`).join("") || "<small>选中步骤后可保存模板</small>";
    query("#relay-connect-hint").textContent = "点输出端口，再点目标输入端口连接；拖动标题整理布局";
    if (ui.notice) notify(ui.notice);
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

  function showCheck() {
    ui.report = {
      ...contract.diagramCheck(ui.graph),
      validatorVersion: "desktop-contract-0.1",
      validatedAt: new Date().toISOString(),
      hashAlgorithm: "prototype-fnv1a64-design-only",
      nonSecurityHash: true,
      intentHash: prototypeDigest({ goal: ui.graph.ui?.sourcePrompt || "", businessRequirements: "01.1/H02,H05,H10" }),
      planHash: prototypeDigest(ui.graph),
      effectiveConfigHash: prototypeDigest({ definitions: contract.definitions, policy: "local-draft-only/no-execution" }),
    };
    refreshStatus();
    const errors = ui.report.issues.filter((entry) => entry.sev === "err");
    openDialog(errors.length ? "先补齐这些内容" : "连接检查完成", `<p>${errors.length ? "流程已停在检查阶段，没有执行任何步骤。草案仍可保存。" : "只检查结构，不代表权限、审批或平台能力已就绪。没有执行 AI、媒体或业务步骤。"}</p>${ui.report.issues.map((entry) => `<div class="relay-issue ${entry.sev}"><strong>${escape(ui.graph.nodes.find((node) => node.id === entry.node_id)?.name || "流程")}</strong><p>${escape(entry.msg)}</p>${entry.node_id && ui.graph.nodes.some((node) => node.id === entry.node_id) ? `<button data-resolve-node="${escape(entry.node_id)}">去这一步补充 →</button>` : ""}</div>`).join("")}${!errors.length ? `<ol>${ui.report.steps.map((step) => `<li><strong>${escape(ui.graph.nodes.find((node) => node.id === step.id)?.name)}</strong><p>${escape(step.text)}</p></li>`).join("")}</ol>` : ""}<p class="relay-note">这是本地结构检查，不是样例执行。真人审批、模型、媒体和业务服务都不会被调用。</p>`);
  }

  function showBreakdown() {
    const groups = Object.entries(stageNames).map(([stage, name]) => [name, ui.graph.nodes.filter((node) => node.params?.businessContract?.stage === stage)]);
    const additional = ui.graph.nodes.filter((node) => !Object.hasOwn(stageNames, node.params?.businessContract?.stage));
    if (additional.length) groups.push(["新增步骤", additional]);
    openDialog("确认这条流程怎么完成工作", `<p>当前是已载入的妆舟样例及你的修改，不是模型重新生成的计划。核对下面的步骤，不合适的可点击后修改。</p>${groups.map(([name, nodes]) => `<section class="relay-breakdown"><h3>${name}</h3>${nodes.map((node) => `<button data-resolve-node="${escape(node.id)}"><span>${escape(node.name)}</span><small>${node.kind === "sign" ? "需要真人决定" : "准备与处理"} →</small></button>`).join("") || "<p>此阶段暂无步骤，请检查是否遗漏。</p>"}</section>`).join("")}<p class="relay-note">确认拆解只表示你已查看计划，不是业务审批，也不会启动运行。</p><button id="relay-guide-check" class="relay-primary">确认拆解，检查缺项 →</button>`);
    query("#relay-guide-check").onclick = () => {
      const next = structuredClone(ui.graph);
      next.ui = { ...next.ui, guideStage: "check" };
      commit(next); showCheck();
    };
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
    commit(next, redraw);
    if (redraw) notify("步骤已修改，旧检查已失效。请再检查并保存草案。");
    else renderCards();
  }

  query("#app").addEventListener("submit", (event) => {
    if (event.target.id !== "relay-node-form") return;
    event.preventDefault();
    updateNodeForm(event.target);
  });
  query("#app").addEventListener("input", (event) => {
    const form = event.target.closest("#relay-node-form");
    if (form) updateNodeForm(form, false);
    else if (event.target.closest("#relay-goal-form")) { ui.report = null; ui.saved = false; refreshStatus(); }
  });

  query("#app").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) {
      const card = event.target.closest(".relay-card");
      if (card) selectNode(card.dataset.node);
      return;
    }
    try {
      if (button.dataset.openPanel) openPanel(ui.panel === button.dataset.openPanel ? null : button.dataset.openPanel);
      if (button.dataset.closePanel !== undefined) { openPanel(null); ui.selected = null; renderCards(); }
      if (button.dataset.selectNode) selectNode(button.dataset.selectNode);
      if (button.dataset.resolveNode) { closeDialog(); selectNode(button.dataset.resolveNode); }
      if (button.dataset.addKind) {
        const next = structuredClone(ui.graph);
        const node = contract.createNode(button.dataset.addKind, contract.newId("node_", next.nodes.map((entry) => entry.id)), { x: 70 + (next.nodes.length % 4) * 290, y: 100 + Math.floor(next.nodes.length / 4) * 310 });
        next.nodes.push(node); ui.selected = node.id; ui.panel = "inspector"; commit(next); requestAnimationFrame(fitCanvas); notify("步骤已加入，请补资料并连接端口。");
      }
      if (button.dataset.portNode) {
        if (button.dataset.direction === "outputs") { ui.connecting = { nodeId: button.dataset.portNode, portId: button.dataset.portId }; query("#relay-connect-hint").textContent = "现在点击目标步骤的输入端口；按 Esc 取消"; }
        else if (ui.connecting) { commit(contract.connect(ui.graph, ui.connecting.nodeId, ui.connecting.portId, button.dataset.portNode, button.dataset.portId)); notify("已按具体端口连接。旧检查已失效。"); }
        else notify("请先点击一个输出端口，再点击输入端口。");
      }
      if (button.dataset.editPort) editPortDialog(button.dataset.portDirection, button.dataset.editPort);
      if (button.dataset.newPort) editPortDialog(button.dataset.newPort);
      if (button.dataset.removeEdge) { const next = structuredClone(ui.graph); next.edges = next.edges.filter((edge) => edge.id !== button.dataset.removeEdge); commit(next); }
      if (button.dataset.insertTemplate !== undefined) {
        const template = ui.templates[Number(button.dataset.insertTemplate)];
        const next = structuredClone(ui.graph); const node = contract.instantiate(template.doc, next, template.id);
        next.nodes.push(node); ui.selected = node.id; ui.panel = "inspector"; commit(next); requestAnimationFrame(fitCanvas); notify("已插入独立副本；连线需重新连接。");
      }
      if (button.id === "relay-remove-node") {
        openDialog("删除这个步骤？", '<p>关联连线也会移除；如果删掉必需的人工确认，原业务流程将不完整。可以撤销。</p><button id="relay-confirm-remove" class="relay-danger">确认删除</button>');
        query("#relay-confirm-remove").onclick = () => { const next = structuredClone(ui.graph); next.nodes = next.nodes.filter((node) => node.id !== ui.selected); next.edges = next.edges.filter((edge) => edge.from !== ui.selected && edge.to !== ui.selected); ui.selected = next.nodes[0]?.id; commit(next); closeDialog(); };
      }
      if (button.id === "relay-save-template") {
        const node = ui.graph.nodes.find((entry) => entry.id === ui.selected);
        const doc = contract.cardTemplate(node);
        const errors = contract.validate(doc).filter((entry) => entry.sev === "err" && entry.code !== "required_port_unconnected");
        if (errors.length) throw new Error(`请先修好这张卡：${errors[0].msg}`);
        const templates = [...ui.templates, { id: contract.newId("local_tpl_", ui.templates.map((entry) => entry.id)), name: node.name, doc }];
        localStorage.setItem(templateKey, JSON.stringify(templates)); ui.templates = templates; render(); notify("模板仅保存到本浏览器，没有发布到平台。");
      }
    } catch (error) { notify(error.message || "未能完成修改，请检查输入。"); }
  });

  query("#relay-save").onclick = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(contract.snapshot(ui.graph))); ui.saved = true; refreshStatus(); notify("草案已保存在本浏览器；未上传、未运行、未发布。"); }
    catch { ui.saved = false; refreshStatus(); notify("浏览器未允许保存，请勿关闭页面；本次修改还未持久化。"); }
  };
  query("#relay-undo").onclick = () => { if (!ui.history.length) return; ui.graph = ui.history.pop(); ui.saved = false; ui.report = null; ui.selected = ui.graph.nodes.some((node) => node.id === ui.selected) ? ui.selected : ui.graph.nodes[0]?.id; render(); notify("已撤销上一步修改，检查需重新执行。"); };
  query("#relay-check").onclick = showCheck;
  query("#relay-dialog-close").onclick = closeDialog;
  query("#relay-migration-open").onclick = () => openDialog("迁移与能力边界", `<ul>${(ui.graph.migration?.atoms?.notes || []).map((note) => `<li>${escape(note)}</li>`).join("")}</ul><p>当前是现有本地原型的增量修改，不是原站源码导出或已部署版本。运行、真实签字和媒体工具尚未接入。</p>`);
  query("#relay-goal-open").onclick = () => {
    openDialog("说清这条流程的目标", `<form id="relay-goal-form">${field("流程名称", "flow_name", ui.graph.name)}${area("希望完成什么", "flow_goal", ui.graph.ui?.sourcePrompt)}<p>修改目标不会自动覆盖你的卡片。重新载入样例会先让你确认。</p><button type="submit" class="relay-primary">保留步骤并更新目标</button><button type="button" id="relay-reset-open">重新载入初始草案</button></form>`);
    query("#relay-goal-form").onsubmit = (event) => {
      event.preventDefault();
      const data = new FormData(event.target);
      const goal = String(data.get("flow_goal") || "").trim();
      if (!goal) { notify("先写一句你希望这条流程完成什么。"); return; }
      const next = structuredClone(ui.graph);
      next.name = String(data.get("flow_name") || "").trim() || ui.graph.name;
      next.ui = { ...next.ui, sourcePrompt: goal, guideStage: "review" };
      commit(next); closeDialog(); showBreakdown();
      notify("目标已更新；已有步骤和手工修改已保留。");
    };
    query("#relay-reset-open").onclick = () => {
      openDialog("保留修改还是重新开始？", '<p>重新载入会替换当前画布；当前版本仍可用“撤销”恢复。</p><button id="relay-keep-edits">保留我的修改</button><button id="relay-reset-confirm">确认重新载入</button>');
      query("#relay-keep-edits").onclick = closeDialog;
      query("#relay-reset-confirm").onclick = () => { commit(structuredClone(original)); ui.selected = ui.graph.nodes[0]?.id; renderInspector(); closeDialog(); notify("已重新载入初始草案。可撤销恢复原修改。"); };
    };
  };
  query("#relay-start").onclick = () => {
    const stage = ui.graph.ui?.guideStage || "goal";
    openPanel(null);
    if (stage === "goal") query("#relay-goal-open").onclick();
    else if (stage === "review") showBreakdown();
    else showCheck();
  };
  query("#relay-chat-apply").onclick = () => {
    const message = query("#relay-chat-input").value.trim();
    if (!message) { notify("先写下要修改的内容。"); return; }
    const next = structuredClone(ui.graph);
    if (query("#relay-chat-scope").value === "flow") next.ui = { ...next.ui, sourcePrompt: message, guideStage: "goal" };
    else {
      const node = next.nodes.find((entry) => entry.id === ui.selected);
      if (!node) { notify("请先选择一个步骤。"); return; }
      if (node.kind === "ai") node.prompts.p2 = message;
      else if (node.kind === "sign" || node.kind === "text") node.params.content = message;
      else { notify("这个步骤需要结构化参数，请在上方设置中修改；未猜测你的意思。"); return; }
    }
    commit(next); query("#relay-chat-input").value = ""; notify("已按你确认的范围写入说明；没有调用模型或自动改动连线。");
  };
  const zoom = (change) => { ui.zoom = Math.max(0.25, Math.min(1.5, Math.round((ui.zoom + change) * 100) / 100)); renderCards(); };
  query("#relay-fit").onclick = () => { openPanel(null); fitCanvas(); };
  query("#relay-layout").onclick = () => {
    const next = structuredClone(ui.graph);
    const stages = Object.keys(stageNames);
    const rows = new Map();
    const heights = new Map([...document.querySelectorAll(".relay-card")].map((card) => [card.dataset.node, card.offsetHeight]));
    let additional = 0;
    next.nodes.forEach((node) => {
      const stage = node.params?.businessContract?.stage;
      const column = stages.indexOf(stage);
      const top = rows.get(stage) || 55;
      if (column >= 0) {
        node.x = 30 + column * 300;
        node.y = top;
        rows.set(stage, top + Math.max(205, (heights.get(node.id) || 175) + 45));
      } else {
        node.x = 1230 + (additional % 2) * 300;
        node.y = 55 + Math.floor(additional / 2) * 205;
        additional += 1;
      }
    });
    openPanel(null); commit(next); requestAnimationFrame(fitCanvas);
    notify("只整理了卡片位置，配置和连线没有改动；可撤销。");
  };
  query("#relay-zoom-in").onclick = () => zoom(0.1);
  query("#relay-zoom-out").onclick = () => zoom(-0.1);
  query("#relay-cards").addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-drag-node]");
    if (!handle || event.button !== 0) return;
    const node = ui.graph.nodes.find((entry) => entry.id === handle.dataset.dragNode);
    const before = structuredClone(ui.graph);
    const startX = event.clientX; const startY = event.clientY;
    const originalX = node.x; const originalY = node.y;
    const card = handle.closest(".relay-card");
    let moved = false;
    const move = (current) => {
      if (Math.abs(current.clientX - startX) + Math.abs(current.clientY - startY) < 5 && !moved) return;
      moved = true;
      node.x = Math.max(0, originalX + (current.clientX - startX) / ui.zoom);
      node.y = Math.max(0, originalY + (current.clientY - startY) / ui.zoom);
      card.style.left = `${node.x}px`; card.style.top = `${node.y}px`; drawConnections();
    };
    const finish = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish);
      if (moved) { ui.history.push(before); ui.saved = false; ui.report = null; refreshStatus(); renderCards(); }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish);
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { ui.connecting = null; openPanel(null); query("#relay-connect-hint").textContent = "已回到画布；点击步骤编辑，或从底部继续检查"; } });
  window.addEventListener("resize", fitCanvas);
  render();
  requestAnimationFrame(fitCanvas);
}
