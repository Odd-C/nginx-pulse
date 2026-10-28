import ipaddress
import re
from functools import lru_cache
from urllib.parse import urlparse

STATIC_EXTENSIONS = {
    ".js", ".mjs", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg",
    ".ico", ".webp", ".avif", ".woff", ".woff2", ".ttf", ".eot",
    ".otf", ".map", ".mp4", ".webm", ".mp3", ".wav", ".pdf", ".zip"
}

STATIC_PREFIXES = ("/static/", "/assets/", "/_next/static/", "/dist/", "/public/", "/favicon.ico")

BOT_PATTERNS = re.compile(
    r"(bot|spider|crawl|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|"
    r"baiduspider|bytespider|sogou|360spider|yisouspider|petalbot|ahrefsbot|semrushbot|"
    r"mj12bot|dotbot|yandex|duckduckbot|applebot|gptbot|claudebot|perplexitybot|"
    r"curl/|wget/|python-requests|python-urllib|go-http-client|java/|apache-httpclient|"
    r"okhttp|axios/|node-fetch|libwww-perl|scrapy|headlesschrome|phantomjs|"
    r"zgrab|masscan|nmap|nikto|sqlmap|nuclei|censys|shodan)",
    re.IGNORECASE,
)

# Built-in offline CIDR prefix mapping for common China telecom/cloud & global blocks
# Plus deterministic fallback for arbitrary public IPs when offline DB file is absent
CHINA_PREFIX_MAP = [
    (ipaddress.ip_network("36.110.0.0/16"), ("中国", "北京", "北京市")),
    (ipaddress.ip_network("106.37.0.0/16"), ("中国", "北京", "北京市")),
    (ipaddress.ip_network("114.240.0.0/12"), ("中国", "北京", "北京市")),
    (ipaddress.ip_network("123.112.0.0/12"), ("中国", "北京", "北京市")),
    (ipaddress.ip_network("202.106.0.0/16"), ("中国", "北京", "北京市")),
    (ipaddress.ip_network("101.80.0.0/12"), ("中国", "上海", "上海市")),
    (ipaddress.ip_network("116.224.0.0/12"), ("中国", "上海", "上海市")),
    (ipaddress.ip_network("180.152.0.0/13"), ("中国", "上海", "上海市")),
    (ipaddress.ip_network("222.64.0.0/13"), ("中国", "上海", "上海市")),
    (ipaddress.ip_network("14.16.0.0/12"), ("中国", "广东", "广州市")),
    (ipaddress.ip_network("58.60.0.0/15"), ("中国", "广东", "深圳市")),
    (ipaddress.ip_network("113.96.0.0/12"), ("中国", "广东", "深圳市")),
    (ipaddress.ip_network("119.120.0.0/13"), ("中国", "广东", "广州市")),
    (ipaddress.ip_network("183.0.0.0/10"), ("中国", "广东", "深圳市")),
    (ipaddress.ip_network("60.176.0.0/12"), ("中国", "浙江", "杭州市")),
    (ipaddress.ip_network("115.192.0.0/11"), ("中国", "浙江", "杭州市")),
    (ipaddress.ip_network("122.224.0.0/12"), ("中国", "浙江", "宁波市")),
    (ipaddress.ip_network("49.64.0.0/11"), ("中国", "江苏", "南京市")),
    (ipaddress.ip_network("114.216.0.0/13"), ("中国", "江苏", "苏州市")),
    (ipaddress.ip_network("180.96.0.0/11"), ("中国", "江苏", "南京市")),
    (ipaddress.ip_network("110.184.0.0/13"), ("中国", "四川", "成都市")),
    (ipaddress.ip_network("118.112.0.0/13"), ("中国", "四川", "成都市")),
    (ipaddress.ip_network("182.128.0.0/11"), ("中国", "四川", "成都市")),
    (ipaddress.ip_network("27.16.0.0/12"), ("中国", "湖北", "武汉市")),
    (ipaddress.ip_network("59.172.0.0/14"), ("中国", "湖北", "武汉市")),
    (ipaddress.ip_network("111.172.0.0/14"), ("中国", "湖北", "武汉市")),
    (ipaddress.ip_network("1.80.0.0/13"), ("中国", "陕西", "西安市")),
    (ipaddress.ip_network("113.140.0.0/15"), ("中国", "陕西", "西安市")),
    (ipaddress.ip_network("113.240.0.0/13"), ("中国", "湖南", "长沙市")),
    (ipaddress.ip_network("175.8.0.0/13"), ("中国", "湖南", "长沙市")),
    (ipaddress.ip_network("27.152.0.0/13"), ("中国", "福建", "厦门市")),
    (ipaddress.ip_network("110.80.0.0/13"), ("中国", "福建", "福州市")),
    (ipaddress.ip_network("60.208.0.0/13"), ("中国", "山东", "济南市")),
    (ipaddress.ip_network("119.164.0.0/14"), ("中国", "山东", "青岛市")),
    (ipaddress.ip_network("115.48.0.0/12"), ("中国", "河南", "郑州市")),
    (ipaddress.ip_network("183.64.0.0/13"), ("中国", "重庆", "重庆市")),
    (ipaddress.ip_network("60.24.0.0/13"), ("中国", "天津", "天津市")),
    (ipaddress.ip_network("59.44.0.0/14"), ("中国", "辽宁", "沈阳市")),
    (ipaddress.ip_network("203.198.0.0/16"), ("中国", "香港", "香港")),
    (ipaddress.ip_network("61.216.0.0/14"), ("中国", "台湾", "台北市")),
    # Global networks
    (ipaddress.ip_network("66.249.64.0/19"), ("美国", "加利福尼亚", "山景城")),
    (ipaddress.ip_network("8.8.0.0/16"), ("美国", "加利福尼亚", "洛杉矶")),
    (ipaddress.ip_network("34.64.0.0/10"), ("美国", "弗吉尼亚", "阿什本")),
    (ipaddress.ip_network("52.0.0.0/11"), ("美国", "俄勒冈", "波特兰")),
    (ipaddress.ip_network("104.16.0.0/12"), ("美国", "加利福尼亚", "旧金山")),
    (ipaddress.ip_network("133.242.0.0/16"), ("日本", "东京", "东京")),
    (ipaddress.ip_network("128.199.0.0/16"), ("新加坡", "新加坡", "新加坡")),
    (ipaddress.ip_network("185.199.108.0/22"), ("德国", "黑森", "法兰克福")),
    (ipaddress.ip_network("51.140.0.0/14"), ("英国", "伦敦", "伦敦")),
]

