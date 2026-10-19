# 契约 · 图文档 2.0「原子」结构（schema `e2s-relay/2.0`）

B0 产出 · 2026-10-18 · 小A · 状态：**定稿。丁明 10-18 ~02:10 拍板：D1–D5 全按推荐（§12.1）；本契约合入 main；机器人新建的流程默认私有（§16）；按原型 v3 硬切（含卡片模板，§15）。本文是 B1–B7 的唯一依据**
取代：`fields-1.1.md` 中的节点类型、端口、边 kind、触发器 required_inputs 几部分（其余如 gate 字段、别名读法、无损存储规则继续有效，本文引用时注明）。
来源：实施计划 `RELAY-ATOMS-REBUILD-PLAN.md` §1 + 追加段「输入口 / 输出口可自定义」+ 拍板记录；原型 `atoms-prototype/index.html`；B0 三环境只读盘点（`ATOMS-B0-INVENTORY.md`）。
代码基线：e2s-relay `d68782e`。下文 `R/` = e2s-relay，`W/` = e2s-web `packages/relay/src`。

> 读法：表里写「err」= `Validate` 阻断保存 / 运行；「warn」= 只提示。所有校验码集中在 §11。

---

## 0. 总规则

1. **一张卡 = 一个节点。** 节点种类（`kind`）是封闭集合，共 9 种（§4）。JSON 里不再有 `type` 键。
2. **端口在节点上，带类型，可自定义。** 每种原子有一组**系统口**（锁定，不能删，类型固定，可改显示名）。用户可以在该种类允许的范围内**加 / 删 / 改名 / 改类型**自定义口（§3）。
3. **边连的是「出口 id → 入口 id」。** 出口类型必须在入口的可接类型里（§5）。不做隐式转换，只有 §5.3 列出的几条固定渲染规则。
4. **资源（技能 / 连接器）只挂在 AI 卡上**；附件（`attachments`）只出现在图片、网盘文件这两种输入卡上。
5. **无损存储沿用 1.1。** 未知顶层键、未知 `params` 键原样保存、原样返回（`fields-1.1.md` §0 规则 2）。盘点里见过的 `template`、`category`、`migration` 都属于这一类。
6. **写入只接受 2.0。** 写接口（graphapi PUT/POST、botapi、line 保存）收到 `e2s-relay/1.0` 或 `1.1` 的文档，回 **409 `schema_outdated`**（提示「页面已升级，请刷新」）。读接口在迁移完成后只会返回 2.0。
7. **节点 id、图号、run 号、gate 号在迁移前后不变**；`relay_node_exec`、`relay_gate` 都按 node_id 关联。
8. **机器人新建的流程默认私有**（`relay_graph.visibility = private`），需要时再分享（§15）。人在编辑器里新建的流程仍按 `graph-acl.md` 的默认值。
9. **卡片模板**存的是**一张卡**（一个节点），不是整条流程；和整条流程的模板一起放在 `relay_line`，用 `kind=card|flow` 区分（§14）。

---

## 1. 图文档（doc）

| 字段 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `schema` | string | 是 | 固定写 `"e2s-relay/2.0"` |
| `name` | string | 否 | 同 1.1 |
| `space_id` | string | — | 同 1.1：永远以请求所在的 space 为准，body 里的值不可信 |
| `nodes` | Node[] | 是 | 可以是 `[]` |
| `edges` | Edge[] | 是 | 可以是 `[]` |
| `ui` | object | 否 | 只放视图状态，如 `ui.viewport {x,y,k}`。**`ui.groups` 废止**：迁移时删除；2.0 文档里出现时报 warn `ui_groups_ignored`，引擎和编辑器都不读 |
| `migration` | object | 否 | 沿用 builtin 迁移的扩展键。本次追加 `migration.atoms = {batch, from_schema, at_ms, notes[], degraded: bool}`。`degraded=true` 时，打开图显示黄条「这条流程迁移时有改动，请检查」 |
| 其他未知顶层键 | any | — | 原样保存 |

---

## 2. 节点（node）通用字段

| 字段 | 类型 | 适用种类 | 规则 |
|---|---|---|---|
| `id` | string | 全部 | 图内唯一，1–64 字符。迁移合成的节点 id：`<旧id>__img`、`<旧id>__att`、`rt_<n>`（§12） |
| `kind` | string | 全部 | §4 的 9 个值之一。未知值报 err `unknown_kind` |
| `name` | string | 全部 | 显示名；空时显示种类名 |
| `x`, `y` | number | 全部 | 画布坐标（卡片左上角） |
| `params` | object | 全部 | 各种类的参数，见 §4。未知键无损保留 |
| `inputs` | Port[] | 全部 | 入口，见 §3。没有入口的种类写 `[]` |
| `outputs` | Port[] | 全部 | 出口，见 §3 |
| `exec` | Exec | 仅 ai | 执行者，见 §7.1。其他种类出现时报 err `exec_not_allowed` |
| `prompts` | `{p1,p2,p3}` | 仅 ai | p1 角色、p2 怎么做、p3 产出要求。可以用 `{{口名}}`（§7.3） |
| `selfcheck` | object | 仅 ai | 沿用 1.1 |
| `skills` | string[] | 仅 ai | 市场目录 id（§7.4）。非 ai 上非空报 err `resource_not_allowed` |
| `connectors` | string[] | 仅 ai | 同上 |
| `attachments` | string[] | 仅 image / file | `drive://<file_id>`。其他种类上非空报 err `attachments_not_allowed` |
| `gate` | Gate | 仅 sign | 字段与 1.1 相同（`fields-1.1.md` §3）：`signer_uid, signer_name, sign_mode, ttl_hours / ttl_minutes, require_conclusion, options, card_quick_sign` |
| `atom` | `{kind, ref, name}` | 全部 | 节点从原子库落地时的来源，只用于显示，引擎不读 |
| `timeout_sec`, `queue_timeout_sec` | int | ai | 沿用 1.1 |
| `session_key`, `owner`, `workspace` | string | ai | 沿用 1.1 |

1.1 的 `agent`、`refs`、`type` 键在 2.0 里**不存在**。迁移时 `agent` 移到 `exec.bot_uid`，`refs` 放进 `params.legacy_refs`。

---

## 3. 端口（Port）与自定义端口

### 3.1 字段

```jsonc
{
  "id": "material",            // 节点内唯一（入口和出口合在一起算），边用它引用；创建后不能改
  "name": "素材",               // 显示名，也是 {{口名}} 引用名和多输出 JSON 的键；可以改
  "types": ["text", "msg"],    // 入口：可接的类型（1–4 个，第 1 个是主类型，决定颜色）；出口：恰好 1 个
  "required": false,           // 仅入口：true 表示必须接线（§3.4）
  "locked": true,              // 系统口为 true。以种类表为准，文档里的值只供显示（服务端不信任它）
  "prompt": "",                // 入口：对这一路输入的说明；出口：这一口的产出要求（多输出时进入格式说明）
  "redo": false, "redoMax": 0, "redoCond": ""   // 仅 ai 的 material 口：打回 / 失败重试，语义同 1.1
}
```

端口类型 `PortType` 只有 4 个值：`text`（文本）、`image`（图片）、`file`（文件）、`msg`（消息）。

### 3.2 约束

