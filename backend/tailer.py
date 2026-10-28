import asyncio
import gzip
import os
from datetime import datetime
from pathlib import Path
from typing import Iterable

from database import get_db
from parser import parse_log_line

INSERT_LOG_SQL = """
INSERT INTO access_logs (
    site_id, timestamp, ts_epoch, remote_addr, country, region, city,
    method, path, query_string, protocol, status, bytes_sent, request_time,
    referer, referer_domain, user_agent, browser, os, device_type, is_bot, is_static
) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?, ?
)
"""


def _row_tuple(site_id: int, parsed: dict) -> tuple:
    return (
        site_id,
        parsed["timestamp"],
        parsed["ts_epoch"],
        parsed["remote_addr"],
        parsed["country"],
        parsed["region"],
        parsed["city"],
        parsed["method"],
        parsed["path"],
        parsed["query_string"],
        parsed["protocol"],
        parsed["status"],
        parsed["bytes_sent"],
        parsed["request_time"],
        parsed["referer"],
        parsed["referer_domain"],
        parsed["user_agent"],
        parsed["browser"],
        parsed["os"],
        parsed["device_type"],
        parsed["is_bot"],
        parsed["is_static"],
    )


def sync_site_log(site_id: int, reset_cursor: bool = False) -> dict:
    """
    Incrementally read new lines from the site's configured Nginx log file,
    parse and enrich them, and batch-insert into SQLite.
    """
    with get_db() as conn:
        site = conn.execute("SELECT * FROM sites WHERE id = ?", (site_id,)).fetchone()
        if not site:
            return {"status": "error", "message": "站点不存在"}

        log_path_str = site["log_path"]
        log_format = site["log_format"]
        custom_regex = site["custom_regex"]
        last_inode = site["last_inode"] or ""
        last_offset = 0 if reset_cursor else int(site["last_offset"] or 0)

    if reset_cursor:
        with get_db() as conn:
            conn.execute("DELETE FROM access_logs WHERE site_id = ?", (site_id,))
            conn.execute(
                "UPDATE sites SET last_offset = 0, total_lines_parsed = 0, parse_errors = 0 WHERE id = ?",
                (site_id,),
            )

    path_obj = Path(log_path_str)
    if not path_obj.exists() or not path_obj.is_file():
        return {
            "status": "missing_file",
            "message": f"日志文件不存在: {log_path_str}",
            "parsed_count": 0,
            "error_count": 0,
        }

    stat = path_obj.stat()
    current_inode = f"{stat.st_ino}_{int(stat.st_ctime)}"
    file_size = stat.st_size

    # Detect logrotate or truncation
    if (last_inode and current_inode != last_inode) or file_size < last_offset:
        last_offset = 0

    if file_size == last_offset:
        return {
            "status": "up_to_date",
            "parsed_count": 0,
            "error_count": 0,
            "offset": last_offset,
        }

    parsed_count = 0
    error_count = 0
    batch: list[tuple] = []
    new_offset = last_offset

    with open(path_obj, "rb") as f:
        f.seek(last_offset)
        while True:
            raw_bytes = f.readline()
            if not raw_bytes:
                break
            # Only advance offset if we read a complete line or reached EOF
            new_offset = f.tell()
            line = raw_bytes.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            parsed = parse_log_line(line, log_format=log_format, custom_regex=custom_regex)
            if parsed:
                batch.append(_row_tuple(site_id, parsed))
                parsed_count += 1
            else:
                error_count += 1

            if len(batch) >= 1000:
                with get_db() as conn:
                    conn.executemany(INSERT_LOG_SQL, batch)
                batch.clear()

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        if batch:
            conn.executemany(INSERT_LOG_SQL, batch)
        conn.execute(
            """
            UPDATE sites
            SET last_inode = ?,
                last_offset = ?,
                total_lines_parsed = total_lines_parsed + ?,
                parse_errors = parse_errors + ?,
                last_sync_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (current_inode, new_offset, parsed_count, error_count, now_str, now_str, site_id),
        )

    return {
        "status": "ok",
        "parsed_count": parsed_count,
        "error_count": error_count,
        "offset": new_offset,
    }


def ingest_raw_lines(site_id: int, lines: Iterable[str]) -> dict:
    """Ingest uploaded log lines (from .log or .gz file) for a given site."""
    with get_db() as conn:
        site = conn.execute("SELECT * FROM sites WHERE id = ?", (site_id,)).fetchone()
        if not site:
            return {"status": "error", "message": "站点不存在"}
        log_format = site["log_format"]
        custom_regex = site["custom_regex"]

    parsed_count = 0
    error_count = 0
    batch: list[tuple] = []

    for line in lines:
        line = line.strip()
        if not line:
            continue
        parsed = parse_log_line(line, log_format=log_format, custom_regex=custom_regex)
        if parsed:
            batch.append(_row_tuple(site_id, parsed))
            parsed_count += 1
        else:
            error_count += 1

        if len(batch) >= 1000:
            with get_db() as conn:
                conn.executemany(INSERT_LOG_SQL, batch)
            batch.clear()

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        if batch:
            conn.executemany(INSERT_LOG_SQL, batch)
        conn.execute(
            """
            UPDATE sites
            SET total_lines_parsed = total_lines_parsed + ?,
                parse_errors = parse_errors + ?,
                last_sync_at = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (parsed_count, error_count, now_str, now_str, site_id),
        )

    return {
        "status": "ok",
        "parsed_count": parsed_count,
        "error_count": error_count,
    }


async def background_tailer_loop(interval_seconds: float = 3.0):
    """Background task that tails all configured Nginx log files periodically."""
    while True:
        try:
            with get_db() as conn:
                sites = conn.execute("SELECT id FROM sites").fetchall()
            for row in sites:
                await asyncio.to_thread(sync_site_log, row["id"])
        except Exception:
            pass
        await asyncio.sleep(interval_seconds)
