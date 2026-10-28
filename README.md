# NGINX // PULSE — 轻量级网关访问流量监控系统

> 基于 **React (Vite) + FastAPI + SQLite (WAL)** 构建的 Nginx 访问日志实时解析、流量遥测与安全审计面板。无需在业务页面植入任何前端埋点脚本，直接通过监听或导入 Nginx `access.log` 即可完成全维度网站流量分析。

---

## 核心特性 (Features)

- **零侵入日志采集 (`tailer.py`)**
  - 后台异步协程按文件 `inode` 与 `byte_offset` 游标每隔 3 秒增量读取新日志，支持断点续读。
  - 自动感知 `logrotate` 日志切割或文件截断，无缝重置读取游标。
  - 支持在 Web 界面直接拖拽上传历史 `.log` 或 `.log.gz` 压缩文件进行离线回溯审计。
- **多格式解析与离线增强 (`parser.py` & `enricher.py`)**
  - 内置支持 Nginx 默认/扩展 `combined` 格式（含 `$request_time`）、`JSON` 格式及自定义 Python 命名分组正则。
  - **毫秒级离线 IP 归属地解析**：内置常见运营商与海外 CIDR 归属地字典 + `lru_cache` 内存缓存。
  - **客户端与爬虫识别**：自动提取操作系统、浏览器、设备类型（Desktop / Mobile / Tablet），精准标记搜索引擎蜘蛛（Googlebot、Baiduspider、Bytespider、Bingbot 等）与恶意扫描器（zgrab、sqlmap、nikto 等）。
  - **静态资源自动剥离**：自动区分业务页面/API 请求与 `.js/.css/.webp/.woff2` 等静态资源请求。
- **SQLite WAL 高并发存储 (`database.py`)**
  - 默认开启 `PRAGMA journal_mode=WAL` 与 64MB 页缓存，结合每批 1000 条事务批量写入（`executemany`），单机轻松应对百万级日志检索与聚合。
- **工业级遥测前端面板 (`React 18 + Vite + Tailwind CSS`)**
  - **流量遥测大盘 (Overview)**：6 格机架式 KPI 指标卡（含环比涨跌）+ 三模式交互式 SVG 脉冲时序图（请求与访客 PV/UV、HTTP 状态码分布、带宽吞吐）+ 2x2 多维排行榜（热门路径/慢响应耗时/4xx·5xx 异常路径、高频访客 IP、省市地域分布、来源域名与客户端构成）。
  - **日志明细检索 (Log Explorer)**：支持按状态码段（2xx/3xx/4xx/5xx）、HTTP 方法、访客 IP、URL/UA 关键字组合检索，点击任意行可展开完整请求头详情。
  - **日志源与正则沙盒 (Ingestion & Sandbox)**：实时查看各站点游标偏移量、一键触发增量/全量同步，内置交互式 Nginx 日志正则解析测试器。

---

## 目录结构

```text
nginx-pulse/
├── backend/
│   ├── main.py            # FastAPI 路由、统计聚合 API 与静态资源托管
│   ├── database.py        # SQLite WAL 初始化与连接管理
│   ├── parser.py          # Combined / JSON / 自定义正则日志解析器
│   ├── enricher.py        # 离线 IP 归属地、User-Agent、静态资源清洗增强
│   ├── tailer.py          # 增量文件游标监听、Logrotate 兼容与批量入库
│   └── requirements.txt   # Python 依赖清单
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # 主遥测控制台视图
│   │   ├── components/
│   │   │   ├── TelemetryChart.tsx     # 多模式 SVG 时序脉冲图组件
│   │   │   └── AddSiteModal.tsx       # 原生 <dialog> 新增监控站点弹窗
│   │   ├── types.ts                   # TypeScript 类型定义
│   │   └── utils.ts                   # 字节格式化与状态码样式工具
│   ├── package.json
│   └── vite.config.ts
├── scripts/
│   └── mock_nginx_log.py  # 仿真 Nginx 访问日志生成器（支持历史与实时突发流量）
├── Dockerfile
├── docker-compose.yml
├── start.ps1              # Windows PowerShell 一键启动脚本
└── todo.md                # 架构与开发里程碑清单
```

---

## 快速开始 (Quick Start)

### 方式一：本地直接运行

#### 1. 启动后端 (FastAPI)

```bash
cd backend
pip install -r requirements.txt
python main.py
```
> 首次启动时，若数据库为空，系统会自动调用 `scripts/mock_nginx_log.py` 生成 2,600 条逼真的多日 Nginx 访问日志并完成入库。后端默认运行在 `http://127.0.0.1:8090`。

#### 2. 启动前端开发服务器（或构建生产包）

```bash
cd frontend
npm install
npm run dev      # 开发模式：http://127.0.0.1:5173
# 或执行 npm run build，构建产物将由 FastAPI 在 http://127.0.0.1:8090 直接托管
```

### 方式二：Docker Compose 部署

```bash
docker compose up -d --build
```
默认将宿主机 `/var/log/nginx` 只读挂载至容器内 `/var/log/nginx:ro`，浏览器访问 `http://localhost:8090` 即可添加站点并监控宿主机上的 Nginx 日志。

---

## 核心 API 端点一览

| 方法 | 路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/api/sites` | 获取所有监控站点及日志文件状态、已入库行数与读取游标 |
| `POST` | `/api/sites` | 新增监控站点并立即触发首次日志扫描 |
| `POST` | `/api/sites/{id}/sync` | 手动触发增量同步（传 `?reset=true` 可重置游标全量重扫） |
| `POST` | `/api/sites/{id}/simulate` | 向站点日志追加仿真访问流量并立即增量入库（用于联调演示） |
| `POST` | `/api/sites/{id}/upload` | 上传历史 `.log` 或 `.log.gz` 日志文件解析入库 |
| `POST` | `/api/parser/test` | 在线测试单行 Nginx 日志的正则匹配与字段清洗结果 |
| `GET` | `/api/sites/{id}/overview` | 获取指定时间范围核心 KPI（PV、UV、带宽、P95 耗时、错误率及环比） |
| `GET` | `/api/sites/{id}/timeseries` | 获取分桶时序趋势数据（Requests、PV、UV、Bytes、状态码分布） |
| `GET` | `/api/sites/{id}/rankings` | 获取热门路径、慢接口、异常路径、高频 IP、地域、来源与终端排行 |
| `GET` | `/api/sites/{id}/logs` | 多条件分页检索访问日志明细 |

---

## License

MIT
