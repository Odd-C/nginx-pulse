import asyncio
import gzip
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from database import DATA_DIR, get_db, init_db
from parser import parse_log_line
from scripts.mock_nginx_log import write_sample_log_file
from tailer import background_tailer_loop, ingest_raw_lines, sync_site_log


def ensure_default_demo_site():
    with get_db() as conn:
        count = conn.execute("SELECT COUNT(*) AS c FROM sites").fetchone()["c"]
        if count > 0:
            return

        sample_log_path = DATA_DIR / "sample_access.log"
        if not sample_log_path.exists() or sample_log_path.stat().st_size == 0:
            write_sample_log_file(sample_log_path, count=2600, append=False)

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor = conn.execute(
            """
            INSERT INTO sites (name, domain, log_path, log_format, custom_regex, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "Pulse 核心网关 (生产示例)",
                "pulse.example.com",
                str(sample_log_path),
                "combined",
                "",
                now_str,
                now_str,
            ),
        )
        site_id = cursor.lastrowid

    sync_site_log(site_id)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    ensure_default_demo_site()
    tailer_task = asyncio.create_task(background_tailer_loop(interval_seconds=3.0))
    yield
    tailer_task.cancel()


app = FastAPI(
    title="Nginx Log Analytics API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SiteCreate(BaseModel):
    name: str
    domain: str
    log_path: str
    log_format: str = "combined"
    custom_regex: str = ""


class SiteUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    log_path: Optional[str] = None
    log_format: Optional[str] = None
    custom_regex: Optional[str] = None


class ParserTestRequest(BaseModel):
    sample_line: str
    log_format: str = "combined"
    custom_regex: str = ""


class SimulateRequest(BaseModel):
    count: int = 200


def _resolve_time_window(conn, site_id: int, range_key: str) -> tuple[int, int, int]:
    """
    Returns (start_epoch, end_epoch, bucket_seconds) for the requested range_key.
    Uses max(now, latest_log_ts) as reference so historical logs also display meaningfully.
    """
    now_epoch = int(datetime.now(timezone.utc).timestamp())
    row = conn.execute(
        "SELECT MAX(ts_epoch) AS max_ts, MIN(ts_epoch) AS min_ts FROM access_logs WHERE site_id = ?",
        (site_id,),
    ).fetchone()
    anchor_epoch = row["max_ts"] if (row and row["max_ts"]) else now_epoch
    # If latest log is recent, anchor to current time
    if abs(now_epoch - anchor_epoch) < 3600:
        anchor_epoch = max(now_epoch, anchor_epoch)

    if range_key == "1h":
        return (anchor_epoch - 3600, anchor_epoch, 300)  # 5-min buckets
    elif range_key == "24h":
        return (anchor_epoch - 86400, anchor_epoch, 3600)  # 1-hour buckets
    elif range_key == "7d":
        return (anchor_epoch - 7 * 86400, anchor_epoch, 6 * 3600)  # 6-hour buckets
    elif range_key == "30d":
        return (anchor_epoch - 30 * 86400, anchor_epoch, 86400)  # 1-day buckets
    else:  # "all"
        min_ts = row["min_ts"] if (row and row["min_ts"]) else (anchor_epoch - 7 * 86400)
        span = max(3600, anchor_epoch - min_ts)
        bucket = max(3600, span // 28)
        return (min_ts - 60, anchor_epoch, bucket)


def _build_filter_clause(
    site_id: int,
    start_ts: int,
    end_ts: int,
    exclude_static: bool,
    exclude_bots: bool,
) -> tuple[str, list]:
    clauses = ["site_id = ?", "ts_epoch >= ?", "ts_epoch <= ?"]
    params: list = [site_id, start_ts, end_ts]
    if exclude_static:
        clauses.append("is_static = 0")
    if exclude_bots:
        clauses.append("is_bot = 0")
    return " AND ".join(clauses), params


def _calc_delta(curr: float, prev: float) -> Optional[float]:
    if prev <= 0:
        return None
    return round(((curr - prev) / prev) * 100.0, 1)


@app.get("/api/sites")
def list_sites():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM sites ORDER BY id ASC").fetchall()
        result = []
        for r in rows:
            d = dict(r)
            p = Path(d["log_path"])
            d["file_exists"] = p.exists() and p.is_file()
            d["file_size"] = p.stat().st_size if d["file_exists"] else 0
            log_count = conn.execute(
                "SELECT COUNT(*) AS c FROM access_logs WHERE site_id = ?", (d["id"],)
            ).fetchone()["c"]
            d["stored_logs_count"] = log_count
            result.append(d)
        return result


@app.post("/api/sites")
def create_site(payload: SiteCreate):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO sites (name, domain, log_path, log_format, custom_regex, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload.name.strip(),
                payload.domain.strip(),
                payload.log_path.strip(),
                payload.log_format,
                payload.custom_regex.strip(),
                now_str,
                now_str,
            ),
        )
        site_id = cur.lastrowid

    sync_res = sync_site_log(site_id)
    with get_db() as conn:
        site = dict(conn.execute("SELECT * FROM sites WHERE id = ?", (site_id,)).fetchone())
        site["sync_result"] = sync_res
    return site


@app.put("/api/sites/{site_id}")
def update_site(site_id: int, payload: SiteUpdate):
    with get_db() as conn:
        existing = conn.execute("SELECT * FROM sites WHERE id = ?", (site_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="站点不存在")

        name = payload.name.strip() if payload.name is not None else existing["name"]
        domain = payload.domain.strip() if payload.domain is not None else existing["domain"]
        log_path = payload.log_path.strip() if payload.log_path is not None else existing["log_path"]
        log_format = payload.log_format if payload.log_format is not None else existing["log_format"]
        custom_regex = (
            payload.custom_regex.strip()
            if payload.custom_regex is not None
            else existing["custom_regex"]
        )
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        conn.execute(
            """
            UPDATE sites
            SET name = ?, domain = ?, log_path = ?, log_format = ?, custom_regex = ?, updated_at = ?
            WHERE id = ?
            """,
            (name, domain, log_path, log_format, custom_regex, now_str, site_id),
        )
        updated = dict(conn.execute("SELECT * FROM sites WHERE id = ?", (site_id,)).fetchone())
    return updated


@app.delete("/api/sites/{site_id}")
def delete_site(site_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM access_logs WHERE site_id = ?", (site_id,))
        cur = conn.execute("DELETE FROM sites WHERE id = ?", (site_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="站点不存在")
    return {"status": "deleted", "id": site_id}


@app.post("/api/sites/{site_id}/sync")
def trigger_site_sync(site_id: int, reset: bool = Query(False)):
    res = sync_site_log(site_id, reset_cursor=reset)
    return res


@app.post("/api/sites/{site_id}/simulate")
def simulate_site_traffic(site_id: int, payload: SimulateRequest):
    with get_db() as conn:
        site = conn.execute("SELECT * FROM sites WHERE id = ?", (site_id,)).fetchone()
        if not site:
            raise HTTPException(status_code=404, detail="站点不存在")
        log_path = Path(site["log_path"])

    count = max(10, min(payload.count, 5000))
    written = write_sample_log_file(log_path, count=count, append=True)
    sync_res = sync_site_log(site_id)
    return {
        "status": "ok",
        "written_lines": written,
        "sync_result": sync_res,
    }


@app.post("/api/sites/{site_id}/upload")
async def upload_log_file(site_id: int, file: UploadFile = File(...)):
    raw_bytes = await file.read()
    filename = (file.filename or "").lower()
    if filename.endswith(".gz"):
        try:
            text_content = gzip.decompress(raw_bytes).decode("utf-8", errors="replace")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"解压 .gz 文件失败: {e}")
    else:
        text_content = raw_bytes.decode("utf-8", errors="replace")

    lines = text_content.splitlines()
    res = ingest_raw_lines(site_id, lines)
    return {
        "filename": file.filename,
        "total_lines": len(lines),
        **res,
    }


@app.post("/api/parser/test")
def test_log_parser(payload: ParserTestRequest):
    parsed = parse_log_line(
        payload.sample_line,
        log_format=payload.log_format,
        custom_regex=payload.custom_regex,
    )
    if not parsed:
        return {
            "matched": False,
            "message": "无法匹配该行日志，请检查日志格式或正则表达式命名分组",
            "parsed": None,
        }
    return {
        "matched": True,
        "message": "解析成功",
        "parsed": parsed,
    }


@app.get("/api/sites/{site_id}/overview")
def get_site_overview(
    site_id: int,
    range: str = Query("7d", pattern="^(1h|24h|7d|30d|all)$"),
    exclude_static: bool = Query(False),
    exclude_bots: bool = Query(False),
):
    with get_db() as conn:
        start_ts, end_ts, _ = _resolve_time_window(conn, site_id, range)
        where_sql, params = _build_filter_clause(
            site_id, start_ts, end_ts, exclude_static, exclude_bots
        )

        agg = conn.execute(
            f"""
            SELECT
                COUNT(*) AS total_requests,
                SUM(CASE WHEN is_static = 0 AND status < 400 THEN 1 ELSE 0 END) AS page_views,
                COUNT(DISTINCT remote_addr) AS unique_visitors,
                COALESCE(SUM(bytes_sent), 0) AS total_bytes,
                COALESCE(AVG(request_time), 0.0) AS avg_rt_sec,
                SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) AS status_2xx,
                SUM(CASE WHEN status >= 300 AND status < 400 THEN 1 ELSE 0 END) AS status_3xx,
                SUM(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END) AS status_4xx,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS status_5xx
            FROM access_logs
            WHERE {where_sql}
            """,
            params,
        ).fetchone()

        # Raw totals (before static/bot filter) in the same window for breakdown badges
        raw_meta = conn.execute(
            """
            SELECT
                COUNT(*) AS raw_total,
                SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END) AS bot_requests,
                SUM(CASE WHEN is_static = 1 THEN 1 ELSE 0 END) AS static_requests
            FROM access_logs
            WHERE site_id = ? AND ts_epoch >= ? AND ts_epoch <= ?
            """,
            (site_id, start_ts, end_ts),
        ).fetchone()

        # P95 response time
        total_reqs = agg["total_requests"] or 0
        p95_rt_ms = 0.0
        if total_reqs > 0:
            offset_95 = max(0, int(total_reqs * 0.95) - 1)
            p95_row = conn.execute(
                f"""
                SELECT request_time FROM access_logs
                WHERE {where_sql}
                ORDER BY request_time ASC
                LIMIT 1 OFFSET ?
                """,
                [*params, offset_95],
            ).fetchone()
            if p95_row:
                p95_rt_ms = round(float(p95_row["request_time"]) * 1000.0, 1)

        # Previous period comparison
        span = max(3600, end_ts - start_ts)
        prev_start = start_ts - span
        prev_end = start_ts - 1
        prev_where, prev_params = _build_filter_clause(
            site_id, prev_start, prev_end, exclude_static, exclude_bots
        )
        prev = conn.execute(
            f"""
            SELECT
                COUNT(*) AS total_requests,
                SUM(CASE WHEN is_static = 0 AND status < 400 THEN 1 ELSE 0 END) AS page_views,
                COUNT(DISTINCT remote_addr) AS unique_visitors,
                COALESCE(SUM(bytes_sent), 0) AS total_bytes,
                COALESCE(AVG(request_time), 0.0) AS avg_rt_sec,
                SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS error_count
            FROM access_logs
            WHERE {prev_where}
            """,
            prev_params,
        ).fetchone()

        # Active UV in recent 15 minutes around anchor
        active_uv = conn.execute(
            """
            SELECT COUNT(DISTINCT remote_addr) AS c
            FROM access_logs
            WHERE site_id = ? AND ts_epoch >= ? AND is_bot = 0
            """,
            (site_id, end_ts - 900),
        ).fetchone()["c"]

        pv = agg["page_views"] or 0
        uv = agg["unique_visitors"] or 0
        total_bytes = agg["total_bytes"] or 0
        avg_rt_ms = round(float(agg["avg_rt_sec"] or 0.0) * 1000.0, 1)
        s4xx = agg["status_4xx"] or 0
        s5xx = agg["status_5xx"] or 0
        err_rate = round(((s4xx + s5xx) / total_reqs) * 100.0, 2) if total_reqs > 0 else 0.0

        prev_reqs = prev["total_requests"] or 0
        prev_err_rate = (
            round(((prev["error_count"] or 0) / prev_reqs) * 100.0, 2) if prev_reqs > 0 else 0.0
        )

        return {
            "total_requests": total_reqs,
            "page_views": pv,
            "unique_visitors": uv,
            "total_bytes": total_bytes,
            "avg_rt_ms": avg_rt_ms,
            "p95_rt_ms": p95_rt_ms,
            "error_4xx": s4xx,
            "error_5xx": s5xx,
            "error_rate": err_rate,
            "active_uv": active_uv,
            "raw_total": raw_meta["raw_total"] or 0,
            "bot_requests": raw_meta["bot_requests"] or 0,
            "static_requests": raw_meta["static_requests"] or 0,
            "status_breakdown": {
                "s2xx": agg["status_2xx"] or 0,
                "s3xx": agg["status_3xx"] or 0,
                "s4xx": s4xx,
                "s5xx": s5xx,
            },
            "deltas": {
                "requests": _calc_delta(total_reqs, prev_reqs),
                "pv": _calc_delta(pv, prev["page_views"] or 0),
                "uv": _calc_delta(uv, prev["unique_visitors"] or 0),
                "bytes": _calc_delta(total_bytes, prev["total_bytes"] or 0),
                "avg_rt": _calc_delta(avg_rt_ms, round(float(prev["avg_rt_sec"] or 0.0) * 1000.0, 1)),
                "error_rate": _calc_delta(err_rate, prev_err_rate),
            },
        }


@app.get("/api/sites/{site_id}/timeseries")
def get_site_timeseries(
    site_id: int,
    range: str = Query("7d", pattern="^(1h|24h|7d|30d|all)$"),
    exclude_static: bool = Query(False),
    exclude_bots: bool = Query(False),
):
    with get_db() as conn:
        start_ts, end_ts, bucket_sec = _resolve_time_window(conn, site_id, range)
        where_sql, params = _build_filter_clause(
            site_id, start_ts, end_ts, exclude_static, exclude_bots
        )

        rows = conn.execute(
            f"""
            SELECT
                (ts_epoch / ?) * ? AS bucket_ts,
                COUNT(*) AS requests,
                SUM(CASE WHEN is_static = 0 AND status < 400 THEN 1 ELSE 0 END) AS pv,
                COUNT(DISTINCT remote_addr) AS uv,
                COALESCE(SUM(bytes_sent), 0) AS bytes_sent,
                ROUND(COALESCE(AVG(request_time), 0.0) * 1000.0, 1) AS avg_rt_ms,
                SUM(CASE WHEN status >= 200 AND status < 300 THEN 1 ELSE 0 END) AS s2xx,
                SUM(CASE WHEN status >= 300 AND status < 400 THEN 1 ELSE 0 END) AS s3xx,
                SUM(CASE WHEN status >= 400 AND status < 500 THEN 1 ELSE 0 END) AS s4xx,
                SUM(CASE WHEN status >= 500 THEN 1 ELSE 0 END) AS s5xx
            FROM access_logs
            WHERE {where_sql}
            GROUP BY bucket_ts
            ORDER BY bucket_ts ASC
            """,
            [bucket_sec, bucket_sec, *params],
        ).fetchall()

        row_map = {r["bucket_ts"]: dict(r) for r in rows}
        first_bucket = (start_ts // bucket_sec) * bucket_sec
        last_bucket = (end_ts // bucket_sec) * bucket_sec

        tz_cn = timezone(timedelta(hours=8))
        series = []
        cur_b = first_bucket
        while cur_b <= last_bucket:
            dt = datetime.fromtimestamp(cur_b, tz=tz_cn)
            if range in ("1h", "24h"):
                label = dt.strftime("%H:%M")
            elif range == "7d":
                label = dt.strftime("%m-%d %H:%M")
            else:
                label = dt.strftime("%m-%d")

            item = row_map.get(cur_b)
            if item:
                series.append(
                    {
                        "bucket_ts": cur_b,
                        "label": label,
                        "requests": item["requests"],
                        "pv": item["pv"] or 0,
                        "uv": item["uv"] or 0,
                        "bytes_sent": item["bytes_sent"] or 0,
                        "avg_rt_ms": item["avg_rt_ms"] or 0.0,
                        "s2xx": item["s2xx"] or 0,
                        "s3xx": item["s3xx"] or 0,
                        "s4xx": item["s4xx"] or 0,
                        "s5xx": item["s5xx"] or 0,
                    }
                )
            else:
                series.append(
                    {
                        "bucket_ts": cur_b,
                        "label": label,
                        "requests": 0,
                        "pv": 0,
                        "uv": 0,
                        "bytes_sent": 0,
                        "avg_rt_ms": 0.0,
                        "s2xx": 0,
                        "s3xx": 0,
                        "s4xx": 0,
                        "s5xx": 0,
                    }
                )
            cur_b += bucket_sec

        return {"bucket_seconds": bucket_sec, "series": series}


@app.get("/api/sites/{site_id}/rankings")
def get_site_rankings(
    site_id: int,
    range: str = Query("7d", pattern="^(1h|24h|7d|30d|all)$"),
    exclude_static: bool = Query(False),
    exclude_bots: bool = Query(False),
):
    with get_db() as conn:
        start_ts, end_ts, _ = _resolve_time_window(conn, site_id, range)
        where_sql, params = _build_filter_clause(
            site_id, start_ts, end_ts, exclude_static, exclude_bots
        )

        top_paths = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT
                    path,
                    COUNT(*) AS requests,
                    COUNT(DISTINCT remote_addr) AS uv,
                    COALESCE(SUM(bytes_sent), 0) AS total_bytes,
                    ROUND(AVG(request_time) * 1000.0, 1) AS avg_rt_ms,
                    MAX(is_static) AS is_static
                FROM access_logs
                WHERE {where_sql}
                GROUP BY path
                ORDER BY requests DESC
                LIMIT 12
                """,
                params,
            ).fetchall()
        ]

        slow_paths = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT
                    path,
                    COUNT(*) AS requests,
                    ROUND(AVG(request_time) * 1000.0, 1) AS avg_rt_ms,
                    ROUND(MAX(request_time) * 1000.0, 1) AS max_rt_ms,
                    COALESCE(SUM(bytes_sent), 0) AS total_bytes
                FROM access_logs
                WHERE {where_sql}
                GROUP BY path
                HAVING requests >= 2
                ORDER BY avg_rt_ms DESC
                LIMIT 10
                """,
                params,
            ).fetchall()
        ]

        error_paths = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT
                    path,
                    status,
                    COUNT(*) AS requests,
                    COUNT(DISTINCT remote_addr) AS unique_ips,
                    MAX(timestamp) AS last_seen
                FROM access_logs
                WHERE {where_sql} AND status >= 400
                GROUP BY path, status
                ORDER BY requests DESC
                LIMIT 12
                """,
                params,
            ).fetchall()
        ]

        top_ips = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT
                    remote_addr,
                    country,
                    region,
                    city,
                    COUNT(*) AS requests,
                    COALESCE(SUM(bytes_sent), 0) AS total_bytes,
                    SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) AS error_count,
                    MAX(is_bot) AS is_bot,
                    MAX(browser) AS browser
                FROM access_logs
                WHERE {where_sql}
                GROUP BY remote_addr
                ORDER BY requests DESC
                LIMIT 12
                """,
                params,
            ).fetchall()
        ]

        top_referers = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT
                    referer_domain,
                    COUNT(*) AS requests,
                    COUNT(DISTINCT remote_addr) AS uv
                FROM access_logs
                WHERE {where_sql}
                GROUP BY referer_domain
                ORDER BY requests DESC
                LIMIT 10
                """,
                params,
            ).fetchall()
        ]

        geo_regions = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT
                    country,
                    region,
                    city,
                    COUNT(*) AS requests,
                    COUNT(DISTINCT remote_addr) AS uv,
                    COALESCE(SUM(bytes_sent), 0) AS total_bytes
                FROM access_logs
                WHERE {where_sql}
                GROUP BY country, region
                ORDER BY requests DESC
                LIMIT 15
                """,
                params,
            ).fetchall()
        ]

        browsers = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT browser AS name, COUNT(*) AS requests, COUNT(DISTINCT remote_addr) AS uv
                FROM access_logs
                WHERE {where_sql}
                GROUP BY browser
                ORDER BY requests DESC
                LIMIT 8
                """,
                params,
            ).fetchall()
        ]

        os_list = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT os AS name, COUNT(*) AS requests, COUNT(DISTINCT remote_addr) AS uv
                FROM access_logs
                WHERE {where_sql}
                GROUP BY os
                ORDER BY requests DESC
                LIMIT 8
                """,
                params,
            ).fetchall()
        ]

        device_types = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT device_type AS name, COUNT(*) AS requests, COUNT(DISTINCT remote_addr) AS uv
                FROM access_logs
                WHERE {where_sql}
                GROUP BY device_type
                ORDER BY requests DESC
                """,
                params,
            ).fetchall()
        ]

        return {
            "top_paths": top_paths,
            "slow_paths": slow_paths,
            "error_paths": error_paths,
            "top_ips": top_ips,
            "top_referers": top_referers,
            "geo_regions": geo_regions,
            "browsers": browsers,
            "os_list": os_list,
            "device_types": device_types,
        }