| 项 | 规则 | 违反时 |
|---|---|---|
| id 格式 | 系统口用 §4 里的固定 id；自定义口用 `^(in\|out)_[a-z0-9]{1,16}$`（编辑器生成，例如 `in_k3f9`） | err `port_id_invalid` |
| id 唯一 | 同一节点内，入口和出口的 id 合在一起不能重复 | err `port_id_dup` |
| name 长度 | 去掉首尾空白后 1–24 字符 | err `port_name_invalid` |
| name 字符 | 不能含 `{` `}` 和换行 | err `port_name_invalid` |
| name 唯一 | 同一节点、同一方向内不能重名 | err `port_name_dup` |
| name 保留字 | 不能是内置变量名：`date` `time` `run` `flow` `日期` `时间` `运行号` `流程名` | err `port_name_reserved` |
| 入口 types | 1–4 个，不能重复，每个都必须在该种类的「可加入口类型」里（§4.1） | err `port_types_invalid` |
| 出口 types | 恰好 1 个，并且在该种类的「可加出口类型」里 | err `port_types_invalid` |
| 数量 | 每个节点最多 8 个入口、8 个出口 | err `port_too_many` |
| 系统口 | 必须存在，id 和 types 与种类表完全一致；`required` 也以种类表为准 | 缺失：err `system_port_missing`；被改过：err `system_port_altered` |
| 不允许加口的种类 | 出现种类表以外的口 | err `port_not_allowed` |

### 3.3 编辑操作（前端 `W/canvas/portTypes.ts` 与后端 `R/internal/graph2/ports.go` 用同一张表）

| 操作 | 系统口 | 自定义口 |
|---|---|---|
| 改名 | 可以 | 可以。改名时编辑器同步改写本节点 prompts 里的 `{{旧名}}`；边连的是 id，不受影响 |
| 改类型 | 不可以 | 可以。改完后，已连的边如果不再兼容，编辑器提示并删掉这些边；服务端校验报 err `port_type_mismatch` |
| 删除 | 不可以 | 可以，连在它上面的边一起删掉 |
| 新增 | — | 只能在该种类允许的类型范围内（§4.1）。新口默认 `required=true`（入口），名字默认「输入 2」「输出 2」 |

### 3.4 必须接线

- 入口 `required=true` 并且没有任何边连进来：报 err `required_port_unconnected`。
- 例外：group_send 的 `body` 口，`params.text` 非空时可以不接。
- ai 一条输入都没接、p2 又是空的：warn `ai_no_input`。

---

## 4. 9 种原子

### 4.1 端口表（冻结；`R/internal/graph2/kinds.go` 与 `W/canvas/atoms.ts` 各有一个快照测试锁住）

| kind | 分类 | 系统入口（id · 名 · types · required） | 系统出口（id · 名 · type） | 可加入口类型 | 可加出口类型 | 执行器 |
|---|---|---|---|---|---|---|
| `text` | 输入 | — | `out` · 内容 · text | 不可加 | 不可加 | logic（source） |
| `image` | 输入 | — | `out` · 图片 · image | 不可加 | 不可加 | logic（source） |
| `file` | 输入 | — | `out` · 文件 · file | 不可加 | 不可加 | logic（source） |
| `group_messages` | 输入 | — | `out` · 消息 · msg | 不可加 | 不可加 | pf `im.group_fetch` |
| `ai` | AI 处理 | `material` · 素材 · [text, msg] · 否；`attach` · 附件 · [file, image] · 否 | `result` · 结果 · text | text, msg, file, image | text, file | bot_task / llm（§7.1） |
| `sign` | 人 | `content` · 待签内容 · [text, file, image] · **是** | `approved` · 通过 · text；`rejected` · 驳回 · text | text, file, image | 不可加 | gate |
| `group_send` | 输出 | `body` · 正文 · [text, msg] · **是**（`params.text` 非空时为否） | — | text, msg | 不可加 | pf `im.group_send` |
| `drive_save` | 输出 | `content` · 内容 · [file, image, text] · **是** | `saved` · 已存文件 · file | file, image, text | 不可加 | pf `drive.save` |
| `result` | 输出 | `in` · 结果 · [text, image, file, msg] · **是** | — | text, image, file, msg | 不可加 | logic（result） |

几点说明：

- sign 的入口比原型多接受 file、image。迁移来的「AI 产出文件 → 签字」需要这两种。
- sign 的 `rejected` 口和 drive_save 的 `saved` 口都是系统口，**可以不接线**。
- 输入类原子不能加口。要把同一个输入给多个下游，从同一个出口拉多条线（扇出）即可。

### 4.2 参数与落地默认值（原子拖到画布上时，节点逐字段等于下表；B6 测试②锁住）

| kind | params 键 | 类型 / 取值 | 默认 |
|---|---|---|---|
| text | `content` | string | `""` |
| | `source` | `static` \| `runtime` | `static` |
| | `key` | string（仅 runtime；规则见 §8） | `""` |
| | `label` | string（仅 runtime） | `""`（为空时显示 key） |
| | `required` | bool（仅 runtime） | `true` |
| image | `source` | `static` \| `runtime` | `static` |
| | `key` / `label` / `required` | 同 text | |
| | （`attachments[]` 在节点上） | `drive://<id>`，最多 4 张，单张 ≤ 8MB | `[]` |
| file | `source` / `key` / `label` / `required` | 同 image | |
| | `mode` | `read`（交给模型读）\| `static`（原文直传） | `read` |
| group_messages | `group_no` | string | `""`（必填，空时报 err `param_required`） |
| | `range` | `last_n` \| `24h` \| `7d` \| `since_last_run` | `last_n` |
| | `limit` | int，1–200 | `50` |
| | `only_at_me` | bool（只看 @发起人 的消息） | `false` |
| ai | （exec / prompts / selfcheck / skills / connectors 在节点上） | 见 §7 | `exec={kind:"platform"}`，三段 prompts 为空 |
| | `timeout_sec`（节点字段） | int | `600` |
| | material 口的 `redoMax` | int（失败重试次数） | `0` |
| sign | `content` | string（给签字人看的说明） | `""` |
| | （`gate` 在节点上） | 同 1.1 | `{signer_uid:"", ttl_hours:24, require_conclusion:true}`（不写 `sign_mode` = 部署默认 `RELAY_SIGN_MODE_DEFAULT`；取值只能是 `both` / `assignee`，同 `fields-1.1.md` §2.3。原型「任一人签」对应部署默认） |
| group_send | `group_no` | string | `""`（必填） |
| | `title` | string，可以用内置变量 | `""` |
| | `text` | string，为空时用上游内容；可以用 `{{口名}}` 和内置变量 | `""` |
| drive_save | `drive_space_id` | string | `""`（必填） |
| | `folder_id` | string | `""`（必填） |
| | `folder_path` | string（只用于显示） | `""` |
| | `filename` | string，可以用内置变量 | `"{{流程名}}-{{日期}}.md"` |
| | `on_conflict` | `rename` \| `overwrite` | `rename` |
| result | `outcome` | `success` \| `failed` | `success` |
| | `close_when` | string（只用于显示） | `""` |

`drive_save.on_conflict` 与计划的差异：B0 核对了 drive 服务，它**没有版本模型**，所以 `version` 改成 `rename`（同名时自动编号成「名称 (2).ext」）。`overwrite` 要求目标空间角色 ≥ editor；新建文件只要 ≥ uploader_downloader。详见盘点 §4.2。

内置变量（`group_send.title/text`、`drive_save.filename` 可用；**ai prompts 里不可用**，避免和口名混淆）：

| 变量 | 含义 |
|---|---|
| `{{日期}}` / `{{date}}` | `YYYY-MM-DD`（Asia/Shanghai） |
| `{{时间}}` / `{{time}}` | `HHmm` |
| `{{运行号}}` / `{{run}}` | run_no |
| `{{流程名}}` / `{{flow}}` | 图名 |

---

## 5. 类型系统与兼容矩阵

### 5.1 规则

1. 只能从**出口**连到**入口**。
2. 出口类型必须在入口的 `types` 里，否则报 err `port_type_mismatch`。提示文案和原型一字不差：「类型不匹配：<出口类型名> 不能接到「<节点名>」的<入口名>口，它只接受 <类型名、…>」。
3. 入口可以接多条线（扇入）；出口可以连任意多条线（扇出）。
4. 不能连自己，不能成环：err `cycle`（从 CreateRun 前移到 Validate）。
5. 同一对 (from, fromPort, to, toPort) 只能有一条边：err `edge_dup`。

