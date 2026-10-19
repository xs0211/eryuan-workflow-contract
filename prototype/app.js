const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const moduleTemplate = (action, executor, capabilities, evidence, onFailure) => ({
  input: {
    action: "校验并绑定上游产物，冻结 ID、版本与哈希",
    executor: "运行时",
    capabilities: [],
    evidence: "输入 artifact identity、规则版本与输入哈希",
    onFailure: "blocked / changes_required",
  },
  check: {
    action: action.check,
    executor: "平台规则校验器",
    capabilities: [],
    evidence: "规则版本、输入哈希、逐条检查结果",
    onFailure,
  },
  execute: {
    action: action.execute,
    executor,
    capabilities,
    evidence,
    onFailure,
  },
  review: {
    action: action.review || "执行确定性质量规则；满足条件后进入输出段",
    executor: action.human ? "平台审批校验器" : "规则审核器",
    capabilities: [],
    evidence: action.human ? "身份、权限、决定、产物版本与哈希" : "规则结果与证据引用",
    onFailure: action.human ? "returned / blocked / expired" : "changes_required / blocked",
  },
  output: {
    action: action.output,
    executor: "运行时",
    capabilities: [],
    evidence: "产物 ID、类型、版本、哈希与状态",
    onFailure: "blocked / retryable_failure",
  },
});

const atoms = [
  {
    id: "01.1-V01",
    name: "登记制作任务",
    type: "生产资料原子",
    palette: "production_material_agent",
    stage: "intent",
    icon: "box",
    description: "读取主播排期、人物和商品资料，确认资料可用后创建制作任务。",
    inputs: [port("productionRequest", "制作任务与源素材", "ProductionRequest@1.0.0")],
    outputs: [port("taskRecord", "任务记录", "TaskRecord@1.0.0")],
    capabilities: ["source.lookup", "file.read", "hash.compute"],
    modules: moduleTemplate(
      { check: "验证排期冲突、文件字节和内容哈希", execute: "创建幂等 TaskRecord", output: "输出 taskId、输入版本和幂等键" },
      "确定性执行器",
      ["file.read", "hash.compute"],
      "源文件哈希、排期查询结果、幂等任务记录",
      "blocked / retryable_failure"
    ),
  },
  {
    id: "01.1-V02",
    name: "生成脚本方案",
    type: "处理代理原子",
    palette: "process_agent",
    stage: "intent",
    icon: "cpu",
    warning: true,
    description: "根据已确认的资料生成六镜脚本候选，商品信息必须有资料来源，完成后交给真人确认。",
    inputs: [
      port("taskRecord", "有效任务记录", "TaskRecord@1.0.0"),
      port("hostProfile", "主播资料", "HostProfile@1.0.0"),
      port("productFacts", "商品事实", "ProductFacts@1.0.0"),
    ],
    outputs: [port("scriptProposal", "脚本候选", "ScriptProposal@1.0.0")],
    capabilities: ["text.generate"],
    modules: moduleTemplate(
      { check: "验证事实来源、数值规则与禁止声明", execute: "生成六镜脚本候选", output: "输出可审批的脚本版本与哈希" },
      "文本执行 Agent",
      ["text.generate"],
      "模型版本、事实引用、脚本哈希与质量检查结果",
      "changes_required / blocked / retryable_failure"
    ),
  },
  {
    id: "01.1-H02",
    name: "人工确认脚本",
    type: "真人决定原子",
    palette: "human",
    stage: "intent",
    icon: "user",
    warning: true,
    human: true,
    description: "由有权限的负责人确认当前脚本。AI 不能代替签字，脚本一旦修改就需要重新确认。",
    inputs: [port("scriptProposal", "待审脚本", "ScriptProposal@1.0.0")],
    outputs: [port("approvedScript", "已确认脚本", "HumanDecision@1.0.0")],
    capabilities: ["human.review"],
    modules: moduleTemplate(
      {
        check: "验证待审脚本 ID、版本、哈希与运行态",
        execute: "等待并记录真人批准、驳回或打回",
        review: "系统校验真人身份、权限、精确脚本版本与哈希、决定有效期及运行态",
        output: "输出 HumanDecision，含 reviewedArtifact 的脚本 ID、类型、版本与哈希",
        human: true,
      },
      "指定真人审核人",
      ["human.review"],
      "登录身份、权限依据、决定、理由、时间、事务号与脚本产物引用",
      "returned / expired / blocked"
    ),
  },
  {
    id: "01.1-V03",
    name: "生成分镜",
    type: "处理代理原子",
    palette: "process_agent",
    stage: "intent",
    icon: "file",
    description: "只使用已经确认的脚本，拆出六个镜头，并写明画面、动作和时长。",
    inputs: [
      port("approvedScript", "已确认脚本", "HumanDecision@1.0.0"),
      port("hostProfile", "主播资料", "HostProfile@1.0.0"),
      port("productFacts", "商品事实", "ProductFacts@1.0.0"),
    ],
    outputs: [port("storyboard", "六镜分镜", "StoryboardPlan@1.0.0")],
    capabilities: ["text.generate"],
    modules: moduleTemplate(
      { check: "取回 HumanDecision.reviewedArtifact，校验精确 ScriptProposal、决定有效期、六镜合同与稳定 shotId", execute: "生成六个分镜实例", output: "输出 StoryboardPlan 与 shotId 列表" },
      "文本执行 Agent",
      ["text.generate"],
      "审批引用、六镜合同、分镜版本与哈希",
      "changes_required / blocked"
    ),
  },
  {
    id: "01.1-V04",
    name: "单镜生图或修图",
    type: "处理代理原子",
    palette: "process_agent",
    stage: "assets",
    icon: "image",
    repeat: 6,
    warning: true,
    description: "按照六个镜头的画面要求逐镜生成或修图，并保留每个镜头对应关系。",
    inputs: [port("shotImageRequest", "单镜图片请求", "ShotImageRequest@1.0.0")],
    outputs: [port("shotImage", "单镜图片", "ShotImage@1.0.0")],
    capabilities: ["image.generate", "image.edit", "storage.put"],
    modules: moduleTemplate(
      { check: "校验 shotId、参考图、提示与付费门禁", execute: "生成或编辑单镜图片", output: "保存图片、哈希与动作状态" },
      "媒体执行 Agent",
      ["image.generate", "image.edit", "storage.put"],
      "请求账本、提供方回执、文件哈希与输出版本",
      "blocked / unknown_outcome / retryable_failure"
    ),
  },
  {
    id: "01.1-V05",
    name: "素材整理、冻结与完整性审核",
    type: "组装与冻结原子",
    palette: "process_agent",
    stage: "assets",
    icon: "box",
    description: "把六张单镜图片整理成一个完整素材包，检查数量、对应关系和文件完整性。",
    inputs: [
      port("storyboard", "分镜", "StoryboardPlan@1.0.0"),
      port("shotImages", "六张单镜图", "ShotImage@1.0.0", "one_or_more"),
      port("manifest", "依赖清单", "ArtifactManifest@1.0.0"),
    ],
    outputs: [port("frozenPackage", "冻结候选", "FrozenContentPackageCandidate@1.0.0")],
    capabilities: ["file.read", "storage.get", "storage.put", "hash.compute"],
    modules: moduleTemplate(
      { check: "校验数量、唯一性、依赖头与全部哈希", execute: "生成 manifest 并 CAS 发布候选", output: "输出不可变冻结候选与 manifest hash" },
      "确定性执行器",
      ["storage.get", "storage.put", "hash.compute"],
      "六源版本、依赖清单、manifest 哈希与事务号",
      "blocked / changes_required"
    ),
  },
  {
    id: "01.1-H05",
    name: "人工确认素材包",
    type: "真人决定原子",
    palette: "human",
    stage: "assets",
    icon: "user",
    warning: true,
    human: true,
    description: "由负责人确认当前素材包。没有获得确认时，后续视频任务不会开始。",
    inputs: [port("frozenPackage", "冻结候选", "FrozenContentPackageCandidate@1.0.0")],
    outputs: [
      port("packageDecision", "素材包确认结果", "HumanDecision@1.0.0"),
      port("approvedPackage", "已确认素材包", "ApprovedContentPackage@1.0.0"),
    ],
    capabilities: ["human.review"],
    modules: moduleTemplate(
      {
        check: "验证冻结候选 CAS、manifest hash 与包版本",
        execute: "等待并记录真人批准、驳回或打回",
        review: "系统校验真人身份、权限、精确候选版本与 manifest hash、决定有效期及运行态",
        output: "输出 HumanDecision，并在批准时派生 ApprovedContentPackage；两者均引用冻结候选的精确身份",
        human: true,
      },
      "指定真人审核人",
      ["human.review"],
      "身份、权限、决定、manifest hash、事务号与冻结候选引用",
      "returned / expired / blocked"
    ),
  },
  {
    id: "01.1-V06",
    name: "单镜提交视频",
    type: "处理代理原子",
    palette: "process_agent",
    stage: "generation",
    icon: "video",
    repeat: 6,
    warning: true,
    description: "只使用已经确认的素材包提交六个单镜视频任务，并防止重复提交和重复扣费。",
    inputs: [
      port("approvedPackage", "已确认素材包", "ApprovedContentPackage@1.0.0"),
      port("submissionIntent", "提交意图", "VideoSubmissionIntent@1.0.0"),
    ],
    outputs: [port("providerReceipt", "提供方回执", "ProviderTaskReceipt@1.0.0")],
    capabilities: ["video.submit", "idempotency.ledger", "quota.reserve"],
    modules: moduleTemplate(
      { check: "验证 ApprovedContentPackage、有效审批引用、包哈希、预算、幂等键与 ownerEpoch", execute: "预留额度并提交视频任务", output: "保存 providerTaskId 或可靠对账记录" },
      "媒体网关执行器",
      ["video.submit", "idempotency.ledger", "quota.reserve"],
      "提交前快照、预算账本、POST 次数、回执与对账依据",
      "blocked / unknown_outcome / retryable_failure"
    ),
  },
  {
    id: "01.1-V07",
    name: "查询并取回片段",
    type: "处理代理原子",
    palette: "process_agent",
    stage: "generation",
    icon: "video",
    repeat: 6,
    description: "查询六个视频任务，成功后取回片段；失败、取消或过期时停止并给出明确结果。",
    inputs: [port("providerReceipt", "提交回执", "ProviderTaskReceipt@1.0.0")],
    outputs: [port("shotVideo", "单镜片段", "ShotVideo@1.0.0")],
    capabilities: ["video.poll", "media.download", "media.probe"],
    modules: moduleTemplate(
      { check: "区分未完成、明确失败、取消、过期与成功", execute: "查询、下载并探测媒体", output: "保存片段、哈希与实测时长" },
      "媒体网关执行器",
      ["video.poll", "media.download", "media.probe"],
      "完整轮询日志、下载哈希、媒体探测结果",
      "blocked / expired / failed / retryable_failure"
    ),
  },
  {
    id: "01.1-V08",
    name: "旁白检测",
    type: "处理代理原子",
    palette: "process_agent",
    stage: "generation",
    icon: "audio",
    repeat: 6,
    warning: true,
    description: "检查每个片段里是否有符合脚本的旁白；没有旁白时也要明确记录已跳过。",
    inputs: [
      port("shotVideo", "单镜片段", "ShotVideo@1.0.0"),
      port("approvedDialogue", "批准对白", "ApprovedDialogue@1.0.0"),
    ],
    outputs: [port("narrationCheck", "旁白检测结果", "NarrationCheck@1.0.0")],
    capabilities: ["audio.extract", "speech.transcribe"],
    modules: moduleTemplate(
      { check: "校验片段、对白与检测能力可用性", execute: "抽取音轨并转写检测", output: "输出检测结果或重做请求" },
      "媒体分析执行器",
      ["audio.extract", "speech.transcribe"],
      "音轨提取日志、转写结果、异常与成本记录",
      "changes_required / blocked / retryable_failure"
    ),
  },
  {
    id: "01.1-V09",
    name: "可选统一音色",
    type: "处理代理原子",
    palette: "process_agent",
    stage: "generation",
    icon: "audio",
    repeat: 6,
    warning: true,
    description: "按照设定的音色要求处理片段；不需要或无法处理时说明原因并保留原音。",
    inputs: [
      port("shotVideo", "单镜片段", "ShotVideo@1.0.0"),
      port("narrationCheck", "旁白检测结论", "NarrationCheck@1.0.0"),
      port("voicePolicy", "音色策略", "VoicePolicy@1.0.0"),
    ],
    outputs: [port("voiceClip", "处理后片段", "VoiceProcessedClip@1.0.0")],
    capabilities: ["voice.convert", "audio.original_fallback", "storage.put"],
    modules: moduleTemplate(
      { check: "验证源文件、旁白检测结论、策略、回退授权与版本", execute: "按检测结论转换音色或按策略回退", output: "保存处理状态、原因与产物" },
      "音频执行器",
      ["voice.convert", "audio.original_fallback", "storage.put"],
      "源哈希、音色策略、处理状态、回退原因与输出哈希",
      "fallback / degraded / skipped / failed"
    ),
  },
  {
    id: "01.1-V10",
    name: "合片、媒体检查与主版本冻结",
    type: "组装与冻结原子",
    palette: "process_agent",
    stage: "delivery",
    icon: "video",
    warning: true,
    description: "按镜头顺序合成六个片段，检查画面、音轨和时长，形成可验收的完整成片。",
    inputs: [
      port("voiceClips", "六镜片段", "VoiceProcessedClip@1.0.0", "one_or_more"),
      port("approvedPackage", "已确认素材包", "ApprovedContentPackage@1.0.0"),
    ],
    outputs: [port("masterCandidate", "主版本候选", "MasterMediaCandidate@1.0.0")],
    capabilities: ["media.compose", "media.probe", "duration.measure", "storage.put"],
    modules: moduleTemplate(
      { check: "校验六源唯一性、音轨、微秒时长与 ownerEpoch", execute: "合片并执行媒体探测", output: "冻结可播放主版本候选与证据" },
      "确定性媒体执行器",
      ["media.compose", "media.probe", "duration.measure"],
      "六源版本、媒体探测、音轨、时长微秒值与成片哈希",
      "blocked / changes_required"
    ),
  },
  {
    id: "01.1-H10",
    name: "人工最终验收",
    type: "真人决定原子",
    palette: "human",
    stage: "delivery",
    icon: "user",
    warning: true,
    human: true,
    description: "由负责人查看完整成片并决定是否通过；成片一旦修改，就需要重新验收。",
    inputs: [port("masterCandidate", "主版本候选", "MasterMediaCandidate@1.0.0")],
    outputs: [port("finalDecision", "最终验收决定（含产物引用）", "HumanDecision@1.0.0")],
    capabilities: ["human.review"],
    modules: moduleTemplate(
      {
        check: "验证主版本、音轨、版本与播放态",
        execute: "等待并记录真人验收、驳回或打回",
        review: "系统校验真人身份、权限、精确主版本与哈希、决定有效期及运行态",
        output: "输出 HumanDecision，含 reviewedArtifact 的主版本 ID、类型、版本与哈希",
        human: true,
      },
      "指定真人审核人",
      ["human.review"],
      "身份、权限、播放证据、决定、时间、事务号与主版本引用",
      "returned / expired / blocked"
    ),
  },
];

