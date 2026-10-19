# 二元AI 自然语言原子工作流字段字典

版本：v0.1  
日期：2026-10-18  
修订：r5（2026-10-19，接入 V4 `e2s-relay/2.0` Schema 并给出兼容落位）  
状态：设计评审字段基线；V4 兼容映射已完成，平台执行验收未通过  
适用范围：自然语言生成草案、流程编辑器、原子配置、01.1 第一条视频流程

## 1. 使用规则

### 1.1 字段归属

每个字段只能有一个主要来源类别：

- **用户配置**：业务目标、输入资料、限制、人工选择；
- **资源配置**：原子、能力、工作流、权限和平台策略；
- **运行证据**：平台执行时生成的任务、回执、计数、时间和产物身份；
- **真人决定**：经过身份和权限验证的真人决定。

四类数据不能互相代填。模型生成的建议不是配置，模型自报的成功不是运行证据，AI 文本不能成为真人决定。

### 1.2 必填和空值

- `required` 字段缺失时不得报告成功；
- 可选字段无值时使用 `null` 或明确的 `not_applicable`，不能静默省略；
- 发布后的资源版本和产物版本不可原地修改；
- 运行必须固定精确版本，不接受浮动 `latest`；
- 字段值发生变化后，相关校验报告必须失效。

### 1.3 展示标签

| 标签 | 含义 |
|---|---|
| `required` | 必须存在 |
| `conditional` | 在指定条件下必须存在 |
| `nullable` | 允许显式为空 |
| `derived` | 由平台确定性计算 |
| `immutable` | 写入后不可修改 |

### 1.4 验收编号对照

本字典保留早期合同中的 M/P/R/Z 编号，用于追溯；当前可执行验收以 `nl-atom-workflow-acceptance-v0.1.md` 的 A-J 编号为准：

| 早期编号 | 当前验收编号 |
|---|---|
| M01-M05 | D01-D03（五段与执行者） |
| M06-M07 | D03、D07 |
| P01 | C01 |
| P02 | C02、C03、C10 |
| P03 | C04 |
| P04 | C05 |
| P05 | C06-C09 |
| P06 | C10 |
| P07 | C11 |
| R01、R03 | B11-B13 |
| R06 | B10 |
| Z01-Z05 | H 组固定观测，以及 F02、G01-G03、J03-J08 的独立调用计数 |
| 早期生成器 G01-G15 | B01-B10、A02-A04、F02、F04-F06 |
| 早期投影 F01-F05 | I03、C12、B10、G02、J11 |
| 早期验证 V01-V03 | A01、B01-B05、C07-C09、B10 |

同一字母在旧稿中可能属于不同用例族时，以本表左列的全名限定为准；正文当前引用优先使用 A-J 新编号。

## 2. 工作流意图与草案

