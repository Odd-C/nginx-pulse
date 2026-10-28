import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

SAMPLE_IPS = [
    # 广东深圳/广州
    "113.96.22.18", "58.60.188.42", "14.16.89.104", "119.120.44.71", "183.14.92.201",
    # 北京
    "114.240.55.12", "123.112.88.19", "202.106.0.20", "36.110.14.8",
    # 上海
    "101.80.32.115", "116.224.76.90", "180.152.19.44",
    # 浙江杭州/宁波
    "115.192.64.33", "60.176.12.99", "122.224.81.5",
    # 江苏南京/苏州
    "49.64.110.27", "114.216.40.88", "180.96.21.6",
    # 四川成都
    "110.184.72.14", "118.112.19.63",
    # 湖北武汉
    "27.16.95.41", "59.172.30.12",
    # 陕西西安 / 湖南长沙 / 福建厦门 / 山东青岛 / 重庆
    "1.80.44.19", "113.240.88.12", "27.152.61.9", "119.164.22.7", "183.64.15.77",
    # 海外与爬虫 IP
    "66.249.66.1", "34.64.12.89", "133.242.18.50", "128.199.45.11", "203.198.40.12",
    # 高频扫描/异常 IP
    "185.199.109.153", "52.14.88.210",
]

PAGE_PATHS = [
    ("/", 28, 14500, 0.032),
    ("/products", 18, 22400, 0.058),
    ("/products/ai-gateway", 14, 19800, 0.045),
    ("/products/cloud-monitor", 11, 18200, 0.049),
    ("/pricing", 12, 11200, 0.028),
    ("/docs/quickstart", 15, 31500, 0.041),
    ("/docs/api/authentication", 9, 26800, 0.039),
    ("/docs/nginx-config", 8, 29400, 0.044),
    ("/blog/high-concurrency-sqlite-wal", 10, 42100, 0.062),
    ("/blog/zero-cookie-web-analytics", 7, 38900, 0.055),
    ("/login", 6, 8400, 0.075),
    ("/dashboard/overview", 9, 16200, 0.120),
    ("/api/v1/metrics/realtime", 14, 3400, 0.085),
    ("/api/v1/orders/export", 4, 158000, 0.890),
    ("/api/v1/search?q=analytics&page=1", 6, 9200, 0.340),
    ("/api/v1/webhook/callback", 3, 620, 1.240),
]

STATIC_PATHS = [
    ("/assets/index-B8f92a.js", 128400, 0.008),
    ("/assets/vendor-echarts-C41d.js", 342000, 0.014),
    ("/assets/main-D19a.css", 45200, 0.004),
    ("/static/images/hero-dashboard.webp", 215000, 0.011),
    ("/static/fonts/JetBrainsMono-Regular.woff2", 86400, 0.006),
    ("/favicon.ico", 4286, 0.002),
]

ERROR_PATHS = [
    ("/.env", 404, 162, 0.003),
    ("/wp-login.php", 404, 162, 0.004),
    ("/phpmyadmin/index.php", 404, 162, 0.003),
    ("/.git/config", 403, 548, 0.002),
    ("/admin/config.yml", 403, 548, 0.002),
    ("/old-docs/v1/guide", 404, 1240, 0.015),
    ("/api/v1/legacy/report", 500, 890, 1.850),
    ("/api/v1/upstream/sync", 502, 560, 3.002),
    ("/api/v1/auth/token", 401, 310, 0.042),
    ("/api/v1/rate-limited", 429, 240, 0.005),
]

REFERERS = [
    "-",
    "-",
    "-",
    "https://www.google.com/",
    "https://www.baidu.com/link?url=98a7s6d",
    "https://github.com/trending",
    "https://juejin.cn/post/738912049",
    "https://www.v2ex.com/t/1084921",
    "https://news.ycombinator.com/",
    "https://linux.do/t/topic/219402",
    "https://www.bing.com/",
    "https://zhihu.com/question/62910482",
]

USER_AGENTS = [
    # Desktop Chrome / Edge / macOS Safari / Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
    # Mobile iOS / Android / HarmonyOS / WeChat
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.58 Mobile Safari/537.36",
    "Mozilla/5.0 (Linux; Android 12; HarmonyOS; ALN-AL00) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.52",
    # Bots & Crawlers
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "curl/8.7.1",
    "Mozilla/5.0 zgrab/0.x",
]