const atomDemoData = {
  "01.1-V01": {
    instruction: "登记 2026-10-20 视频号排期，核验主播资料和商品资料后创建幂等制作任务。",
    params: { 主播: "林晓", 商品: "轻盈保温杯", 排期: "2026-10-20 14:00", 平台: "视频号" },
    steps: {
      input: "读取 ProductionRequest: task=ZZ-1019-001，主播/商品资料各 1 份，文件哈希已登记。",
      check: "排期无冲突；人物授权覆盖本次用途；商品资料版本为 2026-10-18。",
      execute: "确定性执行器创建 TaskRecord，写入幂等键 zz-1019-001-v1。",
      review: "校验 taskId、输入版本和幂等键唯一，未发现重复任务。",
      output: "输出 TaskRecord(taskId=ZZ-1019-001, status=ready, sourceVersion=3)。",
    },
  },
  "01.1-V02": {
    instruction: "使用已登记事实生成 30 秒六镜脚本，商品卖点必须来自资料，不添加价格承诺。",
    params: { 执行方式: "文案生成助手", 时长: "30 秒", 镜头数: "6", 语气: "克制可信" },
    steps: {
      input: "接收 TaskRecord 和主播、商品事实快照，锁定 6 条可引用卖点。",
      check: "过滤无来源卖点与绝对化表达，检查六个镜头的时长预算。",
      execute: "copy-v2.3 生成六镜脚本候选，保留事实引用和模型参数。",
      review: "规则审核器校验事实覆盖、禁用词和 30 秒总时长。",
      output: "输出 ScriptProposal v1，六镜合计 29.96 秒，3 处卖点均有资料引用。",
    },
  },
  "01.1-H02": {
    instruction: "由运营负责人审核精确脚本版本，批准后下游只能消费该次决定引用的脚本。",
    params: { 审核人: "王敏 / 运营负责人", 待审版本: "ScriptProposal@v1", 决定: "批准", 意见: "保留开头冲突，弱化第二镜功效表述" },
    steps: {
      input: "绑定 ScriptProposal(script-001, v1, sha256:script-v1)。",
      check: "平台展示完整脚本、事实来源与运行状态。",
      execute: "王敏提交 approved，填写意见并生成 decisionTransactionId=dec-script-001。",
      review: "平台校验审核人权限、脚本版本/hash 和决定时效，均有效。",
      output: "输出 HumanDecision，reviewedArtifact 精确指向 script-001@v1。",
    },
  },
  "01.1-V03": {
    instruction: "依据已批准脚本生成六镜分镜，分配稳定 shotId，并输出图片和视频提示词。",
    params: { 执行方式: "分镜助手", 画幅: "9:16", 风格: "自然光产品叙事", 镜头数: "6" },
    steps: {
      input: "取回 H02 approved 决定引用的 script-001@v1 和人物、商品事实。",
      check: "审批有效且未失效；六个 shotId 在本次运行内唯一。",
      execute: "storyboard-v1.8 生成逐镜画面、动作、镜头运动和提示词。",
      review: "校验六镜合同、稳定 shotId 和总时长，所有镜头可被下游独立引用。",
      output: "输出 StoryboardPlan，shotId=S01…S06，引用脚本 hash 和事实快照。",
    },
  },
  "01.1-V04": {
    instruction: "按每个 shotId 的提示词生成单镜图片，保持人物与商品外观一致，不做盲重试。",
    params: { 执行方式: "图片处理助手", 分辨率: "1080×1920", 参考图: "商品图-03、主播形象-02", 同时处理: "3 个镜头" },
    steps: {
      input: "接收 S01 单镜请求，绑定参考图版本与提示词，预留测试额度。",
      check: "检查 shotId、参考图、提示词和付费门禁，本次为 dry-run 测试替身。",
      execute: "图片测试替身生成 S01 候选，记录动作号而非真实付费请求。",
      review: "比对人物/商品一致性规则，候选达到测试阈值。",
      output: "输出 ShotImage(shotId=S01, imageId=img-s01-v1, hash=sample:image-s01)。",
    },
  },
  "01.1-V05": {
    instruction: "收集六张唯一 shotId 图片，完成完整性审核后在同一事务中发布冻结候选。",
    params: { 期望图片数: "6", 身份键: "shotId", 清单版本: "manifest-v1", 发布策略: "CAS" },
    steps: {
      input: "接收 S01-S06 六张图片、分镜依赖和依赖清单 manifest-v1。",
      check: "核验六个唯一 shotId、文件哈希、参考图谱系与依赖头。",
      execute: "确定性执行器生成候选 manifest 并执行 CAS 发布。",
      review: "确认候选内容 hash、manifest hash 和事务号一致。",
      output: "输出 FrozenContentPackageCandidate(pkg-001, v1, status=published)。",
    },
  },
  "01.1-H05": {
    instruction: "由素材审核人确认精确冻结候选；只有批准且身份校验有效时才派生已审素材包。",
    params: { 审核人: "李娜 / 内容负责人", 待审候选: "pkg-001@v1", 决定: "批准", 意见: "六镜人物和商品一致，可进入视频测试" },
    steps: {
      input: "绑定已发布 FrozenContentPackageCandidate(pkg-001, v1, manifest hash)。",
      check: "展示六张图片、shots 清单、哈希和依赖谱系。",
      execute: "李娜提交 approved，生成 decisionTransactionId=dec-package-001。",
      review: "平台校验候选类型、published 状态、权限与精确 manifest hash。",
      output: "派生 ApprovedContentPackage(pkg-approved-001, v1)，来源引用 pkg-001。",
    },
  },
  "01.1-V06": {
    instruction: "仅使用已审批素材包提交六个单镜视频测试任务，未知结果先对账，禁止重复 POST。",
    params: { 执行方式: "视频任务助手", 单镜时长: "约 5 秒", 同时提交: "2 个镜头", 费用策略: "仅使用测试额度" },
    steps: {
      input: "接收 ApprovedContentPackage 和 S01 提交意图，生成幂等键 submit-S01-v1。",
      check: "校验审批引用、包 hash、ownerEpoch、预算和未知结果策略。",
      execute: "测试替身返回 S01 providerTaskId=task-s01-9001，不触发真实付费。",
      review: "确认回执已落账且幂等键唯一，可进入查询。",
      output: "输出 ProviderTaskReceipt(S01, task-s01-9001, status=submitted)。",
    },
  },
  "01.1-V07": {
    instruction: "按 providerTaskId 查询并取回六个视频片段；明确失败、取消或过期时停止正常轮询。",
    params: { 查询间隔: "5 秒", 超时: "180 秒", 结果状态: "成功", 媒体检查: "enable" },
    steps: {
      input: "读取 S01 回执 task-s01-9001，当前轮询第 3 次。",
      check: "区分 processing、succeeded、failed、cancelled、expired。",
      execute: "查询得到 succeeded，下载测试片段并执行媒体探测。",
      review: "确认文件可读、时长可测且 hash 与回执一致。",
      output: "输出 ShotVideo(S01, duration=4.92s, probe=passed)。",
    },
  },
  "01.1-V08": {
    instruction: "抽取单镜音轨并对照批准对白检测旁白；没有对白时必须留下显式跳过证据。",
    params: { 执行方式: "旁白检查助手", 参考对白: "已确认脚本 S01 台词", 策略: "正常检测", 匹配要求: "高" },
    steps: {
      input: "接收 S01 视频片段和 H02 reviewedArtifact 中提取的批准对白。",
      check: "校验音轨存在、对白引用有效、检测能力可用。",
      execute: "测试 ASR 返回 S01 旁白文本和置信度 0.94。",
      review: "与批准对白比对，文本一致且置信度超过阈值。",
      output: "输出 NarrationCheck(S01, status=passed, confidence=0.94)。",
    },
  },
  "01.1-V09": {
    instruction: "依据音色策略处理六个片段；需要跳过或回退时写明原因并保留原音证据。",
    params: { 执行方式: "音色处理助手", 音色: "低沉自然男声", 策略: "保留原音优先", 无法处理时: "保留原音" },
    steps: {
      input: "接收 S01 片段、旁白检测结果和已授权音色策略。",
      check: "校验源文件、检测结论、音色授权与回退策略。",
      execute: "测试替身完成 S01 音色处理，记录 processed=true。",
      review: "检查输出音轨可读、时长未变化、状态可追溯。",
      output: "输出 VoiceProcessedClip(S01, status=processed, duration=4.92s)。",
    },
  },
  "01.1-V10": {
    instruction: "按稳定 shotId 汇总六段片段，合片并完成音轨、时长和可播放性检查。",
    params: { 执行方式: "视频合成助手", 目标时长: "29.9-30.1 秒", 画幅: "1080×1920", 音轨: "清晰可播放" },
    steps: {
      input: "接收 S01-S06 六个处理片段、顺序表和 ApprovedContentPackage 依赖。",
      check: "校验六个唯一 shotId、音轨、总时长和 ownerEpoch。",
      execute: "按分镜顺序合片并生成测试主版本。",
      review: "媒体探测通过，实测 30.002 秒，画面和音轨均可解码。",
      output: "输出 MasterMediaCandidate(master-001, 30.002s, probe=passed)。",
    },
  },
  "01.1-H10": {
    instruction: "由业务负责人对精确可播放主版本做最终验收；任何成片替换都使旧决定失效。",
    params: { 验收人: "晓帅 / 业务负责人", 待验版本: "master-001@v1", 决定: "通过", 意见: "节奏、人物与商品信息符合预期" },
    steps: {
      input: "绑定 MasterMediaCandidate(master-001, v1, hash=sample:master)。",
      check: "平台展示成片、时长、音轨和六源版本谱系。",
      execute: "晓帅提交 approved，生成 decisionTransactionId=dec-final-001。",
      review: "校验身份、权限、主版本 hash、播放证据和决定时效。",
      output: "输出最终 HumanDecision，reviewedArtifact 精确指向 master-001@v1。",
    },
  },
};

for (const atom of atoms) {
  const demo = atomDemoData[atom.id];
  atom.instruction = demo.instruction;
  atom.params = demo.params;
  for (const [moduleName, detail] of Object.entries(demo.steps)) {
    atom.modules[moduleName].detail = detail;
    atom.modules[moduleName].model = moduleName === "execute"
      ? atom.modules.execute.executor
      : atom.modules[moduleName].executor;
    atom.modules[moduleName].sampleResult = detail;
  }
}

function port(portId, label, schemaRef, cardinality = "one", required = true, origin = "atom_default") {
  return { portId, label, schemaRef, cardinality, required, origin };
}

const edgeDefinitions = [
  {
    id: "E01",
    from: { atomId: "01.1-V01", portId: "taskRecord" },
    to: { atomId: "01.1-V02", portId: "taskRecord" },
    type: "artifact",
    cardinality: "one",
    transform: "identity",
  },
  {
    id: "E02",
    from: { atomId: "01.1-V02", portId: "scriptProposal" },
    to: { atomId: "01.1-H02", portId: "scriptProposal" },
    type: "artifact",
    cardinality: "one",
    transform: "identity",
  },
  {
    id: "E03",
    from: { atomId: "01.1-H02", portId: "approvedScript" },
    to: { atomId: "01.1-V03", portId: "approvedScript" },
    type: "decision",
    cardinality: "one",
    transform: "validated_human_decision",
  },
  {
    id: "E04",
    from: { atomId: "01.1-V03", portId: "storyboard" },
    to: { atomId: "01.1-V04", portId: "shotImageRequest" },
    type: "artifact",
    cardinality: "fan_out_6",
    transform: "storyboard_to_shot_image_requests",
    identityKey: "shotId",
  },
  {
    id: "E05",
    from: { atomId: "01.1-V04", portId: "shotImage" },
    to: { atomId: "01.1-V05", portId: "shotImages" },
    type: "artifact",
    cardinality: "fan_in_6",
    transform: "collect_six_unique_shot_images",
    identityKey: "shotId",
  },
  {
    id: "E06",
    from: { atomId: "01.1-V05", portId: "frozenPackage" },
    to: { atomId: "01.1-H05", portId: "frozenPackage" },
    type: "artifact",
    cardinality: "one",
    transform: "identity",
  },
  {
    id: "E07",
    from: { atomId: "01.1-H05", portId: "approvedPackage" },
    to: { atomId: "01.1-V06", portId: "approvedPackage" },
    type: "artifact",
    cardinality: "one",
    transform: "approved_package_reference",
  },
  {
    id: "E08",
    from: { atomId: "01.1-V06", portId: "providerReceipt" },
    to: { atomId: "01.1-V07", portId: "providerReceipt" },
    type: "artifact",
    cardinality: "one_per_shot",
    transform: "identity",
    identityKey: "shotId",
  },
  {
    id: "E09",
    from: { atomId: "01.1-V07", portId: "shotVideo" },
    to: { atomId: "01.1-V08", portId: "shotVideo" },
    type: "artifact",
    cardinality: "one",
    transform: "identity",
  },
  {
    id: "E10",
    from: { atomId: "01.1-V08", portId: "narrationCheck" },
    to: { atomId: "01.1-V09", portId: "narrationCheck" },
    type: "gate",
    cardinality: "one",
    transform: "require_passed_or_explicit_skip",
  },
  {
    id: "E11",
    from: { atomId: "01.1-V09", portId: "voiceClip" },
    to: { atomId: "01.1-V10", portId: "voiceClips" },
    type: "artifact",
    cardinality: "fan_in_6",
    transform: "collect_six_unique_voice_clips",
    identityKey: "shotId",
  },
  {
    id: "E12",
    from: { atomId: "01.1-V10", portId: "masterCandidate" },
    to: { atomId: "01.1-H10", portId: "masterCandidate" },
    type: "artifact",
    cardinality: "one",
    transform: "identity",
  },
];