| 字段名 | 所属对象 | 类型/必填 | 数据来源 | 谁可编辑 | 默认值与约束 | 对应验收 |
|---|---|---|---|---|---|---|
| `intentId` | FlowIntent | string / required | 运行时 | 系统创建 | 稳定唯一 ID；用户输入只作为意图内容溯源 | G01 |
| `businessGoal` | FlowIntent | string / required | 用户配置 | 用户或已确认的 AI 提取 | 原提示词可追溯 | G01 |
| `sourcePromptHash` | FlowIntent | hash / required | 运行时 | 不可编辑 | 绑定原始提示词 | R06 |
| `inputContracts[]` | FlowIntent | typed contract array / required | 用户配置 | 用户确认 | 系统解析只作提案证据；至少覆盖真实输入 | G01/G02 |
| `outputContracts[]` | FlowIntent | typed contract array / required | 用户配置 | 用户确认 | 系统解析只作提案证据；类型、格式、数量明确 | G01/G03 |
| `constraints` | FlowIntent | object / required | 用户配置 | 用户 | 无约束时显式为空 | G09/G10/G12 |
| `humanDecisions[]` | FlowIntent | requirement array / required | 用户配置 | 用户 | 业务要求的人工决定不能遗漏 | G08/G11 |
| `assumptions[]` | FlowIntent | array / nullable | 用户配置 | 用户确认 | AI 提案只作候选，未确认假设只能作 warning | G02 |
| `openQuestions[]` | FlowIntent | array / nullable | 用户配置 | 用户 | AI 提取只作候选；关键问题阻断 runnable request | G02 |
| `workflowId` | Draft | string / required | 系统 | 不可编辑 | 稳定工作流 ID | R01 |
| `workflowVersion` | Draft | integer or semver / required | 系统 | 不可编辑 | 每次编辑生成新版本 | R01/R03 |
| `baseRevisionHash` | Draft edit | hash / required | 运行时 | 客户端提交期望值 | 不一致时拒绝过期编辑 | R03 |
| `draftStatus` | Draft | enum / required | 运行时 | 系统 | 见需求文档草案状态 | G01 |
| `executionReadiness` | Draft | enum / required | 运行时 | 系统 | `not_run`、`design_only_not_runnable`、`ready_for_authorized_run` | J11 |
| `registrySnapshotId` | Draft | string / required | 资源解析 | 不可编辑 | 计划和校验绑定同一快照 | A01 |
| `payloadVersion` | Draft snapshot | string / required | 运行时 | 不可编辑 | 只接受已支持版本；未知版本拒绝恢复 | B16/B17 |
| `sourcePrompt` | Draft snapshot | string / required | 用户配置 | 用户 | 保存并恢复原始提示词；编辑后旧报告失效 | B15/B16 |
| `atoms[]` / `edgeDefinitions[]` / `dependencyEdges[]` / `externalInputBindings[]` | Draft snapshot | typed arrays / required | 配置与编排 | 用户通过编辑器修改 | 恢复前深度校验，不能只恢复部分数组 | B16/B17 |
| `selectedId` / `inspectorTab` | Draft snapshot | string / required | 用户界面状态 | 用户 | 重载后恢复有效选择；无效 ID 回退首个原子 | B16 |
| `intentHash` | Validation binding | hash / required | 运行时 | 不可编辑 | 确认意图的 canonical hash | R06 |
| `planHash` | Validation binding | hash / required | 运行时 | 不可编辑 | 精确 `AtomPlan` 与转换注册规则 hash | R06/B15 |
| `effectiveConfigHash` | Validation binding | hash / required | 运行时 | 不可编辑 | 注册表、策略、能力与转换注册规则有效配置 hash | R06/B15 |

## 3. 编排与端口

| 字段名 | 所属对象 | 类型/必填 | 数据来源 | 谁可编辑 | 默认值与约束 | 对应验收 |
|---|---|---|---|---|---|---|
| `instanceId` | 原子实例 | string / required | 系统 | 系统 | 图内稳定唯一 | P03 |
| `atomId` | 原子实例 | string / required | 资源配置 | 不可编辑 | 必须来自发布注册表 | A01 |
| `atomVersion` | 原子实例 | semver / required | 资源配置 | 不可编辑 | 精确版本 | A01 |
| `templateVersion` | 原子实例 | semver / required | 资源配置 | 不可编辑 | 与原子版本兼容 | A02 |
| `businessCategory` | 原子实例 | enum / required | 资源配置 | 不可编辑 | 生产、流程、组装、Human 等业务分类 | A01 |
| `resourceGroup` | 展示引用 | enum / required | 资源配置 | 平台 | 五类编辑器资源之一；不是原子业务类型 | A01 |
| `inputs[]` | 原子实例 | port array / required | 用户配置 | AI 提案或用户 | 原子模板提供合法 Schema；默认一个主输入 | P01/P02 |
| `outputs[]` | 原子实例 | port array / required | 用户配置 | AI 提案或用户 | 原子模板提供合法 Schema；默认一个主输出 | P01/P02 |
| `portId` | 端口 | string / required | 用户或模型配置 | AI 或用户 | 同一原子实例内唯一且稳定 | P02/P06 |
| `label` | 端口 | string / required | 用户或模型配置 | AI 或用户 | 面向用户可读 | P02 |
| `schemaRef` | 端口 | typed schema ref / required | 资源配置 | 用户只可选 | 精确类型和版本 | P05 |
| `required` | 端口 | boolean / required | 用户或模型配置 | AI 或用户 | 默认主输入 true | P02 |
| `cardinality` | 端口 | enum / required | 用户或模型配置 | AI 或用户 | `one`、`zero_or_one`、`one_or_more`、`bounded_many` | P03/P04/P05 |
| `edge.cardinality` | 边 | enum / required | 编排 | AI 或用户 | `one`、`one_per_shot`、`fan_out_6`、`fan_in_6`；必须同时匹配两端端口基数 | C14/C16/C17 |
| `identityKey` | 边 | string / conditional | 编排 | AI 或用户 | `one_per_shot`、扇入扇出必填；只能使用传输登记的稳定键，如 `shotId`，不能使用 `shotIndex` | C04/C14/C18 |
| `origin` | 端口 | enum / required | 系统 | 不可编辑 | `atom_default`、`ai_proposed` 或 `human_added` | P02 |
| `edgeId` | 边 | string / required | 系统 | 系统 | 图内稳定唯一 | P05 |
| `from` | 边 | `{instanceId, portId}` / required | 编排 | AI 或用户 | 必须指向真实输出端口 | P05 |
| `to` | 边 | `{instanceId, portId}` / required | 编排 | AI 或用户 | 必须指向真实输入端口 | P05 |
| `type` | 边 | enum / required | 编排 | AI 或用户 | 如 `artifact`、`decision`、`event` | P05 |
| `versionPolicy` | 边 | enum / required | 资源配置 | 用户可选 | 默认 `exact_published` | A01 |
| `condition` | 边 | typed condition / conditional | 编排 | AI 或用户 | 条件必须来自声明路由 | P07 |
| `validationState` | 边 | enum / required | 运行时 | 系统 | `valid`、`invalid`、`unchecked` | P05 |

