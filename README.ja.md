# opencode Go-Zen Usage Monitor

クリーンなターミナル風のChrome拡張機能で、ブラウザのツールバーに直接**OpenCode Goプランの使用量**と**Zenクレジット残高**を可視化します。APIキーも追加ログインも不要 — 既存のセッションを読み取るだけです。

![Screenshot](docs/screenshot.png)

---

## 機能

| 機能 | 説明 |
|------|------|
| **ツールバーアイコン** | Rolling（5H）制限の消費量を示す円形プログレスアイコン。20%刻みで色が変化し、緑（余裕あり）から赤（残りわずか）まで。 |
| **バッジテキスト** | 現在のZenプリペイド残高をコンパクトなバッジで表示（例：`$12`、`$0.5`）。 |
| **ポップアップダッシュボード** | アイコンをクリックすると詳細表示：Rolling 5H制限、Weekly 7D制限とリセットカウントダウン、Zenクレジット残高。暗いTUI風のデザイン。 |
| **自動更新** | バックグラウンドのService Workerが設定可能な間隔で最新データを取得（デフォルト：30分ごと）。 |
| **セッション認証** | 既存のopencode.aiブラウザCookieを使用。手動ログインやトークン設定は不要。**パスワードはこの拡張機能から見えません。** |

### カラーキー（使用量ベース）

アイコンとプログレスバーは**残りではなく、使用した量**に基づいて色が変わります：

| 使用% | 色 | 意味 |
|--------|-------|---------|
| 0% – 20% | 🟢 緑 | 十分に余裕あり |
| 21% – 40% | 🟡 黄緑 | まだ快適 |
| 41% – 60% | 🟡 黄色 | 半分使った |
| 61% – 80% | 🟠 オレンジ | 厳しくなってきた |
| 81% – 100% | 🔴 赤 | 残りわずか |

---

## 動作原理

OpenCodeのダッシュボードは**SolidJS**で構築され、インライン`<script>`タグでステートをハイドレートしています。この拡張機能は以下のように動作します：

1. **ワークスペースURLを自動検出**（ベストエフォート）：
   - `opencode.ai`のCookieからワークスペースIDを確認
   - 既存のセッションを使って`https://opencode.ai/go`からのリダイレクトを追跡
   - **「Detect from current tab」**をクリックした際、現在のブラウザタブをフォールバックとして読み取り
2. **`/go`ページのハイドレーションペイロード**（`_$HY`レジストリ）を解析して以下を抽出：
   - `rollingUsage.usagePercent` + `resetInSec` → 5時間Rollingウィンドウ + カウントダウン
   - `weeklyUsage.usagePercent` + `resetInSec` → 7日間Weeklyウィンドウ + カウントダウン
   - `balance` → Zenクレジット（10⁻⁸ USD単位で保存）
3. **すべてのデータを**`chrome.storage.local`**にキャッシュ**し、`chrome.alarms`で更新