const dependencyEdges = [
  {
    id: "D01",
    from: { atomId: "01.1-V07", portId: "shotVideo" },
    to: { atomId: "01.1-V09", portId: "shotVideo" },
    type: "artifact",
    cardinality: "one",
    transform: "preserve_source_clip",
  },
  {
    id: "D02",
    from: { atomId: "01.1-V03", portId: "storyboard" },
    to: { atomId: "01.1-V05", portId: "storyboard" },
    type: "artifact",
    cardinality: "one",
    transform: "preserve_storyboard",
  },
  {
    id: "D03",
    from: { atomId: "01.1-H05", portId: "approvedPackage" },
    to: { atomId: "01.1-V10", portId: "approvedPackage" },
    type: "artifact",
    cardinality: "one",
    transform: "approved_package_reference",
  },
];

const conversionDefinitions = {
  identity: {
    cardinalities: ["one", "one_per_shot"],
    sameSchema: true,
    identityKeys: ["shotId"],
  },
  validated_human_decision: {
    fromSchema: "HumanDecision@1.0.0",
    toSchema: "HumanDecision@1.0.0",
    cardinalities: ["one"],
  },
  storyboard_to_shot_image_requests: {
    fromSchema: "StoryboardPlan@1.0.0",
    toSchema: "ShotImageRequest@1.0.0",
    cardinalities: ["fan_out_6"],
    requiresIdentityKey: true,
    identityKeys: ["shotId"],
  },
  collect_six_unique_shot_images: {
    fromSchema: "ShotImage@1.0.0",
    toSchema: "ShotImage@1.0.0",
    cardinalities: ["fan_in_6"],
    requiresIdentityKey: true,
    identityKeys: ["shotId"],
  },
  preserve_source_clip: {
    fromSchema: "ShotVideo@1.0.0",
    toSchema: "ShotVideo@1.0.0",
    cardinalities: ["one"],
  },
  preserve_storyboard: {
    fromSchema: "StoryboardPlan@1.0.0",
    toSchema: "StoryboardPlan@1.0.0",
    cardinalities: ["one"],
  },
  require_passed_or_explicit_skip: {
    fromSchema: "NarrationCheck@1.0.0",
    toSchema: "NarrationCheck@1.0.0",
    cardinalities: ["one"],
  },
  collect_six_unique_voice_clips: {
    fromSchema: "VoiceProcessedClip@1.0.0",
    toSchema: "VoiceProcessedClip@1.0.0",
    cardinalities: ["fan_in_6"],
    requiresIdentityKey: true,
    identityKeys: ["shotId"],
  },
  approved_package_reference: {
    fromSchema: "ApprovedContentPackage@1.0.0",
    toSchema: "ApprovedContentPackage@1.0.0",
    cardinalities: ["one"],
  },
};

const externalInputBindings = [
  {
    atomId: "01.1-V01",
    portId: "productionRequest",
    source: "user_upload",
    state: "missing_artifact",
  },
  {
    atomId: "01.1-V02",
    portId: "hostProfile",
    source: "authorized_host_profile",
    state: "missing_artifact",
  },
  {
    atomId: "01.1-V02",
    portId: "productFacts",
    source: "authorized_product_facts",
    state: "missing_artifact",
  },
  {
    atomId: "01.1-V03",
    portId: "hostProfile",
    source: "same_bound_artifact_as_V02",
    state: "missing_artifact",
  },
  {
    atomId: "01.1-V03",
    portId: "productFacts",
    source: "same_bound_artifact_as_V02",
    state: "missing_artifact",
  },
  {
    atomId: "01.1-V05",
    portId: "manifest",
    source: "derived_manifest_from_artifact_identities",
    state: "defined_not_verified",
  },
  {
    atomId: "01.1-V06",
    portId: "submissionIntent",
    source: "user_authorized_submission_config",
    state: "missing_config",
  },
  {
    atomId: "01.1-V08",
    portId: "approvedDialogue",
    source: "derived_from_H02_reviewed_artifact",
    state: "defined_not_verified",
  },
  {
    atomId: "01.1-V09",
    portId: "voicePolicy",
    source: "user_voice_policy",
    state: "missing_config",
  },
];

const baseEdgeDefinitions = structuredClone(edgeDefinitions);
const baseDependencyEdges = structuredClone(dependencyEdges);
const baseExternalInputBindings = structuredClone(externalInputBindings);

const resources = {
  material: [
    ["主播资料 Agent", "读取授权主播档案、形象资料与可用档期。", "box", "amber", "3 个版本"],
    ["商品资料 Agent", "读取商品事实、卖点边界与参考图。", "database", "amber", "2 个版本"],
    ["素材整理 Agent", "整理源文件、依赖清单和内容哈希。", "file", "amber", "1 个版本"],
  ],
  process: [
    ["脚本生成 Agent", "根据事实资料生成可审批脚本候选。", "cpu", "blue", "已发布"],
    ["分镜生成 Agent", "生成六镜分镜与稳定 shotId。", "file", "blue", "已发布"],
    ["图片生成 Agent", "执行单镜图片生成或编辑。", "image", "blue", "未授权"],
    ["视频生成 Agent", "执行单镜视频提交、查询与取回。", "video", "blue", "未授权"],
    ["媒体冻结 Agent", "执行合片、探测和主版本冻结。", "box", "blue", "测试中"],
  ],
  tool: [
    ["文本生成模型", "原子内部执行的事实约束文本生成。", "cpu", "teal", "测试环境"],
    ["图片生成模型", "原子内部调用的图片生成能力。", "image", "teal", "未授权"],
    ["视频生成模型", "原子内部调用的付费视频能力。", "video", "teal", "未授权"],
    ["媒体探测工具", "确定性读取媒体、音轨和时长。", "code", "teal", "测试环境"],
    ["知识库：商品事实", "固定快照与访问范围。", "database", "teal", "只读"],
  ],
  human: [
    ["脚本审核人", "具名真人或明确岗位映射。", "user", "coral", "未绑定"],
    ["素材包审核人", "有权审核冻结素材包的真人。", "user", "coral", "未绑定"],
    ["最终验收人", "有权验收可播放主版本的真人。", "user", "coral", "未绑定"],
  ],
  workflow: [
    ["旁白质检子流程", "固定版本子流程，继承父运行预算。", "workflow", "violet", "v0.7.2"],
    ["媒体失败对账子流程", "处理未知结果查询，不重复提交。", "workflow", "violet", "v0.4.1"],
    ["内容发布工作流", "当前流程禁止调用。", "workflow", "violet", "未授权"],
  ],
};

const stageNames = {
  intent: "意图与脚本",
  assets: "素材生产",
  generation: "视频生成",
  delivery: "合片交付",
};

const typeColors = {
  "生产资料原子": "amber",
  "处理代理原子": "blue",
  "组装与冻结原子": "violet",
  "真人决定原子": "coral",
};

const state = {
  atoms: structuredClone(atoms),
  selectedId: "01.1-V02",
  inspectorTab: "summary",
  zoom: 100,
  matrixQuery: "",
  resourceCategory: "material",
  saved: false,
  validationReport: null,
  undoStack: [],
  runResults: {},
  runInProgress: false,
  chatScope: "flow",
  chatMessages: [],
  hasManualEdits: false,
  storageDenied: false,
  initialized: false,
};

const DRAFT_STORAGE_KEY = "eryuan-flow-studio-draft-v1";
const DRAFT_PAYLOAD_VERSION = "PrototypeDraft@0.3";
const SUPPORTED_DRAFT_PAYLOAD_VERSIONS = new Set(["PrototypeDraft@0.2", DRAFT_PAYLOAD_VERSION]);

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function canonicalStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
    .join(",")}}`;
}

function prototypeDigest(value) {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonicalStringify(value));
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `prototype-fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

function getAtom(id) {
  return state.atoms.find((atom) => atom.id === id);
}

function getPort(atomId, portId, direction) {
  const atom = getAtom(atomId);
  const ports = direction === "output" ? atom?.outputs : atom?.inputs;
  return ports?.find((item) => item.portId === portId);
}

function isSingleValuePort(port) {
  return port?.cardinality === "one" || port?.cardinality === "zero_or_one";
}

function isMultiValuePort(port) {
  return port?.cardinality === "one_or_more";
}

function validateEdgeCardinality(edge, fromPort, toPort) {
  if (!fromPort.cardinality || !toPort.cardinality) {
    return `${edge.id} 的源端口或目标端口缺少 cardinality`;
  }

  if (edge.cardinality === "one") {
    if (!isSingleValuePort(fromPort)) {
      return `${edge.id} 不能把多值源端口 ${fromPort.portId} 当作单值输出`;
    }
    return null;
  }

  if (edge.cardinality === "one_per_shot") {
    if (!isSingleValuePort(fromPort) || !isSingleValuePort(toPort)) {
      return `${edge.id} 的 one_per_shot 两端都必须是单镜单值端口`;
    }
    return null;
  }

  if (edge.cardinality === "fan_out_6") {
    if (!isSingleValuePort(fromPort) || !isSingleValuePort(toPort)) {
      return `${edge.id} 的 fan_out_6 必须从单值分镜扩为单镜单值输入`;
    }
    return null;
  }

  if (edge.cardinality === "fan_in_6") {
    if (!isSingleValuePort(fromPort) || !isMultiValuePort(toPort)) {
      return `${edge.id} 的 fan_in_6 必须汇入 one_or_more 目标端口`;
    }
    return null;
  }

  return `${edge.id} 使用未知连接数量语义：${edge.cardinality}`;
}

function validateEdgeDefinition(edge) {
  if (!isRecord(edge) || !isRecord(edge.from) || !isRecord(edge.to)) {
    return "连接定义缺少 from/to 端点";
  }
  const fromPort = getPort(edge.from.atomId, edge.from.portId, "output");
  const toPort = getPort(edge.to.atomId, edge.to.portId, "input");
  if (!fromPort) return `${edge.id} 缺少输出端口 ${edge.from.atomId}.${edge.from.portId}`;
  if (!toPort) return `${edge.id} 缺少输入端口 ${edge.to.atomId}.${edge.to.portId}`;
  const conversion = conversionDefinitions[edge.transform];
  if (!edge.transform) return `${edge.id} 缺少类型转换或门禁语义`;
  if (!conversion) return `${edge.id} 使用未注册的转换或门禁语义：${edge.transform}`;
  if (!conversion.sameSchema && (!conversion.fromSchema || !conversion.toSchema)) {
    return `${edge.id} 的转换注册项缺少输入或输出 Schema`;
  }
  const expectedFromSchema = conversion.sameSchema ? toPort.schemaRef : conversion.fromSchema;
  const expectedToSchema = conversion.sameSchema ? fromPort.schemaRef : conversion.toSchema;
  if (conversion.sameSchema && fromPort.schemaRef !== toPort.schemaRef) {
    return `${edge.id} 类型不兼容：${fromPort.schemaRef} -> ${toPort.schemaRef}`;
  }
  if (fromPort.schemaRef !== expectedFromSchema) {
    return `${edge.id} 源 Schema 与转换定义不符：${fromPort.schemaRef} != ${expectedFromSchema}`;
  }
  if (toPort.schemaRef !== expectedToSchema) {
    return `${edge.id} 目标 Schema 与转换定义不符：${toPort.schemaRef} != ${expectedToSchema}`;
  }
  if (!conversion.cardinalities.includes(edge.cardinality)) {
    return `${edge.id} 数量语义 ${edge.cardinality} 不受 ${edge.transform} 支持`;
  }
  const cardinalityError = validateEdgeCardinality(edge, fromPort, toPort);
  if (cardinalityError) return cardinalityError;
  const supportedIdentityKeys = Array.isArray(conversion.identityKeys) ? conversion.identityKeys : [];
  const requiresIdentityKey = conversion.requiresIdentityKey || edge.cardinality === "one_per_shot";
  if (requiresIdentityKey && !edge.identityKey) {
    return `${edge.id} 的 ${edge.transform} 必须声明稳定 identityKey`;
  }
  if (edge.identityKey !== undefined && (typeof edge.identityKey !== "string" || !edge.identityKey.trim())) {
    return `${edge.id} 的 identityKey 必须是非空稳定标识`;
  }
  if (edge.identityKey && !supportedIdentityKeys.includes(edge.identityKey)) {
    return `${edge.id} 的 identityKey ${edge.identityKey} 不是该传输登记的稳定键`;
  }
  return null;
}

function validateConnectionTopology(edges = [...edgeDefinitions, ...dependencyEdges]) {
  const errors = [];
  const incomingCount = new Map();

  for (const edge of edges) {
    const key = `${edge.to.atomId}.${edge.to.portId}`;
    const incoming = incomingCount.get(key) || {
      atomId: edge.to.atomId,
      portId: edge.to.portId,
      count: 0,
    };
    incoming.count += 1;
    incomingCount.set(key, incoming);
  }

  for (const { atomId, portId, count } of incomingCount.values()) {
    if (count <= 1) continue;
    const targetPort = getPort(atomId, portId, "input");
    if (isSingleValuePort(targetPort)) {
      errors.push(`${atomId}.${portId} 是单值输入，但收到 ${count} 条连接`);
    }
  }
  return errors;
}