错误类型、缺失必填输入或数量不符的连接可以保留在可编辑草案中，但必须标记为无效。它们不能进入 runnable request。

## 4. 原子五段公共字段

| 字段名 | 所属模块 | 类型/必填 | 数据来源 | 谁可编辑 | 默认值与约束 | 对应验收 |
|---|---|---|---|---|---|---|
| `modules.input` | 原子 | object / required | 资源配置（原子定义为主，用户只绑定实例输入） | 原子作者或用户 | 定义输入合同和绑定 | M01 |
| `modules.check` | 原子 | object / required | 资源配置 | 原子作者或管理员 | 规则必须机器可执行 | M02 |
| `modules.execute` | 原子 | object / required | 资源配置（用户只选择已授权选项） | 原子作者或授权用户 | 明确执行者和能力 | M03 |
| `modules.review` | 原子 | object / required | 资源配置 | 原子作者或业务负责人 | 自动规则或平台审批校验；真人决定只在 Human 的 execute 段产生 | M04 |
| `modules.output` | 原子 | object / required | 资源配置（运行时只写实际结果和证据） | 原子作者定义，平台写结果 | 产物带身份和哈希 | M05 |
| `modules.<module>.action` | 对应模块 | typed operation / required | 资源配置 | 原子作者 | 不接受自由文本冒充动作 | M01-M05 |
| `modules.<module>.executor` | 对应模块 | actor binding / required | 资源或组织配置 | 作者或管理员 | 每段可不同；Human 的 execute 必须绑定认证真人能力，review 必须绑定平台审批校验器 | M03/M04/D03/E10 |
| `modules.<module>.capabilities[]` | 对应模块 | capability ref array / required | 能力注册表 | 授权用户或管理员 | 无能力时为空数组 | C01 |
| `modules.<module>.timing` | 对应模块 | timing policy / conditional | 用户或资源配置 | 用户或作者 | 平台硬上限不能放宽 | M06 |
| `modules.<module>.onFailure[]` | 对应模块 | typed exits / required | 平台策略 | 作者和管理员 | 出口限定为 wait/retry/reconcile/return/block/cancel/stop | M07 |
| `inputBindings[]` | Input | artifact binding array / required | 运行时 | 用户提交绑定意图，运行时写最终解析结果 | 精确类型、版本、哈希 | M01 |
| `preconditions[]` | Input/Check | typed rule array / required | 资源与平台策略 | 作者和管理员 | 空数组表示无条件 | M02 |
| `qualityCriteria[]` | Check/Review | typed rule array / required | 资源或业务配置 | 作者或业务负责人 | warning 必须分类 | M02/M04 |
| `outputs[]` | Output | typed artifact schema array / required | 资源配置 | 作者定义；平台只写实际产物与证据 | 运行时必须有 artifact identity | M05 |
| `permissions` | Check/Execute | policy object / required | 平台策略 | 平台管理员 | 运行用户只读 | C03 |
| `evidencePolicy` | 全模块 | policy object / required | 平台策略 | 平台管理员 | 保留输入、输出、执行者、回执、状态和时间 | E01 |
| `effectiveConfigSource` | 全模块 | enum / required | 运行时 | 不可编辑 | 平台/工作流/原子默认、用户覆盖或强制策略 | M06 |