### 5.2 矩阵（行 = 出口类型，列 = 入口 types 里含有的类型；✓ = 可以连）

| 出口 \ 入口接受 | text | msg | file | image |
|---|---|---|---|---|
| text | ✓ | | | |
| msg | | ✓ | | |
| file | | | ✓ | |
| image | | | | ✓ |

也就是说，类型完全按名字匹配，入口用「多选」来接受多种类型。系统口和出口类型组合后的实际效果：

| 出口（来自） \ 入口 | ai.material | ai.attach | sign.content | group_send.body | drive_save.content | result.in |
|---|---|---|---|---|---|---|
| text（text / ai.result / sign.*） | ✓ | ✗ | ✓ | ✓ | ✓（存为 .md） | ✓ |
| image（image） | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| file（file / drive_save.saved / ai 文件口） | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| msg（group_messages） | ✓（渲染成聊天记录） | ✗ | ✗ | ✓ | ✗ | ✓ |

B1 测试②用一张 4×9 的表格测试锁住这张矩阵。

### 5.3 运行时的固定渲染（不算类型转换）

| 进入 | 渲染 |
|---|---|
| msg → ai 的 text 口、group_send.body、result | 按「`[HH:mm] 发言人：内容`」一行一条渲染成文本，同时保留结构化的 `messages` |
| text → drive_save | 存成 `<filename>`；没有扩展名时补 `.md` |
| file / image → sign.content | 卡片上列出文件名和链接 |
| file / image 出现在 `{{口名}}` 里 | 渲染成「附件：a.xlsx、b.png」，文件本身走附件通道 |

---

## 6. 边（edge）

```jsonc
{ "id": "e1", "from": "n_ai", "fromPort": "result", "to": "n_sign", "toPort": "content",
  "type": "text",      // 保存时由出口类型推出，存下来供显示；校验时以端口为准，不一致时报 warn edge_type_stale
  "label": "" }
```

- 1.1 的 `kind`（`error` / `no` / `redo`）在 2.0 里**废止**。2.0 文档里出现 `kind` 键时报 err `edge_kind_removed`。
- 签字驳回走 `fromPort="rejected"` 的普通边（§9），不需要单独的边类型。

**死边与跳过（就绪规则）**：

- 签字卡结束后，没被选中的那个出口上的边是「死边」：通过时 `rejected` 口的边是死边，驳回并走驳回口时 `approved` 口的边是死边。
- 一个节点如果所有入边都是死边，状态记为 `skipped`，并把它所有出边也标成死边，依次往下传。
- 一个节点只要还有活的入边，就等所有活入边的上游都 `succeeded` 之后再执行。这和今天 `readiness` 的非 merge 规则一致。
- 运行结束的条件：没有可执行的节点，也没有在等的节点。

---

## 7. AI 卡

### 7.1 执行者 `exec`

```jsonc
{ "kind": "org_agent",          // platform | org_agent | agent | expert | a2a
  "ref": "robot_zb01",          // 见下表
  "name": "周报助手",            // 只用于显示
  "bot_uid": "28my…_bot",       // 实际派单的 bot（= 1.1 的 node.agent）
  "model": "", "provider": "", "temperature": null,
  "instructions": "",           // 专家角色指令（soul）
  "runtime": { "id": "rt_dm_laptop", "name": "丁明的电脑 · OpenClaw" },
  "materialized": { "bot_id": "", "bot_uid": "", "temp": true } }
```

| kind | 面板分组 | 列表数据源 | 必填 | 派单 / 执行器 | 校验 |
|---|---|---|---|---|---|
| `platform` | 「组织AI」组**第一项**「平台模型」（拍板 Q1） | 固定一项 | 无（`model` / `provider` 为空时用网关默认） | **llm**（`R/modules/engine/llm.go`） | 挂了 skills / connectors：warn `platform_ignores_resources`；有 file 类型出口：err `platform_file_output` |
| `org_agent` | 组织AI | `/resources/agents` | `ref`（= robot_id）、`bot_uid` | **bot_task** | `bot_uid` 为空：err `exec_unbound` |
| `agent` | Agent | executorCatalog 的 openclaw 组 | `ref`、`runtime` | 物化出临时 bot → **bot_task**（fleet） | 没有物化也没有 `bot_uid`：运行时物化，失败时节点报 error `exec_materialize_failed` |
| `expert` | 专家 | 市场 `plugin_type=expert` | `ref`、`runtime` | 同 agent。`instructions` 作为 prompt 第 0 层，同时写进 `TaskContext.instructions`；专家自带的技能并入 capabilities.skills | 同 agent |
| `a2a` | （不在面板里；只有迁移遗留） | `/resources/bots` | `ref` = 对端 bot uid | **bot_task**，TaskType `relay.a2a.send` | warn `a2a_legacy`；`ref` 为空：err `exec_unbound` |

`relay_node_exec.executor` 列的取值不变（`bot_task | llm | gate | logic | pf`），recovery 和 sweep 都不用改。

### 7.2 Prompt 组装顺序

1. 第 0 层：`exec.instructions`（仅 expert）
2. `p1` 角色 → `p2` 怎么做 → `p3` 产出要求，三段里的 `{{口名}}` 先展开（§7.3）
3. 没有在 `{{}}` 里引用过、且有内容的入口，按入口在 `inputs[]` 里的顺序逐个追加，标题为 `【上游输入·<口名>】`
4. 有 ≥ 2 个出口时，最后追加多输出格式说明（§7.5）

文件（attach 口，以及任何 file / image 口）的处理：

- 所有这类口的上游 `files[].ref` 去重后，交给 `resolveNodeAttachments`（重构成接受 ref 列表），按**发起人身份**经 drive datahub 鉴权读取。
- llm 执行器把图片注入 vision（每个节点最多 4 张，单张 ≤ 8MB）。
- bot_task 执行器把文件写进 `context.attachments`。

### 7.3 `{{口名}}` 引用

- 语法：`{{` + 可选空白 + 入口 `name` + 可选空白 + `}}`。只匹配本节点的**入口**名。
- 展开的值：
  - 该口所有活入边的上游输出，按 §5.3 渲染成文本，按边在 `edges[]` 里的顺序用空行拼起来；
  - 没接线的可选口展开成空串；
  - file / image 口展开成文件名清单。
- 被引用过的口不再出现在 `【上游输入·…】` 里，避免重复。
- 名字匹配不上任何入口：warn `unknown_port_ref`，运行时**原样保留**这段文字。
- 引用了一个 `required=false` 且没接线的口：warn `ref_unconnected_port`。

### 7.4 资源（skills / connectors）

- 值都是市场目录 id。前端从「资源」面板拖到 AI 卡上时，调用 `addCatalogPicks`；卡上已经绑了 bot 的，顺带调用 `claimCatalogItemToBot`。拖到非 AI 卡上会被拒绝。
- 运行时：
  - `capabilities.Skills` = 节点 `skills` ∪ 专家自带技能；
  - `capabilities.MCP` = `["datahub","attachments","receipt"]` ∪ 由节点 `connectors` 映射出的 mcp 名，去重。这一项受 B3e 开关控制，开关关着时 MCP 与今天逐字节相同。
- 没授权时：`skill_not_available` / `connector_not_available`，节点报 error。
- 1.1 里不是目录 id 的占位值（盘点：`SK-xx`、`mes`、`scada`、`ledger`、`a2agw`）迁移时放进 `params.legacy_skills` / `params.legacy_connectors`，**不进**这两个数组。

