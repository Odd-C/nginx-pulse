import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from enricher import (
    extract_referer_domain,
    lookup_ip_geo,
    normalize_url,
    parse_user_agent,
)

# Standard + Extended Nginx combined format:
# 113.96.22.18 - - [28/Oct/2026:14:22:09 +0800] "GET /api/v1/orders?page=1 HTTP/1.1" 200 4512 "https://www.google.com/" "Mozilla/5.0 ..." 0.034
COMBINED_REGEX = re.compile(
    r'^(?P<remote_addr>\S+)\s+\S+\s+(?P<remote_user>\S+)\s+'
    r'\[(?P<time_local>[^\]]+)\]\s+'
    r'"(?P<request>[^"]*)"\s+'
    r'(?P<status>\d{3})\s+'
    r'(?P<bytes_sent>\d+|-)\s+'
    r'"(?P<referer>[^"]*)"\s+'
    r'"(?P<user_agent>[^"]*)"'
    r'(?:\s+(?:rt=)?(?P<request_time>\d+(?:\.\d+)?))?'
)

MONTH_MAP = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4,
    "May": 5, "Jun": 6, "Jul": 7, "Aug": 8,
    "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def parse_nginx_time(time_str: str) -> tuple[str, int]:
    """
    Parse Nginx time_local '28/Oct/2026:14:22:09 +0800' or ISO 8601 into
    ('YYYY-MM-DD HH:MM:SS', ts_epoch).
    """
    time_str = time_str.strip()
    # Fast path for standard Nginx time_local: DD/Mon/YYYY:HH:MM:SS +ZZZZ
    try:
        if "/" in time_str and ":" in time_str:
            # e.g. 28/Oct/2026:14:22:09 +0800
            parts = time_str.split(" ")
            dt_part = parts[0]
            tz_part = parts[1] if len(parts) > 1 else "+0800"
            day = int(dt_part[0:2])
            mon_str = dt_part[3:6]
            year = int(dt_part[7:11])
            hour = int(dt_part[12:14])
            minute = int(dt_part[15:17])
            second = int(dt_part[18:20])
            month = MONTH_MAP.get(mon_str, 1)

            sign = -1 if tz_part.startswith("-") else 1
            tz_hours = int(tz_part[1:3]) if len(tz_part) >= 5 else 8
            tz_mins = int(tz_part[3:5]) if len(tz_part) >= 5 else 0
            from datetime import timedelta
            tz = timezone(sign * timedelta(hours=tz_hours, minutes=tz_mins))
            dt = datetime(year, month, day, hour, minute, second, tzinfo=tz)
            return dt.strftime("%Y-%m-%d %H:%M:%S"), int(dt.timestamp())
    except Exception:
        pass

    # Fallback ISO 8601
    try:
        dt = datetime.fromisoformat(time_str.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %H:%M:%S"), int(dt.timestamp())
    except Exception:
        now = datetime.now(timezone.utc).astimezone()
        return now.strftime("%Y-%m-%d %H:%M:%S"), int(now.timestamp())


def split_request_line(request_line: str) -> tuple[str, str, str]:
    """Split 'GET /index.html?a=1 HTTP/1.1' into (method, raw_uri, protocol)."""
    if not request_line or request_line == "-":
        return ("GET", "/", "HTTP/1.1")
    parts = request_line.split(" ")
    if len(parts) >= 3:
        return (parts[0].upper(), parts[1], parts[2])
    elif len(parts) == 2:
        return (parts[0].upper(), parts[1], "HTTP/1.1")
    return ("GET", parts[0], "HTTP/1.1")


def parse_log_line(
    line: str,
    log_format: str = "combined",
    custom_regex: str = "",
) -> Optional[dict[str, Any]]:
    """
    Parse a single Nginx access log line and return enriched dict ready for DB insert,
    or None if the line cannot be parsed.
    """
    line = line.strip()
    if not line:
        return None

    raw_data: dict[str, Any] = {}

    if log_format == "json" or (line.startswith("{") and line.endswith("}")):
        try:
            obj = json.loads(line)
            raw_data["remote_addr"] = str(obj.get("remote_addr") or obj.get("client_ip") or "0.0.0.0")
            raw_data["time_local"] = str(
                obj.get("time_local") or obj.get("time_iso8601") or obj.get("timestamp") or ""
            )
            if "request" in obj:
                raw_data["request"] = str(obj["request"])
            else:
                method = obj.get("request_method", "GET")
                uri = obj.get("request_uri") or obj.get("uri") or "/"
                proto = obj.get("server_protocol", "HTTP/1.1")
                raw_data["request"] = f"{method} {uri} {proto}"
            raw_data["status"] = int(obj.get("status", 200))
            raw_data["bytes_sent"] = int(obj.get("body_bytes_sent") or obj.get("bytes_sent") or 0)
            raw_data["referer"] = str(obj.get("http_referer") or obj.get("referer") or "-")
            raw_data["user_agent"] = str(obj.get("http_user_agent") or obj.get("user_agent") or "-")
            raw_data["request_time"] = float(obj.get("request_time") or 0.0)
        except Exception:
            return None
    elif log_format == "custom" and custom_regex:
        try:
            m = re.match(custom_regex, line)
            if not m:
                return None
            gd = m.groupdict()
            raw_data["remote_addr"] = gd.get("remote_addr", "0.0.0.0")
            raw_data["time_local"] = gd.get("time_local", "")
            raw_data["request"] = gd.get("request", "GET / HTTP/1.1")
            raw_data["status"] = int(gd.get("status", 200))
            b_str = gd.get("bytes_sent", "0")
            raw_data["bytes_sent"] = 0 if b_str == "-" else int(b_str)
            raw_data["referer"] = gd.get("referer", "-")
            raw_data["user_agent"] = gd.get("user_agent", "-")
            rt_str = gd.get("request_time")
            raw_data["request_time"] = float(rt_str) if rt_str else 0.0
        except Exception:
            return None
    else:
        m = COMBINED_REGEX.match(line)
        if not m:
            return None
        gd = m.groupdict()
        raw_data["remote_addr"] = gd["remote_addr"]
        raw_data["time_local"] = gd["time_local"]
        raw_data["request"] = gd["request"]
        raw_data["status"] = int(gd["status"])
        b_str = gd["bytes_sent"]
        raw_data["bytes_sent"] = 0 if b_str == "-" else int(b_str)
        raw_data["referer"] = gd["referer"]
        raw_data["user_agent"] = gd["user_agent"]
        rt_str = gd.get("request_time")
        raw_data["request_time"] = float(rt_str) if rt_str else 0.0

    timestamp_str, ts_epoch = parse_nginx_time(raw_data["time_local"])
    method, raw_uri, protocol = split_request_line(raw_data["request"])
    path, query_string, is_static = normalize_url(raw_uri)
    country, region, city = lookup_ip_geo(raw_data["remote_addr"])
    browser, os_name, device_type, is_bot = parse_user_agent(raw_data["user_agent"])
    referer_domain = extract_referer_domain(raw_data["referer"])

    return {
        "timestamp": timestamp_str,
        "ts_epoch": ts_epoch,
        "remote_addr": raw_data["remote_addr"],
        "country": country,
        "region": region,
        "city": city,
        "method": method,
        "path": path,
        "query_string": query_string,
        "protocol": protocol,
        "status": raw_data["status"],
        "bytes_sent": raw_data["bytes_sent"],
        "request_time": round(raw_data["request_time"], 4),
        "referer": raw_data["referer"],
        "referer_domain": referer_domain,
        "user_agent": raw_data["user_agent"],
        "browser": browser,
        "os": os_name,
        "device_type": device_type,
        "is_bot": is_bot,
        "is_static": is_static,
    }