function validateRequiredInputBindings() {
  const connectedInputs = new Set(
    [...edgeDefinitions, ...dependencyEdges].map((edge) => `${edge.to.atomId}.${edge.to.portId}`)
  );
  const externallyBoundInputs = new Set(
    externalInputBindings.map((binding) => `${binding.atomId}.${binding.portId}`)
  );

  return state.atoms.flatMap((atom) => atom.inputs
    .filter((input) => input.required)
    .filter((input) => {
      const endpoint = `${atom.id}.${input.portId}`;
      return !connectedInputs.has(endpoint) && !externallyBoundInputs.has(endpoint);
    })
    .map((input) => `${atom.id}.${input.portId} 必填但未连接，也没有外部绑定`));
}

function deriveApprovedContentPackage(atom, decision, frozenCandidate) {
  const blocked = (reason) => ({ status: "blocked", reason, approvedPackage: null });
  if (atom?.id !== "01.1-H05") return blocked("wrong_human_atom");
  if (decision?.humanDecision !== "approved") return blocked("decision_not_approved");
  if (decision?.validation?.valid !== true) return blocked("decision_not_validated");
  if (decision?.invalidatedAt) return blocked("decision_invalidated");
  const reviewed = decision?.reviewedArtifact;
  if (!reviewed || !decision?.decisionTransactionId) return blocked("missing_reviewed_artifact");

  const identityFields = ["artifactId", "artifactType", "artifactVersion", "artifactHash"];
  const normalizedCandidate = frozenCandidate?.artifactIdentity || frozenCandidate;
  if (!normalizedCandidate || identityFields.some((field) => !normalizedCandidate[field])) {
    return blocked("incomplete_candidate_identity");
  }
  if (normalizedCandidate.artifactType !== "FrozenContentPackageCandidate") {
    return blocked("candidate_type_mismatch");
  }
  if (frozenCandidate?.status !== "published") {
    return blocked("candidate_not_published");
  }
  if (identityFields.some((field) => reviewed[field] !== normalizedCandidate[field])) {
    return blocked("candidate_identity_mismatch");
  }
  if (!frozenCandidate?.manifestHash) return blocked("missing_manifest_hash");

  const approvedIdentity = {
    artifactId: `approved-package:${normalizedCandidate.artifactId}:${decision.decisionTransactionId}`,
    artifactType: "ApprovedContentPackage",
    artifactVersion: "1.0.0",
    artifactHash: prototypeDigest({
      schema: "ApprovedContentPackage@1.0.0",
      sourceCandidate: normalizedCandidate,
      manifestHash: frozenCandidate.manifestHash,
      decisionTransactionId: decision.decisionTransactionId,
    }),
  };

  return {
    status: "ready",
    reason: null,
    approvedPackage: {
      schemaRef: "ApprovedContentPackage@1.0.0",
      artifactIdentity: approvedIdentity,
      manifestHash: frozenCandidate.manifestHash,
      sourceCandidate: Object.fromEntries(identityFields.map((field) => [field, normalizedCandidate[field]])),
      decisionRef: {
        decisionTransactionId: decision.decisionTransactionId,
        reviewedArtifact: Object.fromEntries(identityFields.map((field) => [field, reviewed[field]])),
      },
      sourceDecision: "approved",
    },
  };
}

function renderCanvas() {
  const stageContainers = {
    intent: $("#track-intent"),
    assets: $("#track-assets"),
    generation: $("#track-generation"),
    delivery: $("#track-delivery"),
  };

  Object.values(stageContainers).forEach((container) => {
    container.innerHTML = "";
  });

  for (const atom of state.atoms) {
    const container = stageContainers[atom.stage] || stageContainers.intent;
    container.insertAdjacentHTML("beforeend", nodeMarkup(atom));
  }

  Object.values(stageContainers).forEach((container) => {
    container.dataset.count = String(container.querySelectorAll(".flow-node").length);
  });

  $$(".flow-node").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.atomId;
      state.inspectorTab = "summary";
      $$(".flow-node").forEach((node) => node.classList.toggle("selected", node === button));
      renderInspector();
      openInspector();
    });
  });

  requestAnimationFrame(drawEdges);
}

function nodeMarkup(atom) {
  const firstInput = atom.inputs[0]?.label || "无输入";
  const firstOutput = atom.outputs[0]?.label || "无输出";
  const runResult = state.runResults[atom.id];
  const runClass = atom.disabled
    ? "node-disabled"
    : runResult?.status === "success"
      ? "node-success"
      : runResult?.status === "running"
        ? "node-running"
        : runResult?.status === "blocked"
          ? "node-blocked"
          : runResult?.status === "skipped"
            ? "node-skipped"
        : "";
  const runLabel = atom.disabled
    ? "已停用"
    : runResult?.status === "success"
      ? "演示通过"
      : runResult?.status === "running"
        ? "测试中"
        : runResult?.status === "blocked"
          ? "需要处理"
          : runResult?.status === "skipped"
            ? "未执行"
        : "";
  return `
    <button class="flow-node ${atom.human ? "human" : ""} ${atom.warning ? "warning" : ""} ${runClass} ${state.selectedId === atom.id ? "selected" : ""}"
      data-atom-id="${escapeHtml(atom.id)}" aria-label="打开 ${escapeHtml(atom.name)} 配置">
      <span class="node-port input"></span>
      <span class="node-port output"></span>
      <span class="node-topline">
        <span class="node-icon">${icon(atom.icon)}</span>
        ${atom.repeat ? `<span class="node-repeat">× ${atom.repeat}</span>` : ""}
      </span>
      <h3>${escapeHtml(atom.name)}</h3>
      <span class="node-io">${icon("arrow-right")}<span>${escapeHtml(firstInput)} → ${escapeHtml(firstOutput)}</span></span>
      ${runLabel ? `<span class="node-run-label ${runResult?.status || ""}">${escapeHtml(runLabel)}</span>` : ""}
    </button>
  `;
}

function drawEdges() {
  const canvas = $("#canvas");
  const layer = $("#edge-layer");
  if (!canvas || !layer || $("#matrix-view").classList.contains("hidden") === false) {
    layer.innerHTML = "";
    return;
  }

  const canvasRect = canvas.getBoundingClientRect();
  const scale = state.zoom / 100;
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  layer.setAttribute("viewBox", `0 0 ${width} ${height}`);
  layer.setAttribute("width", width);
  layer.setAttribute("height", height);

  const paths = edgeDefinitions.flatMap((edge) => {
    const fromId = edge.from.atomId;
    const toId = edge.to.atomId;
    const from = $(`.flow-node[data-atom-id="${fromId}"]`);
    const to = $(`.flow-node[data-atom-id="${toId}"]`);
    if (!from || !to) return [];

    const fromRect = from.getBoundingClientRect();
    const toRect = to.getBoundingClientRect();
    const x1 = (fromRect.right - canvasRect.left) / scale - 2;
    const y1 = (fromRect.top + fromRect.height / 2 - canvasRect.top) / scale;
    const x2 = (toRect.left - canvasRect.left) / scale + 2;
    const y2 = (toRect.top + toRect.height / 2 - canvasRect.top) / scale;
    const sameRow = Math.abs(y1 - y2) < 24;
    const segment = sameRow
      ? `M ${x1} ${y1} L ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1 + 34} ${y1}, ${x2 - 34} ${y2}, ${x2} ${y2}`;
    return [`<path d="${segment}" marker-end="url(#edge-arrow)"></path>`];
  });

  layer.innerHTML = `
    <defs>
      <marker id="edge-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ba9bb" stroke="none"></path>
      </marker>
    </defs>
    ${paths.join("")}
  `;
}

function renderMatrix(query = state.matrixQuery) {
  const needle = query.trim().toLowerCase();
  const rows = state.atoms.filter((atom) => {
    const haystack = [
      atom.id,
      atom.name,
      atom.type,
      ...atom.inputs.flatMap((item) => [item.label, item.schemaRef]),
      ...atom.outputs.flatMap((item) => [item.label, item.schemaRef]),
      ...atom.capabilities,
    ].join(" ").toLowerCase();
    return !needle || haystack.includes(needle);
  });

  $("#matrix-body").innerHTML = rows.length
    ? rows.map((atom) => `
      <tr data-atom-id="${escapeHtml(atom.id)}">
        <td>
          <span class="matrix-atom">
            <span class="node-icon">${icon(atom.icon)}</span>
            <span><strong>${escapeHtml(atom.name)}</strong><small>${escapeHtml(atom.id)}</small></span>
          </span>
        </td>
        <td>${escapeHtml(atom.type)}</td>
        <td><span class="matrix-field-list">${atom.inputs.map((item) => `<span>${escapeHtml(item.schemaRef)}</span>`).join("")}</span></td>
        <td><span class="matrix-field-list">${atom.outputs.map((item) => `<span>${escapeHtml(item.schemaRef)}</span>`).join("")}</span></td>
        <td><span class="matrix-field-list">${atom.capabilities.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</span></td>
        <td><span class="node-state ${atom.warning ? "blocked" : "ready"}">${atom.warning ? "待确认" : "静态结构通过"}</span></td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">没有匹配的原子</td></tr>`;

  $$("#matrix-body tr[data-atom-id]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedId = row.dataset.atomId;
      state.inspectorTab = "summary";
      renderInspector();
      openInspector();
    });
  });
}

function renderInspector() {
  const atom = getAtom(state.selectedId) || state.atoms[0];
  if (!atom) return;

  $("#inspector-name").textContent = atom.name;
  $("#inspector-type").textContent = `${stageNames[atom.stage]} · ${atom.type}`;
  $("#inspector-version").textContent = "当前草案 · 可编辑 · 测试只使用样例数据";
  $$(".inspector-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.inspectorTab === state.inspectorTab);
  });

  $("#inspector-body").innerHTML = state.inspectorTab === "advanced"
    ? advancedMarkup(atom)
    : summaryMarkup(atom);

  bindInspectorActions(atom);
}

const friendlyCapabilityNames = {
  "source.lookup": "查找已授权资料",
  "file.read": "读取文件",
  "hash.compute": "校验文件完整性",
  "text.generate": "生成与改写文案",
  "image.generate": "生成图片",
  "image.edit": "编辑图片",
  "storage.put": "保存产物",
  "storage.get": "读取产物",
  "video.submit": "提交视频任务",
  "idempotency.ledger": "防止重复提交",
  "quota.reserve": "预留测试额度",
  "video.poll": "查询视频任务",
  "media.download": "下载视频",
  "media.probe": "检查媒体是否可播放",
  "audio.extract": "提取音轨",
  "speech.transcribe": "识别旁白",
  "voice.convert": "转换音色",
  "audio.original_fallback": "必要时保留原音",
  "media.compose": "合成视频",
  "duration.measure": "测量成片时长",
  "human.review": "等待真人确认",
};

function friendlyCapability(capability) {
  return friendlyCapabilityNames[capability] || capability.replaceAll(".", " ");
}

function friendlyModelName(model) {
  const text = String(model || "AI 自动处理");
  const mappings = [
    ["文本执行 Agent", "文案生成助手"],
    ["媒体执行 Agent", "图片处理助手"],
    ["媒体网关执行器", "视频任务助手"],
    ["媒体分析执行器", "旁白检查助手"],
    ["音频执行器", "音色处理助手"],
    ["确定性媒体执行器", "视频合成助手"],
    ["确定性执行器", "自动处理"],
    ["规则审核器", "自动检查"],
    ["平台规则校验器", "系统规则检查"],
    ["平台审批校验器", "系统确认"],
    ["指定真人审核人", "指定真人"],
  ];
  return mappings.find(([technical]) => text.includes(technical))?.[1] || text;
}

function nodeNextStep(atom) {
  const runResult = state.runResults[atom.id];
  if (runResult?.status === "success") return "样例测试已通过。检查结果无误后，继续处理下一个节点。";
  if (atom.human) {
    const reviewer = atom.params?.["审核人"] || atom.params?.["验收人"] || "指定负责人";
    return `下一步：请 ${reviewer} 确认“${atom.outputs[0]?.label || "处理结果"}”。`;
  }
  if (atom.warning) return "下一步：确认节点参数，然后点击“测试此节点”查看样例结果。";
  return "下一步：可打开“查看内部步骤”核对处理过程，或直接测试此节点。";
}