def format_nginx_line(
    dt: datetime,
    ip: str,
    method: str,
    uri: str,
    status: int,
    bytes_sent: int,
    referer: str,
    ua: str,
    rt: float,
) -> str:
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    mon = months[dt.month - 1]
    time_local = f"{dt.day:02d}/{mon}/{dt.year:04d}:{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d} +0800"
    return (
        f'{ip} - - [{time_local}] "{method} {uri} HTTP/1.1" '
        f'{status} {bytes_sent} "{referer}" "{ua}" {rt:.3f}\n'
    )


def generate_mock_lines(count: int = 1500, days_span: int = 7, live_burst: bool = False) -> list[str]:
    now = datetime.now(timezone(timedelta(hours=8)))
    lines: list[tuple[datetime, str]] = []

    page_population = [p for p in PAGE_PATHS for _ in range(p[1])]

    for _ in range(count):
        if live_burst:
            # Recent 3 minutes
            delta_sec = random.randint(0, 180)
            dt = now - timedelta(seconds=delta_sec)
        else:
            # Spread across last N days, weighted toward daytime hours (09:00-23:00) and recent days
            day_offset = int(random.triangular(0, days_span, 0.3))
            base_day = now - timedelta(days=day_offset)
            hour = random.choices(
                range(24),
                weights=[2, 1, 1, 1, 1, 2, 4, 7, 12, 18, 22, 20, 16, 19, 23, 25, 24, 20, 18, 21, 22, 17, 10, 5],
            )[0]
            dt = base_day.replace(
                hour=hour,
                minute=random.randint(0, 59),
                second=random.randint(0, 59),
            )
            if dt > now:
                dt = now - timedelta(seconds=random.randint(5, 3600))

        roll = random.random()
        if roll < 0.64:
            # Normal page or API request
            ip = random.choice(SAMPLE_IPS[:-2])
            path, _, avg_bytes, avg_rt = random.choice(page_population)
            method = "POST" if "callback" in path or "login" in path else "GET"
            status = random.choices([200, 201, 304], weights=[88, 4, 8])[0]
            bytes_sent = 0 if status == 304 else int(avg_bytes * random.uniform(0.75, 1.35))
            rt = max(0.002, avg_rt * random.uniform(0.6, 1.8))
            referer = random.choice(REFERERS)
            ua = random.choice(USER_AGENTS[:-2])
        elif roll < 0.87:
            # Static asset request
            ip = random.choice(SAMPLE_IPS[:-4])
            path, avg_bytes, avg_rt = random.choice(STATIC_PATHS)
            method = "GET"
            status = random.choices([200, 304], weights=[75, 25])[0]
            bytes_sent = 0 if status == 304 else int(avg_bytes * random.uniform(0.95, 1.05))
            rt = max(0.001, avg_rt * random.uniform(0.7, 1.4))
            referer = "https://pulse.example.com/"
            ua = random.choice(USER_AGENTS[:9])
        else:
            # Error / scanner / slow request
            path, status, avg_bytes, avg_rt = random.choice(ERROR_PATHS)
            if status in (403, 404) and any(k in path for k in (".env", "wp-login", ".git", "phpmyadmin")):
                ip = random.choice(["185.199.109.153", "52.14.88.210", "34.64.12.89"])
                ua = random.choice(USER_AGENTS[-3:])
                referer = "-"
            else:
                ip = random.choice(SAMPLE_IPS)
                ua = random.choice(USER_AGENTS[:10])
                referer = random.choice(REFERERS)
            method = "POST" if "auth" in path or "sync" in path else "GET"
            bytes_sent = int(avg_bytes * random.uniform(0.9, 1.15))
            rt = max(0.002, avg_rt * random.uniform(0.8, 1.6))

        lines.append((dt, format_nginx_line(dt, ip, method, path, status, bytes_sent, referer, ua, rt)))

    lines.sort(key=lambda x: x[0])
    return [item[1] for item in lines]


def write_sample_log_file(target_path: Path, count: int = 2400, append: bool = False) -> int:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    lines = generate_mock_lines(count=count, days_span=7, live_burst=append)
    mode = "a" if append else "w"
    with open(target_path, mode, encoding="utf-8") as f:
        f.writelines(lines)
    return len(lines)


if __name__ == "__main__":
    sample_file = Path(__file__).resolve().parent.parent / "backend" / "data" / "sample_access.log"
    written = write_sample_log_file(sample_file, count=2500, append=False)
    print(f"Generated {written} mock Nginx access log lines at: {sample_file}")
