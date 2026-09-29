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

```yaml
- id: grafana-plugin
  name: dsh-grafana-plugin
  config:
    url: http://localhost:3000          # 必填,Grafana 基地址
    token: !!js process.env.GRAFANA_TOKEN  # 服务账号 token,留空则匿名
    timeoutMs: 30000                     # 单次请求超时(毫秒)
    categories: [dashboards, prometheus, loki, alerting]  # 启用的工具类别
```

## 安装

```sh
# 构建(Windows,Node 22+)
powershell -ExecutionPolicy Bypass -File scripts/build.ps1

# 安装进 profile
dsh plugin --profile web add file:<本目录绝对路径>

# 重新构建后同步
python scripts/sync_profile.py web
```

## 测试

```sh
node tests/e2e.mjs   # 19 项断言,起本地 mock Grafana,无需真实实例
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
├── index.ts             # apply 入口:Config schema + 按类别注册工具 + systemPrompt
├── client.ts            # Grafana HTTP 客户端(可注入 fetch、Bearer token、超时)
├── tools-dashboard.ts   # 仪表盘/文件夹/数据源
├── tools-prometheus.ts  # PromQL 查询与发现
├── tools-loki.ts        # LogQL 查询与发现
└── tools-alerting.ts    # 告警规则只读
tests/
├── mock-server.mjs      # 本地 mock Grafana HTTP 服务
└── e2e.mjs              # 端到端断言
```