## 5. 运行状态与证据

| 字段名 | 所属对象 | 类型/必填 | 数据来源 | 谁可编辑 | 默认值与约束 | 对应验收 |
|---|---|---|---|---|---|---|
| `runId` | 运行 | string / required | 运行时 | 不可编辑 | 执行前生成 | E01 |
| `nodeRunId` | 节点运行 | string / required | 运行时 | 不可编辑 | 标识一次逻辑节点运行；恢复 attempt 使用独立 `attemptId`，不得因重启改变业务意图、幂等键、额度或重试计数 | E02/G09 |
| `attemptId` | 外部动作 | string / conditional | 运行时 | 不可编辑 | 每次授权尝试唯一 | E03 |
| `businessIntentId` | 外部动作 | string / conditional | 运行时 | 不可编辑 | 表达业务目的，不由 attempt 替代 | E03 |
| `startedAt` | Execute | timestamp / required | 运行时 | 不可编辑 | 启动时持久化 | E02 |
| `completedAt` | Review/Output | timestamp / conditional | 运行时 | 不可编辑 | 只用于终态 | E01 |
| `lifecycle` | 全模块 | enum / required | 运行时 | 系统 | `pending` 起步；`expired` 必须显式或原子推导 | E02 |
| `cancellationEpoch` | 全模块 | integer / required | 运行时 | 平台控制 | 默认 0，取消时原子递增 | E02 |
| `ownerEpoch` | 所有权动作 | integer / conditional | 运行时 | 平台控制 | 接管时递增，旧令牌失效 | C04 |
| `businessDecision` | Review/Output | enum / conditional | 真人或规则执行器 | 指定审核人 | 默认 `unreviewed` | D01-D04 |
| `actionResult` | Execute | enum / conditional | 运行时 | 不可编辑 | 提供方回执只作溯源；未知时保留额度并禁止新 POST | E03 |
| `reconciliationStatus` | Execute | enum / conditional | 运行时 | 不可编辑 | 默认 `not_required` | E03 |
| `reconciliationBasisRef` | Execute | evidence ref / conditional | 提供方或回执 | 不可编辑 | 对账时必须可追溯 | E03 |
| `artifactIdentity` | Output/Input | object / required | 运行时 | 不可编辑 | 含 ID、type、version、hash | P05 |
| `perItemResult[]` | 多项目原子 | array / conditional | 运行时 | 不可编辑 | 每项有 itemId、status、reason 和产物 | E01 |
| `actualCallCounts` | Check/Execute/Output | typed counters / required | 独立执行日志 | 不可编辑 | 模型自述不能当计数 | Z01-Z05 |
| `warningClass` | 校验报告 | enum / required | 规则引擎 | 不可编辑 | 未知类别阻断完成 | M02 |
| `failureClass` | 运行 | enum / conditional | 运行时 | 不可编辑 | 区分前置拒绝、执行拒绝、运行时失败、未知 | E02/E03 |

## 6. 能力绑定

