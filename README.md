# わらしべ Asset Radar

0円資産構築プロジェクトのための、**無料/少額で取得可能な資産・権利・ポイント・デジタル資産を比較する公開Radar**です。

## 目的

単発の「お得情報一覧」ではなく、次の3問で案件を選別します。

1. 今0円から取れる価値は何か？
2. それを次の何に変換できるか？
3. この行動は資産として残るか？

調査結果そのものを `情報資産 → Web資産 → 集客資産 → 紹介/収益資産` に変換することを狙います。

## MVP構成

- `index.html` — UI
- `styles.css` — レスポンシブデザイン
- `app.js` — Score計算、検索、フィルター、鮮度判定
- `data/opportunities.json` — 案件DB

外部JS/CSSライブラリ、ビルド処理、サーバーは不要です。

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
4. 信頼できる最新メディア
5. コミュニティ情報

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

## 0円で公開する

### GitHub Pages

1. GitHubでこのリポジトリを開く
2. `Settings` → `Pages`
3. `Build and deployment` の Source を `Deploy from a branch`
4. Branch を `main`、Folderを `/(root)` にして Save
5. 発行された `github.io` URLを確認

このMVPは静的ファイルだけなので、Pages側のビルド設定は不要です。

### Cloudflare Pages（後から推奨）

GitHubリポジトリをCloudflare Pagesへ接続し、ビルドコマンドなし・出力ディレクトリをルートにして公開できます。独自ドメインが必要になるまでは無料サブドメインで運用します。

## 次の開発順

1. MVP公開
2. 案件を10〜20件へ拡充
3. `期限間近 / 高Score / 0円` のランキング
4. 自動鮮度チェック
5. 公式ページ変更検知
6. SNS投稿用の差分生成
7. 紹介可能案件のみ、規約を確認して紹介導線を追加
8. 検索流入データを蓄積し、更新優先順位へフィードバック

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