OpenCode Goプラン制限の公式情報：[Reddit — Official OpenCode Go limits published](https://www.reddit.com/r/opencodeCLI/comments/1ril0ff/official_opencode_go_limits_published/)

> ⚠️ **自動検出はベストエフォートです。** 失敗した場合（CookieにワークスペースIDが含まれていない、リダイレクトで公開されていないなど）、**▸ Settings**で手動でワークスペースURLを貼り付けることもできます。

---

## インストール

### ソースから（開発者モード）

1. **拡張機能をダウンロード**
   ```bash
   git clone https://github.com/YOUR_USERNAME/opencode-usage-monitor.git
   cd opencode-usage-monitor
   ```
   またはGitHubからZIPをダウンロード・展開してください。

2. **Chromeの拡張機能ページを開く**
   - `chrome://extensions/` に移動
   - **開発者モード**（右上）を**ON**に切り替え

3. **拡張機能を読み込む**
   - **パッケージ化されていない拡張機能を読み込む**をクリック
   - `manifest.json`が含まれる`opencode-usage-monitor`フォルダを選択
   - 拡張機能アイコンがツールバーに表示されます

4. **OpenCodeにログイン**
   - 同じブラウザプロファイルで [opencode.ai](https://opencode.ai) にログインしていることを確認
   - 拡張機能は既存のセッションCookieを使用 — 追加設定は不要
   - ポップアップに**「Log in to OpenCode」**ボタンが表示されたら、クリックしてログインページを開く

5. **アイコンをピン留め**（オプションだが推奨）
   - Chromeツールバーのパズルピースアイコンをクリック
   - **opencode Go-Zen Usage Monitor**の横のピンアイコンをクリック

### ワークスペースURL（自動検出）

拡張機能は3つの方法でワークスペースURLを自動検出しようとします：

1. **Cookie** — `opencode.ai`のCookieからワークスペースIDを読み取り
2. **リダイレクト** — `https://opencode.ai/go`からのリダイレクトを追跡
3. **現在のタブ** — ワークスペースのGoページを表示中にポップアップの**「Detect from current tab」**をクリック

> ⚠️ **自動検出はベストエフォートです。** ログインしていても、ワークスペースIDがCookieやリダイレクトに含まれていない場合があります。ポップアップにログインプロンプトが表示されたら、ワークスペースのGoページを開いた状態で**「Detect from current tab」**ボタンを使用するか、**▸ Settings**で手動でURLを貼り付けてください。

すべての方法が失敗した場合、手動で設定できます：

1. 拡張機能のポップアップを開く
2. **▸ Settings**をクリック
3. **Workspace URL**フィールドにワークスペースURL（例：`https://opencode.ai/workspace/wrk_xxxxxxxx/go`）を貼り付け

ワークスペースURLの確認方法：
- opencode.aiにログイン
- **Go**タブに移動
- ブラウザのアドレスバーからURLをコピー

### 更新

新しい変更をプルした後の更新方法：

1. `chrome://extensions/` に移動
2. **opencode Go-Zen Usage Monitor**を探す
3. **更新（↻）**アイコンをクリック、または**削除**して上記の「パッケージ化されていない拡張機能を読み込む」手順を繰り返す

---

## プロジェクト構成

```
opencode-usage-monitor/
├── manifest.json      # 拡張機能マニフェスト（Manifest V3）
├── background.js      # Service Worker — 取得、解析、キャッシュ、アイコン/バッジ更新
├── popup.html         # ターミナル風ポップアップUI
├── popup.js           # ポップアップレンダラーと設定ハンドラー
├── docs/
│   └── screenshot.png # README用UIスクリーンショット
└── README.md          # このファイル
```

---

## 権限

| 権限 | 理由 |
|------------|-----|
| `storage` | 使用量データをローカルにキャッシュ |
| `alarms`  | 定期的なバックグラウンド更新をスケジュール |
| `cookies` | `opencode.ai`のCookieを読み取り、ワークスペースIDを自動検出 |
| `activeTab` | **「Detect from current tab」**をクリックした際に現在のタブURLを読み取る |
| `host_permissions: https://opencode.ai/*` | 既存のセッションCookieを使って`/go`ページを取得 |

外部サーバーには一切接続しません。すべてのデータはお使いのマシンに留まります。

---

## プライバシーとセキュリティ

- **パスワードにアクセスしない**：この拡張機能はOpenCodeのパスワード、メール、ログイン認証情報を**一切見ることができません**。ログイン後にブラウザが既に持っている**セッションCookie**のみを読み取ります。
- **外部にデータを送信しない**：すべてのネットワークリクエストは`opencode.ai`に直接送信されます。サードパーティのサーバーには何も送信されません。
- **ローカルのみのストレージ**：使用量データはブラウザの`chrome.storage.local`にのみキャッシュされます。
- **Cookieが必要**：`opencode.ai`で**Cookieを有効**にする必要があります。サードパーティCookieをブロックしたり、Cookieを消去する積極的なプライバシーモードを使用している場合、拡張機能は認証できず、ログインプロンプトが表示されます。

---

## 設定

ポップアップ内の**▸ Settings**パネルをクリックして、自動更新間隔を変更：

- **1分** — 開発・デバッグ中に便利
- **5 / 15 / 30 / 60分** — 通常使用の標準間隔

設定は`chrome.storage.local`に保存されます。

---

## ブラウザ互換性

**Manifest V3**向けに構築、以下でテスト済み：

- Google Chrome（最新安定版）
- Microsoft Edge（Chromiumベース）
- MV3拡張機能をサポートするChromiumベースのブラウザすべて

Firefoxは、MV3 Service WorkerとAPIの違いにより、現時点ではサポートされていません。

---

## 免責事項

この拡張機能は**非公式のコミュニティ製ツール**です。OpenCodeダッシュボードのHTML/SolidJSハイドレーションペイロードをリバースエンジニアリングして使用量データを抽出します。計算の正確性には最善を尽くしていますが、この拡張機能の数値と公式OpenCode請求ダッシュボードとの**不一致については責任を負いません**。自己責任でお使いください。

---

## ライセンス

MIT License — 自由にフォーク、改変、共有してください。

---

*OpenCodeまたはAnomalyとは提携していません。これはコミュニティによって作成された独立したオープンソースユーティリティです。*