function summaryMarkup(atom) {
  const runResult = state.runResults[atom.id];
  return `
    <p class="node-description">${escapeHtml(atom.description)}</p>
    <section class="node-editor-section">
      <div class="detail-title-row">
        <h3>这个节点要做什么</h3>
        <span class="tiny muted">直接用自然语言修改</span>
      </div>
      <textarea rows="4" data-node-instruction>${escapeHtml(atom.instruction || "")}</textarea>
      <div class="node-param-grid">
        ${Object.entries(atom.params || {}).map(([key, value]) => `
          <label class="node-param">
            <span>${escapeHtml(key)}</span>
            <input data-node-param="${escapeHtml(key)}" value="${escapeHtml(value)}">
          </label>
        `).join("")}
      </div>
      <div class="inline-field-actions">
        <button class="small-action" data-apply-node-config>${icon("check")}保存节点配置</button>
        <button class="small-action" data-test-node ${atom.disabled ? "disabled" : ""}>${icon("play")}${atom.disabled ? "节点已停用" : "测试此节点"}</button>
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-title-row">
        <h3>需要准备什么</h3>
        <button class="small-action" data-add-port="input">${icon("plus")}补充输入</button>
      </div>
      <div class="port-list">
        ${atom.inputs.map((item) => portMarkup(item, "input", false)).join("")}
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-title-row">
        <h3>会产出什么</h3>
        <button class="small-action" data-add-port="output">${icon("plus")}补充输出</button>
      </div>
      <div class="port-list">
        ${atom.outputs.map((item) => portMarkup(item, "output", false)).join("")}
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-title-row"><h3>会借助哪些能力</h3></div>
      <div class="capability-list">
        ${atom.capabilities.length
          ? atom.capabilities.map((capability) => `<span class="capability-chip">${escapeHtml(friendlyCapability(capability))}</span>`).join("")
          : `<span class="muted tiny">这个节点不需要额外外部能力</span>`}
      </div>
    </section>
    <section class="detail-section">
      <div class="detail-title-row"><h3>由谁来处理</h3></div>
      <input class="inline-config-input" data-node-model value="${escapeHtml(friendlyModelName(atom.modules.execute.model || atom.modules.execute.executor))}">
    </section>
    <section class="detail-section">
      <div class="detail-title-row"><h3>真人审核</h3></div>
      ${atom.human
        ? `<div class="review-card">${icon("user")}<div><strong>需要真人确认</strong><span>${escapeHtml(atom.params?.["审核人"] || atom.params?.["验收人"] || "等待指定负责人")}</span></div></div>`
        : `<div class="validation-mini end"><span>不需要额外真人确认</span><span>系统自动检查</span></div>`}
    </section>
    <section class="detail-section">
      <div class="detail-title-row"><h3>下一步</h3></div>
      <div class="next-step-card">
        <span>${escapeHtml(nodeNextStep(atom))}</span>
        <button data-open-validation>查看检查项</button>
      </div>
      ${runResult && runResult.status !== "running"
        ? `<div class="node-test-result ${runResult.status}"><strong>最近节点测试：${escapeHtml(runResult.status === "success" ? "演示通过" : runResult.status === "blocked" ? "需要处理" : "未执行")}</strong><span>${escapeHtml(runResult.output)}</span></div>`
        : ""}
    </section>
    <details class="technical-details">
      <summary>查看技术详情</summary>
      <div class="technical-grid">
        ${atom.inputs.map((item) => portMarkup(item, "input", true)).join("")}
        ${atom.outputs.map((item) => portMarkup(item, "output", true)).join("")}
      </div>
      <label class="node-param">
        <span>能力 ID（用逗号分隔）</span>
        <input class="inline-config-input" data-node-capabilities value="${escapeHtml(atom.capabilities.join(", "))}">
      </label>
      <p>节点类型：${escapeHtml(atom.type)} · 当前草案不会真实运行。</p>
    </details>
  `;
}

function portMarkup(item, direction, technical = false) {
  return `
    <div class="port-row ${technical ? "technical-port" : ""}">
      <div class="port-top">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${item.required ? "必须提供" : "可选"}</span>
      </div>
      ${technical ? `
        <code class="port-schema">${escapeHtml(item.portId)} · ${escapeHtml(item.schemaRef)} · ${escapeHtml(item.cardinality)}</code>
        <span class="origin-badge">${item.origin === "human_added" ? "真人添加" : item.origin === "ai_proposed" ? "AI 建议" : "默认配置"}</span>
      ` : ""}
      ${technical ? "" : `<button class="port-remove" data-remove-port="${direction}" data-port-id="${escapeHtml(item.portId)}" aria-label="删除端口">${icon("x")}</button>`}
    </div>
  `;
}

function advancedMarkup(atom) {
  const modules = [
    ["input", "01", "接收"],
    ["check", "02", "检查"],
    ["execute", "03", "处理"],
    ["review", "04", "确认"],
    ["output", "05", "交付"],
  ];
  const runResult = state.runResults[atom.id];

  return `
    <div class="advanced-intro">这里展示这个节点从接收到交付的五个内部步骤。日常使用只需要看每一步做什么；执行器、失败出口和证据要求收在技术详情里。</div>
    <div class="module-accordion">
      ${modules.map(([key, index, label], moduleIndex) => {
        const module = atom.modules[key];
        return `
          <section class="module ${moduleIndex === 0 ? "open" : ""}" data-module="${key}">
            <button class="module-toggle" data-module-toggle="${key}">
              <span class="module-index">${index}</span>
              <strong>${label}模块</strong>
              ${icon("chevron-down")}
            </button>
            <div class="module-content">
              <div class="module-detail">
                <strong>这一步怎么做</strong>
                <p>${escapeHtml(module.detail || module.evidence)}</p>
              </div>
              <div class="field-row">
                <span>由谁处理</span>
                <input class="inline-config-input" data-module-model="${key}" value="${escapeHtml(module.model || module.executor)}">
              </div>
              <div class="module-detail module-result">
                <strong>${runResult ? "本次测试结果" : "执行结果"}</strong>
                <p>${escapeHtml(runResult?.modules?.[key] || "尚未测试。点击节点简易视图中的“测试此节点”可生成演示结果。")}</p>
              </div>
              <details class="technical-details">
                <summary>查看技术详情</summary>
                <div class="field-row"><span>系统动作</span><span>${escapeHtml(module.action)}</span></div>
                <div class="field-row">
                  <span>执行者</span>
                  <select class="inline-select" data-executor-module="${key}">
                    ${executorOptions(module.executor)}
                  </select>
                </div>
                <div class="field-row">
                  <span>能力</span>
                  <span class="capability-list">${module.capabilities.length
                    ? module.capabilities.map((capability) => `<span class="module-capability">${escapeHtml(capability)}</span>`).join("")
                    : "无能力绑定"}</span>
                </div>
                <div class="field-row"><span>失败出口</span><span>${escapeHtml(module.onFailure)}</span></div>
                <div class="field-row"><span>证据</span><span>${escapeHtml(module.evidence)}</span></div>
              </details>
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function executorOptions(current) {
  const options = [
    "运行时",
    "平台规则校验器",
    "平台审批校验器",
    "规则审核器",
    "确定性执行器",
    "文本执行 Agent",
    "媒体执行 Agent",
    "媒体网关执行器",
    "媒体分析执行器",
    "音频执行器",
    "确定性媒体执行器",
    "指定真人审核人",
  ];
  return [...new Set([current, ...options])]
    .map((value) => `<option value="${escapeHtml(value)}" ${value === current ? "selected" : ""}>${escapeHtml(value)}</option>`)
    .join("");
}

function bindInspectorActions(atom) {
  $$("[data-module-toggle]", $("#inspector-body")).forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".module").classList.toggle("open");
    });
  });

  $$("[data-add-port]", $("#inspector-body")).forEach((button) => {
    button.addEventListener("click", () => openPortDialog(button.dataset.addPort, atom));
  });

  const validationButton = $("[data-open-validation]", $("#inspector-body"));
  if (validationButton) {
    validationButton.addEventListener("click", openValidation);
  }

  const applyNodeButton = $("[data-apply-node-config]", $("#inspector-body"));
  if (applyNodeButton) {
    applyNodeButton.addEventListener("click", () => applyNodeConfiguration(atom));
  }

  const testNodeButton = $("[data-test-node]", $("#inspector-body"));
  if (testNodeButton) {
    testNodeButton.addEventListener("click", () => {
      if (atom.disabled) {
        toast("这个节点已停用，请先在流程对话中重新启用", "warning");
        return;
      }
      runAtomDryRun(atom.id);
    });
  }

  $$("[data-remove-port]", $("#inspector-body")).forEach((button) => {
    button.addEventListener("click", () => {
      const direction = button.dataset.removePort;
      const target = direction === "input" ? atom.inputs : atom.outputs;
      const index = target.findIndex((item) => item.portId === button.dataset.portId);
      if (index < 0) return;
      pushUndoSnapshot();
      target.splice(index, 1);
      markUnsaved();
      renderCanvas();
      renderInspector();
      toast("端口已移除；相关连接保留在草案中并标为无效");
    });
  });

  $$("[data-executor-module]", $("#inspector-body")).forEach((select) => {
    select.addEventListener("change", () => {
      pushUndoSnapshot();
      const module = atom.modules[select.dataset.executorModule];
      const previousExecutor = module.executor;
      module.executor = select.value;
      if (!module.model || module.model === previousExecutor) module.model = select.value;
      markUnsaved();
      toast("执行者已更新，保存草案后写入新修订");
    });
  });

  $$("[data-module-model]", $("#inspector-body")).forEach((input) => {
    input.addEventListener("change", () => {
      pushUndoSnapshot();
      atom.modules[input.dataset.moduleModel].model = input.value.trim();
      markUnsaved();
      toast("执行模型已更新，需重新测试与校验");
    });
  });
}

function portsFromInstruction(atom, direction, phrase, append = false) {
  const targets = direction === "input" ? atom.inputs : atom.outputs;
  const items = phrase
    .split(/[、,，；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!items.length) return 0;

  const created = items.map((item, index) => {
    const schemaMatch = item.match(/\b[A-Za-z][A-Za-z0-9]*@\d+\.\d+\.\d+\b/);
    const label = item.replace(schemaMatch?.[0] || "", "").replace(/[：:]/g, "").trim() || `${direction === "input" ? "输入" : "输出"}${index + 1}`;
    const baseId = `${direction}${index + 1}`;
    let portId = baseId;
    let suffix = 2;
    while (targets.some((port) => port.portId === portId)) portId = `${baseId}${suffix++}`;
    return {
      portId,
      label,
      schemaRef: schemaMatch?.[0] || "ArtifactReference@1.0.0",
      cardinality: "one",
      required: true,
      origin: "ai_proposed",
    };
  });

  if (append) targets.push(...created);
  else targets.splice(0, targets.length, ...created);
  return created.length;
}

function applyInstructionToAtom(atom, instruction, { updateInstruction = true } = {}) {
  const changes = [];
  if (updateInstruction) atom.instruction = instruction.trim();

  const inputMatch = instruction.match(/(?:增加|添加|补充)?输入(?:端口)?(?:改为|改成|为|[:：])\s*([^。\n]+)/);
  if (inputMatch) {
    const append = /增加|添加|补充/.test(inputMatch[0]);
    const count = portsFromInstruction(atom, "input", inputMatch[1], append);
    changes.push(append ? `新增 ${count} 个输入端口` : `输入端口更新为 ${count} 项`);
  }

  const outputMatch = instruction.match(/(?:增加|添加|补充)?输出(?:端口)?(?:改为|改成|为|[:：])\s*([^。\n]+)/);
  if (outputMatch) {
    const append = /增加|添加|补充/.test(outputMatch[0]);
    const count = portsFromInstruction(atom, "output", outputMatch[1], append);
    changes.push(append ? `新增 ${count} 个输出端口` : `输出端口更新为 ${count} 项`);
  }

  const capabilityMatch = instruction.match(/(?:能力|技能)(?:改为|设置为|使用|[:：])\s*([^。\n]+)/);
  if (capabilityMatch) {
    atom.capabilities = capabilityMatch[1].split(/[、,，；;]/).map((item) => item.trim()).filter(Boolean);
    changes.push(`能力更新为 ${atom.capabilities.join("、") || "无"}`);
  }

  const modelMatch = instruction.match(/(?:执行模型|模型|执行者)(?:改为|切换到|使用|[:：])\s*([^。\n]+)/);
  if (modelMatch) {
    atom.modules.execute.model = modelMatch[1].trim();
    const matchingExecutor = ["文本执行 Agent", "媒体执行 Agent", "媒体网关执行器", "媒体分析执行器", "音频执行器", "确定性媒体执行器", "指定真人审核人"]
      .find((executor) => modelMatch[1].includes(executor));
    if (matchingExecutor) atom.modules.execute.executor = matchingExecutor;
    changes.push(`执行模型更新为 ${atom.modules.execute.model}`);
  }

  return changes;
}

function applyNodeConfiguration(atom) {
  pushUndoSnapshot();
  const instruction = $("[data-node-instruction]", $("#inspector-body"))?.value || "";
  const originalModel = atom.modules.execute.model || atom.modules.execute.executor;
  const originalCapabilities = atom.capabilities.join(", ");
  const capabilityInput = $("[data-node-capabilities]", $("#inspector-body"));
  const capabilities = capabilityInput?.value || "";
  const model = $("[data-node-model]", $("#inspector-body"))?.value || "";
  const instructionHandlesModel = /(?:执行模型|模型|执行者)(?:改为|切换到|使用|[:：])/.test(instruction);
  const instructionHandlesCapabilities = /(?:能力|技能)(?:改为|设置为|使用|[:：])/.test(instruction);
  const changes = applyInstructionToAtom(atom, instruction);
  if (!instructionHandlesCapabilities || capabilities !== originalCapabilities) {
    atom.capabilities = capabilities.split(/[、,，；;]/).map((item) => item.trim()).filter(Boolean);
  }
  if (!instructionHandlesModel || model !== friendlyModelName(originalModel)) {
    atom.modules.execute.model = model.trim() || atom.modules.execute.executor;
  }
  $$("[data-node-param]", $("#inspector-body")).forEach((input) => {
    atom.params[input.dataset.nodeParam] = input.value;
  });
  markUnsaved();
  renderCanvas();
  renderMatrix();
  renderInspector();
  toast(changes.length ? `节点已更新：${changes.join("；")}` : "节点参数、能力和模型已保存，需重新校验");
}

function openPortDialog(kind, atom) {
  const existing = $(`.port-dialog`);
  if (existing) existing.remove();

  const dialog = document.createElement("div");
  dialog.className = "port-dialog";
  dialog.innerHTML = `
    <form>
      <h3>增加${kind === "input" ? "输入" : "输出"}端口</h3>
      <p>端口会获得稳定 ID，用于类型化连接。一个字段包含多个值，不应替代多个端口。</p>
      <div class="form-grid">
        <div class="form-field">
          <label for="port-label">展示名称</label>
          <input id="port-label" required maxlength="40" placeholder="例如：角色参考图">
        </div>
        <div class="form-field">
          <label for="port-id">端口 ID</label>
          <input id="port-id" required pattern="[a-z][a-zA-Z0-9_-]*" placeholder="例如：characterReference">
        </div>
        <div class="form-field full">
          <label for="schema-ref">数据类型与版本</label>
          <select id="schema-ref">
            ${kind === "input"
              ? `<option>ImageAsset@1.0.0</option><option>DocumentAsset@1.0.0</option><option>HumanDecision@1.0.0</option>`
              : `<option>ArtifactReference@1.0.0</option><option>ReviewEvidence@1.0.0</option><option>MediaCandidate@1.0.0</option>`}
          </select>
        </div>
        <div class="form-field">
          <label for="cardinality">数量</label>
          <select id="cardinality">
            <option value="one">一个</option>
            <option value="zero_or_one">零或一个</option>
            <option value="one_or_more">一个或多个</option>
          </select>
        </div>
        <div class="form-field">
          <label for="required">是否必需</label>
          <select id="required"><option value="true">必需</option><option value="false">可选</option></select>
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="button" data-cancel-port>取消</button>
        <button type="submit" class="button primary">添加端口</button>
      </div>
    </form>
  `;
  document.body.appendChild(dialog);

  const labelInput = $("#port-label", dialog);
  const idInput = $("#port-id", dialog);
  labelInput.addEventListener("input", () => {
    if (!idInput.dataset.edited) {
      idInput.value = labelInput.value
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(/\s+/)
        .map((part, index) => index === 0 ? part.toLowerCase() : part[0].toUpperCase() + part.slice(1))
        .join("")
        .replace(/[^\x00-\x7F]/g, "");
    }
  });
  idInput.addEventListener("input", () => {
    idInput.dataset.edited = "true";
  });
  $("[data-cancel-port]", dialog).addEventListener("click", () => dialog.remove());
  $("form", dialog).addEventListener("submit", (event) => {
    event.preventDefault();
    const target = kind === "input" ? atom.inputs : atom.outputs;
    if (target.some((item) => item.portId === idInput.value)) {
      toast("端口 ID 已存在，请换一个", "warning");
      idInput.focus();
      return;
    }
    pushUndoSnapshot();
    target.push({
      portId: idInput.value,
      label: labelInput.value,
      schemaRef: $("#schema-ref", dialog).value,
      cardinality: $("#cardinality", dialog).value,
      required: $("#required", dialog).value === "true",
      origin: "human_added",
    });
    dialog.remove();
    markUnsaved();
    renderCanvas();
    renderMatrix();
    renderInspector();
    toast(`${kind === "input" ? "输入" : "输出"}端口已添加，需重新校验`);
  });
  labelInput.focus();
}

function openInspector() {
  $("#inspector").classList.remove("hidden");
  requestAnimationFrame(drawEdges);
}

function closeInspector() {
  $("#inspector").classList.add("hidden");
  $$(".flow-node").forEach((node) => node.classList.remove("selected"));
  requestAnimationFrame(drawEdges);
}

function openValidation() {
  renderValidation();
  $("#validation-panel").classList.add("open");
}

function closeOverlays() {
  $("#validation-panel").classList.remove("open");
  $("#resource-panel").classList.remove("open");
  $("#new-flow-modal").classList.remove("open");
}

function openResourcePanel(category = state.resourceCategory) {
  state.resourceCategory = category;
  renderResources();
  $("#resource-panel").classList.add("open");
}

function renderResources() {
  $$("#resource-categories button").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.resourceCategory);
  });

  $("#resource-grid").innerHTML = (resources[state.resourceCategory] || [])
    .map(([name, description, resourceIcon, color, status], index) => `
      <button class="resource-card" data-resource-index="${index}">
        <span class="resource-icon ${color}">${icon(resourceIcon)}</span>
        <span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small><small>${escapeHtml(status)}</small></span>
        <span class="add-icon">${icon("plus")}</span>
      </button>
    `).join("");

  $$("#resource-grid .resource-card").forEach((button) => {
    button.addEventListener("click", () => addResource(Number(button.dataset.resourceIndex)));
  });
}

