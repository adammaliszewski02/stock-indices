from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from html import unescape
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
REPORTS_DIR = ROOT / "enterprises"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))


def company_name_from(profile: str, ticker: str) -> str:
    ticker_pattern = re.escape(ticker)
    patterns = (
        rf"(?:the )?ticker(?: symbol)?\s+{ticker_pattern}\s+"
        rf"(?:is the stock ticker for|corresponds to|refers to|represents)\s+([^,;]+)",
        rf"^The company identified by (?:the )?stock ticker\s+{ticker_pattern}\s+is\s+([^,;]+)",
        rf"^{ticker_pattern}\s+is the stock ticker for\s+([^,;]+)",
        rf"^(.+?),\s+trading under (?:the )?(?:stock )?ticker\s+{ticker_pattern}\b",
        rf"^(.+?),\s+which trades under (?:the )?(?:stock )?ticker\s+{ticker_pattern}\b",
        rf"^(.+?),\s+(?:traded|listed)\s+(?:under|on)\b",
        r"^(.+?),\s+commonly known\b",
        rf"^(.+?)\s+\([^)]*{ticker_pattern}[^)]*\)\s+is\b",
        r"^(.+?)\s+is\s+(?:a|an|the|one of)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, profile, re.IGNORECASE)
        if match:
            return match.group(1).strip()

    match = re.match(
        r"^(.+?),\s+(?:(?:a|an|the)\s|trading\b|which\b|headquartered\b|founded\b)",
        profile,
        re.IGNORECASE,
    )
    if match:
        return match.group(1).strip()
    return ticker


@lru_cache(maxsize=1)
def load_companies() -> list[dict[str, str]]:
    companies = []
    for report in sorted(REPORTS_DIR.glob("*/*_report.html")):
        ticker = report.parent.name
        with report.open("rb") as source:
            report_start = source.read(65536).decode("utf-8", errors="replace")
        match = re.search(r"<pre[^>]*>(.*?)</pre>", report_start, re.DOTALL)
        profile = unescape(re.sub(r"<[^>]+>", " ", match.group(1))).strip() if match else ""
        profile = " ".join(profile.split())
        companies.append(
            {
                "ticker": ticker,
                "name": company_name_from(profile, ticker),
                "market": "Warsaw" if ticker.endswith(".WA") else "US",
                "href": f"/enterprises/{ticker}/{report.name}",
            }
        )
    return companies


class AppHandler(BaseHTTPRequestHandler):
    def _send_file(self, path: Path, content_type: str) -> None:
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:
        path = unquote(urlsplit(self.path).path)

        if path == "/api/companies":
            data = json.dumps(load_companies(), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return

        static_files = {
            "/": (ROOT / "index.html", "text/html; charset=utf-8"),
            "/index.html": (ROOT / "index.html", "text/html; charset=utf-8"),
            "/app.js": (ROOT / "app.js", "text/javascript; charset=utf-8"),
            "/styles.css": (ROOT / "styles.css", "text/css; charset=utf-8"),
        }
        if path in static_files:
            file_path, content_type = static_files[path]
            self._send_file(file_path, content_type)
            return

        match = re.fullmatch(r"/enterprises/([A-Za-z0-9.]+)/([A-Za-z0-9.]+_report\.html)", path)
        if match:
            ticker, filename = match.groups()
            if ticker == filename.removesuffix("_report.html"):
                report = REPORTS_DIR / ticker / filename
                if report.is_file():
                    self._send_file(report, "text/html; charset=utf-8")
                    return

        self.send_error(404, "Not found")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Stock Indices is running at http://{HOST}:{PORT}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Stock Indices.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
