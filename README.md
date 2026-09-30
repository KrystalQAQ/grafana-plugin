# dsh-grafana-plugin

Grafana 集成的 dsh 插件 —— 用轻量的原生工具替代重型 Grafana MCP server。

## 特性

- **按类别裁剪的工具面**:通过 `categories` 配置只注册需要的工具组,避免 130+ 工具塞爆模型上下文
- **Service Account Token 认证**(Grafana 9.0+),无需跑独立 MCP 进程
- **每工具一职责**,工具名统一 `grafana_` 前缀,参数描述完整
- **内置 systemPrompt 注入**,教模型"先查数据源 uid → 再查询"的标准调用链

## 工具清单(11 个)

| 类别 | 工具 | 说明 |
| --- | --- | --- |
| dashboards | `grafana_search_dashboards` | 按关键词/标签/文件夹/星标搜索仪表盘 |
| dashboards | `grafana_get_dashboard` | 获取仪表盘(summary 省 token / panels 带查询 / full 完整 JSON) |
| dashboards | `grafana_list_datasources` | 列出数据源(查询前先拿 uid) |
| dashboards | `grafana_search_folders` | 搜索文件夹 |
| prometheus | `grafana_query_prometheus` | PromQL instant/range 查询 |
| prometheus | `grafana_list_prometheus_metrics` | 指标名发现(正则过滤) |
| prometheus | `grafana_list_prometheus_labels` | 标签名/标签值发现 |
| loki | `grafana_query_loki` | LogQL 日志/指标查询 |
| loki | `grafana_list_loki_labels` | Loki 标签名/标签值 |
| alerting | `grafana_list_alert_rules` | 告警规则列表(可按 firing 状态过滤) |
| alerting | `grafana_get_alert_rule` | 单条告警规则完整定义 |

## 配置

在 profile 的 patch 里挂**一行**即可——这一行同时承载宿主工具与设置面板：

```yaml
- id: grafana-plugin
  name: dsh-grafana-plugin
  config:
    url: http://localhost:3000          # 必填,Grafana 基地址
    token: glsa_xxx                     # 服务账号 token,留空则匿名
    timeoutMs: 30000                    # 单次请求超时(毫秒)
    categories: [dashboards, prometheus, loki, alerting]  # 启用的工具类别
```

> **不要为浏览器半侧再挂一行。** 客户端模块系统只把包的下半侧挂到
> **解析到包根**的那一行上（`exactPackageSpecifier`）；写 `dsh-grafana-plugin/client-host`
> 这类子路径的行解析不到包根，会被判定为"非客户端行"，且该子路径不在 `exports` 里，
> 于是加载直接失败（`failed to import`）并让整个 profile 少一项激活。宿主半侧
> `lib/index.js` 与浏览器半侧 `lib/client.js` 都由这一行带动。

## 设置面板

配置字段全部声明为 **volatile**，因此可以在 Web 界面直接改，不用编辑 YAML 也不用重启：

**侧栏 → 插件 → Grafana**（Official 分组）打开卡片，填 Grafana 地址 / token /
超时，点保存。写入落在设置文档的 user 层，覆盖 patch 里的 composed 默认值；保存后
`loader/volatile-update` 会就地重建工具集（先注销旧注册再注册新的），无需重载页面。

- token 声明为 `role('secret')`：字面量不进表单响应，卡片只显示"已配置/未配置"，留空
  表示保持当前值不变。
- `categories` 目前只能通过 YAML 调整（面板暂未提供多选控件）。
- 卡片只在 Host 服务 `grafana-plugin` 命名空间期间存在（`configForms.whileServed`），
  没有组合这个插件的部署看不到它。

## 安装

```sh
# 构建(Windows,Node 22+)：host 半侧 + client types + browser 半侧
powershell -ExecutionPolicy Bypass -File scripts/build.ps1

# 安装进 profile
dsh plugin --profile web add file:<本目录绝对路径>

# 重新构建后同步
python scripts/sync_profile.py web
```

## 测试

```sh
node tests/e2e.mjs          # 19 项断言(含 volatile 热更新),起本地 mock Grafana
node scripts/check-client.cjs  # 9 项浏览器 bundle 合约检查
node tests/live-check.mjs   # 真实实例冒烟(需 GRAFANA_TOKEN 环境变量)
```

## 与 Grafana MCP server 的取舍

| | 本插件 | grafana/mcp-grafana |
| --- | --- | --- |
| 运行形态 | dsh 原生插件,无独立进程 | 独立 MCP server + 桥接 |
| 工具面 | 11 个,按类别可裁剪 | 130+,需 --enabled-tools 筛 |
| 上下文成本 | 低(描述精炼) | 高 |
| 覆盖范围 | 核心只读查询 | 全量(含写入/Admin/OnCall/Sift 等) |
| 鉴权 | 一个 service account token | 同左 |

第一版刻意只做**只读查询**四类;写入类(update_dashboard、create_incident 等)按需再加类别。

## 结构

```
src/
├── index.ts                    # apply 入口:volatile Config + 按类别注册工具 + systemPrompt
├── client.ts                   # Grafana HTTP 客户端(可注入 fetch、Bearer token、超时)
├── tools-dashboard.ts          # 仪表盘/文件夹/数据源
├── tools-prometheus.ts         # PromQL 查询与发现
├── tools-loki.ts               # LogQL 查询与发现
├── tools-alerting.ts           # 告警规则只读
└── client/                     # 浏览器半侧(设置面板)
    ├── index.ts                # 注册 plugins.item slot + 字典
    ├── GrafanaCard.tsx         # 表单 UI(原生元素,不依赖 in-repo UI primitives)
    ├── grafana-card-controller.ts  # 暂存表单 + configForms 命名空间读写
    └── locales.ts              # 中英文案
scripts/
├── build.ps1                   # 一键:依赖 → host 半侧 → client types → browser 半侧
├── link_deps.py                # junction 链接宿主依赖(cordis/schemastery 必须指向 vendor)
├── sync_profile.py             # 把产物同步进已安装 profile
└── check-client.cjs            # 浏览器 bundle 合约检查
tests/
├── mock-server.mjs             # 本地 mock Grafana HTTP 服务
├── e2e.mjs                     # 19 项端到端断言
└── live-check.mjs              # 真实实例冒烟
tsconfig.json                   # host 半侧(Host 入口)
tsconfig.client.json            # 双入口编译 → lib/types/{index,client/index}.js
tsdown.node.config.ts           # host 半侧打包
tsdown.client.config.ts         # browser 半侧打包(ModuleLoader factory 包装)
```

### 为什么浏览器半侧不用 in-repo UI primitives

`@deepseek-ai/dsh-client-ui-primitives` 的 barrel 会连带导出 markdown/KaTeX 资源，
外部插件构建无法解析那串样式依赖（官方 `clientBundle` 预设也强制包必须位于
`deepseek-harness/packages/*` 下）。因此设置卡片用原生元素渲染、直接复用
`configForms` 服务契约与 `dsh-client-store`，产物仅 12 KB 且零样式依赖。
