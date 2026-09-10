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
USER_AGENT = "WarashiiAssetRadarDiscovery/1.2 (+https://y-ai-lab.github.io/warashii-dashboard/)"
TRACKING_PARAMS = {"ref", "refer", "referral", "referral_code", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"}
GENERIC_NAV_TEXT = {"all", "campaigns", "earn", "explore", "home", "quests", "spaces"}
GENERIC_GALXE_PATHS = {"/quest", "/quest/explore", "/quest/explore/all", "/quest/spaces"}
HARD_GATE_TERMS = {
    "multi-wallet",
    "multi wallet",
    "multiple wallets",
    "many wallets",
    "sybil",
    "wallet farm",
    "wallet farming",
    "bulk wallets",
    "mass wallets",
    "farm wallets",
    "airdrop bot",
    "auto airdrop",
}
UTILITY_ONLY_TERMS = {
    "devnet faucet",
    "testnet faucet",
    "public web faucet",
    "test token faucet",
}


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
    except Exception as exc:
        return False, f"robots-error:{type(exc).__name__}"

    applies = False
    disallows: list[str] = []
    seen_matching_block = False
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, value = [x.strip() for x in line.split(":", 1)]
        key = key.lower()
        if key == "user-agent":
            if seen_matching_block and not applies:
                break
            applies = value == "*" or "warashiiassetradardiscovery" in value.lower()
            seen_matching_block = seen_matching_block or applies
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


def contains_term(text: str, terms: set[str]) -> bool:
    haystack = re.sub(r"\s+", " ", text).strip().lower()
    return any(term in haystack for term in terms)


def is_navigation_noise(source_id: str, source_url: str, candidate_url: str, title: str) -> bool:
    clean = normalize_url(candidate_url)
    if clean == normalize_url(source_url):
        return True
    path = urlsplit(clean).path.rstrip("/") or "/"
    text = re.sub(r"\s+", " ", title).strip().lower()
    if source_id == "galxe-explore" and path in GENERIC_GALXE_PATHS:
        return True
    if text in GENERIC_NAV_TEXT:
        return True
    return False


def is_github_hard_gate_noise(item: dict) -> bool:
    if item.get("signal_type") != "github_search":
        return False
    text = " ".join([
        str(item.get("title", "")),
        str(item.get("reason", "")),
        str(item.get("candidate_url", "")),
    ])
    return contains_term(text, HARD_GATE_TERMS)


def is_github_utility_only(item: dict) -> bool:
    if item.get("signal_type") != "github_search":
        return False
    text = " ".join([
        str(item.get("title", "")),
        str(item.get("candidate_url", "")),
    ])
    return contains_term(text, UTILITY_ONLY_TERMS)


def prune_existing_noise(items: list[dict], sources: list[dict]) -> tuple[list[dict], dict[str, int]]:
    source_urls = {s["id"]: s.get("url", "") for s in sources}
    kept: list[dict] = []
    counts = {"navigation": 0, "hard_gate": 0, "utility": 0}
    for item in items:
        source_url = source_urls.get(item.get("source_id", ""), "")
        if source_url and item.get("signal_type") == "platform_link" and is_navigation_noise(
            item.get("source_id", ""), source_url, item.get("candidate_url", ""), item.get("title", "")
        ):
            counts["navigation"] += 1
            continue
        if is_github_hard_gate_noise(item):
            counts["hard_gate"] += 1
            continue
        if is_github_utility_only(item):
            counts["utility"] += 1
            continue
        kept.append(item)
    return kept, counts


def discover_html(source: dict) -> tuple[list[dict], dict]:
    allowed, robots = robots_allowed(source["url"])
    stat = {
        "id": source["id"],
        "name": source["name"],
        "kind": "html_links",
        "status": robots,
        "found": 0,
        "noise_filtered": 0,
        "hard_gate_filtered": 0,
        "utility_filtered": 0,
    }
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
        if is_navigation_noise(source["id"], source["url"], url, text):
            stat["noise_filtered"] += 1
            continue
        haystack = f"{text} {parts.path}".lower()
        keyword_hits = [k for k in keywords if k in haystack]
        if not keyword_hits and len(parts.path.strip("/").split("/")) < 3:
            stat["noise_filtered"] += 1
            continue
        strength = 3 if keyword_hits else 2
        reason = f"Found on {source['name']}"
        if keyword_hits:
            reason += "; keywords: " + ", ".join(keyword_hits[:4])
        out.append(make_signal(
            url=url,
            title=text or parts.path.rsplit("/", 1)[-1],
            source_id=source["id"],
            source_name=source["name"],
            trust=source.get("trust", "platform_signal"),
            signal_type="platform_link",
            reason=reason,
            strength=strength,
        ))
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
    hard_gate_filtered = 0
    utility_filtered = 0
    for repo in payload.get("items", []):
        if repo.get("archived") or repo.get("fork"):
            continue
        desc = (repo.get("description") or "").strip()
        title = f"{repo['full_name']} — {desc}" if desc else repo["full_name"]
        screening_text = f"{title} {repo.get('html_url', '')}"
        if contains_term(screening_text, HARD_GATE_TERMS):
            hard_gate_filtered += 1
            continue
        if contains_term(screening_text, UTILITY_ONLY_TERMS):
            utility_filtered += 1
            continue
        stars = int(repo.get("stargazers_count") or 0)
        signals.append(make_signal(
            url=repo["html_url"],
            title=title,
            source_id=query["id"],
            source_name=query["name"],
            trust=query.get("trust", "community_signal"),
            signal_type="github_search",
            reason=f"Recently updated public repo matching discovery query; stars={stars}. Community signal only.",
            strength=1 if stars < 20 else 2,
        ))
    return signals, {
        "id": query["id"],
        "name": query["name"],
        "kind": "github_search",
        "status": "ok",
        "found": len(signals),
        "noise_filtered": 0,
        "hard_gate_filtered": hard_gate_filtered,
        "utility_filtered": utility_filtered,
    }


def main() -> None:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    raw_queue = json.loads(QUEUE.read_text(encoding="utf-8")) if QUEUE.exists() else {"schema_version": "1.0", "candidates": []}
    cleaned, pruned = prune_existing_noise(raw_queue.get("candidates", []), config.get("sources", []))
    existing = {item["candidate_url"]: item for item in cleaned}
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
            stats.append({
                "id": source["id"],
                "name": source["name"],
                "kind": source.get("kind"),
                "status": f"error:{type(exc).__name__}",
                "found": 0,
                "noise_filtered": 0,
                "hard_gate_filtered": 0,
                "utility_filtered": 0,
            })
            errors.append(f"{source['name']}: {type(exc).__name__}: {exc}")
        time.sleep(1)

    for query in config.get("github_queries", []):
        try:
            found, stat = discover_github(query)
            collected.extend(found)
            stats.append(stat)
        except Exception as exc:
            stats.append({
                "id": query["id"],
                "name": query["name"],
                "kind": "github_search",
                "status": f"error:{type(exc).__name__}",
                "found": 0,
                "noise_filtered": 0,
                "hard_gate_filtered": 0,
                "utility_filtered": 0,
            })
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

    candidates = sorted(
        existing.values(),
        key=lambda x: (x.get("discovered_at", ""), x.get("signal_strength", 0), x.get("candidate_url", "")),
        reverse=True,
    )
    generated = now_iso()
    queue_payload = {"schema_version": "1.3", "generated_at": generated, "candidates": candidates}
    QUEUE.write_text(json.dumps(queue_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    nav_filtered = pruned["navigation"] + sum(int(s.get("noise_filtered", 0)) for s in stats)
    hard_gate_filtered = pruned["hard_gate"] + sum(int(s.get("hard_gate_filtered", 0)) for s in stats)
    utility_filtered = pruned["utility"] + sum(int(s.get("utility_filtered", 0)) for s in stats)
    filtered_total = nav_filtered + hard_gate_filtered + utility_filtered
    summary = {
        "generated_at": generated,
        "new_count": len(new_items),
        "queue_count": len(candidates),
        "source_count": len(stats),
        "error_count": len(errors),
        "noise_pruned": filtered_total,
        "navigation_filtered": nav_filtered,
        "hard_gate_filtered": hard_gate_filtered,
        "utility_filtered": utility_filtered,
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
        f"- Navigation/noise filtered: **{nav_filtered}**",
        f"- Hard Gate filtered: **{hard_gate_filtered}**",
        f"- Utility-only filtered: **{utility_filtered}**",
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
        lines.append(
            f"- **{stat['name']}** — {stat['status']} / found {stat['found']} / navigation-noise {stat.get('noise_filtered', 0)} / hard-gate {stat.get('hard_gate_filtered', 0)} / utility {stat.get('utility_filtered', 0)}"
        )
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
