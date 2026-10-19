# V4 原子实现映射 v0.2

记录时间：2026-10-19 12:15 CST  
实现依据：`schema-2.0-atoms@c0a399e-20261018.md`  
Schema 校验：734 行，56,179 bytes，SHA-256 `915901f6f3f640c722ad8adc9ddbc299d8a182d0d649e52f29bb58a204740b5c`  
状态：`implementation_baseline_mapped`，运行状态 `not_run`

## 1. 结论先行

本文件按群内指令，将上述 `e2s-relay/2.0` schema 作为 V4 线上实现基线。它可以表达：

- 9 种技术节点：`text`、`image`、`file`、`group_messages`、`ai`、`sign`、`group_send`、`drive_save`、`result`；
- 节点、边、系统口、自定义口、4 种基础类型；
- AI 执行者 `platform / org_agent / agent / expert / a2a`；
- 技能、连接器、签字门禁、结构化校验码；
- 单输出与结构化多输出；
- 运行结果信封、V1.1 迁移和卡片模板。

它不能原生表达本文 13 个业务原子所需的全部安全语义。特别是精确产物身份、稳定 `shotId` 基数、业务五段、付费幂等、未知结果对账、持久等待/取消和媒体级证据，不能在 schema 中新增一套平行节点类型；应优先通过受控执行器、连接器或向后兼容扩展实现。

因此本映射分三种落位状态：

| 状态 | 含义 |
|---|---|
| `native_composed` | 用 schema 已有节点、端口、边和资源组合即可表达主体流程 |
| `executor_composed` | 主体可由 AI/专家/Agent 节点承载，但确定性业务语义必须由受控执行器实现并提交证据 |
| `extension_required` | schema 当前没有对应字段或语义，需兼容扩展或外部持久证据，不能只靠 prompt |

所有 13 个原子均附加 `runtime_unverified`：当前没有在 prod 执行本流程。

## 2. 五段配置落位

V4 schema 没有名为 `input / check / execute / review / output` 的五个一等字段。建议按以下方式落位，不把 UI 五段误认为九个技术节点：

| 业务五段 | V4 原生落位 | 边界 |
|---|---|---|
| `input` | `node.inputs[]`、`params`、`attachments[]`、runtime input key | 仅 4 种基础类型；复杂产物用 `text` JSON 或 `file` 引用承载 |
| `check` | `graph2.Validate`、`selfcheck`、资源运行前鉴权、执行器内部前置检查 | V4 校验器只负责结构和枚举；业务质量规则需执行器证据 |
| `execute` | `node.kind`、`exec`、`prompts`、`skills`、`connectors`、`gate` | `platform` 仅走 llm；需要文件输出的 AI 必须使用 org_agent/agent/expert |
| `review` | 真人决定映射为 `sign`；自动规则由 `selfcheck` 或执行器内部规则完成 | 真人 `execute/review` 分离、精确 artifact/version/hash 绑定不是 sign 原生字段 |
| `output` | `node.outputs[]`、`relay_node_exec.output`、`files[]`、`ports{}` | 原生文件只有 `ref/name/mime/size/kind`；无统一 artifactId/version/hash |

建议将五段配置保存在节点未知 `params` 扩展中以保证无损保存，但引擎不得把该扩展当作已执行语义。若要运行，执行器必须读取并校验该扩展，或在平台后续版本增加正式字段。

## 3. 字段落位

| 业务字段 | V4 落位 | 判断 |
|---|---|---|
| 原子稳定 ID / 版本 | `node.atom.kind/ref/name` | `atom` 仅用于显示，引擎不读；精确版本必须在外部资源注册表或兼容扩展中解析 |
| 实例 ID | `node.id` | 原生 |
| 输入/输出端口 | `node.inputs[] / outputs[]` | 原生基础类型 |
| 端口显示名 | `Port.name` | 原生；同一方向唯一，不能有换行或花括号 |
| 端口类型 | `Port.types[]` | 原生，仅 `text/image/file/msg` |
| `schemaRef` | 无 | 需外部注册表或兼容扩展 |
| `cardinality` | 无完整对应 | 多端口/多边可以表达简单扇入扇出，但 `one_per_shot`、`fan_in_6` 等语义需扩展 |
| `identityKey` | 无 | 稳定 `shotId` 必须写入执行器 payload，并在运行证据中校验 |
| 执行者 | `exec` | 原生 |
| 技能/连接器 | `skills[] / connectors[]` | 原生数组；资源授权、精确版本和传递白名单仍需外部注册表 |
| 真人决定 | `sign.gate` + `approved/rejected` | 原生决定与分支；精确审核产物绑定需扩展 |
| 运行输入 | `text/image/file.params.source=runtime` | 原生 |
| 结构化多输出 | AI 多出口 + `output.ports` | 原生按口名 JSON；文本/文件两种输出 |
| 产物 ID/version/hash | 无统一字段 | `file.ref` 只证明网盘引用，不等于业务 artifact identity |
| 幂等键/额度/业务意图 | 无 | 付费执行器需持久账本和兼容证据 |
| 查询/对账/恢复 | 无 | 必须由执行器内部状态机实现 |
| 取消/迟到事件隔离 | 无 | 需运行级扩展与执行器证据 |
| 逐调用计数 | 无统一字段 | 由独立执行日志提供，不接受 AI 自报 |

