#!/usr/bin/env python3
"""Discover review-only opportunity signals without auto-promoting them to Radar."""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "data" / "discovery_sources.json"
QUEUE = ROOT / "data" / "discovery_queue.json"
SUMMARY = ROOT / "data" / "discovery" / "summary.json"
REPORT = ROOT / "data" / "discovery" / "latest_report.md"
RADAR = ROOT / "data" / "opportunities.json"
USER_AGENT = "WarashiiAssetRadarDiscovery/1.0 (+https://y-ai-lab.github.io/warashii-dashboard/)"
TRACKING_PARAMS = {"ref", "refer", "referral", "referral_code", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"}


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        self._href = dict(attrs).get("href")
        self._text = []

    def handle_data(self, data: str) -> None:
        if self._href:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href:
            text = re.sub(r"\s+", " ", " ".join(self._text)).strip()
            self.links.append((self._href, text))
            self._href = None
            self._text = []


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def normalize_url(raw: str) -> str:
    parts = urlsplit(raw.strip())
    scheme = parts.scheme.lower() or "https"
    host = parts.netloc.lower()
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    if path != "/":
        path = path.rstrip("/")
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() not in TRACKING_PARAMS]
    return urlunsplit((scheme, host, path, urlencode(query), ""))


def candidate_id(url: str) -> str:
    return "signal-" + hashlib.sha1(normalize_url(url).encode()).hexdigest()[:12]


def fetch_text(url: str, token: str | None = None, accept: str = "text/html,application/xhtml+xml") -> str:
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    if token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-GitHub-Api-Version"] = "2022-11-28"
    req = Request(url, headers=headers)
    with urlopen(req, timeout=20) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read(2_000_000).decode(charset, errors="replace")


