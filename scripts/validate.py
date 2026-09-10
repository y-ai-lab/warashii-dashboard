#!/usr/bin/env python3
import json
import sys
from datetime import date, datetime
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data" / "opportunities.json"
STALE_DAYS = 14

SCORE_MAX = {
    "initial_cost": 20,
    "expected_value": 20,
    "risk": 15,
    "time_efficiency": 15,
    "reproducibility": 10,
    "compoundability": 10,
    "automation": 5,
    "mobile": 5,
}

REQUIRED = {
    "id", "title", "provider", "category", "asset_type", "recommendation",
    "required_funds_yen", "reward_label", "work_minutes", "work_time_label",
    "acquisition_days_label", "risk_label", "conditions", "mobile",
    "conversion_route", "verified_at", "source_url", "source_name",
    "score_components",
}


def fail(errors):
    for error in errors:
        print(f"ERROR: {error}")
    return 1


def main():
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    items = payload.get("opportunities", [])
    errors = []
    seen = set()

    if not isinstance(items, list) or not items:
        errors.append("opportunities must be a non-empty list")
        return fail(errors)

    for i, item in enumerate(items, start=1):
        prefix = f"item #{i} ({item.get('id', 'no-id')})"
        missing = REQUIRED - set(item)
        if missing:
            errors.append(f"{prefix}: missing fields: {sorted(missing)}")

        item_id = item.get("id")
        if item_id in seen:
            errors.append(f"{prefix}: duplicate id")
        seen.add(item_id)

        if item.get("recommendation") not in {"GO", "WATCH", "STOP"}:
            errors.append(f"{prefix}: recommendation must be GO/WATCH/STOP")

        if item.get("mobile") not in {"yes", "partial", "no"}:
            errors.append(f"{prefix}: mobile must be yes/partial/no")

        if not str(item.get("source_url", "")).startswith("https://"):
            errors.append(f"{prefix}: source_url must use https")

        try:
            verified = datetime.strptime(item.get("verified_at", ""), "%Y-%m-%d").date()
            age = (date.today() - verified).days
            if age > STALE_DAYS:
                print(f"WARNING: {prefix}: verified_at is {age} days old")
        except ValueError:
            errors.append(f"{prefix}: verified_at must be YYYY-MM-DD")

        components = item.get("score_components", {})
        if set(components) != set(SCORE_MAX):
            errors.append(f"{prefix}: score_components keys must exactly match scoring model")
        else:
            total = 0
            for key, maximum in SCORE_MAX.items():
                value = components[key]
                if not isinstance(value, (int, float)) or not 0 <= value <= maximum:
                    errors.append(f"{prefix}: {key} must be between 0 and {maximum}")
                else:
                    total += value
            if total > 100:
                errors.append(f"{prefix}: score total exceeds 100")
            print(f"OK: {prefix}: score={total}/100")

    if errors:
        return fail(errors)

    print(f"Validated {len(items)} opportunities successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