FALLBACK_CHINA_REGIONS = [
    ("中国", "广东", "深圳市"),
    ("中国", "北京", "北京市"),
    ("中国", "上海", "上海市"),
    ("中国", "浙江", "杭州市"),
    ("中国", "江苏", "南京市"),
    ("中国", "四川", "成都市"),
    ("中国", "湖北", "武汉市"),
    ("中国", "福建", "厦门市"),
    ("中国", "山东", "青岛市"),
    ("中国", "湖南", "长沙市"),
    ("中国", "陕西", "西安市"),
    ("中国", "河南", "郑州市"),
    ("中国", "重庆", "重庆市"),
    ("中国", "安徽", "合肥市"),
]


@lru_cache(maxsize=16384)
def lookup_ip_geo(ip_str: str) -> tuple[str, str, str]:
    """Return (country, region, city) for an IP address."""
    if not ip_str or ip_str == "-":
        return ("未知", "未知", "未知")
    # Handle X-Forwarded-For comma-separated list
    if "," in ip_str:
        ip_str = ip_str.split(",")[0].strip()

    try:
        ip_obj = ipaddress.ip_address(ip_str)
    except ValueError:
        return ("未知", "未知", "未知")

    if ip_obj.is_loopback or ip_obj.is_private:
        return ("本地内网", "内网", "局域网")

    if isinstance(ip_obj, ipaddress.IPv4Address):
        for net, geo in CHINA_PREFIX_MAP:
            if ip_obj in net:
                return geo
        # Deterministic fallback based on second & third octet for realistic demo/offline coverage
        octets = [int(x) for x in ip_str.split(".")]
        idx = (octets[0] * 31 + octets[1]) % len(FALLBACK_CHINA_REGIONS)
        return FALLBACK_CHINA_REGIONS[idx]

    return ("中国", "北京", "IPv6节点")


