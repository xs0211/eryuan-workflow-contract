const RelayEditor = (() => {
  const contract = typeof RelayContract !== "undefined" ? RelayContract : require("./relay-model.js");
  const clone = (value) => structuredClone(value);
  const stageKeys = ["input", "check", "execute", "review", "output"];
  const stageNames = { input: "输入", check: "检查", execute: "处理", review: "审核", output: "输出" };
  const actors = { runtime: "系统接收与交付", rules: "固定规则检查", model: "大模型（待授权）", human: "指定真人作出决定", approval_validator: "平台核验身份与版本" };
  const failureActions = { wait: "等待补充", retry: "有界重试", reconcile: "先核对结果", return: "退回修改", block: "停止并提示", cancel: "取消", stop: "结束" };
  const signature = (graph) => JSON.stringify(graph);
  const emptyDraft = () => ({ schema: contract.schema, name: "未命名流程", nodes: [], edges: [], ui: { sourcePrompt: "", editorMode: "new", messages: [], attachments: [] } });

  function describe(node) {
    const business = node.params?.businessContract?.business;
    return {
      task: node.params?.editorTask || node.prompts?.p2 || node.params?.content || business?.purpose || `完成${node.name}`,
      input: node.params?.editorInput || business?.input || node.inputs.map((port) => port.name).join("、") || "由你提供资料",
      output: node.params?.editorOutput || business?.output || node.outputs.map((port) => port.name).join("、") || "最终交付结果",
      format: node.params?.outputFormat || (node.kind === "sign" ? "确认意见" : node.outputs.map((port) => contract.typeNames[port.types[0]]).join("、") || "结果说明"),
      processor: node.kind === "sign" ? node.gate?.signer_name || "待指定确认人" : node.kind === "ai" ? node.exec?.model || "大模型（尚未接入）" : "固定处理规则",
    };
  }

  function stagesFor(node) {
    const info = describe(node);
    const original = node.params?.businessContract?.modules || {};
    return Object.fromEntries(stageKeys.map((key) => {
      const executor = key === "execute" && node.kind === "sign" ? "human" : key === "review" && node.kind === "sign" ? "approval_validator" : key === "execute" && node.kind === "ai" ? "model" : ["input", "output"].includes(key) ? "runtime" : "rules";
      const defaults = {
        action: original[key]?.action || ({ input: "接收所需资料", check: "检查资料是否齐全", execute: info.task, review: "核对结果是否符合要求", output: "整理并交付结果" })[key],
        input: key === "input" ? info.input : "上一步的结果与原始资料",
        outputFormat: key === "output" ? info.format : "文字说明与检查记录",
        executor, capability: "", model: executor === "model" ? node.exec?.model || "" : "", onFailure: "block",
      };
      return [key, { ...defaults, ...node.params?.editorStages?.[key] }];
    }));
  }

  function updateStage(graph, nodeId, key, fields) {
    if (!stageKeys.includes(key)) throw new Error("请选择一个已有步骤。");
    const next = clone(graph);
    const node = next.nodes.find((entry) => entry.id === nodeId);
    if (!node) throw new Error("这个步骤已经移除，请重新选择。");
    const stages = stagesFor(node);
    const fieldsAllowed = ["action", "input", "outputFormat", "executor", "capability", "model", "onFailure"];
    for (const name of fieldsAllowed) if (Object.hasOwn(fields, name)) stages[key][name] = String(fields[name]);
    if (node.kind === "sign" && key === "execute" && stages[key].executor !== "human") throw new Error("业务决定必须由真人作出，不能改成模型代签。");
    if (node.kind === "sign" && key === "review" && stages[key].executor !== "approval_validator") throw new Error("这一段必须由平台核验身份、权限和精确版本。");
    node.params.editorStages = stages;
    if (key === "execute") {
      node.params.editorTask = stages.execute.action;
      if (node.kind === "ai") node.prompts.p2 = stages.execute.action;
    }
    if (key === "input") node.params.editorInput = stages.input.input;
    if (key === "output") node.params.outputFormat = stages.output.outputFormat;
    return next;
  }

  function check(graph) {
    const issues = contract.validate(graph);
    const add = (code, msg, node_id = "", sev = "err") => issues.push({ code, msg, node_id, sev });
    if (!graph.nodes.length) add("empty_flow", "还没有步骤，请先描述需求生成流程，或手动添加第一个步骤。");
    for (const node of graph.nodes) {
      if (node.params?.disabled === true) add("step_disabled", "这一步已停用，请恢复或明确调整流程后再检查。", node.id);
      if (node.params?.simulationScenario && !["normal", "missing", "failure"].includes(node.params.simulationScenario)) add("unknown_simulation_scenario", "模拟情景未知，请重新选择，不会默认当作成功。", node.id);
      const stages = node.params?.editorStages;
      if (!stages) continue;
      for (const key of stageKeys) {
        const stage = stages[key];
        if (!stage || ["action", "input", "outputFormat"].some((field) => typeof stage[field] !== "string" || !stage[field].trim())) add("stage_incomplete", `请补齐「${stageNames[key]}」的任务、输入和输出格式。`, node.id);
        if (!stage || !Object.hasOwn(actors, stage.executor) || !Object.hasOwn(failureActions, stage.onFailure)) add("stage_policy_invalid", `请重新选择「${stageNames[key]}」的处理方式和失败处理。`, node.id);
      }
      if (node.kind === "sign" && (stages.execute?.executor !== "human" || stages.review?.executor !== "approval_validator")) add("human_stage_invalid", "真人决定与平台核验不能混用或由模型代替。", node.id);
    }
    const errors = issues.filter((entry) => entry.sev === "err");
    return { status: errors.length ? "needs_input" : "can_continue", issues, runnable: false, simulationAllowed: !errors.length, executionEvidence: "not_run", binding: signature(graph) };
  }

  function generate(prompt, sampleGraph, attachments = []) {
    const text = String(prompt || "").trim();
    if (text.length < 8) throw new Error("请再说具体一些：想完成什么、能提供什么、希望得到什么结果？");
    if (!/(提供|资料|输入|已有|上传|根据|用.*记录)/.test(text) && !attachments.length) throw new Error("还缺少资料说明。你能提供哪些文字、图片或文件？");
    if (!/(交付|输出|得到|生成|制作|写成|整理成|做成)/.test(text)) throw new Error("希望最后得到什么？请补充交付物，例如视频、纪要或一份清单。");
    let graph;
    if (/(视频|分镜|妆舟|口播)/.test(text)) {
      graph = clone(sampleGraph);
      graph.name = "妆舟视频制作流程";
    } else if (/(文字|文本|文档|纪要|记录|清单|报告|文章|总结|Markdown|JSON)/i.test(text)) {
      graph = emptyDraft();
      graph.name = "资料整理与交付";
      const source = contract.createNode("text", "source", { x: 30, y: 70 });
      source.name = "准备资料";
      source.params.content = "待你提供实际资料；模拟时仅使用合成样例。";
      const process = contract.createNode("ai", "process", { x: 330, y: 70 });
      process.name = "整理内容"; process.prompts.p2 = text;
      const review = contract.createNode("sign", "review", { x: 630, y: 70 });
      review.name = "确认内容";
      const result = contract.createNode("result", "delivery", { x: 930, y: 70 });
      result.name = "交付结果";
      graph.nodes = [source, process, review, result];
      graph = contract.connect(graph, "source", "out", "process", "material");
      graph = contract.connect(graph, "process", "result", "review", "content");
      graph = contract.connect(graph, "review", "approved", "delivery", "in");
    } else throw new Error("这版离线演示支持视频制作和文字整理。你可以补充为这两类需求，或选择手动搭建；不会编造不可用能力。");
    graph.ui = { ...graph.ui, sourcePrompt: text, editorMode: "generated", generationMode: "deterministic_mock", attachments: clone(attachments), messages: [] };
    for (const node of graph.nodes) node.params.editorStages = stagesFor(node);
    return graph;
  }

  function propose(graph, message, selectedId) {
    const text = String(message || "").trim();
    if (!text) throw new Error("先描述你想修改的内容。");
    const next = clone(graph);
    const node = selectedId ? next.nodes.find((entry) => entry.id === selectedId) : null;
    if (selectedId && !node) throw new Error("选中的步骤已不存在，请重新选择。");
    const changes = [];
    const match = text.match(/^(?:把)?(?:名称|名字)(?:改为|改成|[：:])\s*(.+)$/);
    const setting = text.match(/^(输入说明|输出格式|模型|能力)(?:改为|改成|[：:])\s*(.+)$/);
    if (node) {
      if (match) { changes.push(`${node.name} → ${match[1]}`); node.name = match[1]; }
      else if (setting) {
        const [, label, value] = setting;
        node.params.editorStages = stagesFor(node);
        if (label === "输入说明") { node.params.editorInput = value; node.params.editorStages.input.input = value; }
        if (label === "输出格式") { node.params.outputFormat = value; node.params.editorStages.output.outputFormat = value; }
        if (label === "模型") {
          if (node.kind !== "ai") throw new Error("这不是模型处理步骤，不能用模型替代真人确认或固定输入输出。");
          node.exec.model = value; node.params.editorStages.execute.model = value;
        }
        if (label === "能力") {
          if (node.kind === "sign") throw new Error("真人决定不能改成工具代签；请在高级编辑中查看各段职责。");
          node.params.editorStages.execute.capability = value;
        }
        changes.push(`仅更新「${node.name}」的${label}为「${value}」；模型或能力引用仍待授权，端口类型不会被文字自动改变`);
      }
      else if (/^(删除|移除)(这个步骤|当前步骤|本步骤)$/.test(text)) {
        const removed = next.edges.filter((edge) => edge.from === node.id || edge.to === node.id);
        next.nodes = next.nodes.filter((entry) => entry.id !== node.id);
        next.edges = next.edges.filter((edge) => !removed.includes(edge));
        changes.push(`删除「${node.name}」及 ${removed.length} 条连线；不会自动绕过确认步骤`);
      } else if (node.kind === "sign" && /^审核人[：:]/.test(text)) {
        const reviewer = text.replace(/^审核人[：:]\s*/, "").trim();
        if (!reviewer) throw new Error("请填写审核人的账号引用；姓名不能证明授权。");
        node.gate.signer_uid = reviewer; node.gate.signer_name = reviewer;
        changes.push(`「${node.name}」审核人引用改为 ${reviewer}（尚未鉴权，不生成批准）`);
      } else {
        const value = text.replace(/^(?:任务|处理说明|提示词)(?:改为|改成|[：:])\s*/, "");
        node.params.editorTask = value;
        if (node.kind === "ai") node.prompts.p2 = value;
        else if (["text", "sign"].includes(node.kind)) node.params.content = value;
        node.params.editorStages = stagesFor(node);
        node.params.editorStages.execute.action = value;
        changes.push(`仅更新「${node.name}」的处理说明；其他步骤和连线不变`);
      }
    } else if (match) { next.name = match[1]; changes.push(`流程名称 → ${match[1]}`); }
    else if (/^(删除|移除)/.test(text)) {
      const name = text.replace(/^(删除|移除)(步骤)?\s*/, "").replace(/[「」“”]/g, "").trim();
      const matches = next.nodes.filter((entry) => entry.name === name || entry.id === name);
      if (matches.length !== 1) throw new Error("请先选中要删除的步骤，或写出唯一的步骤名称。");
      return propose(graph, "删除这个步骤", matches[0].id);
    } else if (/^(添加|增加)/.test(text)) {
      const kind = /人工|确认|审核/.test(text) ? "sign" : /资料|文本/.test(text) ? "text" : /AI|处理|模型/.test(text) ? "ai" : null;
      if (!kind) throw new Error("请说明要添加资料、处理还是人工确认步骤，或从左侧选择。");
      const added = contract.createNode(kind, contract.newId("node_", next.nodes.map((entry) => entry.id)));
      added.params.editorStages = stagesFor(added);
      next.nodes.push(added); changes.push(`添加「${added.name}」；由你连接和补充配置，不自动改动旧连线`);
    } else {
      next.ui = { ...next.ui, sourcePrompt: text };
      changes.push("只更新整个流程的需求说明；不擅自替换现有步骤或执行任何动作");
    }
    return { base: signature(graph), graph: next, scope: selectedId || "flow", changes, message: text };
  }

  function applyProposal(graph, proposal) {
    if (!proposal || proposal.base !== signature(graph)) throw new Error("草案在建议生成后变过，请重新描述修改，旧建议不能直接套用。");
    return clone(proposal.graph);
  }

  function simulation(graph) {
    const report = check(graph);
    return { binding: signature(graph), status: report.simulationAllowed ? "running" : "needs_input", executionEvidence: "not_run", mock: true, issues: report.issues, records: graph.nodes.map((node) => ({ id: node.id, status: report.simulationAllowed ? "pending" : "not_started", output: "" })) };
  }

  function tick(graph, current, decision) {
    const run = clone(current);
    if (run.binding !== signature(graph)) throw new Error("流程已修改，本次模拟失效，请重新检查。");
    if (!["running", "waiting"].includes(run.status)) return run;
    const active = run.records.find((record) => ["processing", "waiting"].includes(record.status));
    if (active) {
      const node = graph.nodes.find((entry) => entry.id === active.id);
      if (active.status === "waiting") {
        if (!decision) return run;
        if (!["approved", "rejected"].includes(decision)) throw new Error("请选择模拟同意或模拟退回。");
        active.mockDecision = decision;
      }
      const scenario = node.params?.simulationScenario || "normal";
      active.status = scenario === "failure" ? "failed" : scenario === "missing" ? "needs_input" : "passed";
      active.output = active.status === "passed" ? `合成样例：${describe(node).output}；不是真实产物或正式审批` : "模拟问题，流程停在这里；没有业务调用";
      if (active.status !== "passed") {
        run.status = active.status;
        for (const record of run.records) if (record.status === "pending") { record.status = "not_started"; record.output = "前一步未完成，后续没有执行"; }
        return run;
      }
    }
    run.status = "running";
    for (const record of run.records.filter((entry) => entry.status === "pending")) {
      const incoming = graph.edges.filter((edge) => edge.to === record.id);
      const parents = incoming.map((edge) => ({ edge, parent: run.records.find((entry) => entry.id === edge.from) }));
      if (parents.some(({ parent }) => !parent || ["pending", "processing", "waiting"].includes(parent.status))) continue;
      const enabled = parents.filter(({ edge, parent }) => parent.status === "passed" && (!parent.mockDecision || edge.fromPort === parent.mockDecision));
      if (incoming.length && !enabled.length) { record.status = "skipped"; record.output = "未选择此分支，未模拟此步骤"; continue; }
      const node = graph.nodes.find((entry) => entry.id === record.id);
      const missing = node.inputs.find((port) => port.required && !enabled.some(({ edge }) => edge.toPort === port.id));
      if (missing && !(node.kind === "group_send" && node.params?.text)) {
        record.status = "needs_input"; record.output = "这条分支缺少必要输入，模拟停止"; run.status = "needs_input";
        for (const other of run.records) if (other.status === "pending") other.status = "not_started";
        return run;
      }
      record.status = node.kind === "sign" ? "waiting" : "processing";
      record.output = node.kind === "sign" ? "等待你的模拟选择；不生成真人批准" : "正在使用合成样例模拟处理";
      run.status = node.kind === "sign" ? "waiting" : "running";
      return run;
    }
    if (run.records.every((record) => ["passed", "skipped"].includes(record.status))) run.status = "completed";
    else { run.status = "failed"; run.records.filter((record) => record.status === "pending").forEach((record) => { record.status = "not_started"; record.output = "无法继续安排步骤，未模拟"; }); }
    return run;
  }

  function cancel(current) {
    const run = clone(current); run.status = "cancelled";
    run.records.filter((record) => ["pending", "processing", "waiting"].includes(record.status)).forEach((record) => { record.status = "cancelled"; record.output = "已取消，未生成真实结果"; });
    return run;
  }

  return { emptyDraft, describe, stagesFor, updateStage, check, generate, propose, applyProposal, simulation, tick, cancel, signature, stageKeys, stageNames, actors, failureActions };
})();

if (typeof module !== "undefined" && module.exports) module.exports = RelayEditor;
