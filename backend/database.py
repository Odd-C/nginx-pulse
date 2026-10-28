import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "nginx_analytics.db"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA cache_size=-64000;")  # 64MB cache
    conn.execute("PRAGMA temp_store=MEMORY;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                domain TEXT NOT NULL,
                log_path TEXT NOT NULL,
                log_format TEXT NOT NULL DEFAULT 'combined',
                custom_regex TEXT NOT NULL DEFAULT '',
                last_inode TEXT NOT NULL DEFAULT '',
                last_offset INTEGER NOT NULL DEFAULT 0,
                total_lines_parsed INTEGER NOT NULL DEFAULT 0,
                parse_errors INTEGER NOT NULL DEFAULT 0,
                last_sync_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_id INTEGER NOT NULL,
                timestamp TEXT NOT NULL,
                ts_epoch INTEGER NOT NULL,
                remote_addr TEXT NOT NULL,
                country TEXT NOT NULL,
                region TEXT NOT NULL,
                city TEXT NOT NULL,
                method TEXT NOT NULL,
                path TEXT NOT NULL,
                query_string TEXT NOT NULL,
                protocol TEXT NOT NULL,
                status INTEGER NOT NULL,
                bytes_sent INTEGER NOT NULL,
                request_time REAL NOT NULL DEFAULT 0.0,
                referer TEXT NOT NULL,
                referer_domain TEXT NOT NULL,
                user_agent TEXT NOT NULL,
                browser TEXT NOT NULL,
                os TEXT NOT NULL,
                device_type TEXT NOT NULL,
                is_bot INTEGER NOT NULL DEFAULT 0,
                is_static INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_logs_site_ts ON access_logs(site_id, ts_epoch DESC);
            CREATE INDEX IF NOT EXISTS idx_logs_site_status ON access_logs(site_id, status, ts_epoch);
            CREATE INDEX IF NOT EXISTS idx_logs_site_ip ON access_logs(site_id, remote_addr, ts_epoch);
            CREATE INDEX IF NOT EXISTS idx_logs_site_path ON access_logs(site_id, path, ts_epoch);
            """
        )
