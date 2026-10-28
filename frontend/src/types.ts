export type TimeRangeKey = '1h' | '24h' | '7d' | '30d' | 'all';

export interface Site {
  id: number;
  name: string;
  domain: string;
  log_path: string;
  log_format: 'combined' | 'json' | 'custom';
  custom_regex: string;
  last_inode: string;
  last_offset: number;
  total_lines_parsed: number;
  parse_errors: number;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
  file_exists?: boolean;
  file_size?: number;
  stored_logs_count?: number;
}

export interface SiteOverview {
  total_requests: number;
  page_views: number;
  unique_visitors: number;
  total_bytes: number;
  avg_rt_ms: number;
  p95_rt_ms: number;
  error_4xx: number;
  error_5xx: number;
  error_rate: number;
  active_uv: number;
  raw_total: number;
  bot_requests: number;
  static_requests: number;
  status_breakdown: {
    s2xx: number;
    s3xx: number;
    s4xx: number;
    s5xx: number;
  };
  deltas: {
    requests: number | null;
    pv: number | null;
    uv: number | null;
    bytes: number | null;
    avg_rt: number | null;
    error_rate: number | null;
  };
}

export interface TimeseriesPoint {
  bucket_ts: number;
  label: string;
  requests: number;
  pv: number;
  uv: number;
  bytes_sent: number;
  avg_rt_ms: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
}

export interface SiteRankings {
  top_paths: {
    path: string;
    requests: number;
    uv: number;
    total_bytes: number;
    avg_rt_ms: number;
    is_static: number;
  }[];
  slow_paths: {
    path: string;
    requests: number;
    avg_rt_ms: number;
    max_rt_ms: number;
    total_bytes: number;
  }[];
  error_paths: {
    path: string;
    status: number;
    requests: number;
    unique_ips: number;
    last_seen: string;
  }[];
  top_ips: {
    remote_addr: string;
    country: string;
    region: string;
    city: string;
    requests: number;
    total_bytes: number;
    error_count: number;
    is_bot: number;
    browser: string;
  }[];
  top_referers: {
    referer_domain: string;
    requests: number;
    uv: number;
  }[];
  geo_regions: {
    country: string;
    region: string;
    city: string;
    requests: number;
    uv: number;
    total_bytes: number;
  }[];
  browsers: { name: string; requests: number; uv: number }[];
  os_list: { name: string; requests: number; uv: number }[];
  device_types: { name: string; requests: number; uv: number }[];
}

export interface AccessLogItem {
  id: number;
  site_id: number;
  timestamp: string;
  ts_epoch: number;
  remote_addr: string;
  country: string;
  region: string;
  city: string;
  method: string;
  path: string;
  query_string: string;
  protocol: string;
  status: number;
  bytes_sent: number;
  request_time: number;
  referer: string;
  referer_domain: string;
  user_agent: string;
  browser: string;
  os: string;
  device_type: string;
  is_bot: number;
  is_static: number;
}

export interface PaginatedLogs {
  total: number;
  page: number;
  page_size: number;
  items: AccessLogItem[];
}
