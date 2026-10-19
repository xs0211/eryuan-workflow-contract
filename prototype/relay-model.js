const RelayContract = (() => {
  const schema = "e2s-relay/2.0";
  const types = ["text", "image", "file", "msg"];
  const typeNames = { text: "文本", image: "图片", file: "文件", msg: "消息" };
  const clone = (value) => structuredClone(value);
  const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
  const port = (id, name, accepted, required) => ({ id, name, types: accepted, locked: true, ...(required === undefined ? {} : { required }) });
  const definitions = {
    text: { name: "文本资料", inputs: [], outputs: [port("out", "内容", ["text"])], params: { content: "", source: "static", key: "", label: "", required: true } },
    image: { name: "图片资料", inputs: [], outputs: [port("out", "图片", ["image"])], params: { source: "static", key: "", label: "", required: true } },
    file: { name: "文件资料", inputs: [], outputs: [port("out", "文件", ["file"])], params: { source: "static", key: "", label: "", required: true, mode: "read" } },
    group_messages: { name: "读取群消息", inputs: [], outputs: [port("out", "消息", ["msg"])], params: { group_no: "", range: "last_n", limit: 50, only_at_me: false } },
    ai: { name: "AI 处理", inputs: [port("material", "素材", ["text", "msg"], false), port("attach", "附件", ["file", "image"], false)], outputs: [port("result", "结果", ["text"])], params: {}, customInputs: types, customOutputs: ["text", "file"] },
    sign: { name: "人工确认", inputs: [port("content", "待签内容", ["text", "file", "image"], true)], outputs: [port("approved", "通过", ["text"]), port("rejected", "驳回", ["text"])], params: { content: "" }, customInputs: ["text", "file", "image"] },
    group_send: { name: "发送到群", inputs: [port("body", "正文", ["text", "msg"], true)], outputs: [], params: { group_no: "", title: "", text: "" }, customInputs: ["text", "msg"] },
    drive_save: { name: "存入文件空间", inputs: [port("content", "内容", ["file", "image", "text"], true)], outputs: [port("saved", "已存文件", ["file"])], params: { drive_space_id: "", folder_id: "", folder_path: "", filename: "{{流程名}}-{{日期}}.md", on_conflict: "rename" }, customInputs: ["file", "image", "text"] },
    result: { name: "交付结果", inputs: [port("in", "结果", types, true)], outputs: [], params: { outcome: "success", close_when: "" }, customInputs: types },
  };
  const kinds = Object.keys(definitions);
  const hasKind = (kind) => Object.hasOwn(definitions, kind);
  const newId = (prefix, used) => {
    let serial = 1;
    while (used.includes(`${prefix}${serial}`)) serial += 1;
    return `${prefix}${serial}`;
  };

  function createNode(kind, id, position = {}) {
    if (!hasKind(kind)) throw new Error("unknown_kind");
    const definition = definitions[kind];
    const node = { id, kind, name: definition.name, x: position.x ?? 80, y: position.y ?? 80, params: clone(definition.params), inputs: clone(definition.inputs), outputs: clone(definition.outputs) };
    if (kind === "ai") Object.assign(node, { exec: { kind: "platform" }, prompts: { p1: "", p2: "", p3: "" }, skills: [], connectors: [], timeout_sec: 600 });
    if (kind === "sign") node.gate = { signer_uid: "", ttl_hours: 24, require_conclusion: true };
    if (["image", "file"].includes(kind)) node.attachments = [];
    return node;
  }

  function fromBusinessAtoms(businessAtoms) {
    const nodes = businessAtoms.map((business, index) => {
      const node = createNode(business.human ? "sign" : "ai", business.id, { x: 50 + (index % 4) * 290, y: 100 + Math.floor(index / 4) * 310 });
      node.name = business.name;
      node.params.businessContract = clone(business);
      if (node.kind === "ai") node.prompts = { p1: business.description, p2: business.business?.prompt ?? business.modules.execute.action, p3: business.business?.output ?? business.modules.review.action };
      return node;
    });
    const edges = nodes.slice(1).map((target, index) => ({ id: `main_${index + 1}`, from: nodes[index].id, fromPort: nodes[index].kind === "sign" ? "approved" : "result", to: target.id, toPort: target.kind === "sign" ? "content" : "material", type: "text" }));
    return {
      schema, name: "妆舟 · 主播排期出片", nodes, edges,
      ui: { sourcePrompt: "根据主播排期、主播和商品资料，制作六镜、30秒短视频；脚本、素材和成片由真人确认，不自动发布。" },
      migration: { atoms: { batch: "local-prototype-v4-desktop-1", from_schema: "PrototypeDraft", at_ms: Date.now(), degraded: true, notes: ["13 个业务步骤投影为 10 个 AI 卡和 3 个签字卡，仅为编辑结构。", "原业务五段、精确产物、镜头身份和依赖规则保存在 params.businessContract，尚未接入平台执行。", "文本连线不代表媒体传输或审批语义等价；确定性工具、付费幂等与恢复仍待平台适配。"] } },
    };
  }

  function systemPort(node, direction, id) {
    return hasKind(node.kind) ? definitions[node.kind][direction].find((entry) => entry.id === id) : undefined;
  }

  function validate(graph) {
    const issues = [];
    const issue = (code, msg, node_id = "", port_id = "", sev = "err") => issues.push({ sev, code, node_id, port_id, msg });
    if (!graph || graph.schema !== schema) issue("schema_outdated", "文件版本不匹配，请先迁移再编辑。");
    if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) {
      issue("graph_invalid", "流程缺少步骤或连线列表。");
      return issues;
    }
    const nodeMap = new Map();
    const runtimeKeys = new Set();
    const reserved = new Set(["date", "time", "run", "flow", "日期", "时间", "运行号", "流程名"]);
    graph.nodes.forEach((node) => {
      if (!node || typeof node.id !== "string" || !node.id.length || node.id.length > 64 || nodeMap.has(node.id)) {
        issue("node_id_invalid", "步骤编号缺失或重复。");
        return;
      }
      nodeMap.set(node.id, node);
      if (!hasKind(node.kind)) { issue("unknown_kind", "这个步骤类型尚未登记。", node.id); return; }
      const definition = definitions[node.kind];
      if (Object.hasOwn(node, "type") || Object.hasOwn(node, "agent") || Object.hasOwn(node, "refs")) issue("legacy_node_field", "旧版节点字段需要先迁移。", node.id);
      const ids = new Set();
      ["inputs", "outputs"].forEach((direction) => {
        const entries = node[direction];
        if (!Array.isArray(entries)) { issue("ports_invalid", "请补齐输入和输出列表。", node.id); return; }
        if (entries.length > 8) issue("port_too_many", "每侧最多 8 个端口。", node.id);
        const names = new Set();
        definition[direction].forEach((expected) => {
          const found = entries.find((entry) => entry?.id === expected.id);
          if (!found) issue("system_port_missing", "系统端口不能删除。", node.id, expected.id);
          else if (JSON.stringify(found.types) !== JSON.stringify(expected.types) || Boolean(found.required) !== Boolean(expected.required)) issue("system_port_altered", "系统端口的类型和必填性不能修改。", node.id, expected.id);
        });
        entries.forEach((entry) => {
          if (!entry || typeof entry.id !== "string") { issue("port_id_invalid", "端口缺少固定编号。", node.id); return; }
          if (ids.has(entry.id)) issue("port_id_dup", "同一步骤的端口编号不能重复。", node.id, entry.id);
          ids.add(entry.id);
          const system = systemPort(node, direction, entry.id);
          if (!system && !/^(in|out)_[a-z0-9]{1,16}$/.test(entry.id)) issue("port_id_invalid", "自定义端口编号不符合规则。", node.id, entry.id);
          const name = typeof entry.name === "string" ? entry.name.trim() : "";
          if (!name || name.length > 24 || /[{}\n\r]/.test(name)) issue("port_name_invalid", "端口名称需为 1–24 字，不能使用换行或大括号。", node.id, entry.id);
          if (reserved.has(name)) issue("port_name_reserved", "这个名称为系统保留，请换一个名称。", node.id, entry.id);
          if (names.has(name)) issue("port_name_dup", "同一侧端口名称不能重复。", node.id, entry.id);
          names.add(name);
          const allowed = system?.types || (direction === "inputs" ? definition.customInputs : definition.customOutputs) || [];
          if (!system && !allowed.length) issue("port_not_allowed", "这个步骤不支持增加此侧端口。", node.id, entry.id);
          if (!Array.isArray(entry.types) || !entry.types.length || entry.types.length > (direction === "outputs" ? 1 : 4) || new Set(entry.types).size !== entry.types.length || entry.types.some((type) => !types.includes(type) || !allowed.includes(type))) issue("port_types_invalid", "这个步骤不支持所选端口类型。", node.id, entry.id);
        });
      });
      const params = node.params || {};
      if (node.kind !== "ai") {
        if (["exec", "prompts", "selfcheck", "timeout_sec", "queue_timeout_sec", "session_key", "owner", "workspace"].some((key) => Object.hasOwn(node, key))) issue("exec_not_allowed", "只有 AI 步骤可以配置 AI 执行参数。", node.id);
        if (node.skills?.length || node.connectors?.length) issue("resource_not_allowed", "这个步骤不能绑定技能或连接器。", node.id);
      } else {
        const exec = node.exec || {};
        if (!["platform", "org_agent", "agent", "expert", "a2a"].includes(exec.kind)) issue("exec_kind_invalid", "请选择支持的处理者。", node.id);
        if (exec.kind !== "platform" && (!exec.ref || (exec.kind === "org_agent" && !exec.bot_uid))) issue("exec_unbound", "请补齐处理者的绑定信息。", node.id);
        if (["agent", "expert"].includes(exec.kind) && !exec.runtime?.id) issue("exec_unbound", "请先选择该处理者的运行设备。", node.id);
        if (exec.kind === "platform" && (node.skills?.length || node.connectors?.length)) issue("platform_ignores_resources", "平台模型不会使用此处的技能和连接器。", node.id, "", "warn");
        if (exec.kind === "platform" && Array.isArray(node.outputs) && node.outputs.some((entry) => entry?.types?.includes("file"))) issue("platform_file_output", "平台模型不能直接交付文件，请更换已授权处理者。", node.id);
        if (exec.kind === "a2a") issue("a2a_legacy", "这是旧版处理者，使用前需核实兼容性。", node.id, "", "warn");
        if (!graph.edges.some((edge) => edge?.to === node.id) && !nonEmpty(node.prompts?.p2)) issue("ai_no_input", "请填写要处理的事情，或接入资料。", node.id, "", "warn");
        ["timeout_sec", "queue_timeout_sec"].forEach((key) => {
          if (node[key] !== undefined && (!Number.isInteger(node[key]) || node[key] < 0)) issue("param_range", "等待时长必须是非负整数。", node.id);
        });
        Object.values(node.prompts || {}).forEach((prompt) => {
          if (typeof prompt !== "string") { issue("prompt_invalid", "处理说明必须是文字。", node.id); return; }
          for (const match of prompt.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
            const input = Array.isArray(node.inputs) ? node.inputs.find((entry) => entry?.name === match[1].trim()) : null;
            if (!input) issue("unknown_port_ref", `说明中引用的「${match[1].trim()}」不是输入名称。`, node.id, "", "warn");
            else if (!graph.edges.some((edge) => edge?.to === node.id && edge.toPort === input.id)) issue("ref_unconnected_port", `「${input.name}」还没有接入资料。`, node.id, input.id, "warn");
          }
        });
      }
      if (node.kind !== "sign" && node.gate) issue("gate_not_allowed", "只有人工确认步骤可以配置签字。", node.id);
      if (node.attachments?.length && !["image", "file"].includes(node.kind)) issue("attachments_not_allowed", "附件只能放在图片或文件资料步骤。", node.id);
      if (node.kind === "image" && node.attachments?.length > 4) issue("attachments_too_many", "图片最多 4 张。", node.id);
      if (["text", "image", "file"].includes(node.kind)) {
        if (!["static", "runtime"].includes(params.source)) issue("param_range", "请选择资料填写方式。", node.id);
        if (params.source === "runtime") {
          if (!nonEmpty(params.key)) issue("runtime_key_required", "请填写资料名称编号。", node.id);
          else if (typeof params.key !== "string" || params.key.length > 128 || /[{},]/.test(params.key)) issue("runtime_key_invalid", "资料编号不能超过 128 字或包含大括号、逗号。", node.id);
          if (runtimeKeys.has(params.key)) issue("runtime_key_dup", "流程中的资料编号重复。", node.id);
          runtimeKeys.add(params.key);
        }
      }
      if (node.kind === "file" && !["read", "static"].includes(params.mode)) issue("param_range", "请选择文件处理方式。", node.id);
      if (["group_messages", "group_send"].includes(node.kind) && !nonEmpty(params.group_no)) issue("param_required", "请先选择目标群。", node.id);
      if (node.kind === "group_messages" && (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 200 || !["last_n", "24h", "7d", "since_last_run"].includes(params.range))) issue("param_range", "消息数量需为 1–200，时间范围须为已提供选项。", node.id);
      if (node.kind === "drive_save") {
        if (!params.drive_space_id || !params.folder_id) issue("param_required", "请选择文件空间和文件夹。", node.id);
        if (!["rename", "overwrite"].includes(params.on_conflict)) issue("param_range", "重名文件仅支持改名保存或覆盖。", node.id);
      }
      if (node.kind === "result" && !["success", "failed"].includes(params.outcome)) issue("param_range", "请选择交付结果状态。", node.id);
      if (node.kind === "sign") {
        if (!nonEmpty(node.gate?.signer_uid)) issue("param_required", "请选择需要确认这一步的人。", node.id);
        if ((node.gate?.ttl_hours !== undefined && (!Number.isFinite(node.gate.ttl_hours) || node.gate.ttl_hours < 0)) || (node.gate?.ttl_minutes !== undefined && (!Number.isInteger(node.gate.ttl_minutes) || node.gate.ttl_minutes < 0)) || (node.gate?.sign_mode !== undefined && !["both", "assignee"].includes(node.gate.sign_mode))) issue("param_range", "确认期限或签字方式不符合规则。", node.id);
      }
    });
    const edgeKeys = new Set();
    const edgeIds = new Set();
    const incoming = new Set();
    const successors = new Map();
    graph.edges.forEach((edge) => {
      if (!edge || !edge.id || edgeIds.has(edge.id)) { issue("edge_id_invalid", "连线编号缺失或重复。"); return; }
      edgeIds.add(edge.id);
      if (Object.hasOwn(edge, "kind")) issue("edge_kind_removed", "连线不能使用旧版 kind 字段。");
      const source = nodeMap.get(edge.from);
      const target = nodeMap.get(edge.to);
      const output = Array.isArray(source?.outputs) ? source.outputs.find((entry) => entry?.id === edge.fromPort) : null;
      const input = Array.isArray(target?.inputs) ? target.inputs.find((entry) => entry?.id === edge.toPort) : null;
      if (!output || !input) {
        const reversed = source?.inputs?.some?.((entry) => entry?.id === edge.fromPort) || target?.outputs?.some?.((entry) => entry?.id === edge.toPort);
        issue(reversed ? "edge_direction" : "edge_port_missing", reversed ? "只能从输出端口连接到输入端口。" : "连线的一端不存在。", edge.to || "");
        return;
      }
      const key = JSON.stringify([edge.from, edge.fromPort, edge.to, edge.toPort]);
      if (edgeKeys.has(key)) issue("edge_dup", "这两个端口已经连接。", edge.to, edge.toPort);
      edgeKeys.add(key);
      if (edge.from === edge.to) issue("self_loop", "步骤不能连接回自己。", edge.to);
      const outputType = output.types?.[0];
      if (!input.types?.includes(outputType)) issue("port_type_mismatch", `类型不匹配：${typeNames[outputType] || outputType} 不能接到「${target.name}」的${input.name}口，它只接受 ${(input.types || []).map((type) => typeNames[type] || type).join("、")}`, edge.to, edge.toPort);
      else incoming.add(JSON.stringify([edge.to, edge.toPort]));
      if (edge.type !== outputType) issue("edge_type_stale", "连线记录的类型已变化，请检查。", edge.to, edge.toPort, "warn");
      if (!successors.has(edge.from)) successors.set(edge.from, []);
      successors.get(edge.from).push(edge.to);
    });
    const visited = new Set();
    const active = new Set();
    function visit(id) {
      if (active.has(id)) return true;
      if (visited.has(id)) return false;
      active.add(id);
      for (const target of successors.get(id) || []) if (visit(target)) return true;
      active.delete(id); visited.add(id);
      return false;
    }
    if ([...nodeMap.keys()].some(visit)) issue("cycle", "流程出现循环，请移除返回上游的连线。");
    nodeMap.forEach((node) => {
      (Array.isArray(node.inputs) ? node.inputs : []).forEach((input) => {
        const required = systemPort(node, "inputs", input?.id)?.required ?? input?.required;
        const inline = node.kind === "group_send" && input?.id === "body" && nonEmpty(node.params?.text);
        if (required && !inline && !incoming.has(JSON.stringify([node.id, input.id]))) issue("required_port_unconnected", `请为「${node.name}」接入${input.name}。`, node.id, input.id);
      });
    });
    if (graph.ui?.groups?.length) issue("ui_groups_ignored", "分组只用于展示，不改变执行顺序。", "", "", "warn");
    if (graph.migration?.atoms?.from_schema === "PrototypeDraft") {
      ["01.1-H02", "01.1-H05", "01.1-H10"].forEach((id) => {
        if (nodeMap.get(id)?.kind !== "sign") issue("business_gate_missing", "妆舟流程的必需人工确认被删除或替换，请恢复。", id);
      });
      [["01.1-H02", "01.1-V03"], ["01.1-H05", "01.1-V06"]].forEach(([gateId, downstream]) => {
        if (nodeMap.has(downstream) && !graph.edges.some((edge) => edge?.from === gateId && edge.fromPort === "approved" && edge.to === downstream)) issue("business_gate_bypassed", "这个业务步骤必须由对应的人工确认通过后继续。", downstream);
      });
    }
    return issues;
  }

  function editPort(graph, nodeId, direction, portId, update) {
    const next = clone(graph);
    const node = next.nodes.find((entry) => entry.id === nodeId);
    const target = node?.[direction]?.find((entry) => entry.id === portId);
    if (!target || !["inputs", "outputs"].includes(direction)) throw new Error("edge_port_missing");
    const system = systemPort(node, direction, portId);
    if (update.id && update.id !== portId) throw new Error("port_id_immutable");
    if (system && (update.remove || update.types || update.required !== undefined)) throw new Error("system_port_altered");
    const oldName = target.name;
    if (update.remove) node[direction] = node[direction].filter((entry) => entry.id !== portId);
    else {
      ["name", "types", "required", "prompt"].forEach((key) => { if (update[key] !== undefined) target[key] = clone(update[key]); });
      if (direction === "inputs" && node.kind === "ai" && update.name && oldName !== update.name) {
        Object.keys(node.prompts).forEach((key) => {
          node.prompts[key] = node.prompts[key].replace(/{{\s*([^{}]+?)\s*}}/g, (whole, name) => name.trim() === oldName ? `{{${update.name}}}` : whole);
        });
      }
    }
    const before = next.edges.length;
    next.edges = next.edges.filter((edge) => {
      const related = direction === "inputs" ? edge.to === nodeId && edge.toPort === portId : edge.from === nodeId && edge.fromPort === portId;
      if (!related) return true;
      if (update.remove) return false;
      if (!update.types) return true;
      const source = next.nodes.find((entry) => entry.id === edge.from)?.outputs.find((entry) => entry.id === edge.fromPort);
      const input = next.nodes.find((entry) => entry.id === edge.to)?.inputs.find((entry) => entry.id === edge.toPort);
      if (!input?.types.includes(source?.types[0])) return false;
      edge.type = source.types[0];
      return true;
    });
    const errors = validate(next).filter((entry) => entry.sev === "err" && entry.node_id === nodeId && entry.code !== "port_type_mismatch" && /^(port_|system_port|ports_)/.test(entry.code));
    if (errors.length) throw new Error(errors[0].msg);
    return { graph: next, removedEdges: before - next.edges.length };
  }

  function addPort(graph, nodeId, direction, name, portTypes, required = true) {
    const next = clone(graph);
    const node = next.nodes.find((entry) => entry.id === nodeId);
    if (!node || !["inputs", "outputs"].includes(direction)) throw new Error("ports_invalid");
    const id = newId(direction === "inputs" ? "in_" : "out_", [...node.inputs, ...node.outputs].map((entry) => entry.id));
    node[direction].push({ id, name, types: clone(portTypes), locked: false, ...(direction === "inputs" ? { required } : {}) });
    const errors = validate(next).filter((entry) => entry.node_id === nodeId && /^(port_|ports_)/.test(entry.code));
    if (errors.length) throw new Error(errors[0].msg);
    return next;
  }

  function connect(graph, from, fromPort, to, toPort) {
    const next = clone(graph);
    const source = next.nodes.find((entry) => entry.id === from)?.outputs.find((entry) => entry.id === fromPort);
    const edge = { id: newId("edge_", next.edges.map((entry) => entry.id)), from, fromPort, to, toPort, type: source?.types[0] };
    next.edges.push(edge);
    const errors = validate(next).filter((entry) => entry.sev === "err" && /^(edge_|port_type_mismatch|self_loop|cycle)/.test(entry.code));
    if (errors.length) throw new Error(errors[0].msg);
    return next;
  }

  function cardTemplate(node, name = node.name) {
    const allowed = ["kind", "name", "atom", "exec", "prompts", "selfcheck", "timeout_sec", "queue_timeout_sec", "inputs", "outputs", "params", "skills", "connectors", "gate", "attachments"];
    const card = { id: "n1", x: 0, y: 0 };
    allowed.forEach((key) => { if (node[key] !== undefined) card[key] = clone(node[key]); });
    if (card.exec) {
      delete card.exec.materialized;
      if (["agent", "expert"].includes(card.exec.kind)) delete card.exec.bot_uid;
    }
    return { schema, name, nodes: [card], edges: [], template: { kind: "node" } };
  }

  function instantiate(template, graph, templateId) {
    if (template?.schema !== schema || template.template?.kind !== "node" || template.nodes?.length !== 1 || template.edges?.length !== 0) throw new Error("tpl_not_single_card");
    const node = clone(template.nodes[0]);
    node.id = newId("node_", graph.nodes.map((entry) => entry.id));
    node.x = 80 + (graph.nodes.length % 4) * 290;
    node.y = 100 + Math.floor(graph.nodes.length / 4) * 310;
    node.atom = { ...node.atom, tpl: templateId };
    if (node.params?.source === "runtime" && node.params.key) {
      const original = node.params.key;
      const keys = graph.nodes.filter((entry) => entry.params?.source === "runtime").map((entry) => entry.params.key);
      let suffix = 2;
      while (keys.includes(node.params.key)) { node.params.key = `${original}_${suffix}`; suffix += 1; }
    }
    return node;
  }

  function snapshot(graph) {
    return { format: "LocalRelayDraft@1", executionEvidence: "not_run", runnable: false, graph: clone(graph), savedAt: new Date().toISOString() };
  }

  function restore(raw) {
    const saved = JSON.parse(raw);
    const graph = saved?.graph;
    if (saved?.format !== "LocalRelayDraft@1" || graph?.schema !== schema || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error("unsupported_snapshot");
    if (new Set(graph.nodes.map((node) => node?.id)).size !== graph.nodes.length || graph.nodes.some((node) => !hasKind(node?.kind) || typeof node.id !== "string" || !Array.isArray(node.inputs) || !Array.isArray(node.outputs) || !node.params || typeof node.params !== "object" || Array.isArray(node.params) || [...node.inputs, ...node.outputs].some((entry) => !entry || typeof entry.id !== "string" || typeof entry.name !== "string" || !Array.isArray(entry.types) || entry.types.some((type) => typeof type !== "string")))) throw new Error("damaged_snapshot");
    for (const node of graph.nodes) {
      if (node.kind === "ai" && (!node.exec || typeof node.exec !== "object" || !node.prompts || typeof node.prompts !== "object" || !Array.isArray(node.skills) || !Array.isArray(node.connectors) || ["p1", "p2", "p3"].some((key) => typeof node.prompts[key] !== "string"))) throw new Error("damaged_snapshot");
      if (node.kind === "sign" && (!node.gate || typeof node.gate !== "object")) throw new Error("damaged_snapshot");
    }
    if (graph.edges.some((edge) => !edge || ["id", "from", "fromPort", "to", "toPort"].some((key) => typeof edge[key] !== "string"))) throw new Error("damaged_snapshot");
    return clone(graph);
  }

  function diagramCheck(graph) {
    const issues = validate(graph);
    const errors = issues.filter((entry) => entry.sev === "err");
    if (errors.length) return { status: "blocked", issues, steps: [], executionEvidence: "not_run", runnable: false };
    const pending = new Set(graph.nodes.map((node) => node.id));
    const steps = [];
    while (pending.size) {
      const available = graph.nodes.filter((node) => pending.has(node.id) && graph.edges.filter((edge) => edge.to === node.id).every((edge) => !pending.has(edge.from)));
      if (!available.length) return { status: "blocked", issues, steps, executionEvidence: "not_run", runnable: false };
      available.forEach((node) => { pending.delete(node.id); steps.push({ id: node.id, status: node.kind === "sign" ? "human_required" : "structure_only", text: node.kind === "sign" ? "实际运行必须等待真人；此处没有生成批准。" : "资料连接已检查；未执行本步骤。" }); });
    }
    return { status: "structure_checked", issues, steps, executionEvidence: "not_run", runnable: false };
  }

  return { schema, types, typeNames, kinds, definitions, createNode, fromBusinessAtoms, systemPort, validate, editPort, addPort, connect, cardTemplate, instantiate, snapshot, restore, diagramCheck, newId };
})();

if (typeof module !== "undefined" && module.exports) module.exports = RelayContract;
