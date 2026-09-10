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
USER_AGENT = "WarashiiAssetRadar/0.3 (+https://y-ai-lab.github.io/warashii-dashboard/)"
REQUEST_TIMEOUT = 20
MAX_BYTES = 2_000_000
SLEEP_SECONDS = 1.0
STATE_VERSION = 2


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


def between(text: str, start_markers: list[str], end_markers: list[str], *, lead: int = 0, max_len: int = 30_000) -> str:
    starts = [text.find(m) for m in start_markers if text.find(m) >= 0]
    if not starts:
        return ""
    start = max(0, min(starts) - lead)
    ends = []
    for marker in end_markers:
        idx = text.find(marker, start + 1)
        if idx >= 0:
            ends.append(idx)
    end = min(ends) if ends else min(len(text), start + max_len)
    return text[start:end][:max_len]


def material_text(url: str, normalized: str) -> tuple[str, str]:
    """Return a stable campaign-specific fingerprint input and its scope label."""
    host = urllib.parse.urlparse(url).netloc.lower()

    if host == "pc.moppy.jp":
        # Moppy pages contain volatile review counts, rankings and recommendations.
        # Hash only the campaign summary (including reward) plus acquisition/exclusion rules.
        summary = between(
            normalized,
            ["予定反映"],
            ["ポイ活応援サービス"],
            lead=500,
            max_len=8_000,
        )
        rules = between(
            normalized,
            ["〖獲得条件〗", "【獲得条件】"],
            ["広告概要", "必読ポイントを必ず獲得するために", "クチコミをもっと見る"],
            max_len=20_000,
        )
        material = re.sub(r"\s+", " ", f"{summary} {rules}").strip()
        if material:
            return material, "moppy_campaign_terms"

    if host == "web.powl.jp":
        # Public Powl pages may change generic notices/UI. The public page does not always expose
        # the logged-in reward amount, so monitor the qualification/rejection terms only.
        rules = between(
            normalized,
            ["≪成果条件≫", "成果条件"],
            ["広告の利用方法", "注意事項", "よくある質問"],
            max_len=18_000,
        )
        if rules:
            return re.sub(r"\s+", " ", rules).strip(), "powl_public_terms"

    return normalized, "full_visible_text"


def robots_allowed(url: str):
    parsed = urllib.parse.urlparse(url)
    robots_url = urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        return rp.can_fetch(USER_AGENT, url), robots_url
    except Exception:
        return True, robots_url


def self_managed_state(item: dict):
    checked_at = utc_now()
    return {
        "status": "self_managed",
        "checked_at": checked_at,
        "robots_url": None,
        "sha256": hashlib.sha256(item["id"].encode()).hexdigest(),
        "http_status": None,
        "content_length": 0,
        "etag": None,
        "last_modified": None,
        "final_url": item.get("source_url"),
        "truncated": False,
        "fingerprint_scope": "self_managed_no_external_alert",
        "error": None,
    }


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
            "fingerprint_scope": "robots_blocked",
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
            material, scope = material_text(url, normalized)
            digest = hashlib.sha256(material.encode("utf-8")).hexdigest() if material else None
            return {
                "status": "ok",
                "checked_at": checked_at,
                "robots_url": robots_url,
                "sha256": digest,
                "http_status": getattr(resp, "status", 200),
                "content_length": len(material),
                "etag": resp.headers.get("ETag"),
                "last_modified": resp.headers.get("Last-Modified"),
                "final_url": resp.geturl(),
                "truncated": truncated,
                "fingerprint_scope": scope,
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
            "fingerprint_scope": "fetch_failed",
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
            "fingerprint_scope": "fetch_failed",
            "error": f"{type(exc).__name__}: {exc}",
        }


def change_kind(previous, current):
    if not previous:
        return None
    if previous.get("status") != current.get("status"):
        return f"status: {previous.get('status')} → {current.get('status')}"
    if current.get("status") == "ok" and previous.get("sha256") and current.get("sha256"):
        if previous["sha256"] != current["sha256"]:
            return "material_content_changed"
    if previous.get("http_status") != current.get("http_status"):
        return f"HTTP: {previous.get('http_status')} → {current.get('http_status')}"
    return None


def main():
    payload = load_json(DB, {"opportunities": []})
    previous_state = load_json(STATE, {"version": 0, "sources": {}})
    old_sources = previous_state.get("sources", {})
    migration = previous_state.get("version") != STATE_VERSION
    new_sources = {}
    changes = []
    errors = []
    initialized = 0
    migrated = 0

    items = payload.get("opportunities", [])
    for index, item in enumerate(items):
        item_id = item["id"]
        url = item.get("source_url")
        if not url or not url.startswith("https://"):
            continue

        if item_id == "warashii-asset-radar-mvp":
            current = self_managed_state(item)
        else:
            current = fetch_source(url)

        current.update({
            "id": item_id,
            "title": item.get("title"),
            "url": url,
            "source_name": item.get("source_name"),
        })
        previous = old_sources.get(item_id)

        if previous is None:
            initialized += 1
        elif migration:
            migrated += 1
        else:
            kind = change_kind(previous, current)
            if kind:
                changes.append({
                    "id": item_id,
                    "title": item.get("title"),
                    "url": url,
                    "kind": kind,
                    "scope": current.get("fingerprint_scope"),
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
        if index < len(items) - 1 and current["status"] not in {"self_managed"}:
            time.sleep(SLEEP_SECONDS)

    generated_at = utc_now()
    state = {"version": STATE_VERSION, "generated_at": generated_at, "sources": new_sources}
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Asset Radar Source Monitor",
        "",
        f"- Checked: `{generated_at}`",
        f"- Sources: **{len(new_sources)}**",
        f"- Newly initialized: **{initialized}**",
        f"- Fingerprints migrated: **{migrated}**",
        f"- Changes requiring review: **{len(changes)}**",
        f"- Fetch errors: **{len(errors)}**",
        "",
    ]

    if changes:
        lines += ["## Changes requiring human review", ""]
        for ch in changes:
            lines += [
                f"- **{ch['title']}** — `{ch['kind']}` / `{ch.get('scope')}`",
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

    self_managed = [s for s in new_sources.values() if s.get("status") == "self_managed"]
    if self_managed:
        lines += ["## Self-managed sources", ""]
        for src in self_managed:
            lines.append(f"- **{src['title']}** — internal repository changes do not trigger external-condition alerts")
        lines.append("")

    if errors:
        lines += ["## Fetch errors", ""]
        for err in errors:
            lines.append(f"- **{err['title']}** — {err['error']} — {err['url']}")
        lines.append("")

    lines += [
        "## Policy",
        "",
        "The monitor fingerprints campaign-specific reward/qualification text where possible, instead of volatile reviews/rankings. It never changes opportunity conditions automatically. A detected material change only creates a review candidate; the primary source must be re-verified before editing the Radar database.",
        "",
    ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")

    summary = {
        "generated_at": generated_at,
        "source_count": len(new_sources),
        "initialized": initialized,
        "migrated": migrated,
        "change_count": len(changes),
        "error_count": len(errors),
        "alert": bool(changes),
    }
    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
