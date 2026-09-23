# 适配说明：dsh-session-workbench → DSH 0.1.6-alpha.1

本目录是 `dsh-session-workbench@1.0.2`（上游 [PolinniZhong/dsh-session-workbench](https://github.com/PolinniZhong/dsh-session-workbench)，MIT）的本地适配版，
版本号 `1.0.3-dsh0.1.6.1`。适配目标：本机 `@deepseek-ai/dsh 0.1.6-alpha.1` + `web` profile。

上游自述基线是 DSH 0.1.2-rc.1，与 0.1.6 之间官方换了两轮客户端扩展面，因此需要以下改动。

## 1. 宿主侧：设置命名空间（**必须**，否则插件根本加载不了）

- **问题**：`lib/index.js` 原来 `import { settingsNamespace } from "@deepseek-ai/dsh-settings"`。
  0.1.6-alpha.1 的 `@deepseek-ai/dsh-settings` 只导出 `SettingsConflictError` / `SettingsProvider` / `redactSecrets`，
  **没有 `settingsNamespace`**。ESM 具名导出缺失 = `SyntaxError`，插件整行加载失败。
- **改法**：命名空间在 0.1.6 就是**普通字符串**（provider 内部用 `parseSettingsNamespace` 校验 `/^[a-z][a-z0-9-]*$/`），
  于是去掉该 import，改为 `const NS = "session-kb";`。
- **验证**：测试实例 `GET /session-kb/settings` → `200`。

## 2. 客户端声明：inject 表（去掉已删除的模块）

- **问题**：`dsh.client.inject` 里第一项是 `@deepseek-ai/dsh-client-runtime`。该包在 0.1.5 线已被官方移除
  （整个 0.1.6 安装树里只有两份 README 散文提到这个词，无任何代码；亦不在 shell 的静态模块种子表里）。
- **改法**：改为声明真实提供者
  `["@deepseek-ai/dsh-client-ui-renderer", "@deepseek-ai/dsh-client-ui-sidebar-right", "@deepseek-ai/dsh-client-locale", "@deepseek-ai/dsh-client-ui-conversation"]`。
  - `slots` 服务由 **`dsh-client-ui-renderer`** 提供（`super(ctx, "slots")`）；
  - 右侧栏由 **`dsh-client-ui-sidebar-right`** 提供（服务 `sidebarRight` / `sidebarRightTabs`）。
- **验证**：boot manifest 中该 entry 的 4 个 inject 目标全部可解析（无 dangling）。
- **重要更正（实测结论）**：这一项属于**卫生清理，不是修复**。实测把同样声明了
  `@deepseek-ai/dsh-client-runtime` 的 `dsh-notify` 装进测试 profile 后，应用**照常启动、无失败卡片**——
  说明 `dsh.client.inject` 里的**未知包名会被忽略**（它只是客户端 entry 的装配/排序提示），
  真正会让 entry 卡 `pending` 并拖垮 web boot 的是**代码级 `exports.inject` 里的 cordis 服务名**
  （本插件为 `["slots","locale"]`；这两个服务在 0.1.6 均由官方提供，所以本来就正常）。
  本插件在 0.1.6 上唯一真正的加载阻断是第 1 条（宿主侧 `settingsNamespace`）。

## 3. 客户端补入口：原生右侧栏 Tab（**完整两步注册**）

- **问题**：上游的侧边栏入口走第三方 `betterSidebar.registerTab`，本机**没装 dsh-better-sidebar**，
  于是插件实际只剩「设置 → 会话工作台」一个入口，搜索/召回面板进不去。
- **第一次改法不完整**：只把面板挂到 `sidebar.right.pane.tab`（`key = "session-kb"`），
  再在 `conversation.session.header.actions` 加按钮调用 `openTabIn(sessionId, "session-kb")`。
  官方右侧栏是**两步**：先 `ctx.sidebarRightTabs.register({ id, kind })`，再把 body/title
  挂到 keyed 座位，**key 必须是 definition.id**。缺第 1 步时 `openTabIn` 抛
  `sidebarRight: no tab type is registered as "session-kb"`，按钮把错误吞掉，看起来像
  会话左上角一块点不动的 UI。
- **现改法**（对齐官方 `dsh-client-ui-sidebar-files` / `-sidebar-terminal`）：
  - 类型：`ctx.sidebarRightTabs.register({ id: "dsh-session-workbench", kind: "session-kb", guide })`
    —— `openTab` 用 kind；右侧栏首页出现「会话库」卡片。
  - 面板：`sidebar.right.pane.tab` + `.title`，`key = "dsh-session-workbench"`（id，不是 kind）。
  - 一键入口：改挂 `conversation.session.header.utilities`（标题右侧工具区，和通知铃铛同排），
    无描边，点击 `openTabIn(sessionId, "session-kb")`。
  - `exports.inject` 加上 `sidebarRight` / `sidebarRightTabs`。
  - `betterSidebar` 那段仍保留为可选降级。
- **生效**：改了 `exports.inject`，需要**重启 `dsh web`**（只刷新页面不够）。

## 4. 依赖

- 去掉 `@deepseek-ai/dsh-settings`（第 1 条改完就不再 import 它）。
- `@deepseek-ai/schemastery` 提到 `^3.18.2`（与本机 3.18.2 对齐），并在**插件目录内**自带 `node_modules`
  （`pnpm install --prod`）——与本机 `dsh-turn-rail-pin` 同样的做法：`link:` 进来的插件无法从 profile 解析 `@deepseek-ai/*`。

## 5. 搜索功能的运行前提（profile 配置，非插件改动）

会话库搜索依赖官方 FTS 索引，而 web 模板默认是 **全关**：

```yaml
# <DSH_HOME>/profiles/<profile>/cordis.patch.yml
- id: session-query-sqlite
  config:
    path: '<DSH_HOME>/session-query.sqlite'   # 必须绝对路径
    openAt: startup
```

## 旧会话产物：已隔离（原为搜索阻断项）

搜索最初 100% 失败：

```
session-search persistence observation failed: subagent/descriptor 0 uses unsupported
descriptor version 2; source v0 artifact remains unchanged
(raw log: ...\sessions\--D-deepseek~0020harness~0020DSH~0020workspace--\06803415-...\session.jsonl.zstd)
```

- **根因**：`dsh-session-format-v0-to-v1/lib/index.js:1584`
  `if (event.type === "subagent/descriptor" && data["version"] !== 3) throw …`。
  这批会话是**旧版 DSH 写的 v0 产物**，内含 `subagent/descriptor` **v2**，而当前构建是 **v3**
  （`dsh-subagent/lib/types/descriptor.js`：`SUBAGENT_DESCRIPTOR_VERSION = 3`）。
- **为什么不去 patch 那一行**：该迁移**成功时会重写日志文件**（"source v0 artifact remains unchanged"
  的言下之意）。放宽校验等于用 v3 的语义改写 34 份 v2 历史，属于不可逆的数据风险，故不采用。
- **处置**：把当前构建**本来就读不了**的这批子代理会话移出 `sessions/` 树到
  `<DSH_HOME>/sessions-quarantine/`。它们全是 subagent 子会话（8/14「唐史考据助手」子任务、
  9/5「智能体集群」多智能体运行），不是用户本人的对话。
- **结果**：隔离 33 条；另有 1 条（`session-cc752152-…`）因会话正文里含一段"事件统计报告"文本
  被启发式误判，已还原。隔离前 228 个会话目录 → 隔离后 204 个。
- **可逆**：清单与还原脚本在插件目录 `quarantine/` 下
  （`quarantine/manifest.json` 记录逐条 from/to 与原会话标题；
  `node quarantine/restore.mjs` 原路移回，`--dry-run` 可先预演）。

## profile 配置：FTS 索引改为持久化

`<DSH_HOME>/profiles/web/cordis.patch.yml`（已备份为 `.bak-before-session-workbench`）：

```yaml
- id: session-query-sqlite
  config:
    path: '<DSH_HOME>/session-query.sqlite'   # 绝对路径，平台不展开 ~
    openAt: startup
```

- 原为 `':memory:'` + `first-search`：每次重启 dsh web 后第一次搜索要在内存里全量重建，
  期间**阻塞宿主进程**（界面卡住）。
- **代价**：索引落盘。本机语料实测索引约 **100 MB**（+ 同量级 WAL，关闭时 checkpoint），
  且首次启动要构建一次（分钟级）。若不想付这个成本，可改回 `openAt: first-search`
  （仍持久化、但推迟到首次搜索时构建）。

## 验证记录

| 项 | 结果 |
|---|---|
| 宿主半边加载 | ✅ 测试实例正常启动 |
| 客户端 boot（57 个 entry） | ✅ 无 `did not activate` / 失败卡片 |
| 插件 apply() 执行 | ✅ DOM 存在 `style[data-session-kb]` |
| 控制台异常 | ✅ 无 |
| `GET /session-kb/settings` | ✅ 200 `{"ok":true,"enabled":true,"scope":"all"}` |
| 原生右侧栏 Tab | ✅ DOM 中出现 `会话库` 标签 |
| 会话头部入口按钮 | ✅ `button[aria-label="会话库"]` |
| `GET /session-kb/search`「插件」 | ✅ 200，命中会话 + 片段 |
| 同上「剧情」/「Harness」/「MCP 配置」 | ✅ 均 200 且有命中 |
| 索引落盘 | ✅ `session-query-*.sqlite` 约 100 MB |

验证环境：`<DSH_HOME>/profiles/wbtest`（独立测试 profile，验证后已删除）。验证用的索引文件已删除。

## 回滚

```powershell
# 1) 还原被隔离的旧会话（先 --dry-run 预演）
node quarantine/restore.mjs --dry-run
node quarantine/restore.mjs
# 2) 卸载插件
dsh plugin --profile web remove dsh-session-workbench
# 3) 还原 profile 配置
Copy-Item "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml.bak-before-session-workbench" `
          "$env:USERPROFILE\.dsh\profiles\web\cordis.patch.yml" -Force
# 4) 重启 dsh web
```