| 字段名 | 类型/必填 | 数据来源 | 谁可编辑 | 约束 | 对应验收 |
|---|---|---|---|---|---|
| `capabilityId` | string / required | 能力注册表 | 授权用户或管理员 | 精确 ID | C01 |
| `adapterVersion` | semver / required | 能力注册表 | 平台管理员 | 精确版本 | C01 |
| `bindingKind` | enum / required | 能力注册表 | 平台管理员 | `model/skill/mcp_tool/connector/knowledge/executor` | C02 |
| `placement` | enum / required | 能力注册表 | 平台管理员 | `executor/capability_node/module_binding` | C02 |
| `module` | enum / conditional | 工作流配置 | 作者或用户 | 模块绑定必须落到真实模块 | C02 |
| `providerRef` | string / required | 平台配置 | 授权用户或管理员 | 不保存凭据本身 | C03 |
| `environment` | enum / required | 平台配置 | 管理员 | dev/SIT/prod 或受控测试环境 | C03 |
| `sideEffectClass` | enum / required | 能力注册表 | 管理员 | read/idempotent/write/destructive/paid | C03 |
| `externalWrite` | boolean / required | 能力注册表 | 管理员 | 外部写必须显式策略 | C03 |
| `costModel` | object / conditional | 能力注册表 | 管理员 | 付费能力必须有额度和上限 | C05 |
| `timeoutPolicy` | object / required | 能力注册表 | 管理员 | 与调用合同一致 | C05 |
| `idempotency` | object / conditional | 能力注册表 | 管理员 | 外部写/付费动作必须明确 | C05 |
| `unknownResultPolicy` | enum / conditional | 能力注册表 | 管理员 | `reconcile_then_block` 等 | C05 |
| `transitiveToolAllowlist[]` | string array / required | 原子版本 | 原子作者 | 允许为空；列表外调用阻断 | C06 |
| `knowledgeSnapshot` | object / conditional | 知识资源 | 授权用户 | 固定 snapshot/version/scope | C07 |
| `authorizationRef` | string / conditional | 平台授权 | 管理员 | 运行前重新验证 | C03 |

## 7. 真人决定

| 字段名 | 类型/必填 | 数据来源 | 谁可编辑 | 约束 | 对应验收 |
|---|---|---|---|---|---|
| `humanAtomId` | string / required | 资源配置 | 原子作者 | 必须是 Human 原子 | D01 |
| `reviewerBinding` | person/role ref / required | 组织配置 | 管理员 | 不能为空或仅写岗位名称 | D01 |
| `authenticatedIdentity` | user ref / required | 登录和平台验证 | 不可编辑 | 必须与 reviewer 权限一致 | D02 |
| `permissionEvidence` | evidence ref / required | 平台权限系统 | 不可编辑 | 运行时可验证 | D02 |
| `reviewedArtifact` | artifact identity / required | 上游产物 | 不可编辑 | ID、type、version、hash 全有 | D03 |
| `reviewStateVersion` | integer/hash / required | 平台 | 不可编辑 | 防并发旧审批 | D04 |
| `humanDecision` | enum / required | 真人 | 仅审核人 | approved/rejected/returned 等 | D01 |
| `reason` | string / conditional | 真人 | 仅审核人 | 驳回或打回时必填 | D01 |
| `decisionTransactionId` | string / required | 平台 | 不可编辑 | 幂等且可审计 | D04 |
| `reviewedAt` | timestamp / required | 平台 | 不可编辑 | 绑定身份和产物 | D04 |
| `invalidatedAt` | timestamp / nullable | 平台 | 不可编辑 | 产物变更后写入 | D04 |

Human 原子的 `execute.executor` 必须解析为经过认证、具备审批权限的真人或受控岗位映射；`review.executor` 必须解析为平台审批校验器。两者不能共用同一个真人执行者。`HumanDecision.reviewedArtifact` 是下游必须取回的精确产物引用，决定状态本身不能替代产物身份、版本和哈希。

### 7.1 H05 候选与派生包

| 字段名 | 类型/必填 | 数据来源 | 谁可编辑 | 约束 | 对应验收 |
|---|---|---|---|---|---|
| `frozenCandidate.artifactIdentity.artifactType` | string / required | V05 运行时 | 不可编辑 | 必须是 `FrozenContentPackageCandidate` | E12 |
| `frozenCandidate.status` | enum / required | V05 运行时 | 不可编辑 | 仅 `published` 可进入 H05 派生；`audit_only` 等状态阻断 | E12 |
| `frozenCandidate.artifactIdentity` | object / required | V05 运行时 | 不可编辑 | ID、type、version、hash 必须与真人审批引用逐项一致 | E03/E11 |
| `approvedPackage.artifactIdentity.artifactType` | string / derived | H05 运行时 | 不可编辑 | 必须是 `ApprovedContentPackage` | E11/E12 |
| `approvedPackage.artifactIdentity.artifactId` | string / derived | H05 运行时 | 不可编辑 | 新产物独立身份；不得复制冻结候选 ID | E12 |
| `approvedPackage.artifactIdentity.artifactHash` | hash / derived | H05 运行时 | 不可编辑 | 绑定派生包内容、manifest 和决定事务；不得原样复制候选 hash | E12 |
| `approvedPackage.sourceCandidate` | artifact identity / required | 冻结候选 | 不可编辑 | 保存冻结候选的原始 ID/type/version/hash | E11/E12 |
| `approvedPackage.decisionRef` | decision ref / required | H05 决定 | 不可编辑 | 引用精确决定事务和 `reviewedArtifact` | E11 |
| `approvedPackage.manifestHash` | hash / required | 冻结候选 | 不可编辑 | 必须等于被批准候选的 manifest hash | E03/E11 |