function addResource(index) {
  const resource = resources[state.resourceCategory][index];
  if (!resource) return;
  const [name, description, resourceIcon] = resource;

  if (state.resourceCategory === "tool") {
    const atom = getAtom(state.selectedId);
    const binding = `tool.${name}`;
    if (atom && !atom.capabilities.includes(binding)) {
      pushUndoSnapshot();
      atom.capabilities.push(binding);
      markUnsaved();
      renderInspector();
    }
    closeOverlays();
    toast(`${name} 已绑定到 ${atom?.name || "当前原子"}，需重新校验`);
    return;
  }

  if (state.resourceCategory === "workflow") {
    closeOverlays();
    toast("子流程只能引用已发布的精确版本，原型未创建浮动调用", "warning");
    return;
  }

  let draftNumber = 1;
  while (getAtom(`DRAFT-${draftNumber}`)) draftNumber += 1;
  const isHuman = state.resourceCategory === "human";
  const stage = getAtom(state.selectedId)?.stage || "intent";
  const atom = {
    id: `DRAFT-${draftNumber}`,
    name,
    type: isHuman ? "真人决定原子" : state.resourceCategory === "material" ? "生产资料原子" : "处理代理原子",
    palette: state.resourceCategory,
    stage,
    icon: resourceIcon,
    warning: true,
    human: isHuman,
    description,
    inputs: [port("draftInput", "待绑定输入", "ArtifactReference@1.0.0", "one", true, "human_added")],
    outputs: [port("draftOutput", "待定义输出", "ArtifactReference@1.0.0", "one", true, "human_added")],
    capabilities: isHuman ? ["human.review"] : [],
    modules: moduleTemplate(
      { check: "待配置检查规则", execute: "待配置执行动作", output: "待配置输出合同", human: isHuman },
      isHuman ? "指定真人审核人" : "待绑定执行器",
      isHuman ? ["human.review"] : [],
      "待配置证据要求",
      "blocked"
    ),
  };
  pushUndoSnapshot();
  state.atoms.push(atom);
  state.selectedId = atom.id;
  state.inspectorTab = "summary";
  closeOverlays();
  renderCanvas();
  renderMatrix();
  renderInspector();
  openInspector();
  markUnsaved();
  toast(`${name} 已加入草案，连接和端口仍需配置`);
}

function openNewFlow() {
  $("#new-flow-modal").classList.add("open");
  $("#generation-conflict").classList.add("hidden");
  setTimeout(() => $("#prompt-input").focus(), 80);
}

function dryRunResult(atom, mode) {
  if (atom.disabled) {
    return {
      status: "blocked",
      mode,
      output: "节点已停用，本次演示不会继续调用它。",
      modules: {},
      generatedAt: new Date().toISOString(),
    };
  }

  const modules = Object.fromEntries(
    ["input", "check", "execute", "review", "output"].map((name) => [
      name,
      atom.modules[name]?.sampleResult || atom.modules[name]?.detail || atom.modules[name]?.action || "样例数据已处理。",
    ])
  );
  const humanBoundary = atom.human
    ? "这是测试样例，不代表真人已经批准，也不会生成真实签字。"
    : "";
  return {
    status: "success",
    mode,
    output: `${humanBoundary}${atom.modules.output?.sampleResult || atom.modules.output?.action || `已生成${atom.outputs[0]?.label || "样例结果"}。`}`,
    modules,
    simulatedHumanDecision: Boolean(atom.human),
    generatedAt: new Date().toISOString(),
  };
}