### 7.5 多输出：一次结构化产出（拍板：按口名）

**什么时候生效**：ai 节点有 ≥ 2 个出口。只有 1 个出口时行为和今天一样：整段产出就是这个口的值，不要求 JSON。

**引擎追加到 prompt 末尾的说明**（文字固定，B2 测试锁住）：

```
【输出格式】只输出一个 JSON 对象，不要输出任何其它文字。键必须是下面这些口名：
- "风险清单"（文本）：<该出口的 prompt>
- "修改建议稿"（文件）：<该出口的 prompt>
文本口的值是字符串；文件口的值是数组，每项为 {"ref":"drive://…","name":"…"}。
```

**各执行器怎么产出**：

- **llm**：provider 支持时请求 `response_format: {"type":"json_object"}`，不支持时只靠 prompt 约束。platform 不允许有 file 出口（§7.1）。
- **bot_task**：`TaskContext.output_ports = [{id, name, type, prompt}]`。回执的 `output` 可以是 JSON 对象，也可以是含 JSON 的文本，两种都按下面的解析规则处理。文件口的文件由 agent 通过 datahub / attachments MCP 写入，把 ref 填进来。

**解析规则**（`R/modules/engine/structured.go`，纯函数，表格测试）：

1. 去掉首尾空白，再去掉一层 ```json … ``` 围栏。
2. 如果整体不是 JSON 对象，就取第一个配平的顶层 `{…}`。
3. 键按口名精确匹配（去首尾空白）；匹配不上时再按口 id 匹配。多出来的键忽略，写一行日志。
4. 值的形状：text 口要求 string（如果是数字、布尔、对象，按 JSON 文本转成字符串）；file 口要求数组，每项有 `ref`。

**失败处理**：

| 情况 | 结果 |
|---|---|
| 解析不出 JSON 对象 | 节点 error `output_not_structured`（会计入失败重试 `redoMax`） |
| 某个出口缺键，并且这个口**有下游边** | 节点 error `output_port_missing:<口名>`（同样计入重试） |
| 某个出口缺键，但这个口没有下游边 | 这个口的值为空，写 warn 事件 |

**存储**（`relay_node_exec.output`）：

```jsonc
{ "text": "<原始产出，供回看>",
  "ports": { "out_risk": { "text": "…" }, "out_doc": { "files": [ {"ref":"drive://9","name":"修改稿.docx","kind":"file"} ] } } }
```

下游沿一条边读值时：输出里有 `ports` 就取 `ports[fromPort]`，没有就取整个信封（兼容单输出和其它种类）。

---

## 8. 运行时输入（替代 trigger + required_inputs）

- text / image / file 节点的 `params.source = "runtime"` 时，这个节点就是一项启动时要填的内容。
- `key` 规则：
  - 1–128 字符，不能含 `{` `}` `,`；
  - **整张图内唯一**（err `runtime_key_dup`）；
  - 空的：err `runtime_key_required`。
  - 可以有中文和空格。盘点发现 prod 的旧键是整串中文，例如 `设备号 EQ、发生时间、来源、原始值 / 停机码`，迁移后原样保留。
- 启动请求 `POST /runs {payload:{<key>: value}}` 的格式**不变**：
  - text：string；
  - image / file：`"drive://<id>"` 或这种字符串组成的数组（image 最多 4 张）。
- 缺少 `required=true` 的键：**422 `payload_missing`**，错误码和 payload 形状都与今天相同。
- 值的形状不对：422 `payload_invalid`，`detail.key` 指出是哪一项。
- 引擎的取值：`run.TriggerPayload[key]`。source 节点是纯函数，不访问网络；文件鉴权交给消费方（按发起人身份）。
- RunPanel、e2s-link `flow run` 用 `GET 图` 时，按 runtime 节点渲染输入项（标签 = `label` 或 `key`）。

---

## 9. 签字（sign）：通过 / 驳回两个出口

- 卡片上给签字人看的内容 = `params.content` + 所有入口的上游文本 + 文件清单。
- **通过**：节点 `succeeded`，`approved` 口的输出是：

  ```json
  {"text":"<上游正文>\n签字结论：<conclusion>","files":[…上游 files 原样带下去],"decision":"approved","conclusion":"…","by":"<uid>"}
  ```

  `rejected` 口的边全部变成死边。
- **驳回，并且 `rejected` 口连了线**：节点 `succeeded`，选中口 = `rejected`，输出 `{"text":"<驳回意见>","decision":"rejected","conclusion":"…","by":"<uid>"}`。`approved` 口的边全部变成死边，运行沿驳回分支继续。
- **驳回，`rejected` 口没连线**：和今天一样（`R/modules/engine/sign.go rejectRun`）。节点报 error `gate_rejected`，运行状态 `rejected`，其余待执行节点 skipped，其余待签 gate 取消。
- **过期**：和今天一样，节点报 error `gate_expired`，**不走**驳回口。
- gate 表、签字页、卡片回调、「今天待签」都不变。

---

## 10. 统一输出信封与结果

`relay_node_exec.output` 的统一形状（向后兼容 `mergeText`）：

```jsonc
{ "text": "人能读的正文",
  "files": [ {"ref":"drive://123","name":"周报.xlsx","mime":"…","size":0,"kind":"file|image"} ],
  "messages": [ {"from":"张三","from_uid":"…","at":1739000000000,"text":"…"} ],   // group_messages
  "decision": "approved", "conclusion": "…", "by": "uid",                          // sign
  "group_no": "…", "message_id": "…",                                             // group_send
  "count": 0,
  "ports": { }                                                                    // 只有多输出 ai 才有，见 §7.5
}
```

各种类写什么：

| kind | 写入 |
|---|---|
| text | static：`{text: content}`；runtime：`{text: payload[key]}` |
| image / file | `{files:[{ref,name,kind}]}`（来自 attachments 或 payload）。file 节点 `mode=static` 时另带 `text`：服务端读出的文本，≤ 64KB，读取在消费方执行 |
| group_messages | `{text: 渲染后的记录, messages[], count, group_no}` |
| ai | 单输出：`{text, files?}`；多输出：见 §7.5 |
| sign | 见 §9 |
| group_send | `{group_no, message_id}` |
| drive_save | `{files:[新文件 ref]}`。由 `saved` 口输出 |
| result | `{text, files, count, sections:[{port, name, text, files}]}`：按入口顺序汇总上游，`outcome=failed` 时整次运行判为 failed（同 1.1 的 error 阻断终点） |

`GET /runs/{no}` 新增 `result` 字段：

- 图里只有一个 result 节点时，就是它的 output；
- 有多个时，是 `{<node_id>: output}`；
- 没有执行到的 result 节点不出现在里面。

不加新列。RunPanel 的「本次运行结果」显示的就是这个字段。

---

## 11. 校验码（`graph2.Validate` → `Issue{sev, code, node_id, port_id, msg}`；比 1.1 新增 `code`、`port_id` 两个字段）