原型中的派生身份哈希仅用于交互演示，不能作为正式安全摘要、审批依据或防篡改证明。

## 8. 校验报告

| 字段名 | 类型/必填 | 数据来源 | 谁可编辑 | 约束 | 对应验收 |
|---|---|---|---|---|---|
| `validationReportId` | string / required | 运行时 | 不可编辑 | 唯一报告 ID | V01 |
| `validatorVersion` | semver / required | 运行时 | 不可编辑 | 与实现版本一致 | V01 |
| `validatedAt` | timestamp / required | 运行时 | 不可编辑 | 不能复用旧时间冒充新报告 | R06 |
| `intentCoverage[]` | array / required | 校验器 | 不可编辑 | 覆盖每个输入、输出、真人决定、禁止动作 | V02 |
| `coverage.status` | enum / required | 校验器 | 不可编辑 | covered/missing/conflicting | V02 |
| `coverage.target` | `{atomId,module,portId}` / conditional | 校验器 | 不可编辑 | covered 时必须真实存在 | V02 |
| `issues[]` | array / required | 校验器 | 不可编辑 | 含严重级别、代码、节点和端口 | V03 |
| `blocking` | boolean / required | 校验器 | 不可编辑 | 有 error 时不得创建 runnable request | V03 |
| `runnable` | boolean / required | 校验器 | 不可编辑 | 仅在全部运行门禁通过时为 true | V03 |

校验器必须把完整、已确认的 `FlowIntent` 要求与 `intentCoverage` 双向比对。模型不能先漏掉要求，再以自己生成的覆盖表证明完整。

## 9. 13 个业务原子字段

### 9.1 V01 登记制作任务

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | `ProductionRequest` | 主播、商品、日期、时段、平台、目的、截止时间 |
| 输出 | `TaskRecord` | taskId、inputVersion/hash、幂等键、状态、原因码 |
| 关键检查 | 文件引用、字节、哈希、排期冲突 | 无法读取或重复请求时阻断/返回原任务 |

### 9.2 V02 生成脚本方案

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | `TaskRecord`、`HostProfile`、`ProductFacts`、`MaterialRules` | 商品事实必须可追溯 |
| 输出 | `ScriptProposal` | 脚本、场景、主题、警告、来源版本与哈希 |
| 关键检查 | 数值规则、事实来源、最多两轮预览 | 无来源声明阻断 H02 |

### 9.3 H02 人工确认脚本

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 精确 `ScriptProposal` | ID、版本、哈希、审核状态版本 |
| 输出 | `HumanDecision` | 身份、权限、决定、理由、事务 ID、失效时间 |
| 关键检查 | 登录身份、权限、产物未变化 | AI 不能签署或代填 |

### 9.4 V03 生成分镜

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 有效 H02 决定、主播资料、商品事实 | 审批陈旧时阻断 |
| 输出 | `StoryboardPlan` | 稳定 shotId、显示 shotIndex、画面、图片/视频提示、名义时长 |
| 关键检查 | 六镜合同、已批准脚本、规则 | 稳定 ID 不能由显示顺序替代 |

### 9.5 V04 单镜生图或修图

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | storyboardRef、shotId、参考图、单镜提示 | 参考图需可读取并带哈希 |
| 输出 | `ShotImage` | shotId、文件、哈希、产物版本、动作/对账状态 |
| 关键执行 | 本地请求账本、幂等键、额度预留 | 继承 V06 付费门禁；未知不得盲重提 |

### 9.6 V05 素材整理、冻结与完整性审核

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 分镜、六张图、依赖和哈希 | 所有依赖头必须为当前版本 |
| 输出 | `FrozenContentPackageCandidate` | manifest hash、candidateState |
| 关键检查 | 数量、哈希、依赖、审批 | 发布和依赖 CAS 必须同一事务 |

