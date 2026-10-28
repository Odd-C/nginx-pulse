# Nginx 网站流量监控系统开发清单 (TODO)

> **技术栈**：React (Vite) + FastAPI (Python) + SQLite  
> **数据源**：Nginx Access Log（实时增量监听 + 历史日志导入）

---

## Phase 1: 项目初始化与数据库设计 (SQLite)

- [x] **1.1 目录结构初始化**
  - [x] 创建 `backend/`（FastAPI + SQLite3 + Pydantic）
  - [x] 创建 `frontend/`（React 18 + Vite + TypeScript + Tailwind CSS + Lucide Icons）
- [x] **1.2 SQLite 性能与并发配置**
  - [x] 开启 `PRAGMA journal_mode=WAL;`（支持读写并发，防止日志高频写入阻塞前端查询）
  - [x] 配置 `PRAGMA synchronous=NORMAL;` 与 64MB `cache_size`
- [x] **1.3 数据库表结构设计**
  - [x] `sites`（站点与日志源配置表：`id`, `name`, `domain`, `log_path`, `log_format`, `last_inode`, `last_offset` 等）
  - [x] `access_logs`（访问日志明细表：`timestamp`, `ts_epoch`, `remote_addr`, `country`, `region`, `city`, `method`, `path`, `status`, `bytes_sent`, `request_time`, `referer_domain`, `browser`, `os`, `device_type`, `is_bot`, `is_static`）
  - [x] **索引设计**：在 `(site_id, ts_epoch DESC)`、`(site_id, status, ts_epoch)`、`(site_id, remote_addr, ts_epoch)`、`(site_id, path, ts_epoch)` 上建立复合索引

---

## Phase 2: Nginx 日志解析与增量采集引擎 (Backend Core)

- [x] **2.1 日志格式解析器 (`backend/parser.py`)**
  - [x] 支持 Nginx 默认与扩展 `combined` 格式正则解析（含 `$request_time`）
  - [x] 支持 Nginx `JSON` 格式日志解析
  - [x] 支持用户自定义正则表达式与字段映射测试
- [x] **2.2 数据清洗与信息增强 (`backend/enricher.py`)**
  - [x] **IP 归属地解析**：内置离线 CIDR 归属地字典 + 毫秒级省市解析（含 LRU 缓存）
  - [x] **User-Agent 解析**：提取 OS、浏览器、终端类型，自动标记爬虫（Baiduspider、Googlebot、Bytespider、AhrefsBot、安全扫描器等）
  - [x] **URL 规范化**：分离 `path` 与 `query_string`，自动标记静态资源 `is_static`
- [x] **2.3 增量文件监听器 (`backend/tailer.py`)**
  - [x] 后台异步任务定期读取新增日志行（基于文件 `inode` 和 `byte_offset`）
  - [x] **Logrotate 兼容**：检测文件 `inode` 变化或文件大小缩水，自动重置游标
  - [x] **批量事务写入（Batch Insert）**：每 1000 条批量事务写入 SQLite
- [x] **2.4 历史日志导入器**
  - [x] 支持通过前端上传 `.log` / `.log.gz` 压缩日志直接解析入库

---

## Phase 3: 后端统计与管理 API (FastAPI)

- [x] **3.1 核心概览指标接口 (`GET /api/sites/{id}/overview`)**
  - [x] 支持时间范围筛选（1h、24h、7d、30d、all）及过滤条件（排除静态资源、排除爬虫）
  - [x] 返回核心 KPI：总请求数 (Hits)、有效 PV、独立 IP (UV)、总带宽消耗、平均与 P95 响应耗时、4xx/5xx 错误率及环比涨跌幅
- [x] **3.2 时序趋势图接口 (`GET /api/sites/{id}/timeseries`)**
  - [x] 按时间桶聚合：Requests、PV、UV、流量带宽 (`bytes_sent`)、状态码分布 (`2xx/3xx/4xx/5xx`)
- [x] **3.3 多维排行榜接口 (`GET /api/sites/{id}/rankings`)**
  - [x] Top 受访页面排行、Top 慢接口排行、Top 4xx/5xx 异常请求排行
  - [x] Top 访客 IP 排行（含归属地、耗流、异常次数、Bot 标记）
  - [x] Top 来源域名 (Referer)、地域省市分布、浏览器 / OS / 终端设备占比
- [x] **3.4 实时日志检索接口 (`GET /api/sites/{id}/logs`)**
  - [x] 分页 + 多条件检索（按 IP、状态码段、URL/UA 关键字、请求方法过滤）
- [x] **3.5 站点与采集管理接口 (`/api/sites` & `/api/parser/test`)**
  - [x] 站点增删改查、手动增量/全量同步、实时模拟流量注入 (`/api/sites/{id}/simulate`)、正则解析测试沙盒

---

## Phase 4: 前端监控面板开发 (React + Vite)

- [x] **4.1 布局与全局过滤器 (`frontend/src/App.tsx`)**
  - [x] 顶栏站点切换器、时间范围选择器、快捷开关（过滤静态资源、过滤爬虫）、一键注入实时流量 (+200)
- [x] **4.2 数据可视化大盘页 (Overview)**
  - [x] 6 格机架式 KPI 卡片组（总请求数、有效 PV、独立 IP、出站带宽、平均/P95 耗时、4xx/5xx 异常率）
  - [x] 交互式时序脉冲图表 (`TelemetryChart.tsx`)：支持切换「请求与访客」「状态码分布」「带宽吞吐」三种模式
  - [x] 2x2 深度排行面板（热门/慢响应/异常路径切换、高频 IP 监控、省市地域分布、来源与客户端环境构成）
- [x] **4.3 实时日志检索页 (Log Explorer)**
  - [x] 响应式语义化固定表头表格，支持多维过滤与点击展开查看完整请求头/UA
- [x] **4.4 站点管理与日志解析调试台 (Ingestion & Sandbox)**
  - [x] 站点游标监控、上传 `.log/.gz` 文件、Nginx 日志正则实时解析预览器

---

## Phase 5: 部署与交付优化

- [x] **5.1 模拟日志生成器 (`scripts/mock_nginx_log.py`)**
  - [x] 生成逼真的多日 Nginx 访问日志并支持实时追加突发流量
- [x] **5.2 生产打包与部署**
  - [x] FastAPI 自动挂载 `frontend/dist` 静态产物，并提供 `Dockerfile`、`docker-compose.yml` 与 `start.ps1`