| code | sev | 条件 |
|---|---|---|
| `schema_outdated` | （HTTP 409，不进 Validate） | 写入的文档不是 2.0 |
| `unknown_kind` | err | kind 不在 9 种之内 |
| `exec_not_allowed` | err | 非 ai 节点带了 exec |
| `exec_kind_invalid` | err | `exec.kind` 不是 platform / org_agent / agent / expert / a2a 之一 |
| `exec_unbound` | err | org_agent 缺 `bot_uid`；a2a 缺 `ref` |
| `platform_ignores_resources` | warn | platform 执行者挂了 skills / connectors |
| `platform_file_output` | err | platform 执行者有 file 出口 |
| `a2a_legacy` | warn | exec.kind = a2a |
| `resource_not_allowed` | err | 非 ai 节点上的 skills / connectors 非空 |
| `attachments_not_allowed` | err | image / file 以外的节点有 attachments |
| `attachments_too_many` | err | image 节点超过 4 张 |
| `port_id_invalid` / `port_id_dup` | err | §3.2 |
| `port_name_invalid` / `port_name_dup` / `port_name_reserved` | err | §3.2 |
| `port_types_invalid` | err | §3.2 |
| `port_too_many` / `port_not_allowed` | err | §3.2 |
| `system_port_missing` / `system_port_altered` | err | §3.2 |
| `port_type_mismatch` | err | §5.1 规则 2（固定文案） |
| `edge_port_missing` | err | 边引用的节点或端口 id 不存在 |
| `edge_direction` | err | 边从入口出发，或连到了出口 |
| `edge_dup` | err | §5.1 规则 5 |
| `edge_kind_removed` | err | 边带了 kind 键 |
| `edge_type_stale` | warn | edge.type 与出口类型不一致 |
| `self_loop` / `cycle` | err | §5.1 规则 4 |
| `required_port_unconnected` | err | §3.4 |
| `ai_no_input` | warn | §3.4 |
| `unknown_port_ref` / `ref_unconnected_port` | warn | §7.3 |
| `runtime_key_required` / `runtime_key_dup` | err | §8 |
| `runtime_key_invalid` | err | §8：key 超过 128 字符，或含 `{` `}` `,` |
| `param_required` | err | group_messages / group_send 缺 group_no；drive_save 缺 drive_space_id / folder_id；sign 缺 signer_uid |
| `tpl_not_single_card` | err | 卡片模板文档不是恰好 1 个节点、或 `edges` 非空、或缺 `template.kind="node"`（只在 `ValidateCardTemplate` 里） |
| `param_range` | err | limit 不在 1–200；ttl 为负；枚举值不合法（`source` / `range` / `mode` / `on_conflict` / `outcome` / `gate.sign_mode`）；`timeout_sec` / `queue_timeout_sec` / `gate.ttl_minutes` / `gate.options` 越界（界限同 1.1） |
| `ui_groups_ignored` | warn | 文档里有 ui.groups |

1.1 的以下规则**删除**：必须有触发器；节点超过 3 个必须有 lead；a2a 汇合点；「除触发器外都要有入边」。

---

## 12. 与 1.1 的对应（完整规则见计划 §2.1，以下是端口层面的结论 + B0 盘点补充）

| 1.1 | 2.0 节点 | 端口映射 |
|---|---|---|
| trigger（有 required_inputs） | 每个键一个 `text`（`source=runtime`，id `rt_<n>`），n 从 1 起，按键的出现顺序编号 | 原 trigger 出边 → 每个 rt 节点的 `out` → 下游的 `material`（下游是 sign 时连 `content`） |
| trigger（没有 required_inputs） | 删除 | 下游变成源头 |
| lead / step / skill | ai | 所有旧入口 → `material`；所有旧出口 → `result` |
| data static / passthrough | text（static） | 旧出口 → `out` |
| data 模型模式（有附件） | file（`mode=read`） | 旧出口 → `out` → 下游 `attach` |
| data 模型模式（只有 content） | ai（platform，p2=content） | 同 lead |
| 节点 attachments | `<id>__img` image + `<id>__att` file | → 宿主 ai 的 `attach` |
| wait | sign | 旧入口 → `content`；正常出边 → `approved`；error / no 出边 → `rejected` |
| done / error | result（`outcome=success` / `failed`） | 旧入口 → `in` |
| a2a | ai（`exec.kind=a2a`）；**没有对端的转成 platform**（盘点 prod 10 个，需 `-accept`） | 同 lead |
| merge | 删除，改成扇入 | |
| if、pf（notify / ledger / 演示 PF / 未注册的 PF-xx）、起点不是 wait 的 error 边 | **needs_fix**（`-accept` 后按默认降级） | |

盘点之后补充的转换规则：

- 接受 `e2s-relay/1.0` 文档（prod 有 1 张）。
- 字符串形式的 required_inputs 只按英文逗号切，和 `ParamStrings` 一致。
- 非目录 id 的 skills / connectors 放进 legacy。
- run 状态 `rejected` 算作终态。
- 终态运行的快照自动降级，不进 needs_fix。

### 12.1 拍板 D1–D5（丁明 10-18 ~02:10「按你的建议来」，全部按推荐）

| # | 内容 | 落到转换 / 实现上 |
|---|---|---|
| D1 | prod 3 张「业务线」图（`rgb7342…`、`rg0ca9…`、`rgfe39…`）窗口里 `-accept` 按默认降级 | AI 失败分支（起点不是签字卡的 error / no 边）删除；未注册 PF-01…11 节点删除、上下游直连；无对端 a2a 转平台模型；`migration.atoms.degraded=true`，打开图出黄条 |
| D2 | dev 24 张图 + 6 个 line 模板一律 `-accept` 降级，不逐张通知，群里发一句 | 同 D1 的降级规则 |
| D3 | 用「、」分隔的整串中文必填项保持 **1 个**运行时文本卡 | `required_inputs` 只按英文逗号切（与 `ParamStrings` 一字不差）；`key = label = 原串`；启动参数不变 |
| D4 | 终态运行快照（`relay_run.doc`，状态 succeeded / failed / stopped / **rejected**）自动按默认降级 | 不进 needs_fix、不需要 `-accept`；被删掉的节点在回看页显示成灰色「迁移前节点」 |
| D5 | drive 允许自己写文件字节（存网盘的前提） | B3c 按计划 §6.2：`POST /v1/internal/drive/datahub/write`，上限 20MB，drive 内复制一份扩展名白名单 |

### 12.2 转换细则（`R/internal/graph2/upgrade.go`，纯函数；B1 黄金测试锁住）

入口：`UpgradeV1(raw, Options{Accept, Snapshot, Batch, AtMs}) → Result{Doc, Notes, NeedsFix, Degraded, OK, Synth, Removed}`。已经是 2.0 的文档原样返回（`Unchanged=true`），所以 `Upgrade(Upgrade(x)) == Upgrade(x)`。