function wait(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function openRunConsole(title) {
  $("#run-console-title").textContent = title;
  $("#run-console").classList.remove("hidden");
}

function renderRunConsole(mode = "flow", atomIds = state.atoms.map((atom) => atom.id)) {
  const results = atomIds.map((atomId) => ({
    atom: getAtom(atomId),
    result: state.runResults[atomId],
  })).filter(({ atom }) => atom);
  const finished = results.filter(({ result }) => result && result.status !== "running").length;
  const running = results.find(({ result }) => result?.status === "running")?.atom;
  const blocked = results.find(({ result }) => result?.status === "blocked");
  const complete = !state.runInProgress && finished === results.length;
  const statusText = state.runInProgress
    ? running
      ? `正在演示：${running.name}`
      : "正在准备样例数据"
    : blocked
      ? `演示在“${blocked.atom.name}”停止 · 真实模型、媒体和业务调用均为 0`
      : complete
        ? "演示完成 · 真实模型、媒体和业务调用均为 0"
        : "准备运行";

  $("#run-console-status").textContent = statusText;
  $("#run-console-progress").textContent = `${finished} / ${results.length}`;
  $("#run-progress-bar").style.width = `${results.length ? Math.round((finished / results.length) * 100) : 0}%`;
  $("#run-console-list").innerHTML = results.map(({ atom, result }) => {
    const status = result?.status || "pending";
    const label = {
      running: "运行中",
      success: "完成",
      blocked: "需处理",
      skipped: "未执行",
      pending: "等待",
    }[status] || "等待";
    const detail = result?.output
      || (status === "pending" ? "尚未开始。" : "正在使用样例数据演示这一步。");
    return `
      <article class="run-log-item ${escapeHtml(status)}">
        <span>${status === "success" ? "✓" : status === "blocked" ? "!" : results.findIndex((item) => item.atom.id === atom.id) + 1}</span>
        <div>
          <strong>${escapeHtml(atom.name)} · ${escapeHtml(label)}</strong>
          <small>${escapeHtml(detail)}</small>
        </div>
      </article>
    `;
  }).join("");
}

async function runAtomDryRun(atomId) {
  if (state.runInProgress) {
    toast("已有测试正在运行，请稍候", "warning");
    return;
  }
  const atom = getAtom(atomId);
  if (!atom || atom.disabled) return;

  state.runInProgress = true;
  state.runResults[atomId] = { status: "running", mode: "node" };
  openRunConsole(`${atom.name} · 节点演示`);
  renderCanvas();
  renderInspector();
  renderRunConsole("node", [atomId]);
  await wait(520);
  state.runResults[atomId] = dryRunResult(atom, "node");
  state.runInProgress = false;
  renderCanvas();
  renderInspector();
  renderRunConsole("node", [atomId]);
  toast(`${atom.name} 演示完成；没有调用真实模型或业务工具`);
}

async function runFlowDryRun() {
  if (state.runInProgress) {
    toast("已有测试正在运行，请稍候", "warning");
    return;
  }

  const atomIds = state.atoms.map((atom) => atom.id);
  state.runResults = {};
  state.runInProgress = true;
  openRunConsole("整条流程 · 确定性演示");
  renderCanvas();
  renderRunConsole("flow", atomIds);

  let stopped = false;
  for (const atom of state.atoms) {
    if (stopped) {
      state.runResults[atom.id] = {
        status: "skipped",
        mode: "flow",
        output: "上游节点未通过，本节点没有被调用。",
        modules: {},
      };
      renderCanvas();
      renderRunConsole("flow", atomIds);
      continue;
    }
    if (atom.disabled) {
      state.runResults[atom.id] = dryRunResult(atom, "flow");
      stopped = true;
      renderCanvas();
      renderRunConsole("flow", atomIds);
      continue;
    }
    state.runResults[atom.id] = { status: "running", mode: "flow" };
    renderCanvas();
    renderRunConsole("flow", atomIds);
    await wait(210);
    state.runResults[atom.id] = dryRunResult(atom, "flow");
    renderCanvas();
    renderRunConsole("flow", atomIds);
  }

  state.runInProgress = false;
  renderCanvas();
  renderInspector();
  renderRunConsole("flow", atomIds);
  toast(stopped
    ? "演示已按流程门禁停止；后续节点没有执行"
    : "整条流程演示完成；真实模型、媒体和业务调用均为 0");
}

function findAtomFromChat(text, fallbackId = state.selectedId) {
  const normalized = text.replace(/[“”"'，。！？、\s]/g, "").toLowerCase();
  return state.atoms.find((atom) => normalized.includes(atom.id.replaceAll(".", "").toLowerCase()))
    || state.atoms.find((atom) => normalized.includes(atom.name.replace(/\s/g, "").toLowerCase()))
    || getAtom(fallbackId);
}

function renderChat() {
  if (!state.chatMessages.length) {
    state.chatMessages.push({
      role: "assistant",
      text: "你可以直接说要改什么。我会先说明会改到整条流程还是当前节点，再更新草案。",
    });
  }
  $("#chat-messages").innerHTML = state.chatMessages.map((message) => `
    <div class="chat-message ${escapeHtml(message.role)}">${escapeHtml(message.text)}</div>
  `).join("");
  $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
}

function updateChatScopeOptions() {
  const select = $("#chat-scope-select");
  if (!select) return;
  const validScope = state.chatScope === "flow" || getAtom(state.chatScope);
  if (!validScope) state.chatScope = "flow";
  select.innerHTML = [
    `<option value="flow">整条流程</option>`,
    ...state.atoms.map((atom) => `<option value="${escapeHtml(atom.id)}">当前节点：${escapeHtml(atom.name)}</option>`),
  ].join("");
  select.value = state.chatScope;
}

function addChatMessage(role, text) {
  state.chatMessages.push({ role, text });
  renderChat();
}

function markAtomChanged(atom, message) {
  markUnsaved();
  renderCanvas();
  renderMatrix();
  renderInspector();
  updateChatScopeOptions();
  addChatMessage("assistant", message);
  toast(`${atom.name} 已更新，测试和检查结果需要重新生成`);
}

function submitFlowChat() {
  const input = $("#flow-chat-input");
  const text = input.value.trim();
  if (!text) return;
  addChatMessage("user", text);
  input.value = "";

  const scopedAtom = state.chatScope === "flow" ? getAtom(state.selectedId) : getAtom(state.chatScope);
  if (/测试运行|试运行|跑一遍|运行一下/.test(text)) {
    addChatMessage("assistant", state.chatScope === "flow"
      ? "开始整条流程的确定性演示。只使用样例数据，不会调用真实模型、媒体或业务工具。"
      : `开始演示“${scopedAtom?.name || "当前节点"}”。结果会明确标为样例，不会生成真实签字。`);
    if (state.chatScope === "flow") runFlowDryRun();
    else if (scopedAtom) runAtomDryRun(scopedAtom.id);
    return;
  }

  if (/停用|关闭/.test(text)) {
    const atom = findAtomFromChat(text.replace(/^.*?(?:停用|关闭)/, ""));
    if (!atom) {
      addChatMessage("assistant", "我没有找到要停用的节点，请把节点名称或编号再说具体一些。");
      return;
    }
    pushUndoSnapshot();
    atom.disabled = true;
    state.runResults = {};
    markAtomChanged(atom, `已停用“${atom.name}”。测试运行到这里会停止，后续节点不会执行。`);
    return;
  }

  if (/启用|恢复/.test(text)) {
    const atom = findAtomFromChat(text.replace(/^.*?(?:启用|恢复)/, ""));
    if (!atom) {
      addChatMessage("assistant", "我没有找到要启用的节点，请把节点名称或编号再说具体一些。");
      return;
    }
    pushUndoSnapshot();
    atom.disabled = false;
    state.runResults = {};
    markAtomChanged(atom, `已重新启用“${atom.name}”，可以继续编辑或测试。`);
    return;
  }

  const target = state.chatScope === "flow"
    ? findAtomFromChat(text, state.selectedId)
    : scopedAtom;
  if (!target) {
    addChatMessage("assistant", "请先选中一个节点，再描述要修改的内容。");
    return;
  }

  pushUndoSnapshot();
  const changes = applyInstructionToAtom(target, text, { updateInstruction: false });
  const modelMatch = text.match(/(?:执行模型|模型|执行者)(?:改为|切换到|使用|[:：])\s*([^。\n]+)/);
  if (modelMatch) {
    target.modules.execute.model = modelMatch[1].trim();
    const matchingExecutor = ["文本执行 Agent", "媒体执行 Agent", "媒体网关执行器", "媒体分析执行器", "音频执行器", "确定性媒体执行器", "指定真人审核人"]
      .find((executor) => modelMatch[1].includes(executor));
    if (matchingExecutor) target.modules.execute.executor = matchingExecutor;
  }

  const renameMatch = text.match(/(?:把)?(?:节点|原子)?(?:名称)?(?:改为|改成|重命名为)\s*[“"]?([^”"。\n]+)/);
  if (renameMatch && /重命名|名称改为|名字改为/.test(text)) {
    target.name = renameMatch[1].trim();
    changes.push(`名称更新为 ${target.name}`);
  }

  if (modelMatch && !changes.some((item) => item.startsWith("执行模型"))) {
    changes.push(`执行模型更新为 ${target.modules.execute.model}`);
  }

  if (!changes.length) {
    target.instruction = text;
    changes.push("节点说明已更新");
  }

  markAtomChanged(target, `已更新“${target.name}”：${changes.join("；")}。这次修改只影响草案。`);
}

function generateFlow(mode = "request") {
  if (mode === "request" && state.hasManualEdits) {
    $("#generation-conflict").classList.remove("hidden");
    toast("当前草案含人工编辑，请选择另建草案或确认覆盖", "warning");
    return;
  }
  if (mode === "request") mode = "initial";
  $("#generation-conflict").classList.add("hidden");
  state.undoStack.push(captureDraftSnapshot());
  if (state.undoStack.length > 10) state.undoStack.shift();
  $("#generation-overlay").classList.remove("hidden");
  $("#generate-button").disabled = true;
  const messages = [
    ["正在识别你要准备什么、最终得到什么…", 0],
    ["正在拆分业务步骤并匹配可用能力…", 650],
    ["正在配置 13 个节点的处理过程…", 1300],
    ["正在检查前后步骤能否正确衔接…", 1950],
  ];
  messages.forEach(([message, delay]) => {
    setTimeout(() => {
      $("#generation-message").textContent = message;
    }, delay);
  });

  setTimeout(() => {
    $("#generation-overlay").classList.add("hidden");
    $("#generate-button").disabled = false;
    $("#new-flow-modal").classList.remove("open");
    state.atoms = structuredClone(atoms);
    replaceArray(edgeDefinitions, baseEdgeDefinitions);
    replaceArray(dependencyEdges, baseDependencyEdges);
    replaceArray(externalInputBindings, baseExternalInputBindings);
    state.selectedId = "01.1-V02";
    state.saved = false;
    state.validationReport = null;
    state.runResults = {};
    state.runInProgress = false;
    state.hasManualEdits = false;
    state.chatMessages = [];
    state.chatScope = "flow";
    renderChat();
    updateChatScopeOptions();
    updateDraftStatus(false);
    renderCanvas();
    renderMatrix();
    renderInspector();
    openInspector();
    setTimeout(() => {
      toast(mode === "new"
        ? "已另建草案；上一版已保留在撤销历史"
        : mode === "overwrite"
          ? "已确认覆盖当前草案；上一版仍可通过撤销恢复"
          : "草案已生成：13 个节点，4 项关键信息待确认");
    }, 120);
  }, 2700);
}

function markUnsaved({ manual = true } = {}) {
  if (manual) {
    state.hasManualEdits = true;
    state.runResults = {};
  }
  state.saved = false;
  state.validationReport = null;
  updateDraftStatus(false);
  renderMatrix();
  renderInvalidatedValidation();
}

function updateDraftStatus(saved) {
  const status = $("#draft-status");
  status.textContent = saved ? "已保存" : "待确认";
  status.classList.toggle("success", saved);
  status.classList.toggle("warning", !saved);
  $("#project-subtitle").textContent = saved
    ? "13 个节点 · 已保存为草案 · 尚未正式运行"
    : "13 个节点 · 可编辑 · 测试仅使用样例数据";
}

function replaceArray(target, values) {
  target.splice(0, target.length, ...structuredClone(values));
}

function captureDraftSnapshot() {
  return structuredClone({
    sourcePrompt: $("#prompt-input")?.value || "",
    selectedId: state.selectedId,
    inspectorTab: state.inspectorTab,
    saved: state.saved,
    hasManualEdits: state.hasManualEdits,
    validationReport: state.validationReport,
    runResults: state.runResults,
    atoms: state.atoms,
    edgeDefinitions,
    dependencyEdges,
    externalInputBindings,
  });
}

function pushUndoSnapshot() {
  state.undoStack.push(captureDraftSnapshot());
  if (state.undoStack.length > 10) state.undoStack.shift();
}

function applyDraftSnapshot(snapshot) {
  state.atoms = structuredClone(snapshot.atoms);
  replaceArray(edgeDefinitions, snapshot.edgeDefinitions);
  replaceArray(dependencyEdges, snapshot.dependencyEdges);
  replaceArray(externalInputBindings, snapshot.externalInputBindings);
  state.selectedId = state.atoms.some((atom) => atom.id === snapshot.selectedId)
    ? snapshot.selectedId
    : state.atoms[0].id;
  state.inspectorTab = snapshot.inspectorTab === "advanced" ? "advanced" : "summary";
  state.saved = Boolean(snapshot.saved);
  state.hasManualEdits = Boolean(snapshot.hasManualEdits);
  state.runResults = snapshot.runResults ? structuredClone(snapshot.runResults) : {};
  state.validationReport = snapshot.validationReport ? structuredClone(snapshot.validationReport) : null;
  $("#prompt-input").value = snapshot.sourcePrompt;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePortSnapshot(port) {
  const cardinalities = new Set(["one", "zero_or_one", "one_or_more", "one_per_shot"]);
  return isRecord(port)
    && typeof port.portId === "string"
    && port.portId.trim().length > 0
    && typeof port.label === "string"
    && typeof port.schemaRef === "string"
    && cardinalities.has(port.cardinality)
    && typeof port.required === "boolean"
    && typeof port.origin === "string";
}

function validateAtomSnapshot(atom) {
  const moduleNames = ["input", "check", "execute", "review", "output"];
  if (!isRecord(atom)
    || typeof atom.id !== "string"
    || !atom.id.trim()
    || typeof atom.name !== "string"
    || typeof atom.type !== "string"
    || typeof atom.palette !== "string"
    || typeof atom.stage !== "string"
    || typeof atom.icon !== "string"
    || typeof atom.description !== "string"
    || !Array.isArray(atom.capabilities)
    || !atom.capabilities.every((capability) => typeof capability === "string")
    || !Array.isArray(atom.inputs)
    || !Array.isArray(atom.outputs)
    || !atom.inputs.every(validatePortSnapshot)
    || !atom.outputs.every(validatePortSnapshot)
    || !isRecord(atom.modules)) {
    return false;
  }
  const inputIds = atom.inputs.map((port) => port.portId);
  const outputIds = atom.outputs.map((port) => port.portId);
  if (new Set(inputIds).size !== inputIds.length || new Set(outputIds).size !== outputIds.length) {
    return false;
  }
  return moduleNames.every((name) => {
    const module = atom.modules[name];
    return isRecord(module)
      && typeof module.action === "string"
      && typeof module.executor === "string"
      && Array.isArray(module.capabilities)
      && module.capabilities.every((capability) => typeof capability === "string")
      && typeof module.evidence === "string"
      && typeof module.onFailure === "string";
  });
}

function validateEdgeSnapshot(edge) {
  return isRecord(edge)
    && typeof edge.id === "string"
    && edge.id.trim().length > 0
    && isRecord(edge.from)
    && typeof edge.from.atomId === "string"
    && typeof edge.from.portId === "string"
    && isRecord(edge.to)
    && typeof edge.to.atomId === "string"
    && typeof edge.to.portId === "string"
    && typeof edge.type === "string"
    && typeof edge.cardinality === "string"
    && typeof edge.transform === "string"
    && (edge.identityKey === undefined || typeof edge.identityKey === "string");
}

function validateBindingSnapshot(binding) {
  return isRecord(binding)
    && typeof binding.atomId === "string"
    && typeof binding.portId === "string"
    && typeof binding.source === "string"
    && typeof binding.state === "string";
}

function validateValidationReportSnapshot(report) {
  return isRecord(report)
    && typeof report.intentHash === "string"
    && typeof report.planHash === "string"
    && typeof report.effectiveConfigHash === "string"
    && report.hashAlgorithm === "prototype-fnv1a64-design-only"
    && report.nonSecurityHash === true
    && report.runnable === false
    && Array.isArray(report.validationItems);
}

function validateDraftSnapshot(draft) {
  if (!isRecord(draft)) return { ok: false, reason: "存档不是对象" };
  if (!SUPPORTED_DRAFT_PAYLOAD_VERSIONS.has(draft.payloadVersion)) {
    return { ok: false, reason: `不支持存档版本 ${draft.payloadVersion || "missing"}` };
  }
  if (typeof draft.sourcePrompt !== "string") return { ok: false, reason: "缺少源提示词" };
  if (!Array.isArray(draft.atoms) || draft.atoms.length === 0 || !draft.atoms.every(validateAtomSnapshot)) {
    return { ok: false, reason: "原子结构不完整" };
  }
  const atomIds = draft.atoms.map((atom) => atom.id);
  if (new Set(atomIds).size !== atomIds.length) return { ok: false, reason: "原子 ID 重复" };
  if (!Array.isArray(draft.edgeDefinitions) || !draft.edgeDefinitions.every(validateEdgeSnapshot)) {
    return { ok: false, reason: "主连接结构不完整" };
  }
  if (!Array.isArray(draft.dependencyEdges) || !draft.dependencyEdges.every(validateEdgeSnapshot)) {
    return { ok: false, reason: "依赖连接结构不完整" };
  }
  const edgeIds = [...draft.edgeDefinitions, ...draft.dependencyEdges].map((edge) => edge.id);
  if (new Set(edgeIds).size !== edgeIds.length) return { ok: false, reason: "连接 ID 重复" };
  if (!Array.isArray(draft.externalInputBindings) || !draft.externalInputBindings.every(validateBindingSnapshot)) {
    return { ok: false, reason: "外部输入绑定结构不完整" };
  }
  if (!validateValidationReportSnapshot(draft.validationReport)) {
    return { ok: false, reason: "验证报告结构不完整" };
  }
  return { ok: true };
}

function readStorage(key) {
  try {
    return { ok: true, value: window.localStorage.getItem(key) };
  } catch {
    state.storageDenied = true;
    return { ok: false, value: null };
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
    state.storageDenied = false;
    return true;
  } catch {
    state.storageDenied = true;
    return false;
  }
}

function restoreSavedDraft() {
  const stored = readStorage(DRAFT_STORAGE_KEY);
  if (!stored.ok) {
    toast("浏览器拒绝本地存储访问；当前页面仍可使用，但不会恢复或保存草案", "warning");
    return false;
  }
  if (!stored.value) return false;
  try {
    const draft = JSON.parse(stored.value);
    const validation = validateDraftSnapshot(draft);
    if (!validation.ok) {
      toast(`存档已拒绝：${validation.reason}`, "warning");
      return false;
    }
    applyDraftSnapshot({
      sourcePrompt: draft.sourcePrompt,
      selectedId: draft.selectedId || draft.atoms[0].id,
      inspectorTab: draft.inspectorTab || "summary",
      saved: true,
      hasManualEdits: Boolean(draft.hasManualEdits),
      runResults: draft.runResults || {},
      validationReport: draft.validationReport,
      atoms: draft.atoms,
      edgeDefinitions: draft.edgeDefinitions,
      dependencyEdges: draft.dependencyEdges,
      externalInputBindings: draft.externalInputBindings,
    });
    return true;
  } catch {
    toast("存档无法解析，已拒绝恢复", "warning");
    return false;
  }
}

function saveDraft() {
  const report = createValidationReport();
  const snapshot = captureDraftSnapshot();
  const payload = {
    payloadVersion: DRAFT_PAYLOAD_VERSION,
    savedAt: new Date().toISOString(),
    ...snapshot,
    executionReadiness: "not_run",
    executionEvidence: "not_run",
    intentHash: report.intentHash,
    planHash: report.planHash,
    effectiveConfigHash: report.effectiveConfigHash,
    validationReport: report,
    validation: report.validationItems,
  };
  if (writeStorage(DRAFT_STORAGE_KEY, JSON.stringify(payload))) {
    state.saved = true;
    state.validationReport = report;
    updateDraftStatus(true);
    toast("草案已保存。没有创建运行申请，也没有触发任何外部能力");
  } else {
    toast("浏览器未允许本地保存，本次仅保留在当前页面", "warning");
  }
}

function renderDraft() {
  renderCanvas();
  renderMatrix();
  renderInspector();
  renderValidation();
  updateChatScopeOptions();
  promptCount();
  updateDraftStatus(state.saved);
}

function undoDraft() {
  const snapshot = state.undoStack.pop();
  if (snapshot) {
    applyDraftSnapshot(snapshot);
    renderDraft();
    toast("已撤销最近一次完整修改");
    return;
  }

  if (restoreSavedDraft()) {
    renderDraft();
    toast("已恢复至最近一次保存的完整草案");
    return;
  }
  toast("当前没有可撤销的草案版本", "warning");
}

function setView(mode) {
  $$(".view-switcher button").forEach((button) => {
    const active = button.dataset.viewMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  const matrix = mode === "matrix";
  $("#canvas").classList.toggle("hidden", matrix);
  $("#matrix-view").classList.toggle("hidden", !matrix);
  if (matrix) {
    renderMatrix();
  } else {
    requestAnimationFrame(drawEdges);
  }
}

function setZoom(next) {
  state.zoom = Math.max(70, Math.min(120, next));
  $("#zoom-value").textContent = `${state.zoom}%`;
  $("#canvas").style.transform = `scale(${state.zoom / 100})`;
  $("#canvas").style.width = `${100 / (state.zoom / 100)}%`;
  requestAnimationFrame(drawEdges);
}

function fitView() {
  setZoom(100);
  $("#canvas-container").scrollTo({ top: 0, left: 0, behavior: "smooth" });
}

function toast(message, type = "success") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.innerHTML = `${icon(type === "warning" ? "alert" : "check")}<span>${escapeHtml(message)}</span>`;
  $("#toast-region").appendChild(item);
  setTimeout(() => {
    item.style.opacity = "0";
    item.style.transform = "translateY(6px)";
    item.style.transition = "opacity 160ms ease, transform 160ms ease";
    setTimeout(() => item.remove(), 180);
  }, 3200);
}

function renderValidation() {
  const report = validateValidationReportSnapshot(state.validationReport)
    ? state.validationReport
    : createValidationReport();
  const validationItems = report.validationItems;
  const passedCount = validationItems.filter(([status]) => status === "structure_valid").length;
  const attentionCount = validationItems.filter(([status]) => status === "warning").length;
  $("#validation-score").textContent = `${passedCount}/${validationItems.length}`;
  $("#validation-score-label").textContent = "静态结构项通过";
  $("#validation-summary").textContent = `当前草案仅完成 ${passedCount} 项可复核的结构检查；${attentionCount} 项业务或运行门禁仍阻断。保存和预览不会创建运行申请。`;
  $("#validation-button-label").textContent = attentionCount
    ? `${attentionCount} 项需确认`
    : "查看检查结果";
  $("#validation-list").innerHTML = validationItems.map(([status, title, description]) => `
    <article class="validation-item">
      <span class="validation-icon ${status === "structure_valid" ? "passed" : ""}">${icon(status === "structure_valid" ? "check" : "alert")}</span>
      <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>
    </article>
  `).join("");
  $("#validation-hashes").innerHTML = [
    ["意图", report.intentHash],
    ["计划", report.planHash],
    ["有效配置", report.effectiveConfigHash],
  ].map(([label, hash]) => `<div><dt>${escapeHtml(label)}</dt><dd title="${escapeHtml(hash)}">${escapeHtml(hash)}</dd></div>`).join("");
}

function renderInvalidatedValidation() {
  $("#validation-score").textContent = "—";
  $("#validation-score-label").textContent = "需要重新校验";
  $("#validation-summary").textContent = "草案已修改，旧验证报告和三个绑定哈希已失效；打开验证面板后会按当前草案重新计算。";
  $("#validation-button-label").textContent = "待重新校验";
  $("#validation-list").innerHTML = `
    <article class="validation-item">
      <span class="validation-icon">${icon("alert")}</span>
      <div><strong>当前草案尚未生成验证报告</strong><p>重新计算只做原型静态检查，不会创建运行申请或调用外部能力。</p></div>
    </article>
  `;
  $("#validation-hashes").innerHTML = "<div><dt>报告</dt><dd>已失效，等待重新校验</dd></div>";
}

function createValidationReport() {
  const prompt = $("#prompt-input")?.value || "";
  const intentHash = prototypeDigest({
    schema: "PrototypeFlowIntent@0.1",
    businessGoal: prompt,
    inputContracts: externalInputBindings.map(({ atomId, portId, source }) => ({ atomId, portId, source })),
    outputContracts: ["MasterMediaCandidate@1.0.0", "HumanDecision@1.0.0"],
    constraints: ["draft_only", "not_run", "no_external_side_effects"],
    humanDecisions: state.atoms.filter((atom) => atom.human).map((atom) => atom.id),
  });
  const planHash = prototypeDigest({
    schema: "PrototypeAtomPlan@0.1",
    atoms: state.atoms,
    edges: edgeDefinitions,
    dependencyEdges,
    externalInputBindings,
    conversionDefinitions,
  });
  const effectiveConfigHash = prototypeDigest({
    schema: "PrototypeEffectiveConfig@0.1",
    atoms: state.atoms,
    resources,
    conversionDefinitions,
    validationRuleVersion: "PrototypeStructuralRules@0.2",
    policy: { draftOnly: true, executionReadiness: "not_run" },
  });
  const report = {
    reportVersion: "PrototypeValidationReport@0.1",
    hashAlgorithm: "prototype-fnv1a64-design-only",
    nonSecurityHash: true,
    runnable: false,
    generatedAt: new Date().toISOString(),
    intentHash,
    planHash,
    effectiveConfigHash,
    validationItems: createValidationItems(),
  };
  state.validationReport = report;
  return report;
}

function createValidationItems() {
  const connectionErrors = [
    ...[...edgeDefinitions, ...dependencyEdges].map(validateEdgeDefinition).filter(Boolean),
    ...validateConnectionTopology(),
    ...validateRequiredInputBindings(),
  ];
  const missingExternalInputs = externalInputBindings
    .filter((binding) => binding.state.startsWith("missing"))
    .length;
  const unverifiedDependencies = externalInputBindings
    .filter((binding) => binding.state === "defined_not_verified")
    .length;
  const humanExecutorErrors = state.atoms
    .filter((atom) => atom.human)
    .flatMap((atom) => {
      const errors = [];
      if (atom.modules.execute.executor !== "指定真人审核人") {
        errors.push(`${atom.id}.execute 必须由指定真人执行`);
      }
      if (atom.modules.review.executor !== "平台审批校验器") {
        errors.push(`${atom.id}.review 必须由平台审批校验器执行`);
      }
      return errors;
    });

  return [
    [
      connectionErrors.length ? "warning" : "structure_valid",
      "控制与数据连接",
      connectionErrors.length
        ? connectionErrors.join("；")
        : `当前草案的 ${state.atoms.length} 个原子、${edgeDefinitions.length} 条主连接、${dependencyEdges.length} 条依赖连接均通过端口数量、稳定身份键与必填输入绑定检查。`,
    ],
    [
      "unchecked",
      "资源发布版本",
      "原型只显示固定 schema 引用，未读取平台发布注册表；不能据此证明原子、能力和策略仍处于可用发布版本。",
    ],
    [
      missingExternalInputs ? "warning" : "structure_valid",
      "真实输入与配置绑定",
      missingExternalInputs
        ? `${missingExternalInputs} 个外部输入或用户配置仍缺 artifact ID、版本和哈希。`
        : "所有外部输入和用户配置均已绑定精确 artifact 或配置版本。",
    ],
    [
      unverifiedDependencies ? "warning" : "structure_valid",
      "派生输入可验证性",
      unverifiedDependencies
        ? `${unverifiedDependencies} 个派生输入只有生成规则，尚未用实际产物验证 manifest、对白和哈希传递。`
        : "派生输入均已验证。",
    ],
    [
      humanExecutorErrors.length ? "warning" : "structure_valid",
      "真人审核绑定",
      humanExecutorErrors.length
        ? humanExecutorErrors.join("；")
        : "H02、H05、H10 的真人执行段已与平台校验段分开；具名真人或岗位映射仍未绑定。",
    ],
    [
      "warning",
      "能力、预算与隔离环境",
      "图片生成、视频提交、预算硬上限和非生产媒体空间尚未获授权或验证。",
    ],
    [
      "not_run",
      "生成阶段副作用",
      "当前源码没有生成、保存或预览触发网络调用的路径，但这只是静态实现边界；流程运行、发布、触发器和业务工具调用均未执行，不能记为执行证据。",
    ],
    [
      "not_run",
      "平台运行能力",
      "类型传递、阻断路由、精确审批、取消恢复和执行器失败关闭仍待平台实现后的独立执行验收。",
    ],
  ];
}

function promptCount() {
  const count = $("#prompt-input").value.length;
  $("#prompt-count").textContent = `${count} / 1200`;
}

const promptExamples = {
  video: "根据主播排期、主播资料和商品资料，制作一条 30 秒竖版短视频。要求六个镜头、商品信息必须来自资料，脚本和素材包需要人工确认，最终成片由真人验收；不要自动发布。",
  review: "创建一条内容审核流程：接收待审文章和配图，检查事实来源、敏感表述与图片完整性，低风险自动通过，高风险交给真人审核；最终不要自动发布。",
  inventory: "每天读取授权库存快照，检查缺货和异常价格，生成补货建议；超过阈值的商品交给运营人员确认，禁止直接写回业务系统。",
};

function bindEvents() {
  $("#new-flow-button").addEventListener("click", openNewFlow);
  $("#generate-button").addEventListener("click", () => generateFlow("request"));
  $("#generate-new-draft").addEventListener("click", () => generateFlow("new"));
  $("#generate-overwrite").addEventListener("click", () => generateFlow("overwrite"));
  $("#prompt-input").addEventListener("input", () => {
    promptCount();
    markUnsaved();
  });
  $("#save-button").addEventListener("click", saveDraft);
  $("#validation-button").addEventListener("click", openValidation);
  $("#open-palette-button").addEventListener("click", () => openResourcePanel());
  $("#close-inspector").addEventListener("click", closeInspector);
  $("#zoom-in").addEventListener("click", () => setZoom(state.zoom + 10));
  $("#zoom-out").addEventListener("click", () => setZoom(state.zoom - 10));
  $("#fit-view-button").addEventListener("click", fitView);
  $("#run-button").addEventListener("click", runFlowDryRun);
  $("#close-run-console").addEventListener("click", () => $("#run-console").classList.add("hidden"));
  $("#flow-chat-toggle").addEventListener("click", () => {
    $("#flow-chat-panel").classList.add("open");
    $("#flow-chat-toggle").classList.add("hidden");
    $("#flow-chat-toggle").setAttribute("aria-expanded", "true");
    $("#flow-chat-input").focus();
  });
  $("#close-flow-chat").addEventListener("click", () => {
    $("#flow-chat-panel").classList.remove("open");
    $("#flow-chat-toggle").classList.remove("hidden");
    $("#flow-chat-toggle").setAttribute("aria-expanded", "false");
  });
  $("#chat-scope-select").addEventListener("change", (event) => {
    state.chatScope = event.target.value;
    if (state.chatScope !== "flow") {
      state.selectedId = state.chatScope;
      state.inspectorTab = "summary";
      renderInspector();
      openInspector();
    }
  });
  $("#flow-chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitFlowChat();
  });
  $$("[data-chat-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      $("#flow-chat-input").value = button.dataset.chatSuggestion;
      submitFlowChat();
    });
  });
  $("#undo-button").addEventListener("click", undoDraft);

  $$(".view-switcher button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewMode));
  });

  $$(".inspector-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      state.inspectorTab = button.dataset.inspectorTab;
      renderInspector();
    });
  });

  $$("[data-close-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.dataset.closePanel;
      if (panel === "validation") $("#validation-panel").classList.remove("open");
      if (panel === "resource") $("#resource-panel").classList.remove("open");
    });
  });

  $$("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => $("#new-flow-modal").classList.remove("open"));
  });

  $$("[data-resource-group]").forEach((button) => {
    button.addEventListener("click", () => openResourcePanel(button.dataset.resourceGroup));
  });

  $$("#resource-categories button").forEach((button) => {
    button.addEventListener("click", () => {
      state.resourceCategory = button.dataset.category;
      $("#resource-search").value = "";
      renderResources();
    });
  });

  $$(".prompt-examples button").forEach((button) => {
    button.addEventListener("click", () => {
      $("#prompt-input").value = promptExamples[button.dataset.example];
      promptCount();
      markUnsaved();
      $("#prompt-input").focus();
    });
  });

  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.view === "palette") {
        openResourcePanel();
        return;
      }
      if (button.dataset.view === "runs") {
        toast("当前草案尚未运行，运行记录为 0", "warning");
        return;
      }
      $$(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    });
  });

  $("#matrix-search").addEventListener("input", (event) => {
    state.matrixQuery = event.target.value;
    renderMatrix();
  });

  $("#resource-search").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    $$("#resource-grid .resource-card").forEach((card) => {
      card.classList.toggle("hidden", query && !card.textContent.toLowerCase().includes(query));
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeOverlays();
  });

  window.addEventListener("resize", () => {
    clearTimeout(window.__edgeResizeTimer);
    window.__edgeResizeTimer = setTimeout(drawEdges, 100);
  });
}

function init() {
  if (typeof initContractWorkbench === "function") {
    initContractWorkbench();
    return;
  }
  bindEvents();
  restoreSavedDraft();
  renderCanvas();
  renderMatrix();
  renderInspector();
  renderResources();
  renderValidation();
  updateChatScopeOptions();
  renderChat();
  promptCount();
  updateDraftStatus(false);
  if (state.saved) {
    updateDraftStatus(true);
  } else {
    const welcomed = readStorage("eryuan-flow-studio-welcomed");
    if (!welcomed.ok || !welcomed.value) {
      if (welcomed.ok) writeStorage("eryuan-flow-studio-welcomed", "1");
      setTimeout(openNewFlow, 350);
    }
  }
  state.initialized = true;
}

init();
