#!/usr/bin/env python3
"""Serve the outing page and proxy Xixiang weather (Open-Meteo) from the server.

Run on a machine that can reach the internet, then open it from your phone:
    python3 server.py 8000
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

LAT = 22.582
LON = 113.876
WEATHER_URL = (
    "https://api.open-meteo.com/v1/forecast"
    f"?latitude={LAT}&longitude={LON}"
    "&current=temperature_2m,precipitation,weather_code,wind_speed_10m"
    "&wind_speed_unit=kmh&timezone=Asia%2FShanghai"
)
AIR_URL = (
    "https://air-quality-api.open-meteo.com/v1/air-quality"
    f"?latitude={LAT}&longitude={LON}&current=pm2_5&timezone=Asia%2FShanghai"
)


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "chumen/1.0"})
    with urllib.request.urlopen(req, timeout=12) as res:
        return json.loads(res.read().decode("utf-8"))


def code_text(code: int) -> str:
    if code in (0, 1):
        return "晴"
    if code in (2, 3):
        return "多云"
    if code in (45, 48):
        return "有雾"
    if 51 <= code <= 57:
        return "毛毛雨"
    if code in (61, 80):
        return "小雨"
    if code in (63, 81):
        return "中雨"
    if code in (65, 82):
        return "大雨"
    if code >= 95:
        return "雷雨"
    return "天气有变化"


def map_weather(temp, precip, code, wind_kmh, pm25):
    if wind_kmh >= 62:
        return "typhoon"
    if precip >= 0.2 or (51 <= code <= 67) or (80 <= code <= 82) or code >= 95:
        return "rain"
    if pm25 is not None and pm25 >= 75:
        return "haze"
    if temp >= 33:
        return "hot"
    return "ok"


def build_payload() -> dict:
    weather = fetch_json(WEATHER_URL)
    try:
        air = fetch_json(AIR_URL)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        air = {"current": {}}
    cur = weather.get("current") or {}
    temp = cur.get("temperature_2m")
    precip = cur.get("precipitation") or 0
    code = int(cur.get("weather_code") or 0)
    wind = cur.get("wind_speed_10m") or 0
    pm25 = (air.get("current") or {}).get("pm2_5")
    mapped = map_weather(temp, precip, code, wind, pm25)
    bits = [f"{round(temp)}°C", code_text(code)]
    if wind >= 40:
        bits.append(f"风 {round(wind)} km/h")
    if pm25 is not None:
        bits.append(f"PM2.5 {round(pm25)}")
    return {
        "mapped": mapped,
        "text": "西乡附近现在：" + " · ".join(bits),
    }


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self) -> None:
        if self.path.split("?", 1)[0] == "/api/weather":
            try:
                payload = build_payload()
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception as exc:
                body = json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8")
                self.send_response(502)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            return
        super().do_GET()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"打开 http://127.0.0.1:{port}/  局域网用这台电脑的 IP")
    server.serve_forever()


if __name__ == "__main__":
    main()