- **needs_fix 码**：`if_node`、`pf_node`（所有 pf：notify / ledger / 演示 PF / 未注册 PF-xx）、`ai_error_branch`（起点不是 wait 的 error / no 边）、`a2a_no_peer`、`unknown_type`、`edge_incompatible`。`Accept=false` 且 `Snapshot=false` 时有任一项 → `OK=false`（工具拒绝整批）。`Accept` 或 `Snapshot` 时按下面的默认降级，`Degraded=true`。
- **降级**：if 删除，只保留第一个出口（「是」，与引擎 `ifPorts` 一致）的下游，上游直连过去；pf / 未知类型删除，所有入边上游 × 所有正常出边下游直连；失败分支边删除；不兼容的边删除。**删边后一个节点的入边全没了**（且至少一条是被降级删掉的），这个节点也删除，并级联往下（例：只挂在失败分支上的 error 终点）。每删一个节点记一条 note，并列进 `Result.Removed`。
- **执行者**：data 的模型模式今天**一律走 llm**（`executorFor`），所以迁成 ai 时 `exec.kind=platform`，就算节点上有 `agent` 也是（`agent` 放进 `params.legacy_agent_uid`，记 note）。lead / step / skill：`params.executor` 优先，其次 `agent`（→ org_agent），都没有 → platform。`params.model / provider / temperature / executor` 移进 `exec`，不再留在 params。`executor.materialized` 的 `botId / botUid` 改写成 `bot_id / bot_uid`。
- **资源**：1.1 的 `skills[]` / `connectors[]` **全部**移进 `params.legacy_skills` / `params.legacy_connectors`（三环境盘点里没有一个是市场目录 id），2.0 的两个数组迁移后为空。
- **非 ai 节点上 2.0 不允许的节点级字段**（`agent`、`owner`、`workspace`、`session_key`、`timeout_sec`、`queue_timeout_sec`、非空的 `prompts` / `selfcheck`）移进 `params.legacy_<字段名>`；空值直接丢。`refs` 非空时进 `params.legacy_refs`。未知节点级键（盘点见过 `demo`）原样保留。
- **data**：`mode=static|passthrough` → 没有附件时 `text`（static，`content` 原样）；有附件时 `file`（`source=static, mode=static`）。模型模式 → 有附件时 `file`（`mode=read`，**行为变化**，记 note）；没有附件时 ai（platform，prompts 原样；`p2` 为空且 `content` 非空时 `p2=content`）。static 的 data 今天不读上游，所以它的入边删除（盘点：入边全部来自 trigger）。
- **ai 的附件**：`attachments[]` 里扩展名是 jpg / jpeg / png / gif / webp / bmp 的进 `<id>__img`（image），其余（包括没有扩展名的 `drive://38`）进 `<id>__att`（file），连到宿主的 `attach`。
- **边**：旧 id 保留；没有 id 的边编号 `em_<n>`；直连产生的边编号 `eb_<n>`；运行时文本卡 / 附件卡的边用 `<旧边id>__rt<n>`、`<节点id>__att_e` / `__img_e`。按目标节点挑**第一个类型兼容**的入口（ai：text→material、file/image→attach；sign→content；result→in）；同一对端口重复的边只留第一条。`edge.type` 写出口类型。出边从 done / error 出发的（1.1 只是 warn）删除并记 note。
- **坐标**：节点 x / y 原样；`ui.groups` 删除，其余 `ui` 键保留；运行时文本卡放在原 trigger 位置往下每个 +120；附件卡放在宿主左下（x−40，y+160）。最后按节点顺序消重：和前面某张卡坐标**完全相同**的，往右 +260 直到不重叠（分组卡里成员常常同坐标）。
- **运行快照**（`Snapshot=true`）：规则同上，自动降级；`Result.Synth` 列出合成的源头节点（`rt_<n>` 带 key，`__att` / `__img` 带附件），B5 对**非终态**运行据此补 `relay_node_exec` 行。终态判断：`succeeded / failed / stopped / rejected`（`graph2.RunStatusTerminal`）。

---

## 13. JSON 示例

### 13.1 新建流程：群消息 + 运行时文本 → AI（组织AI，挂技能）→ 签字 → 发到群 / 存网盘 / 流程结果

```json
{
  "schema": "e2s-relay/2.0",
  "name": "销售周报",
  "space_id": "sp_1",
  "nodes": [
    { "id": "n_msg", "kind": "group_messages", "name": "销售一部群消息", "x": 40, "y": 60,
      "params": { "group_no": "g_sales1", "range": "7d", "limit": 200, "only_at_me": false },
      "inputs": [], "outputs": [ { "id": "out", "name": "消息", "types": ["msg"], "locked": true } ],
      "skills": [], "connectors": [], "attachments": [] },
    { "id": "n_focus", "kind": "text", "name": "本周重点", "x": 40, "y": 220,
      "params": { "source": "runtime", "key": "focus", "label": "本周重点", "required": true, "content": "" },
      "inputs": [], "outputs": [ { "id": "out", "name": "内容", "types": ["text"], "locked": true } ],
      "skills": [], "connectors": [], "attachments": [] },
    { "id": "n_data", "kind": "file", "name": "上周销售数据", "x": 40, "y": 380,
      "params": { "source": "static", "mode": "read" },
      "inputs": [], "outputs": [ { "id": "out", "name": "文件", "types": ["file"], "locked": true } ],
      "skills": [], "connectors": [], "attachments": ["drive://9001"] },
    { "id": "n_ai", "kind": "ai", "name": "周报助手", "x": 340, "y": 200,
      "params": {},
      "exec": { "kind": "org_agent", "ref": "robot_zb01", "name": "周报助手", "bot_uid": "28myzb01_bot" },
      "prompts": { "p1": "你是销售运营助理。", "p2": "结合 {{群聊}} 和本周重点「{{重点}}」，读附件里的数据，写本周周报。", "p3": "Markdown 周报正文" },
      "inputs": [
        { "id": "material", "name": "群聊", "types": ["text", "msg"], "required": false, "locked": true, "redoMax": 1 },
        { "id": "attach", "name": "附件", "types": ["file", "image"], "required": false, "locked": true },
        { "id": "in_k3f9", "name": "重点", "types": ["text"], "required": true, "locked": false }
      ],
      "outputs": [ { "id": "result", "name": "结果", "types": ["text"], "locked": true } ],
      "skills": ["sk_zb"], "connectors": [], "attachments": [], "timeout_sec": 600 },
    { "id": "n_sign", "kind": "sign", "name": "王磊确认", "x": 640, "y": 200,
      "params": { "content": "确认周报内容无误后签字" },
      "gate": { "signer_uid": "u_wl", "signer_name": "王磊", "ttl_hours": 24, "require_conclusion": true },
      "inputs": [ { "id": "content", "name": "待签内容", "types": ["text", "file", "image"], "required": true, "locked": true } ],
      "outputs": [ { "id": "approved", "name": "通过", "types": ["text"], "locked": true },
                   { "id": "rejected", "name": "驳回", "types": ["text"], "locked": true } ],
      "skills": [], "connectors": [], "attachments": [] },
    { "id": "n_send", "kind": "group_send", "name": "发到产品周会群", "x": 940, "y": 100,
      "params": { "group_no": "g_pm", "title": "本周周报 {{日期}}", "text": "" },
      "inputs": [ { "id": "body", "name": "正文", "types": ["text", "msg"], "required": true, "locked": true } ],
      "outputs": [], "skills": [], "connectors": [], "attachments": [] },
    { "id": "n_save", "kind": "drive_save", "name": "存周报", "x": 940, "y": 260,
      "params": { "drive_space_id": "ds_7", "folder_id": "f_88", "folder_path": "我的网盘 / 周报归档", "filename": "{{流程名}}-{{日期}}.md", "on_conflict": "rename" },
      "inputs": [ { "id": "content", "name": "内容", "types": ["file", "image", "text"], "required": true, "locked": true } ],
      "outputs": [ { "id": "saved", "name": "已存文件", "types": ["file"], "locked": true } ],
      "skills": [], "connectors": [], "attachments": [] },
    { "id": "n_res", "kind": "result", "name": "流程结果", "x": 1240, "y": 200,
      "params": { "outcome": "success", "close_when": "签字通过后结束" },
      "inputs": [ { "id": "in", "name": "结果", "types": ["text", "image", "file", "msg"], "required": true, "locked": true },
                  { "id": "in_f2", "name": "归档文件", "types": ["file"], "required": false, "locked": false } ],
      "outputs": [], "skills": [], "connectors": [], "attachments": [] }
  ],
  "edges": [
    { "id": "e1", "from": "n_msg",   "fromPort": "out",      "to": "n_ai",   "toPort": "material", "type": "msg" },
    { "id": "e2", "from": "n_focus", "fromPort": "out",      "to": "n_ai",   "toPort": "in_k3f9",  "type": "text" },
    { "id": "e3", "from": "n_data",  "fromPort": "out",      "to": "n_ai",   "toPort": "attach",   "type": "file" },
    { "id": "e4", "from": "n_ai",    "fromPort": "result",   "to": "n_sign", "toPort": "content",  "type": "text" },
    { "id": "e5", "from": "n_sign",  "fromPort": "approved", "to": "n_send", "toPort": "body",     "type": "text" },
    { "id": "e6", "from": "n_sign",  "fromPort": "approved", "to": "n_save", "toPort": "content",  "type": "text" },
    { "id": "e7", "from": "n_sign",  "fromPort": "approved", "to": "n_res",  "toPort": "in",       "type": "text" },
    { "id": "e8", "from": "n_save",  "fromPort": "saved",    "to": "n_res",  "toPort": "in_f2",    "type": "file" }
  ]
}
```