def robots_allowed(url: str) -> tuple[bool, str]:
    parts = urlsplit(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    try:
        text = fetch_text(robots_url, accept="text/plain,*/*")
    except HTTPError as exc:
        if exc.code == 404:
            return True, "robots-not-found"
        return False, f"robots-http-{exc.code}"
    except Exception as exc:  # conservative on unknown robots state
        return False, f"robots-error:{type(exc).__name__}"

    current_agents: list[str] = []
    disallows: list[str] = []
    applies = False
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, value = [x.strip() for x in line.split(":", 1)]
        key = key.lower()
        if key == "user-agent":
            if current_agents and applies:
                break
            current_agents = [value.lower()]
            applies = value == "*" or "warashiiassetradardiscovery" in value.lower()
        elif key == "disallow" and applies and value:
            disallows.append(value)
    path = parts.path or "/"
    for rule in disallows:
        if rule == "/" or path.startswith(rule):
            return False, f"robots-disallow:{rule}"
    return True, "allowed"


def known_radar_urls() -> set[str]:
    payload = json.loads(RADAR.read_text(encoding="utf-8"))
    return {normalize_url(item.get("source_url", "")) for item in payload.get("opportunities", []) if item.get("source_url")}


def make_signal(*, url: str, title: str, source_id: str, source_name: str, trust: str, signal_type: str, reason: str, strength: int) -> dict:
    clean = normalize_url(url)
    return {
        "id": candidate_id(clean),
        "title": title.strip()[:240] or clean,
        "candidate_url": clean,
        "source_id": source_id,
        "source_name": source_name,
        "signal_type": signal_type,
        "trust": trust,
        "signal_strength": max(1, min(int(strength), 5)),
        "reason": reason,
        "status": "REVIEW_REQUIRED",
        "score_status": "NOT_SCORED",
        "official_verification_required": True,
        "discovered_at": today(),
        "last_seen_at": today(),
    }


def discover_html(source: dict) -> tuple[list[dict], dict]:
    allowed, robots = robots_allowed(source["url"])
    stat = {"id": source["id"], "name": source["name"], "kind": "html_links", "status": robots, "found": 0}
    if not allowed:
        return [], stat
    html = fetch_text(source["url"])
    parser = LinkParser()
    parser.feed(html)
    out: list[dict] = []
    allowed_hosts = {h.lower() for h in source.get("allowed_hosts", [])}
    patterns = source.get("path_patterns", [])
    keywords = [x.lower() for x in source.get("keywords", [])]
    for href, text in parser.links:
        url = normalize_url(urljoin(source["url"], href))
        parts = urlsplit(url)
        if allowed_hosts and parts.netloc not in allowed_hosts:
            continue
        if patterns and not any(p in parts.path for p in patterns):
            continue
        haystack = f"{text} {parts.path}".lower()
        keyword_hits = [k for k in keywords if k in haystack]
        strength = 3 if keyword_hits else 2
        reason = f"Found on {source['name']}"
        if keyword_hits:
            reason += "; keywords: " + ", ".join(keyword_hits[:4])
        out.append(make_signal(url=url, title=text or parts.path.rsplit("/", 1)[-1], source_id=source["id"], source_name=source["name"], trust=source.get("trust", "platform_signal"), signal_type="platform_link", reason=reason, strength=strength))
    unique = {item["candidate_url"]: item for item in out}
    stat["found"] = len(unique)
    return list(unique.values()), stat


def discover_github(query: dict) -> tuple[list[dict], dict]:
    token = os.getenv("GITHUB_TOKEN")
    cutoff = (datetime.now(timezone.utc) - timedelta(days=int(query.get("days", 30)))).date().isoformat()
    q = f"{query['query']} pushed:>{cutoff} stars:>={int(query.get('min_stars', 5))}"
    api = "https://api.github.com/search/repositories?" + urlencode({"q": q, "sort": "updated", "order": "desc", "per_page": 10})
    raw = fetch_text(api, token=token, accept="application/vnd.github+json")
    payload = json.loads(raw)
    signals: list[dict] = []
    for repo in payload.get("items", []):
        if repo.get("archived") or repo.get("fork"):
            continue
        desc = (repo.get("description") or "").strip()
        stars = int(repo.get("stargazers_count") or 0)
        signals.append(make_signal(
            url=repo["html_url"],
            title=f"{repo['full_name']} — {desc}" if desc else repo["full_name"],
            source_id=query["id"],
            source_name=query["name"],
            trust=query.get("trust", "community_signal"),
            signal_type="github_search",
            reason=f"Recently updated public repo matching discovery query; stars={stars}. Community signal only.",
            strength=1 if stars < 20 else 2,
        ))
    return signals, {"id": query["id"], "name": query["name"], "kind": "github_search", "status": "ok", "found": len(signals)}


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    queue = json.loads(QUEUE.read_text(encoding="utf-8")) if QUEUE.exists() else {"schema_version": "1.0", "candidates": []}
    existing = {item["candidate_url"]: item for item in queue.get("candidates", [])}
    known = known_radar_urls()
    collected: list[dict] = []
    stats: list[dict] = []
    errors: list[str] = []

    for source in config.get("sources", []):
        try:
            found, stat = discover_html(source)
            collected.extend(found)
            stats.append(stat)
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError) as exc:
            stats.append({"id": source["id"], "name": source["name"], "kind": source.get("kind"), "status": f"error:{type(exc).__name__}", "found": 0})
            errors.append(f"{source['name']}: {type(exc).__name__}: {exc}")
        time.sleep(1)

    for query in config.get("github_queries", []):
        try:
            found, stat = discover_github(query)
            collected.extend(found)
            stats.append(stat)
        except Exception as exc:
            stats.append({"id": query["id"], "name": query["name"], "kind": "github_search", "status": f"error:{type(exc).__name__}", "found": 0})
            errors.append(f"{query['name']}: {type(exc).__name__}: {exc}")

    max_new = int(config.get("max_new_per_run", 8))
    new_items: list[dict] = []
    for item in sorted(collected, key=lambda x: (-x["signal_strength"], x["candidate_url"])):
        if item["candidate_url"] in known:
            continue
        if item["candidate_url"] in existing:
            existing[item["candidate_url"]]["last_seen_at"] = today()
            continue
        if len(new_items) >= max_new:
            break
        existing[item["candidate_url"]] = item
        new_items.append(item)

    candidates = sorted(existing.values(), key=lambda x: (x.get("status") != "REVIEW_REQUIRED", x.get("discovered_at", ""), x.get("signal_strength", 0)), reverse=True)
    generated = now_iso()
    queue_payload = {"schema_version": "1.0", "generated_at": generated, "candidates": candidates}
    QUEUE.write_text(json.dumps(queue_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    summary = {
        "generated_at": generated,
        "new_count": len(new_items),
        "queue_count": len(candidates),
        "source_count": len(stats),
        "error_count": len(errors),
        "alert": bool(new_items),
        "source_stats": stats,
    }
    SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Opportunity Discovery",
        "",
        f"- Checked: `{generated}`",
        f"- Discovery sources: **{len(stats)}**",
        f"- New review candidates: **{len(new_items)}**",
        f"- Queue total: **{len(candidates)}**",
        f"- Source errors: **{len(errors)}**",
        "",
        "> **REVIEW_REQUIRED = 実行禁止。** 発見シグナルは推薦ではありません。公式サイト/公式Docsへ戻り、Hard Gateと100点評価を通過するまでRadar本体には入りません。",
        "",
        "## New candidates",
        "",
    ]
    if new_items:
        for item in new_items:
            lines += [
                f"- **{item['title']}**",
                f"  - URL: {item['candidate_url']}",
                f"  - Signal: {item['source_name']} / {item['trust']} / strength {item['signal_strength']}/5",
                f"  - Reason: {item['reason']}",
            ]
    else:
        lines.append("None.")
    lines += ["", "## Source status", ""]
    for stat in stats:
        lines.append(f"- **{stat['name']}** — {stat['status']} / found {stat['found']}")
    if errors:
        lines += ["", "## Errors", ""] + [f"- {e}" for e in errors]
    lines += [
        "",
        "## Promotion gate",
        "",
        "1. プロジェクト自身の公式サイト/公式Docs/公式SNSを特定する。",
        "2. 0円で開始・継続できるか、地域/KYC/資金条件を確認する。",
        "3. Hard Gateに触れないことを確認する。",
        "4. 100点評価を行い、GO/WATCH/STOPを決める。",
        "5. GO/WATCHに値するものだけ data/opportunities.json へ追加する。",
        "",
    ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
