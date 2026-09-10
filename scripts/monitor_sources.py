#!/usr/bin/env python3
import hashlib
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "opportunities.json"
STATE = ROOT / "data" / "source_state.json"
REPORT_DIR = ROOT / "data" / "monitoring"
REPORT = REPORT_DIR / "latest_report.md"
SUMMARY = REPORT_DIR / "summary.json"
USER_AGENT = "WarashiiAssetRadar/0.2 (+https://y-ai-lab.github.io/warashii-dashboard/)"
REQUEST_TIMEOUT = 20
MAX_BYTES = 2_000_000
SLEEP_SECONDS = 1.0


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag.lower() in {"script", "style", "noscript", "svg"}:
            self.skip_depth += 1

    def handle_endtag(self, tag):
        if tag.lower() in {"script", "style", "noscript", "svg"} and self.skip_depth:
            self.skip_depth -= 1

    def handle_data(self, data):
        if not self.skip_depth:
            self.parts.append(data)


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_text(raw: bytes, content_type: str) -> str:
    text = raw.decode("utf-8", errors="replace")
    if "html" in content_type.lower() or "<html" in text[:2000].lower():
        parser = TextExtractor()
        try:
            parser.feed(text)
            text = " ".join(parser.parts)
        except Exception:
            text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:500_000]


def robots_allowed(url: str):
    parsed = urllib.parse.urlparse(url)
    robots_url = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        return rp.can_fetch(USER_AGENT, url), robots_url
    except Exception:
        # If robots.txt cannot be obtained, do not infer a block; continue with one low-frequency request.
        return True, robots_url


def fetch_source(url: str):
    allowed, robots_url = robots_allowed(url)
    checked_at = utc_now()
    if not allowed:
        return {
            "status": "robots_blocked",
            "checked_at": checked_at,
            "robots_url": robots_url,
            "sha256": None,
            "http_status": None,
            "content_length": 0,
            "etag": None,
            "last_modified": None,
            "error": None,
        }

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5",
            "Accept-Language": "ja,en;q=0.7",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            raw = resp.read(MAX_BYTES + 1)
            truncated = len(raw) > MAX_BYTES
            raw = raw[:MAX_BYTES]
            content_type = resp.headers.get("Content-Type", "")
            normalized = normalize_text(raw, content_type)
            digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest() if normalized else None
            return {
                "status": "ok",
                "checked_at": checked_at,
                "robots_url": robots_url,
                "sha256": digest,
                "http_status": getattr(resp, "status", 200),
                "content_length": len(normalized),
                "etag": resp.headers.get("ETag"),
                "last_modified": resp.headers.get("Last-Modified"),
                "final_url": resp.geturl(),
                "truncated": truncated,
                "error": None,
            }
    except urllib.error.HTTPError as exc:
        return {
            "status": "http_error",
            "checked_at": checked_at,
            "robots_url": robots_url,
            "sha256": None,
            "http_status": exc.code,
            "content_length": 0,
            "etag": exc.headers.get("ETag") if exc.headers else None,
            "last_modified": exc.headers.get("Last-Modified") if exc.headers else None,
            "error": f"HTTP {exc.code}",
        }
    except Exception as exc:
        return {
            "status": "fetch_error",
            "checked_at": checked_at,
            "robots_url": robots_url,
            "sha256": None,
            "http_status": None,
            "content_length": 0,
            "etag": None,
            "last_modified": None,
            "error": f"{type(exc).__name__}: {exc}",
        }


def change_kind(previous, current):
    if not previous:
        return None
    if previous.get("status") != current.get("status"):
        return f"status: {previous.get('status')} → {current.get('status')}"
    if current.get("status") == "ok" and previous.get("sha256") and current.get("sha256"):
        if previous["sha256"] != current["sha256"]:
            return "content_changed"
    if previous.get("http_status") != current.get("http_status"):
        return f"HTTP: {previous.get('http_status')} → {current.get('http_status')}"
    return None


def main():
    payload = load_json(DB, {"opportunities": []})
    previous_state = load_json(STATE, {"version": 1, "sources": {}})
    old_sources = previous_state.get("sources", {})
    new_sources = {}
    changes = []
    errors = []
    initialized = 0

    items = payload.get("opportunities", [])
    for index, item in enumerate(items):
        item_id = item["id"]
        url = item.get("source_url")
        if not url or not url.startswith("https://"):
            continue

        current = fetch_source(url)
        current.update({
            "id": item_id,
            "title": item.get("title"),
            "url": url,
            "source_name": item.get("source_name"),
        })
        previous = old_sources.get(item_id)
        kind = change_kind(previous, current)
        if previous is None:
            initialized += 1
        elif kind:
            changes.append({
                "id": item_id,
                "title": item.get("title"),
                "url": url,
                "kind": kind,
                "previous_status": previous.get("status"),
                "current_status": current.get("status"),
                "previous_http": previous.get("http_status"),
                "current_http": current.get("http_status"),
            })

        if current["status"] in {"http_error", "fetch_error"}:
            errors.append({
                "id": item_id,
                "title": item.get("title"),
                "url": url,
                "status": current["status"],
                "error": current.get("error"),
            })

        new_sources[item_id] = current
        if index < len(items) - 1:
            time.sleep(SLEEP_SECONDS)

    generated_at = utc_now()
    state = {"version": 1, "generated_at": generated_at, "sources": new_sources}
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Asset Radar Source Monitor",
        "",
        f"- Checked: `{generated_at}`",
        f"- Sources: **{len(new_sources)}**",
        f"- Newly initialized: **{initialized}**",
        f"- Changes requiring review: **{len(changes)}**",
        f"- Fetch errors: **{len(errors)}**",
        "",
    ]

    if changes:
        lines += ["## Changes requiring human review", ""]
        for ch in changes:
            lines += [
                f"- **{ch['title']}** — `{ch['kind']}`",
                f"  - {ch['url']}",
            ]
        lines.append("")
    else:
        lines += ["## Changes requiring human review", "", "None.", ""]

    blocked = [s for s in new_sources.values() if s.get("status") == "robots_blocked"]
    if blocked:
        lines += ["## Skipped by robots.txt", ""]
        for src in blocked:
            lines.append(f"- **{src['title']}** — {src['url']}")
        lines.append("")

    if errors:
        lines += ["## Fetch errors", ""]
        for err in errors:
            lines.append(f"- **{err['title']}** — {err['error']} — {err['url']}")
        lines.append("")

    lines += [
        "## Policy",
        "",
        "This monitor never changes opportunity conditions automatically. A detected change only creates a review candidate; the official source must be re-verified before editing the Radar database.",
        "",
    ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")

    summary = {
        "generated_at": generated_at,
        "source_count": len(new_sources),
        "initialized": initialized,
        "change_count": len(changes),
        "error_count": len(errors),
        "alert": bool(changes),
    }
    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