启动：`POST /runs {"payload": {"focus": "华南区回款"}}`。少了 `focus` 时回 422 `payload_missing`。

### 13.2 多输出 AI（专家）+ 驳回口

```json
{
  "id": "n_review", "kind": "ai", "name": "法务顾问", "x": 300, "y": 100, "params": {},
  "exec": { "kind": "expert", "ref": "exp_legal", "name": "法务顾问",
            "runtime": { "id": "rt_dev_cloud", "name": "研发云主机 · OpenClaw" },
            "instructions": "你是企业法务，措辞严谨，只依据条款原文判断。" },
  "prompts": { "p2": "审阅 {{合同}}，按出口要求分别产出。" },
  "inputs": [ { "id": "material", "name": "合同", "types": ["text", "msg"], "locked": true },
              { "id": "attach", "name": "附件", "types": ["file", "image"], "locked": true } ],
  "outputs": [ { "id": "result", "name": "结果", "types": ["text"], "locked": true, "prompt": "一句话结论" },
               { "id": "out_risk", "name": "风险清单", "types": ["text"], "locked": false, "prompt": "逐条列出付款、违约、保密风险" },
               { "id": "out_doc", "name": "修改稿", "types": ["file"], "locked": false, "prompt": "带修订的合同文件" } ],
  "skills": ["sk_contract_lib"], "connectors": [], "attachments": []
}
```

AI 回执里的 JSON：

```json
{ "结果": "有 2 处高风险条款", "风险清单": "1. 付款…\n2. 违约…", "修改稿": [ { "ref": "drive://9132", "name": "合同-修订.docx" } ] }
```

存储（`relay_node_exec.output`）：

```json
{ "text": "{…原始…}",
  "ports": { "result": { "text": "有 2 处高风险条款" },
             "out_risk": { "text": "1. 付款…\n2. 违约…" },
             "out_doc": { "files": [ { "ref": "drive://9132", "name": "合同-修订.docx", "kind": "file" } ] } } }
```

驳回分支的边：`{ "from": "n_sign", "fromPort": "rejected", "to": "n_rewrite", "toPort": "material", "type": "text" }`。

### 13.3 迁移后的 builtin 流程片段（prod 典型：trigger 无必填 → 资料 → 平台模型 → 签字）

```json
{
  "schema": "e2s-relay/2.0",
  "migration": { "builtin": { "…": "原样" },
                 "atoms": { "batch": "atoms-20261101-01", "from_schema": "e2s-relay/1.1", "at_ms": 1761900000000, "notes": [], "degraded": false } },
  "nodes": [
    { "id": "d1", "kind": "text", "name": "资料", "params": { "source": "static", "content": "…", "mode": "static" },
      "inputs": [], "outputs": [ { "id": "out", "name": "内容", "types": ["text"], "locked": true } ] },
    { "id": "s1", "kind": "ai", "name": "起草", "exec": { "kind": "platform" },
      "prompts": { "p2": "…" }, "params": { "legacy_refs": [] },
      "inputs": [ { "id": "material", "name": "素材", "types": ["text", "msg"], "locked": true },
                  { "id": "attach", "name": "附件", "types": ["file", "image"], "locked": true } ],
      "outputs": [ { "id": "result", "name": "结果", "types": ["text"], "locked": true } ] },
    { "id": "w1", "kind": "sign", "name": "确认", "gate": { "signer_uid": "…", "ttl_hours": 24 },
      "inputs": [ { "id": "content", "name": "待签内容", "types": ["text", "file", "image"], "required": true, "locked": true } ],
      "outputs": [ { "id": "approved", "name": "通过", "types": ["text"], "locked": true },
                   { "id": "rejected", "name": "驳回", "types": ["text"], "locked": true } ] }
  ],
  "edges": [
    { "id": "e1", "from": "d1", "fromPort": "out",    "to": "s1", "toPort": "material", "type": "text" },
    { "id": "e2", "from": "s1", "fromPort": "result", "to": "w1", "toPort": "content",  "type": "text" }
  ]
}
```

（示例省略了 `x` / `y` / `skills` / `connectors` / `attachments` 这些空字段。实际存储里这几个数组总是写出来，空就写 `[]`。）

---

## 14. 卡片模板（原型 v3：资源 › 模板）

原型：`atoms-prototype-v3/index.html`，截图 `v3-01…v3-06`；计划 v2「v3 变更：卡片模板」。选中卡片 → 浮动工具条「存为模板」，把**这一张卡**存进「资源 › 模板」，以后点一下 / 拖到画布就生成一张同样的卡。整条流程的模板（「公司流程」）和卡片模板放在同一张 `relay_line` 表，用 `kind` 区分。

### 14.1 存什么、不存什么

| 存（模板文档里那一个节点） | 不存 |
|---|---|
| `kind`、`name`、`atom`；ai 的 `exec`（kind / ref / name / model / provider / temperature / instructions / runtime）、`prompts`、`selfcheck`、`timeout_sec` / `queue_timeout_sec` | 连线（`edges` 恒为 `[]`）——生成的卡连线要自己接 |
| 全部端口（系统口 + 自定义口，含 `name` / `types` / `required` / `prompt` / `redo*`） | 运行时填的值（只存「运行时填写」的设置：`source / key / label / required` 和默认 `content`；值只在 `POST /runs` 的 payload 里） |
| `params`（预填参数：群、文件夹、文件名模板、签字说明…；未知键原样存） | 运行记录、产出结果 |
| 挂载的资源 `skills[]`、`connectors[]` | `x` / `y`（置 0）、所在流程；`session_key`；ai 的 `exec.materialized`，以及 agent / expert 的 `exec.bot_uid`（临时 bot 跟人跟节点走，生成卡后重新物化） |
| sign 的 `gate`（签字人、方式、时限、方案）；image / file 的 `attachments`（运行时仍按**发起人身份**鉴权） | |

### 14.2 存储：复用 `relay_line`（加法，不新建表）

前端已有先例（e2s-web `canvas/nodeTemplates.ts` 的「岗位模板」= 只含一个节点、`template.kind:"node"` 的 relay_line），B5 迁移工具本来就要把 `relay_line.doc` 转成 2.0，卡片模板跟着一起转。补 4 列：

```sql
-- relay-2026xxxx-NN-line-kind.sql（加法，可重复执行；COLLATE 与 relay_graph 一致）
ALTER TABLE relay_line
  ADD COLUMN kind        VARCHAR(16)  NOT NULL DEFAULT 'flow'  COMMENT 'flow | card',
  ADD COLUMN visibility  VARCHAR(16)  NOT NULL DEFAULT 'space' COMMENT 'private(我的) | space(公司)',
  ADD COLUMN description VARCHAR(200) NOT NULL DEFAULT '',
  ADD COLUMN updated_by  VARCHAR(64)  NOT NULL DEFAULT '',
  ADD KEY idx_relay_line_kind (space_id, kind, updated_at_ms);
UPDATE relay_line SET kind = 'card'
 WHERE JSON_UNQUOTE(JSON_EXTRACT(doc, '$.template.kind')) = 'node';   -- 现有岗位模板回填
```

卡片模板的 `doc`（形状和岗位模板兼容）：

```json
{ "schema": "e2s-relay/2.0", "name": "周报助手（含周报生成技能）",
  "nodes": [ { "id": "n1", "kind": "ai", "x": 0, "y": 0, "exec": {"kind": "org_agent", "ref": "robot_zb01", "bot_uid": "28myzb01_bot"},
               "inputs": [ … ], "outputs": [ … ], "params": { … }, "prompts": { … },
               "skills": ["sk_zb"], "connectors": ["cn_fs"], "attachments": [] } ],
  "edges": [], "template": { "kind": "node" } }
```