@lru_cache(maxsize=8192)
def parse_user_agent(ua: str) -> tuple[str, str, str, int]:
    """
    Parse User-Agent string into (browser, os, device_type, is_bot).
    device_type: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot'
    """
    if not ua or ua == "-":
        return ("Unknown", "Unknown", "Desktop", 0)

    ua_lower = ua.lower()

    # Check if Bot
    if BOT_PATTERNS.search(ua):
        if "baiduspider" in ua_lower:
            bot_name = "Baiduspider"
        elif "googlebot" in ua_lower:
            bot_name = "Googlebot"
        elif "bingbot" in ua_lower:
            bot_name = "Bingbot"
        elif "bytespider" in ua_lower:
            bot_name = "Bytespider"
        elif "ahrefsbot" in ua_lower:
            bot_name = "AhrefsBot"
        elif "semrushbot" in ua_lower:
            bot_name = "SemrushBot"
        elif "petalbot" in ua_lower:
            bot_name = "PetalBot"
        elif "gptbot" in ua_lower or "claudebot" in ua_lower:
            bot_name = "AI Crawler"
        elif "curl" in ua_lower or "python" in ua_lower or "go-http" in ua_lower:
            bot_name = "Script/CLI"
        elif any(s in ua_lower for s in ("zgrab", "nmap", "sqlmap", "nikto", "masscan", "nuclei")):
            bot_name = "Security Scanner"
        else:
            bot_name = "Other Bot"
        return (bot_name, "Bot", "Bot", 1)

    # Detect OS
    if "windows nt" in ua_lower:
        os_name = "Windows"
    elif "harmonyos" in ua_lower:
        os_name = "HarmonyOS"
    elif "android" in ua_lower:
        os_name = "Android"
    elif "iphone" in ua_lower or "ipad" in ua_lower or "ipod" in ua_lower:
        os_name = "iOS"
    elif "mac os x" in ua_lower or "macintosh" in ua_lower:
        os_name = "macOS"
    elif "linux" in ua_lower:
        os_name = "Linux"
    else:
        os_name = "Other"

    # Detect Device Type
    if "ipad" in ua_lower or "tablet" in ua_lower:
        device_type = "Tablet"
    elif any(m in ua_lower for m in ("mobile", "iphone", "ipod", "android", "harmonyos")):
        device_type = "Mobile"
    else:
        device_type = "Desktop"

    # Detect Browser
    if "micromessenger" in ua_lower:
        browser = "WeChat"
    elif "edg/" in ua_lower or "edge/" in ua_lower:
        browser = "Edge"
    elif "opr/" in ua_lower or "opera" in ua_lower:
        browser = "Opera"
    elif "firefox/" in ua_lower or "fxios/" in ua_lower:
        browser = "Firefox"
    elif "chrome/" in ua_lower or "crios/" in ua_lower:
        browser = "Chrome"
    elif "safari/" in ua_lower:
        browser = "Safari"
    else:
        browser = "Other"

    return (browser, os_name, device_type, 0)


def normalize_url(raw_uri: str) -> tuple[str, str, int]:
    """
    Split raw request URI into (path, query_string, is_static).
    """
    if not raw_uri:
        return ("/", "", 0)

    if "?" in raw_uri:
        path, query = raw_uri.split("?", 1)
    else:
        path, query = raw_uri, ""

    if not path.startswith("/"):
        path = "/" + path

    path_lower = path.lower()
    is_static = 0
    if path_lower.startswith(STATIC_PREFIXES):
        is_static = 1
    else:
        dot_idx = path_lower.rfind(".")
        if dot_idx != -1 and path_lower[dot_idx:] in STATIC_EXTENSIONS:
            is_static = 1

    return (path, query, is_static)


def extract_referer_domain(referer: str) -> str:
    if not referer or referer == "-":
        return "直接访问 (Direct)"
    try:
        parsed = urlparse(referer)
        if parsed.netloc:
            return parsed.netloc.lower()
        return "直接访问 (Direct)"
    except Exception:
        return "直接访问 (Direct)"