### 9.7 H05 人工确认素材包

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 已发布 `FrozenContentPackageCandidate` | 完整 manifest hash 和版本；`audit_only`、错误类型或未发布状态阻断 |
| 输出 | `PackageDecision` + 派生 `ApprovedContentPackage` | 决定绑定精确候选；派生包拥有独立 `ApprovedContentPackage` ID/version/hash，并通过 `sourceCandidate` 引用冻结候选 |
| 关键检查 | 真人权限、CAS、包未变化、候选类型/发布态、派生一致性 | 未批准、决定失效、候选类型/状态错误或派生包身份复用候选身份时不得进入 V06 |

### 9.8 V06 单镜提交视频

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | `ApprovedContentPackage`、单镜输入、提供方和预算 | 精确包哈希、审批引用和 ownerEpoch |
| 输出 | `ProviderTaskReceipt` | providerTaskId 或 null、动作状态、对账状态 |
| 关键执行 | businessIntentId、幂等键、配置指纹、额度预留、started 标记 | unknown 时新增 POST 必须为 0 |

### 9.9 V07 查询并取回片段

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 回执或可靠本地对账记录 | 本地 requestId 不能冒充 providerTaskId |
| 输出 | `ShotVideo` | 文件、哈希、探测结果、实测时长、版本 |
| 关键执行 | 查询与下载分离 | 明确失败/取消/过期时停止正常轮询 |

### 9.10 V08 旁白检测

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 精确片段、批准台词、转写能力、预算 | 无台词时需明确跳过证据 |
| 输出 | `NarrationCheck` | shotId、执行状态、检测结果、异常或重做请求 |
| 关键检查 | 工具可用性、重试和成本 | 缺少结果记录不能当通过或跳过 |

### 9.11 V09 可选统一音色

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 精确片段、音色开关、参考音色或原音 | 回退和例外需授权 |
| 输出 | `VoiceProcessedClip` | processed/fallback/degraded/failed/skipped 及原因证据 |
| 关键检查 | 源文件、版本、回退策略 | 任何状态变化都需可审计 |

### 9.12 V10 合片、媒体检查与主版本冻结

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 六个稳定 shotId 的精确片段、批准包 | 版本唯一且当前，音轨策略明确 |
| 输出 | `MasterMediaCandidate` | 可播放文件、哈希、六源版本、音轨版本、时长证据 |
| 关键检查 | 唯一性、媒体探测、音轨、时长、ownerEpoch | 时长通过判定用微秒值，毫秒仅供展示 |

### 9.13 H10 人工最终验收

| 方向 | 主要字段 | 约束 |
|---|---|---|
| 输入 | 精确可播放 `MasterMediaCandidate` | 媒体、音轨、版本、哈希、运行状态 |
| 输出 | `HumanDecision` | 验收、驳回或打回，绑定精确成片 |
| 关键检查 | 真人身份权限、成片未替换 | 陈旧或替换后的成片不能完成 |

## 10. 版本和兼容性

- 原子 ID 稳定，业务语义变化必须发布新版本；
- 原子版本、模板版本和 Schema 版本分别记录；
- 能力适配器版本独立记录；
- 工作流草稿保存精确引用，不解析浮动名称；
- 升级资源前必须检查端口、五段、能力、权限和成本兼容性；
- 重新打开草案后必须恢复相同原子、能力、策略和端口身份；
- V4 字段映射以 `v4-atom-realization-map-v0.2.md` 为当前基线；prod 版本差异和运行证据仍需闭环。

## 11. 本字典的关闭条件

字段字典可关闭设计评审需满足：

1. 每个必需字段只有一个主要来源；
2. 用户配置、运行证据和真人决定不可互相代填；
3. 每个原子都有五段执行者、能力、前后置条件和失败出口；
4. 每个必需字段能映射到验收用例；
5. 多端口、能力、知识、权限、成本、取消和未知结果均有字段；
6. 13 个业务原子的输入、输出和关键证据齐全；
7. V4 完整原子 Schema 的字段落位和缺口报告通过复核；当前映射状态为已形成、待实现方确认。

本字典闭合不代表平台实现、部署或运行通过。