纯函数（B1 已实现，`R/internal/graph2/template.go`）：`CardTemplateDoc(node, name) (*Doc, []Issue)` 按 §14.1 剥字段、节点 id 固定 `n1`、过节点自身校验（`ValidateNode`：§11 里不涉及边的规则）；`ValidateCardTemplate(doc)`：恰好 1 个节点、`edges` 为空、`template.kind="node"`（违反报 err `tpl_not_single_card`）+ `ValidateNode`；`IsCardTemplate(doc)`；`Instantiate(tplNode, newID, x, y, tplNo, usedKeys)`：深拷贝、换节点 id 和坐标，**端口 id 原样保留**（系统口 id 有语义：`approved / rejected / result`…；口 id 只在节点内唯一，不用换），运行时卡的 `params.key` 和图里已有的重复时自动加后缀 `_2`、`_3`…，`atom.tpl = <line_no>`（抽屉显示「来自模板『…』」，引擎不读）。之后改卡不影响模板，删模板也不影响已生成的卡。

### 14.3 归属与权限（我的 / 公司）

| visibility | 面板分组 | 谁能看、能用 | 谁能新建 | 谁能改名 / 删除 |
|---|---|---|---|---|
| `private` | 我的模板 | 只有创建人 | space 成员 | 创建人 |
| `space` | 公司模板 · 组织内都能用 | 该 space 全部成员 | space 成员 | **创建人**（别人的公司模板 ⋯ 菜单置灰，「只有创建人能改」） |

- 名称 1–40 字（去首尾空白），说明 ≤ 80 字；**同一范围内不重名**（`private` 按「创建人 + space」，`space` 按 space），重名回 409 `tpl_name_dup`，文案「我的模板里已经有「…」，换个名字」/「公司模板里已经有「…」，换个名字」。
- 存成公司模板而卡上带群（group_messages / group_send）时，前端黄条「群按使用人列出：同事不在这个群时要重新选」。运行时照 §4.5 再校验成员身份；「检查」对不在的群报 err。
- 技能 / 连接器：生成卡片时走和拖资源一样的 `addCatalogPicks` / claim；没授权的连接器「检查」里提醒（运行时 `connector_not_available`）。
- 「只有管理员能发布公司模板」**本期不做**：需要 e2s-server verify 在 Principal 里带回空间角色（`internal/e2sclient/verify.go` 现在没有角色字段），约 +1 人天，待丁明定。

### 14.4 接口（`modules/graphapi`，都是加法；后端能力线 [先]）

| 接口 | 变化 |
|---|---|
| `POST /lines` | 新增可选 `kind`（默认 `flow`）、`visibility`（默认 `space`）、`description`。`kind=card` 时：文档过 `ValidateCardTemplate`（err → 422 `{code:"tpl_invalid", issues}`），x / y 置 0；重名 → 409 `tpl_name_dup` |
| `GET /lines?kind=card\|flow` | 按 kind 过滤；`private` 只返回 `created_by = 我`。每行多返回 `kind / visibility / description / created_by / mine`；`kind=card` 再带从 doc 算出的 `card` 摘要 `{atom_kind, exec_kind, in_types[], out_types[], skills, connectors}`（去掉前端逐个 `GET /lines/{no}` 的 N+1） |
| `PATCH /lines/{no}` | 新增，`{name?, description?}`（改名 / 改说明，不改 doc、不改 visibility）；只有创建人；写 `updated_by / updated_at_ms`；重名 409 |
| `DELETE /lines/{no}` | `kind=card` 时只有创建人能删（整图模板沿用现在的 `admitRow` 规则） |
| `GET /lines/{no}` | 不变（返回 `{name, graph}`） |
| 生成卡片 | **不加接口**：前端 `GET /lines/{no}` 拿到模板，用与 `Instantiate` 同规则的 `instantiateCardTemplate` 放进画布，走正常保存（CAS）路径 |

前端：「公司流程」改成 `GET /lines?kind=flow`，资源 › 模板用 `GET /lines?kind=card`。bot 接口（FlowSpec）本期不开放模板。

---

## 15. 流程可见性：机器人新建默认私有（拍板）

- 经 bot 接口（`R/modules/botapi` 的 `POST /projects/from-spec` 等）**新建**的流程：`relay_graph.visibility = "private"`，`space_role` 取默认值。创建它的身份（`created_by`，代人发起时为被代表的人，规则不变）是 owner，其他人按 `graph-acl.md` 分享后才能看到（「按需分享」）。
- 人在编辑器里新建（graphapi `POST /graphs`）保持 `graph-acl.md` 的默认（缺省 `space`）。
- 存量图不改可见性（迁移工具不碰 `visibility`）。
- 纯函数 `graph2.DefaultVisibility(byBot bool)`：bot → `private`，人 → `space`。B4 在 botapi 建图时写这一列（今天的 INSERT 没写，落的是列默认 `space`）。

## 16. 变更记录

| 日期 | 改动 |
|---|---|
| 2026-10-18 | 初版（B0）。相对计划 §1 有三处调整：①端口用 `types[]` + `locked` + `required`（来自追加段），取代 `Type` + `Accept`；②签字驳回走 `fromPort="rejected"` 的普通边，取消计划草案里的 `edge.on`；③`drive_save.on_conflict` 由 `version` 改为 `rename`（drive 没有版本模型）。另外，边按**端口 id** 绑定（追加段原话是「边绑端口名」），这样改名不会断线；口名用于 `{{}}` 引用和多输出的 JSON 键 |
| 2026-10-18 | 定稿并合入 main（丁明 ~02:10 拍板）。新增：§12.1 D1–D5 拍板；§12.2 转换细则（B1 实现时补齐：data 模型模式一律 platform、skills/connectors 全进 legacy、降级后孤立节点级联删除、非 ai 节点级字段进 legacy、坐标消重）；§14 卡片模板（原型 v3；复用 `relay_line` 加 kind / visibility / description / updated_by 四列，`/lines` 加法接口，与计划 v2「v3 变更」一致）；§15 机器人新建流程默认私有。修正：sign 落地默认值去掉 `sign_mode:"any"`（1.1 只认 both / assignee）。新增校验码 `exec_kind_invalid`、`runtime_key_invalid`、`tpl_not_single_card`；`edge_port_missing` 也覆盖节点不存在；`param_range` 明确覆盖枚举和 1.1 的数值界限。2.0 代码包名定为 `R/internal/graph2`（`internal/graph` 留给 1.1 引擎，B2 切换后删除） |
| 2026-10-18 | B2 引擎实现时的落地口径（分支 `xiaoa/atoms-b2-engine-20261018`）：① 保存不拦 err（编辑器会自动保存半成品，和 1.1 一样），**运行**拦 err；写接口收到非 2.0（含没写 schema）一律 409 `schema_outdated`。② PF 型原子（群消息 / 发到群 / 存网盘）的能力没注册时，启动运行回 422 `pf_unavailable`（B3b / B3c 上线后自动可用）。③ agent / expert 执行者没有物化出 bot（没有 `bot_uid`、`materialized.bot_uid`）时，节点报 `exec_materialize_failed`；引擎本身不做物化（仍由编辑器 `materializeNodeExecutor` 做）。④ bot 回执契约不变（`output.text` 必须是字符串）：多输出的 JSON 放在 `output.text` 里（也可带围栏），即 §7.5「含 JSON 的文本」那一种。⑤ llm 多输出暂不发 `response_format`（只靠 prompt 约束 + 宽松解析 + 重试）。⑥ 1.1 的 ledger / notify / 演示 PF、if / merge / 失败分支执行逻辑随节点类型删除 |