@app.get("/api/sites/{site_id}/logs")
def explore_site_logs(
    site_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    status_class: str = Query("all", pattern="^(all|2xx|3xx|4xx|5xx)$"),
    method: str = Query("all"),
    search: str = Query(""),
    ip: str = Query(""),
    exclude_static: bool = Query(False),
    exclude_bots: bool = Query(False),
):
    clauses = ["site_id = ?"]
    params: list = [site_id]

    if exclude_static:
        clauses.append("is_static = 0")
    if exclude_bots:
        clauses.append("is_bot = 0")

    if status_class == "2xx":
        clauses.append("status >= 200 AND status < 300")
    elif status_class == "3xx":
        clauses.append("status >= 300 AND status < 400")
    elif status_class == "4xx":
        clauses.append("status >= 400 AND status < 500")
    elif status_class == "5xx":
        clauses.append("status >= 500")

    if method and method != "all":
        clauses.append("method = ?")
        params.append(method.upper())

    if ip.strip():
        clauses.append("remote_addr LIKE ?")
        params.append(f"%{ip.strip()}%")

    if search.strip():
        clauses.append("(path LIKE ? OR user_agent LIKE ? OR referer LIKE ?)")
        kw = f"%{search.strip()}%"
        params.extend([kw, kw, kw])

    where_sql = " AND ".join(clauses)
    offset = (page - 1) * page_size

    with get_db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS c FROM access_logs WHERE {where_sql}", params
        ).fetchone()["c"]

        items = [
            dict(r)
            for r in conn.execute(
                f"""
                SELECT * FROM access_logs
                WHERE {where_sql}
                ORDER BY ts_epoch DESC, id DESC
                LIMIT ? OFFSET ?
                """,
                [*params, page_size, offset],
            ).fetchall()
        ]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items,
    }


# Serve frontend build if available
FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8090)

