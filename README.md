# わらしべ Asset Radar

0円資産構築プロジェクトのための、**無料/少額で取得可能な資産・権利・ポイント・デジタル資産を比較する公開Radar**です。

## 目的

単発の「お得情報一覧」ではなく、次の3問で案件を選別します。

1. 今0円から取れる価値は何か？
2. それを次の何に変換できるか？
3. この行動は資産として残るか？

調査結果そのものを `情報資産 → Web資産 → 集客資産 → 紹介/収益資産` に変換することを狙います。

## 現在のMVP

- `index.html` — UI
- `styles.css` — レスポンシブデザイン
- `app.js` — Score計算、検索、フィルター、鮮度判定
- `data/opportunities.json` — 案件DB
- `scripts/validate.py` — DB検証
- `.github/workflows/validate.yml` — 無料CI

外部JS/CSSライブラリ、ビルド処理、サーバーは不要です。

2026-09-10時点で、ポイント/金融、少額投資、DePIN、Airdrop/Testnet、無料デジタル資産を横断して14件を収録しています。

## 100点評価

| 項目 | 最大点 |
|---|---:|
| 初期費用 | 20 |
| 期待値 | 20 |
| リスク | 15 |
| 時間効率 | 15 |
| 再現性 | 10 |
| 複利性 | 10 |
| 自動化可能性 | 5 |
| スマホ完結度 | 5 |
| **合計** | **100** |

`app.js` が `score_components` を合算します。リスク欄は「高得点ほど安全」です。

## 鮮度ルール

`verified_at` から **14日を超えると自動で「要再確認」** と表示します。

金融・ポイント・Web3・キャンペーンは条件変更が早いため、実行推奨前には一次情報を再確認します。

情報源の優先順位：

1. 公式サイト
2. 公式SNS
3. 公式ドキュメント
4. ポイントサイト等、報酬条件を直接提示する公式案件ページ
5. 信頼できる最新メディア
6. コミュニティ情報

コミュニティ情報だけでGO判定はしません。

## Recommendation

- `GO` — 現時点で実行/構築価値が高い
- `WATCH` — 条件・リスク・報酬不確実性を確認してから実行
- `STOP` — 現時点では見送る

ポイント案件は表示額が変動するため、Radarの金額は確認日時点のスナップショットです。実行直前の案件ページ表示を最終値とします。

## 新しい案件の追加

`data/opportunities.json` の `opportunities` に1件追加します。

最低限、以下を持たせます。

```json
{
  "id": "unique-id",
  "title": "案件名",
  "provider": "提供元",
  "category": "カテゴリ",
  "asset_type": "資産タイプ",
  "recommendation": "GO",
  "required_funds_yen": 0,
  "potential_value_yen": 1000,
  "reward_label": "1,000円相当",
  "work_minutes": 15,
  "work_time_label": "約15分",
  "acquisition_days_label": "約30日",
  "risk_label": "1 / 5",
  "conditions": ["条件1"],
  "deadline_label": "2026-12-31",
  "mobile": "yes",
  "conversion_route": "取得資産 → 次の資産",
  "verified_at": "2026-09-10",
  "source_url": "https://example.com",
  "source_name": "公式サイト",
  "notes": "補足",
  "score_components": {
    "initial_cost": 20,
    "expected_value": 15,
    "risk": 14,
    "time_efficiency": 13,
    "reproducibility": 5,
    "compoundability": 5,
    "automation": 2,
    "mobile": 5
  }
}
```

`mobile` は `yes` / `partial` / `no`。

## GitHub Pagesで公開する

`main` への変更は `.github/workflows/deploy-pages.yml` により検証・ビルドされ、GitHub Pagesへ自動公開されます。

公開URL: <https://y-ai-lab.github.io/warashii-dashboard/>

ローカルでは次のコマンドでCIと同じチェックを実行できます。

```sh
npm ci
npm run lint
npm run test
npm run typecheck
npm run build
```

## 0円で公開する — Cloudflare Pagesを第一候補にする

Asset Radarは将来的に紹介リンク、検索流入、収益導線を持つ可能性があります。そのため、公開サイトは **Cloudflare Pages Free** を第一候補にします。

MVPは静的ファイルだけなので、Cloudflare PagesでGitHubリポジトリを接続し、ビルドコマンドなしで公開できます。

### Cloudflare Pages 接続

1. Cloudflare Dashboardで `Workers & Pages` を開く
2. `Create` / `Pages` からGit連携を選ぶ
3. GitHubの `y-ai-lab/warashii-dashboard` を接続
4. Production branchを `main`
5. Framework presetは静的サイト相当 / None
6. Build commandは空欄
7. Build output directoryは `/` またはCloudflare画面の静的ルート指定に合わせる
8. Deploy
9. 発行された `pages.dev` URLで表示確認

Free planの範囲を超える機能は追加しません。

### GitHub Pagesについて

GitHub Pagesは技術確認・非商用プロトタイプには利用できますが、GitHub公式ドキュメント上、オンラインビジネス等の無料Webホスティング用途を主目的とする利用は想定されていません。

そのため、このRadarではGitHubを**コード保管・履歴・CI・自動化資産**として使い、一般公開サイトはCloudflare Pagesを標準とします。

## 次の開発順

1. Cloudflare PagesでMVP公開
2. 14件のRadarを運用開始
3. `期限間近 / 高Score / 0円` のランキング改善
4. GitHub Actionsで鮮度チェック
5. 公式ページ変更検知
6. DB履歴をCloudflare D1へ蓄積
7. SNS投稿用の差分生成
8. 紹介可能案件だけ規約を確認して紹介導線を追加
9. 検索流入データを蓄積し、更新優先順位へフィードバック

## 資金投入案件の扱い

0円案件と資金投入案件を混同しません。

`required_funds_yen > 0` の案件は、報酬が高くても自動的にGOにはしません。元本毀損、資金拘束、手数料、換金性を別途評価します。

特に借金、リボ払い、高レバレッジ投資を元本にする案件は禁止です。

## 禁止

- 違法行為、詐欺、虚偽申告
- 他人名義・名義貸し
- 規約違反の複数アカウント
- 本人確認や地域制限の回避
- キャンペーン規約の悪用
- 借金・リボ・高レバレッジを元本化
- 根拠のないギャンブル的案件

## Disclaimer

本リポジトリは公開情報の整理・比較用です。掲載情報は報酬や投資成果を保証するものではありません。実行前に必ず最新の公式条件・規約を確認してください。