## 4. 13 个业务原子映射

下表“最小技术形态”表示主体语义，不表示当前可直接运行。所有 `V04-V09` 在有界六镜场景中按稳定 `shotId` 实例化六次；不能用 `shotIndex` 代替身份。

| 业务原子 | 最小技术形态 | 端口/类型 | 执行与检查 | 状态与缺口 |
|---|---|---|---|---|
| `V01 登记制作任务` | runtime `text` + runtime `file` → `ai(org_agent/expert)` → `result/text` | `material:text/msg`、`attach:file/image` → `result:text` | 执行器完成 source lookup、文件读取、哈希和冲突检查，输出 JSON 任务记录 | `executor_composed`；TaskRecord/哈希/幂等不是原生 output 字段 |
| `V02 生成脚本方案` | `text/file` 输入 → `ai(org_agent/expert)` → `text` | 素材与附件 → 脚本 JSON/text | 平台/专家生成；业务事实来源检查由自检或执行器完成 | `executor_composed`；无法原生保证“无来源即阻断 H02” |
| `H02 人工确认脚本` | `ai.result → sign.content` | `approved/rejected:text` | sign 绑定真人、TTL、结论；驳回可走 `rejected` 边 | `extension_required`；基础 gate 原生，精确 ScriptProposal ID/version/hash 和审批失效需扩展 |
| `V03 生成分镜` | `sign.approved → ai(org_agent/expert)` → `text` | 文本/附件 → StoryboardPlan JSON | 执行器生成 6 个稳定 `shotId`，做数量与字段检查 | `executor_composed`；稳定 ID 基数和审批谱系需执行器证据 |
| `V04 单镜生图或修图` | 分镜支路 → `ai(agent/expert)` → `file` | `material:text`、`attach:image/file` → `result:file` | 图片生成/编辑由外部 agent；运行前鉴权；输出文件写回 | `extension_required`；`platform` 禁止 file 输出，需真实媒体执行器和存储证据 |
| `V05 素材整理/冻结` | 分镜依赖 + 六张图扇入 `ai(agent/expert)` → `text/file` | `material:text` + `attach:file/image` → `result:text/file` | 执行器做数量、唯一 shotId、hash、dependency head CAS | `extension_required`；manifest hash、CAS 发布、同事务冻结不在 schema |
| `H05 人工确认素材包` | `V05 → sign.content` | `approved/rejected:text` | sign 记录真人决定；rejected 可分支 | `extension_required`；sign 不派生 `ApprovedContentPackage`，也不绑定候选 ID/version/hash |
| `V06 单镜提交视频` | `H05.approved → ai(agent/expert)` + 单镜意图 | `material:text` + 附件 → `result:text` | 执行器调用视频连接器；提交前预算、幂等和授权检查 | `extension_required`；付费 POST、unknown 对账、额度保留均无原生字段 |
| `V07 查询并取回片段` | `V06 → ai(agent/expert)` → `text+file` | receipt JSON → 结果 JSON + 片段文件 | 执行器内部执行持久轮询/查询、下载、探测和哈希 | `extension_required`；V4 无 wait/poll/loop 节点，必须由 bot_task 内部状态机承担 |
| `V08 旁白检测` | 片段文件 + 批准台词 → `ai(agent/expert)` → `text` | `attach:file` + 自定义 text 口 → `result:text` | 执行器完成音轨提取、转写、比较；无台词时返回显式 skipped 证据 | `executor_composed`；无法用空输出伪装通过或跳过 |
| `V09 可选统一音色` | 片段文件 + voice policy → `ai(agent/expert)` → `file` | `attach:file` + text → `result:file` | 执行器输出 processed/fallback/degraded 文件；保留源版本和原因 | `extension_required`；可选跳过分支和 degraded 证据需执行器状态机 |
| `V10 合片/媒体检查/冻结` | 六个片段扇入 + 批准包 → `ai(agent/expert)` → `file` | `attach:file/image` 多个活入边 + text → `result:file` | 外部媒体执行器完成合片、音视频探测、时长判定和主版本哈希 | `extension_required`；确定性媒体工具、精确六源版本和 master identity 不在 schema |
| `H10 人工最终验收` | `V10 → sign.content` | `approved/rejected:text` | sign 绑定真人、TTL、结论；驳回可分支 | `extension_required`；基础 gate 原生，成片替换后旧审批失效需 artifact/version/hash 绑定 |

## 5. H05 的关键实现边界

V4 `sign` 输出只有：

- `approved` 或 `rejected` 文本；
- `decision / conclusion / by`；
- 上游正文与文件引用。

它不能单独完成 H05 的业务语义。若只把 `approved` 标签传给 V06，就违反了“批准精确冻结候选并派生 ApprovedContentPackage”的合同。

