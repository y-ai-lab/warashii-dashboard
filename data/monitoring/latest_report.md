# Asset Radar Source Monitor

- Checked: `2026-10-04T18:08:53Z`
- Sources: **15**
- Newly initialized: **0**
- Fingerprints migrated: **0**
- Changes requiring review: **4**
- Fetch errors: **1**

## Changes requiring human review

- **みずほ銀行 新規口座開設 × Powl** — `status: ok → http_error` / `fetch_failed`
  - https://web.powl.jp/reward/35100
- **SBI新生銀行 新規口座開設 × モッピー** — `material_content_changed` / `moppy_campaign_terms`
  - https://pc.moppy.jp/ad/detail.php?site_id=142543
- **三井住友銀行 Olive 新規口座開設 × モッピー** — `material_content_changed` / `moppy_campaign_terms`
  - https://pc.moppy.jp/ad/detail.php?site_id=155058
- **松井証券 無料口座開設 × モッピー** — `material_content_changed` / `moppy_campaign_terms`
  - https://pc.moppy.jp/ad/detail.php?s_id=129569

## Skipped by robots.txt

- **Grass DePIN ポイント蓄積** — https://www.grass.io/terms-and-conditions/
- **DAWN Validator Extension ポイント蓄積** — https://www.dawninternet.com/validator-extension
- **DeNet Watcher Node** — https://docs.denet.pro/watcher.html
- **Cloudflare Pages Free で公開Web資産を保有** — https://developers.cloudflare.com/pages/platform/limits/
- **Cloudflare D1 Free で案件DBを資産化** — https://developers.cloudflare.com/d1/platform/pricing/

## Self-managed sources

- **わらしべ Asset Radar MVP** — internal repository changes do not trigger external-condition alerts

## Fetch errors

- **みずほ銀行 新規口座開設 × Powl** — HTTP 404 — https://web.powl.jp/reward/35100

## Policy

The monitor fingerprints campaign-specific reward/qualification text where possible, instead of volatile reviews/rankings. It never changes opportunity conditions automatically. A detected material change only creates a review candidate; the primary source must be re-verified before editing the Radar database.
