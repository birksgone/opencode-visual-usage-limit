# セキュリティ・品質レビュー結果

レビュー日: 2026-05-16

## 総評

全体的に安全によく書かれています。パーミッションは `https://opencode.ai/*` のみに限定、パスワード・認証情報の保存なし、HTTPS 通信のみ、という設計は適切です。深刻な脆弱性はなく、公開して問題ないコードです。

---

## バグ（機能上の不具合）

### 1. "Detect from current tab" で URL が `/go/go` になる

**ファイル:** `popup.js:249`

ユーザーがすでに `/workspace/wrk_xxx/go` を開いている状態で「Detect from current tab」をクリックすると、URL が二重になる。

```javascript
// 現在のコード（問題あり）
let url = currentUrl.replace(/\/?$/, '/go');
// https://opencode.ai/workspace/wrk_xxx/go → /go/go になる
```

**修正案:**

```javascript
let url = currentUrl.replace(/\/?(?:\/go)?$/, '/go');
```

---

### 2. Workspace URL のクリア（空文字送信）が機能しない

**ファイル:** `popup.js:206` / `background.js:333`

`popup.js` は空文字を送ってクリアを意図しているが、`background.js` の `if (url && url.startsWith(...))` で空文字は falsy なので `{ success: false }` が返り、実際にはクリアされない。

**修正案:**

```javascript
// background.js の setWorkspaceUrl ハンドラ内に追加
if (!url) {
  chrome.storage.local.remove(['config', 'discoveredUrl'], () => reply({ success: true }));
  return true;
}
```

---

## セキュリティ上の軽微な指摘

### 3. `htmlPreview` に生 HTML が保存される

**ファイル:** `background.js:209`

パース失敗時に `html.slice(0, 800)` を `chrome.storage.local` に保存している。opencode.ai のページ HTML には CSRF トークンやセッション関連情報が含まれる可能性がある。デバッグ表示は `textContent` で安全だが、ストレージに残り続ける点に注意。

**修正案:** `htmlPreview` の保存を削除し、コンソールログに留める。

```javascript
// htmlPreview: html.slice(0, 800),  ← 削除推奨
```

### 4. Cookie の正規表現がやや広い

**ファイル:** `background.js:20`

```javascript
const m = cookie.value.match(/(wrk_[A-Za-z0-9]+)/);
```

opencode.ai の他のクッキー値に `wrk_` が含まれていた場合、誤マッチする可能性がある。クッキーの `name` も限定できれば確実。

### 5. `setDetail` での `innerHTML` 使用

**ファイル:** `popup.js:71`

```javascript
function setDetail(id, html) {
  document.getElementById(id).innerHTML = html;
}
```

現在は数値データのみを渡しているため XSS は起きないが、将来の変更で文字列データを混入した場合にリスクとなる。

### 6. Workspace URL の入力バリデーションが弱い

**ファイル:** `background.js:333`

プレフィックスチェックのみで末尾の形式を検証していない。より厳格なバリデーション例:

```javascript
const WORKSPACE_URL_RE = /^https:\/\/opencode\.ai\/workspace\/wrk_[A-Za-z0-9]+\/go$/;
if (url && WORKSPACE_URL_RE.test(url)) { ... }
```

---

## 問題なし・良い点

| 項目 | 評価 |
|---|---|
| 認証情報の保存 | パスワード・トークン保存なし、セッションクッキー活用のみ |
| ネットワーク通信 | HTTPS のみ、opencode.ai ドメイン限定 |
| パーミッション範囲 | 最小権限、適切にスコープ済み |
| デバッグパネル表示 | `textContent` 使用で XSS なし |
| ハードコードされた秘密情報 | リポジトリに一切なし |
| マニフェスト | Manifest V3 準拠 |

---

## 修正優先度

| 優先度 | 項目 |
|---|---|
| 高 | バグ1: `/go/go` 二重サフィックス問題 |
| 高 | バグ2: URL クリアが機能しない問題 |
| 低 | htmlPreview のストレージ保存 |
| 低 | その他の軽微な指摘 |