最低实现应满足：

1. H05 展示 `FrozenContentPackageCandidate` 的 artifactId/type/version/hash 和 manifest hash；
2. 真人决定记录精确候选身份、身份/权限、决定事务、时间和运行态；
3. 批准后由受控派生逻辑创建新的 `ApprovedContentPackage`，拥有独立 ID/version/hash；
4. 派生包同时引用冻结候选和 H05 决定；
5. V06 运行前重新校验决定未失效、包版本仍一致、资源授权仍有效。

只增加 prompt、在 sign 文案里写“已批准”或由 AI 生成一个包 ID，都不满足要求。

## 6. 运行状态映射

| 业务状态 | V4 可观察状态 | 是否足够 |
|---|---|---|
| 结构不可运行 | `graph2.Validate` issue，含 severity/code/node_id/port_id | 足够表达结构阻断 |
| 真人通过/驳回 | sign 节点成功，选中 approved/rejected 口 | 足够表达分支 |
| 驳回且无 rejected 边 | `gate_rejected` | 足够 |
| 签字过期 | `gate_expired` | 足够 |
| 上游失败导致下游停止 | 活边就绪规则；无活入边节点为 `skipped` | 机制存在，线上行为待验证 |
| 业务 blocked / unknown_outcome | 需执行器输出及兼容证据 | 原生运行状态不足 |
| 未知付费等待对账 | 需持久状态机和人工恢复入口 | 原生运行状态不足 |
| 取消后迟到回调 | 需 cancellation epoch/owner epoch 等外部状态 | schema 未定义 |

## 7. 必须补充的兼容实现

| 编号 | 扩展 | 原因 | 验收 |
|---|---|---|---|
| `X01` | 业务 artifact identity：ID/type/version/hash | 4 个基础端口类型和文件 ref 不能表达精确业务版本 | 错 ID/type/version/hash 下游调用数为 0 |
| `X02` | 五段配置与证据映射 | schema 无同名五段 | 保存重载无损；默认 UI 不展示技术字段；运行证据可追溯 |
| `X03` | 端口基数与稳定身份键 | 无 `cardinality/identityKey` 原生字段 | 打乱顺序后六镜仍按 shotId 对应；非法基数在运行前失败 |
| `X04` | 确定性业务工具 | `platform` 只执行 llm，不能代替哈希/CAS/媒体工具 | 同一输入得到同哈希；越权工具和白名单外调用为 0 |
| `X05` | H05 派生包 | sign 不创建 ApprovedContentPackage | 未批准或候选错误时包创建数 0；批准后 ID/hash 不复用候选身份 |
| `X06` | 付费幂等与未知对账 | schema 无账本/额度/业务意图字段 | unknown 后新增 POST 为 0，恢复前保留额度和幂等键 |
| `X07` | 持久等待、取消和迟到回调隔离 | schema 无 wait/poll/cancellation epoch | 取消后不再新增调用；迟到审批/回调不能推进 |
| `X08` | 可选/降级分支证据 | schema 无通用 if 节点，AI 空输出不能冒充跳过 | skipped/degraded/fallback 均有独立原因和证据 |
| `X09` | 精确资源版本与运行前重鉴权 | `skills/connectors` 数组不含版本/授权快照 | 资源升级、撤权或成员变化后旧校验不可复用 |
| `X10` | 媒体存储、探测与合片证据 | schema 无媒体专用字段 | 文件可下载、可播放、hash/时长/音轨与主版本一致 |

## 8. 当前可推进与不可宣称

可以立即推进：

- 将 13 个业务原子投影为 schema 中的 9 类技术节点组合；
- 形成可保存、可重开、可结构校验的 V4 草案；
- 在普通用户界面展示业务输入、输出、负责人、缺口和下一步；
- 在技术详情中展示节点、端口、执行者、资源、校验码和投影损失；
- 将当前映射提交给 CodeX 作为前端集成合同。

不能宣称：

- schema 文件存在等于当前 prod 已部署同样版本；
- 图能保存、Validate 通过等于可以运行；
- AI 自检通过等于业务审核通过；
- sign 节点 approved 等于精确产物已绑定；
- 页面显示 done 等于支付成功或业务完成；
- 本地原型、线下文档或本映射等于线上执行验收。

## 9. 关闭条件

本映射可升级为 `implementation_accepted` 前必须满足：

1. 小E确认 prod `53bbcd6` 与本 schema 的字段差异；
2. X01-X10 均有明确落位、负责人和可读实现；
3. 01.1 的 13 个业务原子都有无损失或显式降级的 V4 投影；
4. 六镜 fan-out/fan-in 使用稳定 `shotId`，不是显示顺序；
5. H02/H05/H10 对精确产物完成身份、版本、hash、权限和时效校验；
6. V06 的未知付费结果在独立日志中证明新增 POST 为 0；
7. 取消、重启和迟到事件有持久状态证据；
8. 不使用生产、付费或业务写回即可完成的正反例先全部通过。
