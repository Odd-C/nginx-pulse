import React, { useState } from 'react';
import { TimeseriesPoint } from '../types';
import { formatBytes, formatNumber } from '../utils';

interface TelemetryChartProps {
  series: TimeseriesPoint[];
}

type ChartMode = 'traffic' | 'status' | 'bandwidth';

export const TelemetryChart: React.FC<TelemetryChartProps> = ({ series }) => {
  const [mode, setMode] = useState<ChartMode>('traffic');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!series || series.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-slate-500 font-mono">
        暂无时序遥测数据
      </div>
    );
  }

  const width = 960;
  const height = 250;
  const padLeft = 48;
  const padRight = 20;
  const padTop = 18;
  const padBottom = 28;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const n = series.length;
  const xAt = (i: number) =>
    n <= 1 ? padLeft + innerW / 2 : padLeft + (i / (n - 1)) * innerW;

  // Compute max value based on mode
  const maxVal = Math.max(
    1,
    ...series.map((d) => {
      if (mode === 'traffic') return Math.max(d.requests, d.pv, d.uv);
      if (mode === 'status') return d.s2xx + d.s3xx + d.s4xx + d.s5xx;
      return d.bytes_sent;
    })
  );

  const yAt = (val: number) => padTop + innerH - (val / maxVal) * innerH;

  const buildPath = (extractor: (d: TimeseriesPoint) => number) =>
    series
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(extractor(d)).toFixed(1)}`)
      .join(' ');

  const buildArea = (extractor: (d: TimeseriesPoint) => number) => {
    const line = buildPath(extractor);
    return `${line} L ${xAt(n - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;
  };

  const activePoint = hoverIdx !== null && series[hoverIdx] ? series[hoverIdx] : series[n - 1];
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-800/80 bg-[#0d131f]">
        <div className="flex items-center gap-4">
          <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
            SIGNAL // 时序脉冲视图
          </span>
          {activePoint && (
            <div className="hidden sm:flex items-center gap-4 text-xs font-mono tabular-nums">
              <span className="text-slate-400">[{activePoint.label}]</span>
              <span className="text-emerald-400">
                Reqs: <strong>{formatNumber(activePoint.requests)}</strong>
              </span>
              <span className="text-cyan-400">
                UV: <strong>{formatNumber(activePoint.uv)}</strong>
              </span>
              <span className="text-indigo-300">
                流量: <strong>{formatBytes(activePoint.bytes_sent)}</strong>
              </span>
              <span className="text-amber-300">
                4xx/5xx: <strong>{activePoint.s4xx + activePoint.s5xx}</strong>
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center bg-[#0B0F17] p-0.5 rounded border border-slate-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => setMode('traffic')}
            className={`px-2.5 py-1 rounded transition-colors ${
              mode === 'traffic'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            请求与访客 (PV/UV)
          </button>
          <button
            type="button"
            onClick={() => setMode('status')}
            className={`px-2.5 py-1 rounded transition-colors ${
              mode === 'status'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            状态码分布 (HTTP)
          </button>
          <button
            type="button"
            onClick={() => setMode('bandwidth')}
            className={`px-2.5 py-1 rounded transition-colors ${
              mode === 'bandwidth'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            带宽吞吐 (Bytes)
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative px-2 pt-3 pb-2 select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-64 overflow-visible"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="gradRequests" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradUv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradBandwidth" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal reference grid lines */}
          {yTicks.map((t) => {
            const y = padTop + innerH - t * innerH;
            const rawVal = maxVal * t;
            const label =
              mode === 'bandwidth' ? formatBytes(rawVal) : formatNumber(Math.round(rawVal));
            return (
              <g key={t}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray={t === 0 ? undefined : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-500 text-[10px] font-mono tabular-nums"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Mode: Traffic (Requests + PV + UV) */}
          {mode === 'traffic' && (
            <>
              <path d={buildArea((d) => d.requests)} fill="url(#gradRequests)" />
              <path
                d={buildPath((d) => d.requests)}
                fill="none"
                stroke="#10b981"
                strokeWidth="2"
              />
              <path
                d={buildPath((d) => d.pv)}
                fill="none"
                stroke="#34d399"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <path d={buildArea((d) => d.uv)} fill="url(#gradUv)" />
              <path d={buildPath((d) => d.uv)} fill="none" stroke="#06b6d4" strokeWidth="2" />
            </>
          )}

          {/* Mode: Bandwidth */}
          {mode === 'bandwidth' && (
            <>
              <path d={buildArea((d) => d.bytes_sent)} fill="url(#gradBandwidth)" />
              <path
                d={buildPath((d) => d.bytes_sent)}
                fill="none"
                stroke="#818cf8"
                strokeWidth="2"
              />
            </>
          )}

          {/* Mode: Status Stacked Bars */}
          {mode === 'status' &&
            series.map((d, i) => {
              const barW = Math.max(4, Math.min(22, innerW / n - 4));
              const cx = xAt(i) - barW / 2;
              const h2xx = (d.s2xx / maxVal) * innerH;
              const h3xx = (d.s3xx / maxVal) * innerH;
              const h4xx = (d.s4xx / maxVal) * innerH;
              const h5xx = (d.s5xx / maxVal) * innerH;

              const y2 = padTop + innerH - h2xx;
              const y3 = y2 - h3xx;
              const y4 = y3 - h4xx;
              const y5 = y4 - h5xx;

              return (
                <g key={d.bucket_ts}>
                  {h2xx > 0 && (
                    <rect x={cx} y={y2} width={barW} height={h2xx} fill="#10b981" opacity={0.85} />
                  )}
                  {h3xx > 0 && (
                    <rect x={cx} y={y3} width={barW} height={h3xx} fill="#06b6d4" opacity={0.85} />
                  )}
                  {h4xx > 0 && (
                    <rect x={cx} y={y4} width={barW} height={h4xx} fill="#f59e0b" opacity={0.9} />
                  )}
                  {h5xx > 0 && (
                    <rect x={cx} y={y5} width={barW} height={h5xx} fill="#f43f5e" opacity={0.95} />
                  )}
                </g>
              );
            })}

          {/* X-axis labels */}
          {series.map((d, i) => {
            const step = Math.max(1, Math.floor(n / 7));
            if (i % step !== 0 && i !== n - 1) return null;
            return (
              <text
                key={d.bucket_ts}
                x={xAt(i)}
                y={height - 6}
                textAnchor="middle"
                className="fill-slate-500 text-[10px] font-mono tabular-nums"
              >
                {d.label}
              </text>
            );
          })}

          {/* Hover crosshair & active dots */}
          {hoverIdx !== null && series[hoverIdx] && (
            <g>
              <line
                x1={xAt(hoverIdx)}
                y1={padTop}
                x2={xAt(hoverIdx)}
                y2={padTop + innerH}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              {mode === 'traffic' && (
                <>
                  <circle
                    cx={xAt(hoverIdx)}
                    cy={yAt(series[hoverIdx].requests)}
                    r="4"
                    className="fill-emerald-400 stroke-[#0B0F17] stroke-2"
                  />
                  <circle
                    cx={xAt(hoverIdx)}
                    cy={yAt(series[hoverIdx].uv)}
                    r="4"
                    className="fill-cyan-400 stroke-[#0B0F17] stroke-2"
                  />
                </>
              )}
              {mode === 'bandwidth' && (
                <circle
                  cx={xAt(hoverIdx)}
                  cy={yAt(series[hoverIdx].bytes_sent)}
                  r="4"
                  className="fill-indigo-400 stroke-[#0B0F17] stroke-2"
                />
              )}
            </g>
          )}

          {/* Invisible hover hit columns */}
          {series.map((d, i) => {
            const colW = innerW / n;
            return (
              <rect
                key={d.bucket_ts}
                x={xAt(i) - colW / 2}
                y={padTop}
                width={colW}
                height={innerH}
                fill="transparent"
                className="cursor-crosshair"
                onMouseEnter={() => setHoverIdx(i)}
              />
            );
          })}
        </svg>

        {/* Legend Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-1 text-[11px] font-mono text-slate-400">
          {mode === 'traffic' && (
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> 总请求数 (Hits)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-emerald-300 border-b border-dashed inline-block" /> 页面浏览 (PV)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" /> 独立 IP (UV)
              </span>
            </div>
          )}
          {mode === 'status' && (
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> 2xx 正常
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500 inline-block" /> 3xx 重定向/缓存
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> 4xx 客户端异常
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> 5xx 服务端错误
              </span>
            </div>
          )}
          {mode === 'bandwidth' && (
            <div className="flex items-center gap-5">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400 inline-block" /> 响应出站流量 (bytes_sent)
              </span>
            </div>
          )}
          <span className="text-slate-500">悬停图表查看分时切片详情</span>
        </div>
      </div>
    </div>
  );
};
