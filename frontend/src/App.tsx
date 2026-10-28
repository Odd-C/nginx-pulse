import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  FileCode2,
  Filter,
  Globe,
  HardDrive,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import {
  AccessLogItem,
  PaginatedLogs,
  Site,
  SiteOverview,
  SiteRankings,
  TimeRangeKey,
  TimeseriesPoint,
} from './types';
import { formatBytes, formatNumber, methodBadgeClass, statusBadgeClass } from './utils';
import { TelemetryChart } from './components/TelemetryChart';
import { AddSiteModal } from './components/AddSiteModal';

type ActiveTab = 'overview' | 'logs' | 'settings';
type PathRankTab = 'top' | 'slow' | 'errors';
type EnvRankTab = 'referers' | 'browsers' | 'os' | 'devices';

const DEFAULT_SAMPLE_LINE =
  '113.96.22.18 - - [28/Oct/2026:14:22:09 +0800] "GET /products/ai-gateway?from=github HTTP/1.1" 200 19840 "https://github.com/trending" "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36" 0.042';

export const App: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('7d');
  const [excludeStatic, setExcludeStatic] = useState<boolean>(false);
  const [excludeBots, setExcludeBots] = useState<boolean>(false);

  const [overview, setOverview] = useState<SiteOverview | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [rankings, setRankings] = useState<SiteRankings | null>(null);

  const [pathRankTab, setPathRankTab] = useState<PathRankTab>('top');
  const [envRankTab, setEnvRankTab] = useState<EnvRankTab>('referers');

  // Log Explorer state
  const [logsData, setLogsData] = useState<PaginatedLogs | null>(null);
  const [logPage, setLogPage] = useState<number>(1);
  const [logStatusClass, setLogStatusClass] = useState<string>('all');
  const [logMethod, setLogMethod] = useState<string>('all');
  const [logSearch, setLogSearch] = useState<string>('');
  const [logIp, setLogIp] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  // Actions & Modals
  const [isAddSiteOpen, setIsAddSiteOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  // Parser Tester state
  const [testLine, setTestLine] = useState<string>(DEFAULT_SAMPLE_LINE);
  const [testFormat, setTestFormat] = useState<'combined' | 'json' | 'custom'>('combined');
  const [testRegex, setTestRegex] = useState<string>('');
  const [testResult, setTestResult] = useState<any>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/sites');
      const data: Site[] = await res.json();
      setSites(data);
      if (data.length > 0 && selectedSiteId === null) {
        setSelectedSiteId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }, [selectedSiteId]);

  const fetchDashboard = useCallback(async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({
        range: timeRange,
        exclude_static: String(excludeStatic),
        exclude_bots: String(excludeBots),
      }).toString();

      const [ovRes, tsRes, rkRes] = await Promise.all([
        fetch(`/api/sites/${selectedSiteId}/overview?${q}`),
        fetch(`/api/sites/${selectedSiteId}/timeseries?${q}`),
        fetch(`/api/sites/${selectedSiteId}/rankings?${q}`),
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (tsRes.ok) {
        const tsJson = await tsRes.json();
        setTimeseries(tsJson.series || []);
      }
      if (rkRes.ok) setRankings(await rkRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId, timeRange, excludeStatic, excludeBots]);

  const fetchLogs = useCallback(async () => {
    if (!selectedSiteId) return;
    try {
      const q = new URLSearchParams({
        page: String(logPage),
        page_size: '50',
        status_class: logStatusClass,
        method: logMethod,
        search: logSearch,
        ip: logIp,
        exclude_static: String(excludeStatic),
        exclude_bots: String(excludeBots),
      }).toString();

      const res = await fetch(`/api/sites/${selectedSiteId}/logs?${q}`);
      if (res.ok) {
        setLogsData(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  }, [selectedSiteId, logPage, logStatusClass, logMethod, logSearch, logIp, excludeStatic, excludeBots]);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    if (selectedSiteId) {
      fetchDashboard();
    }
  }, [selectedSiteId, fetchDashboard]);

  useEffect(() => {
    if (selectedSiteId && activeTab === 'logs') {
      fetchLogs();
    }
  }, [selectedSiteId, activeTab, fetchLogs]);

  const handleSimulateTraffic = async () => {
    if (!selectedSiteId) return;
    setSimulating(true);
    try {
      const res = await fetch(`/api/sites/${selectedSiteId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 200 }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`已向 Nginx 日志追加 ${data.written_lines} 条实时访问记录并完成增量入库`);
        await fetchSites();
        await fetchDashboard();
        if (activeTab === 'logs') await fetchLogs();
      }
    } finally {
      setSimulating(false);
    }
  };

  const handleSyncSite = async (reset: boolean = false) => {
    if (!selectedSiteId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${selectedSiteId}/sync?reset=${reset}`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        showToast(
          reset
            ? `已重置游标并全量重扫：解析入库 ${data.parsed_count} 条日志`
            : `增量同步完成：新增 ${data.parsed_count} 条日志`
        );
        await fetchSites();
        await fetchDashboard();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUploadLogFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSiteId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/sites/${selectedSiteId}/upload`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`文件 ${data.filename} 导入成功：共解析 ${data.parsed_count} 条记录`);
        await fetchSites();
        await fetchDashboard();
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleTestParser = async () => {
    const res = await fetch('/api/parser/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sample_line: testLine,
        log_format: testFormat,
        custom_regex: testRegex,
      }),
    });
    if (res.ok) {
      setTestResult(await res.json());
    }
  };

  const jumpToLogsWithFilter = (opts: { ip?: string; search?: string; statusClass?: string }) => {
    setLogPage(1);
    setLogIp(opts.ip ?? '');
    setLogSearch(opts.search ?? '');
    setLogStatusClass(opts.statusClass ?? 'all');
    setActiveTab('logs');
  };

  const currentSite = sites.find((s) => s.id === selectedSiteId) || null;

  const renderDelta = (val: number | null | undefined, inverseGood: boolean = false) => {
    if (val === null || val === undefined) {
      return <span className="text-[11px] font-mono text-slate-500">对比上周期 --</span>;
    }
    const isPositive = val > 0;
    const isGood = inverseGood ? !isPositive : isPositive;
    const color =
      val === 0
        ? 'text-slate-400'
        : isGood
        ? 'text-emerald-400'
        : 'text-rose-400';
    return (
      <span className={`text-[11px] font-mono tabular-nums ${color}`}>
        {isPositive ? `+${val}%` : `${val}%`} 环比
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] bg-telemetry-grid text-slate-100 flex flex-col">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 px-4 py-2.5 rounded bg-emerald-950/95 border border-emerald-500/50 text-emerald-200 text-xs font-mono shadow-2xl">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Top Industrial Telemetry Control Bar */}
      <header className="sticky top-0 z-30 bg-[#0B0F17]/95 backdrop-blur border-b border-slate-800">
        <div className="max-w-[1600px] mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Brand & Site Switcher */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#10b981] animate-pulse" />
              <span className="font-mono font-bold tracking-wider text-sm text-slate-100">
                NGINX<span className="text-emerald-400">//</span>PULSE
              </span>
              <span className="hidden md:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700">
                SQLite WAL
              </span>
            </div>

            <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

            {/* Site Select */}
            <div className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label="选择监控站点"
                value={selectedSiteId ?? ''}
                onChange={(e) => setSelectedSiteId(Number(e.target.value))}
                className="bg-[#111827] border border-slate-700/90 rounded px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.domain})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setIsAddSiteOpen(true)}
                title="接入新 Nginx 站点"
                className="p-1.5 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700/90 text-slate-300 hover:text-emerald-400 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {overview && (
              <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-mono text-emerald-300 tabular-nums">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                近期活跃 IP: <strong>{overview.active_uv}</strong>
              </div>
            )}
          </div>

          {/* Right: Filters, Time Range & Live Simulation */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {/* Filter Toggles */}
            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111827] border border-slate-800 cursor-pointer hover:border-slate-700 select-none">
              <input
                type="checkbox"
                checked={excludeStatic}
                onChange={(e) => setExcludeStatic(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
              <span className="text-slate-300">过滤静态资源</span>
            </label>

            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#111827] border border-slate-800 cursor-pointer hover:border-slate-700 select-none">
              <input
                type="checkbox"
                checked={excludeBots}
                onChange={(e) => setExcludeBots(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
              <span className="text-slate-300">过滤爬虫(Bot)</span>
            </label>

            {/* Time Range Pills */}
            <div className="flex items-center bg-[#111827] p-0.5 rounded border border-slate-800">
              {(
                [
                  ['1h', '1小时'],
                  ['24h', '24小时'],
                  ['7d', '近7天'],
                  ['30d', '近30天'],
                  ['all', '全部'],
                ] as [TimeRangeKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTimeRange(key)}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    timeRange === key
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Live Burst Generator Button */}
            <button
              type="button"
              onClick={handleSimulateTraffic}
              disabled={simulating}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 transition-colors disabled:opacity-50"
              title="向当前站点 Nginx 日志文件追加 200 条仿真访问记录并立刻触发增量解析"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>{simulating ? '写入中...' : '注入实时流量 (+200)'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                fetchSites();
                fetchDashboard();
                if (activeTab === 'logs') fetchLogs();
              }}
              className="p-1.5 rounded bg-[#111827] hover:bg-slate-800 border border-slate-800 text-slate-300"
              title="刷新数据"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Sub-navigation bar */}
        <div className="max-w-[1600px] mx-auto px-4 flex items-center justify-between border-t border-slate-800/70 bg-[#0d121c]">
          <nav className="flex items-center gap-1 text-xs font-mono">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
                activeTab === 'overview'
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>流量遥测大盘 (OVERVIEW)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
                activeTab === 'logs'
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>日志明细检索 (LOG EXPLORER)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-b-2 transition-colors ${
                activeTab === 'settings'
                  ? 'border-emerald-400 text-emerald-300 bg-emerald-500/5'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>日志源与正则调试 (INGESTION)</span>
            </button>
          </nav>

          {currentSite && (
            <div className="hidden lg:flex items-center gap-4 text-[11px] font-mono text-slate-400 tabular-nums">
              <span>
                日志路径: <code className="text-slate-300">{currentSite.log_path}</code>
              </span>
              <span>
                已入库: <strong className="text-emerald-400">{formatNumber(currentSite.stored_logs_count || 0)}</strong> 行
              </span>
              <span>
                Offset: <strong className="text-slate-300">{formatBytes(currentSite.last_offset || 0)}</strong>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 py-5 space-y-5">
        {/* ==================== TAB 1: OVERVIEW ==================== */}
        {activeTab === 'overview' && overview && (
          <>
            {/* 6-Cell Rack Telemetry KPI Grid */}
            <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 bg-slate-800 gap-[1px] border border-slate-800 rounded-lg overflow-hidden shadow-lg">
              {/* KPI 1: Total Requests */}
              <div className="bg-[#111827] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>总请求数 (HITS)</span>
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="my-2 text-2xl font-mono font-bold text-slate-100 tabular-nums">
                  {formatNumber(overview.total_requests)}
                </div>
                <div className="flex items-center justify-between">
                  {renderDelta(overview.deltas.requests)}
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    静态: {formatNumber(overview.static_requests)}
                  </span>
                </div>
              </div>

              {/* KPI 2: Page Views (PV) */}
              <div className="bg-[#111827] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>有效页面浏览 (PV)</span>
                  <Layers className="w-3.5 h-3.5 text-emerald-300" />
                </div>
                <div className="my-2 text-2xl font-mono font-bold text-emerald-300 tabular-nums">
                  {formatNumber(overview.page_views)}
                </div>
                <div className="flex items-center justify-between">
                  {renderDelta(overview.deltas.pv)}
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    占比 {overview.total_requests ? Math.round((overview.page_views / overview.total_requests) * 100) : 0}%
                  </span>
                </div>
              </div>

              {/* KPI 3: Unique Visitors (UV) */}
              <div className="bg-[#111827] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>独立访客 IP (UV)</span>
                  <Users className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="my-2 text-2xl font-mono font-bold text-cyan-300 tabular-nums">
                  {formatNumber(overview.unique_visitors)}
                </div>
                <div className="flex items-center justify-between">
                  {renderDelta(overview.deltas.uv)}
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    人均 {overview.unique_visitors ? (overview.total_requests / overview.unique_visitors).toFixed(1) : 0} 次
                  </span>
                </div>
              </div>

              {/* KPI 4: Bandwidth */}
              <div className="bg-[#111827] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>出站响应流量</span>
                  <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="my-2 text-2xl font-mono font-bold text-indigo-300 tabular-nums">
                  {formatBytes(overview.total_bytes)}
                </div>
                <div className="flex items-center justify-between">
                  {renderDelta(overview.deltas.bytes)}
                  <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                    均 {overview.total_requests ? formatBytes(overview.total_bytes / overview.total_requests) : '0 B'}/req
                  </span>
                </div>
              </div>

              {/* KPI 5: Response Time */}
              <div className="bg-[#111827] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>响应耗时 (AVG/P95)</span>
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="my-2 text-2xl font-mono font-bold text-slate-100 tabular-nums">
                  {overview.avg_rt_ms}
                  <span className="text-xs font-normal text-slate-400 ml-1">ms</span>
                </div>
                <div className="flex items-center justify-between">
                  {renderDelta(overview.deltas.avg_rt, true)}
                  <span className="text-[11px] font-mono text-amber-300/90 tabular-nums">
                    P95: {overview.p95_rt_ms} ms
                  </span>
                </div>
              </div>

              {/* KPI 6: Error Rate & Bots */}
              <div className="bg-[#111827] p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>异常率 (4xx/5xx)</span>
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="my-2 text-2xl font-mono font-bold text-rose-400 tabular-nums">
                  {overview.error_rate}%
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                  <span className="text-amber-300">4xx: {overview.error_4xx}</span>
                  <span className="text-rose-400">5xx: {overview.error_5xx}</span>
                  <span className="text-slate-400">Bot: {overview.bot_requests}</span>
                </div>
              </div>
            </section>

            {/* Primary Oscilloscope Chart + Status Code Distribution Strip */}
            <section className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden shadow-lg">
              <TelemetryChart series={timeseries} />

              {/* HTTP Status Code Telemetry Bar */}
              <div className="px-4 py-3 bg-[#0d131f] border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
                  <span className="text-slate-400">HTTP 状态码构成:</span>
                  <button
                    type="button"
                    onClick={() => jumpToLogsWithFilter({ statusClass: '2xx' })}
                    className="text-emerald-400 hover:underline"
                  >
                    2xx 正常 ({formatNumber(overview.status_breakdown.s2xx)})
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToLogsWithFilter({ statusClass: '3xx' })}
                    className="text-cyan-400 hover:underline"
                  >
                    3xx 重定向 ({formatNumber(overview.status_breakdown.s3xx)})
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToLogsWithFilter({ statusClass: '4xx' })}
                    className="text-amber-400 hover:underline"
                  >
                    4xx 客户端错误 ({formatNumber(overview.status_breakdown.s4xx)})
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToLogsWithFilter({ statusClass: '5xx' })}
                    className="text-rose-400 hover:underline"
                  >
                    5xx 服务端异常 ({formatNumber(overview.status_breakdown.s5xx)})
                  </button>
                </div>

                {/* Proportional Segmented Bar */}
                {overview.total_requests > 0 && (
                  <div className="w-full sm:w-72 h-2.5 bg-slate-900 rounded-sm overflow-hidden flex border border-slate-800">
                    <div
                      style={{
                        width: `${(overview.status_breakdown.s2xx / overview.total_requests) * 100}%`,
                      }}
                      className="bg-emerald-500"
                      title="2xx"
                    />
                    <div
                      style={{
                        width: `${(overview.status_breakdown.s3xx / overview.total_requests) * 100}%`,
                      }}
                      className="bg-cyan-500"
                      title="3xx"
                    />
                    <div
                      style={{
                        width: `${(overview.status_breakdown.s4xx / overview.total_requests) * 100}%`,
                      }}
                      className="bg-amber-500"
                      title="4xx"
                    />
                    <div
                      style={{
                        width: `${(overview.status_breakdown.s5xx / overview.total_requests) * 100}%`,
                      }}
                      className="bg-rose-500"
                      title="5xx"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* 2x2 Deep Ranking Matrices */}
            {rankings && (
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Panel 1: URL Paths Matrix (Top / Slow / 4xx-5xx Errors) */}
                <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-3 bg-[#0d131f] border-b border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-slate-200 tracking-wide">
                      URI // 请求路径与接口性能排行
                    </span>
                    <div className="flex items-center bg-[#0B0F17] p-0.5 rounded border border-slate-800 text-[11px] font-mono">
                      <button
                        type="button"
                        onClick={() => setPathRankTab('top')}
                        className={`px-2 py-0.5 rounded ${
                          pathRankTab === 'top'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        热门受访路径
                      </button>
                      <button
                        type="button"
                        onClick={() => setPathRankTab('slow')}
                        className={`px-2 py-0.5 rounded ${
                          pathRankTab === 'slow'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        慢响应耗时
                      </button>
                      <button
                        type="button"
                        onClick={() => setPathRankTab('errors')}
                        className={`px-2 py-0.5 rounded ${
                          pathRankTab === 'errors'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        4xx/5xx 异常路径
                      </button>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800/70 text-xs font-mono max-h-[380px] overflow-y-auto scroller">
                    {pathRankTab === 'top' &&
                      rankings.top_paths.map((item) => {
                        const maxReq = rankings.top_paths[0]?.requests || 1;
                        const pct = Math.round((item.requests / maxReq) * 100);
                        return (
                          <div
                            key={item.path}
                            onClick={() => jumpToLogsWithFilter({ search: item.path })}
                            className="relative px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/40 cursor-pointer group"
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-emerald-500/10 pointer-events-none"
                              style={{ width: `${pct}%` }}
                            />
                            <div className="relative flex items-center gap-2 min-w-0">
                              <span className="truncate text-slate-200 group-hover:text-emerald-300">
                                {item.path}
                              </span>
                              {item.is_static === 1 && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-slate-800 text-slate-400 rounded border border-slate-700 shrink-0">
                                  STATIC
                                </span>
                              )}
                            </div>
                            <div className="relative flex items-center gap-4 shrink-0 tabular-nums text-[11px]">
                              <span className="text-emerald-400 font-semibold">
                                {formatNumber(item.requests)} 次
                              </span>
                              <span className="text-cyan-400 w-16 text-right">
                                {item.uv} IP
                              </span>
                              <span className="text-slate-400 w-20 text-right hidden sm:inline-block">
                                {formatBytes(item.total_bytes)}
                              </span>
                            </div>
                          </div>
                        );
                      })}

                    {pathRankTab === 'slow' &&
                      rankings.slow_paths.map((item) => {
                        const maxRt = rankings.slow_paths[0]?.avg_rt_ms || 1;
                        const pct = Math.min(100, Math.round((item.avg_rt_ms / maxRt) * 100));
                        return (
                          <div
                            key={item.path}
                            onClick={() => jumpToLogsWithFilter({ search: item.path })}
                            className="relative px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/40 cursor-pointer"
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-amber-500/10 pointer-events-none"
                              style={{ width: `${pct}%` }}
                            />
                            <span className="relative truncate text-slate-200">{item.path}</span>
                            <div className="relative flex items-center gap-4 shrink-0 tabular-nums text-[11px]">
                              <span className="text-amber-300 font-semibold">
                                均 {item.avg_rt_ms} ms
                              </span>
                              <span className="text-rose-400 w-24 text-right">
                                峰值 {item.max_rt_ms} ms
                              </span>
                              <span className="text-slate-400 w-16 text-right">
                                {item.requests} 次
                              </span>
                            </div>
                          </div>
                        );
                      })}

                    {pathRankTab === 'errors' &&
                      rankings.error_paths.map((item, idx) => (
                        <div
                          key={`${item.path}-${item.status}-${idx}`}
                          onClick={() =>
                            jumpToLogsWithFilter({
                              search: item.path,
                              statusClass: item.status >= 500 ? '5xx' : '4xx',
                            })
                          }
                          className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/40 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 text-[10px] rounded border ${statusBadgeClass(
                                item.status
                              )}`}
                            >
                              {item.status}
                            </span>
                            <span className="truncate text-slate-200">{item.path}</span>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 tabular-nums text-[11px]">
                            <span className="text-rose-400 font-semibold">
                              {formatNumber(item.requests)} 次
                            </span>
                            <span className="text-slate-400">{item.unique_ips} IP</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Panel 2: Top Visitor IPs & Scanner Detection */}
                <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-3 bg-[#0d131f] border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-slate-200 tracking-wide">
                      CLIENT IP // 高频访客 IP 与异常扫描监控
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      点击 IP 检索访问轨迹
                    </span>
                  </div>

                  <div className="divide-y divide-slate-800/70 text-xs font-mono max-h-[380px] overflow-y-auto scroller">
                    {rankings.top_ips.map((item) => {
                      const maxReq = rankings.top_ips[0]?.requests || 1;
                      const pct = Math.round((item.requests / maxReq) * 100);
                      return (
                        <div
                          key={item.remote_addr}
                          onClick={() => jumpToLogsWithFilter({ ip: item.remote_addr })}
                          className="relative px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/40 cursor-pointer group"
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-cyan-500/10 pointer-events-none"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center gap-2.5 min-w-0">
                            <span className="text-cyan-300 font-semibold group-hover:underline tabular-nums">
                              {item.remote_addr}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate">
                              {item.country} · {item.region} · {item.city}
                            </span>
                            {item.is_bot === 1 && (
                              <span className="px-1.5 py-0.2 text-[10px] rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                BOT ({item.browser})
                              </span>
                            )}
                          </div>
                          <div className="relative flex items-center gap-4 shrink-0 tabular-nums text-[11px]">
                            <span className="text-slate-100 font-semibold">
                              {formatNumber(item.requests)} 次
                            </span>
                            <span className="text-slate-400 w-20 text-right hidden sm:inline-block">
                              {formatBytes(item.total_bytes)}
                            </span>
                            {item.error_count > 0 ? (
                              <span className="text-rose-400 w-16 text-right">
                                异常 {item.error_count}
                              </span>
                            ) : (
                              <span className="text-emerald-500/80 w-16 text-right">正常</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Panel 3: Geo-location Distribution */}
                <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-3 bg-[#0d131f] border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold text-slate-200 tracking-wide flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-emerald-400" />
                      GEO // 访客地域分布 (国家 / 省份 / 城市)
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">离线 CIDR 归属解析</span>
                  </div>

                  <div className="divide-y divide-slate-800/70 text-xs font-mono max-h-[340px] overflow-y-auto scroller">
                    {rankings.geo_regions.map((item, idx) => {
                      const maxReq = rankings.geo_regions[0]?.requests || 1;
                      const pct = Math.round((item.requests / maxReq) * 100);
                      return (
                        <div
                          key={`${item.country}-${item.region}-${idx}`}
                          className="relative px-4 py-2.5 flex items-center justify-between gap-3"
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-emerald-500/10 pointer-events-none"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="relative flex items-center gap-2">
                            <span className="text-slate-500 w-5 tabular-nums">{idx + 1}.</span>
                            <span className="text-slate-200">
                              {item.country} · <strong>{item.region}</strong>
                            </span>
                            <span className="text-slate-500 text-[11px]">({item.city})</span>
                          </div>
                          <div className="relative flex items-center gap-4 tabular-nums text-[11px]">
                            <span className="text-emerald-400 font-semibold">
                              {formatNumber(item.requests)} 请求
                            </span>
                            <span className="text-cyan-400 w-14 text-right">{item.uv} IP</span>
                            <span className="text-slate-400 w-20 text-right hidden sm:inline-block">
                              {formatBytes(item.total_bytes)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Panel 4: Referers, Browsers, OS & Device Types */}
                <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-3 bg-[#0d131f] border-b border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-semibold text-slate-200 tracking-wide">
                      ENV // 来源渠道与客户端环境
                    </span>
                    <div className="flex items-center bg-[#0B0F17] p-0.5 rounded border border-slate-800 text-[11px] font-mono">
                      {(
                        [
                          ['referers', '来源域名'],
                          ['browsers', '浏览器/爬虫'],
                          ['os', '操作系统'],
                          ['devices', '终端类型'],
                        ] as [EnvRankTab, string][]
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setEnvRankTab(k)}
                          className={`px-2 py-0.5 rounded ${
                            envRankTab === k
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="divide-y divide-slate-800/70 text-xs font-mono max-h-[340px] overflow-y-auto scroller">
                    {envRankTab === 'referers' &&
                      rankings.top_referers.map((r) => {
                        const maxR = rankings.top_referers[0]?.requests || 1;
                        const pct = Math.round((r.requests / maxR) * 100);
                        return (
                          <div
                            key={r.referer_domain}
                            className="relative px-4 py-2.5 flex items-center justify-between"
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-indigo-500/10 pointer-events-none"
                              style={{ width: `${pct}%` }}
                            />
                            <span className="relative text-slate-200 truncate">
                              {r.referer_domain}
                            </span>
                            <div className="relative flex items-center gap-4 tabular-nums text-[11px]">
                              <span className="text-indigo-300 font-semibold">
                                {formatNumber(r.requests)} 次
                              </span>
                              <span className="text-cyan-400 w-16 text-right">{r.uv} IP</span>
                            </div>
                          </div>
                        );
                      })}

                    {envRankTab !== 'referers' &&
                      (envRankTab === 'browsers'
                        ? rankings.browsers
                        : envRankTab === 'os'
                        ? rankings.os_list
                        : rankings.device_types
                      ).map((item) => {
                        const list =
                          envRankTab === 'browsers'
                            ? rankings.browsers
                            : envRankTab === 'os'
                            ? rankings.os_list
                            : rankings.device_types;
                        const maxR = list[0]?.requests || 1;
                        const pct = Math.round((item.requests / maxR) * 100);
                        return (
                          <div
                            key={item.name}
                            className="relative px-4 py-2.5 flex items-center justify-between"
                          >
                            <div
                              className="absolute inset-y-0 left-0 bg-cyan-500/10 pointer-events-none"
                              style={{ width: `${pct}%` }}
                            />
                            <span className="relative text-slate-200">{item.name}</span>
                            <div className="relative flex items-center gap-4 tabular-nums text-[11px]">
                              <span className="text-emerald-300 font-semibold">
                                {formatNumber(item.requests)} 次
                              </span>
                              <span className="text-cyan-400 w-16 text-right">{item.uv} IP</span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {/* ==================== TAB 2: LOG EXPLORER ==================== */}
        {activeTab === 'logs' && (
          <section className="bg-[#111827] border border-slate-800 rounded-lg overflow-hidden shadow-lg flex flex-col">
            {/* Filter Control Bar */}
            <div className="p-4 bg-[#0d131f] border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
              <div className="flex flex-wrap items-center gap-2">
                {/* Status class filter */}
                <select
                  aria-label="按状态码筛选"
                  value={logStatusClass}
                  onChange={(e) => {
                    setLogPage(1);
                    setLogStatusClass(e.target.value);
                  }}
                  className="bg-[#0B0F17] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="all">全部状态码</option>
                  <option value="2xx">2xx 成功</option>
                  <option value="3xx">3xx 重定向</option>
                  <option value="4xx">4xx 客户端错误</option>
                  <option value="5xx">5xx 服务端异常</option>
                </select>

                {/* HTTP Method filter */}
                <select
                  aria-label="按请求方法筛选"
                  value={logMethod}
                  onChange={(e) => {
                    setLogPage(1);
                    setLogMethod(e.target.value);
                  }}
                  className="bg-[#0B0F17] border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                >
                  <option value="all">全部方法</option>
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>

                {/* IP Search */}
                <input
                  type="text"
                  value={logIp}
                  onChange={(e) => {
                    setLogPage(1);
                    setLogIp(e.target.value);
                  }}
                  placeholder="过滤访客 IP..."
                  className="bg-[#0B0F17] border border-slate-700 rounded px-3 py-1.5 text-slate-200 w-36 focus:outline-none focus:border-emerald-500"
                />

                {/* Keyword Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={logSearch}
                    onChange={(e) => {
                      setLogPage(1);
                      setLogSearch(e.target.value);
                    }}
                    placeholder="搜索 URL 路径 / User-Agent / Referer..."
                    className="bg-[#0B0F17] border border-slate-700 rounded pl-8 pr-3 py-1.5 text-slate-200 w-64 sm:w-80 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {(logIp || logSearch || logStatusClass !== 'all' || logMethod !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogPage(1);
                      setLogIp('');
                      setLogSearch('');
                      setLogStatusClass('all');
                      setLogMethod('all');
                    }}
                    className="px-2.5 py-1.5 rounded border border-slate-700 text-slate-400 hover:text-slate-200"
                  >
                    清空筛选
                  </button>
                )}
              </div>

              {logsData && (
                <div className="text-slate-400 tabular-nums">
                  共匹配 <strong className="text-emerald-400">{formatNumber(logsData.total)}</strong> 条访问记录
                </div>
              )}
            </div>

            {/* Responsive Accessible Telemetry Table */}
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="nginx-logs-caption"
              className="table-wrapper scroller"
            >
              <table className="telemetry-table text-left text-xs font-mono">
                <caption id="nginx-logs-caption" className="sr-only">
                  Nginx 访问日志实时检索列表
                </caption>
                <thead className="bg-[#0f172a] text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">时间与访客 IP</th>
                    <th className="py-2.5 px-2.5 font-medium">状态</th>
                    <th className="py-2.5 px-3 font-medium">请求方法与路径</th>
                    <th className="py-2.5 px-3 font-medium">归属地与客户端</th>
                    <th className="py-2.5 px-3 font-medium text-right">响应流量</th>
                    <th className="py-2.5 px-3 font-medium text-right">耗时</th>
                    <th className="py-2.5 px-3 font-medium">来源域名</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 tabular-nums">
                  {logsData?.items.map((row: AccessLogItem) => {
                    const isExpanded = expandedLogId === row.id;
                    return (
                      <React.Fragment key={row.id}>
                        <tr
                          onClick={() => setExpandedLogId(isExpanded ? null : row.id)}
                          className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <th scope="row" className="py-2 px-3 font-normal whitespace-nowrap">
                            <div className="text-slate-400 text-[11px]">{row.timestamp}</div>
                            <div className="text-cyan-300 font-medium">{row.remote_addr}</div>
                          </th>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            <span
                              className={`px-1.5 py-0.5 text-[11px] rounded border ${statusBadgeClass(
                                row.status
                              )}`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 max-w-md truncate">
                            <span className={`font-bold mr-2 ${methodBadgeClass(row.method)}`}>
                              {row.method}
                            </span>
                            <span className="text-slate-100">{row.path}</span>
                            {row.query_string && (
                              <span className="text-slate-500">?{row.query_string}</span>
                            )}
                          </td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="text-slate-200">
                              {row.country}·{row.region}·{row.city}
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                              <span>
                                {row.browser} / {row.os}
                              </span>
                              {row.is_bot === 1 && (
                                <span className="px-1 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                                  BOT
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap text-slate-300">
                            {formatBytes(row.bytes_sent)}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap">
                            <span
                              className={
                                row.request_time >= 0.5
                                  ? 'text-rose-400 font-semibold'
                                  : row.request_time >= 0.15
                                  ? 'text-amber-300'
                                  : 'text-emerald-400'
                              }
                            >
                              {(row.request_time * 1000).toFixed(1)} ms
                            </span>
                          </td>
                          <td className="py-2 px-3 max-w-[180px] truncate text-slate-400">
                            {row.referer_domain}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-[#0B0F17]">
                            <td colSpan={7} className="p-3.5 text-[11px] font-mono space-y-1.5 border-l-2 border-emerald-500">
                              <div>
                                <span className="text-slate-500">完整请求路径: </span>
                                <code className="text-emerald-300">
                                  {row.method} {row.path}
                                  {row.query_string ? `?${row.query_string}` : ''} {row.protocol}
                                </code>
                              </div>
                              <div>
                                <span className="text-slate-500">完整 Referer: </span>
                                <code className="text-slate-300">{row.referer}</code>
                              </div>
                              <div>
                                <span className="text-slate-500">完整 User-Agent: </span>
                                <code className="text-slate-300 break-all">{row.user_agent}</code>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            {logsData && (
              <div className="px-4 py-3 bg-[#0d131f] border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400 tabular-nums">
                  第 {logsData.page} 页 / 共 {Math.max(1, Math.ceil(logsData.total / logsData.page_size))} 页
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={logPage <= 1}
                    onClick={() => setLogPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 rounded bg-[#111827] border border-slate-700 text-slate-300 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    disabled={logPage * logsData.page_size >= logsData.total}
                    onClick={() => setLogPage((p) => p + 1)}
                    className="px-3 py-1 rounded bg-[#111827] border border-slate-700 text-slate-300 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ==================== TAB 3: SETTINGS & PARSER DEBUGGER ==================== */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Left Column: Current Site Log Tailer Status & Manual Upload */}
            <section className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-mono font-semibold text-emerald-400">
                    SITE INGESTION // 日志源监控与游标状态
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    后台进程每 3 秒自动校验文件 Inode 与 Byte Offset 进行断点续读
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddSiteOpen(true)}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono"
                >
                  + 新增站点
                </button>
              </div>

              {currentSite && (
                <div className="space-y-3 text-xs font-mono bg-[#0B0F17] p-4 rounded border border-slate-800">
                  <div className="flex justify-between">
                    <span className="text-slate-400">站点名称:</span>
                    <span className="text-slate-100 font-semibold">{currentSite.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">绑定域名:</span>
                    <span className="text-cyan-300">{currentSite.domain}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-400 shrink-0">日志文件路径:</span>
                    <code className="text-slate-200 break-all text-right">{currentSite.log_path}</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">文件状态:</span>
                    <span className={currentSite.file_exists ? 'text-emerald-400' : 'text-amber-400'}>
                      {currentSite.file_exists
                        ? `在线 (${formatBytes(currentSite.file_size || 0)})`
                        : '本地文件未找到（可上传历史日志）'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">读取游标 (Inode / Offset):</span>
                    <span className="text-slate-300 tabular-nums">
                      {currentSite.last_inode || '--'} @ {formatBytes(currentSite.last_offset)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">累计解析成功 / 失败行:</span>
                    <span className="tabular-nums">
                      <strong className="text-emerald-400">
                        {formatNumber(currentSite.total_lines_parsed)}
                      </strong>{' '}
                      / <span className="text-rose-400">{currentSite.parse_errors}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">最后同步时间:</span>
                    <span className="text-slate-300">{currentSite.last_sync_at || '--'}</span>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSyncSite(false)}
                      className="px-3 py-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300"
                    >
                      立即增量同步
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSyncSite(true)}
                      className="px-3 py-1.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300"
                    >
                      重置游标并全量重扫
                    </button>
                  </div>
                </div>
              )}

              {/* Historical Log File Upload */}
              <div className="p-4 rounded border border-dashed border-slate-700 bg-[#0B0F17]/60 flex flex-col items-center justify-center text-center space-y-2">
                <Upload className="w-6 h-6 text-emerald-400" />
                <div className="text-xs font-mono text-slate-200">
                  导入历史 Nginx 日志文件（支持 <code>.log</code> 或 <code>.log.gz</code>）
                </div>
                <p className="text-[11px] text-slate-400">
                  即使不在同一台服务器，也可以直接上传 Nginx 导出的日志文件完成离线流量审计
                </p>
                <label className="mt-2 px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-mono text-emerald-300 cursor-pointer">
                  <span>{uploading ? '正在解析入库...' : '选择日志文件上传'}</span>
                  <input
                    type="file"
                    accept=".log,.txt,.gz"
                    onChange={handleUploadLogFile}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
              </div>
            </section>

            {/* Right Column: Interactive Nginx Log Regex & Format Debugger */}
            <section className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h2 className="text-sm font-mono font-semibold text-cyan-400">
                  PARSER SANDBOX // Nginx 日志解析与字段增强测试器
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  粘贴任意一行 Nginx 日志，实时验证字段提取、IP 归属地与 User-Agent 识别效果
                </p>
              </div>

              <div className="space-y-3 text-xs font-mono">
                <div>
                  <label className="block text-slate-400 mb-1">选择解析模式</label>
                  <select
                    value={testFormat}
                    onChange={(e) => setTestFormat(e.target.value as any)}
                    className="w-full bg-[#0B0F17] border border-slate-700 rounded px-3 py-2 text-slate-200"
                  >
                    <option value="combined">Nginx Combined 默认/扩展格式</option>
                    <option value="json">Nginx JSON 格式日志</option>
                    <option value="custom">自定义正则表达式 (Python Named Groups)</option>
                  </select>
                </div>

                {testFormat === 'custom' && (
                  <div>
                    <label className="block text-slate-400 mb-1">自定义命名正则</label>
                    <input
                      type="text"
                      value={testRegex}
                      onChange={(e) => setTestRegex(e.target.value)}
                      placeholder="^(?P<remote_addr>\S+) - - \[(?P<time_local>[^\]]+)\] ..."
                      className="w-full bg-[#0B0F17] border border-slate-700 rounded px-3 py-2 text-slate-200"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-400 mb-1">测试日志行样本</label>
                  <textarea
                    rows={3}
                    value={testLine}
                    onChange={(e) => setTestLine(e.target.value)}
                    className="w-full bg-[#0B0F17] border border-slate-700 rounded p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleTestParser}
                  className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium"
                >
                  执行解析测试
                </button>

                {testResult && (
                  <div className="mt-3 p-3.5 rounded bg-[#0B0F17] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={
                          testResult.matched ? 'text-emerald-400 font-semibold' : 'text-rose-400'
                        }
                      >
                        {testResult.matched ? '✓ 匹配成功' : `✕ ${testResult.message}`}
                      </span>
                    </div>
                    {testResult.parsed && (
                      <pre className="text-[11px] text-slate-300 overflow-x-auto leading-relaxed">
                        {JSON.stringify(testResult.parsed, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Native Light-Dismiss Modal Dialog */}
      <AddSiteModal
        isOpen={isAddSiteOpen}
        onClose={() => setIsAddSiteOpen(false)}
        onCreated={() => {
          fetchSites();
          fetchDashboard();
        }}
      />
    </div>
  );
};
