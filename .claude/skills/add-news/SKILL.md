---
name: add-news
description: Phos'Prism公式サイトにニュース記事（お知らせ）を追加・編集する手順。「ニュースを追加して」「お知らせを書いて」「告知記事を作って」「イベント参加のお知らせ」「〇〇のリリース告知」「NEWSに載せて」など、src/content/news/ にMarkdown記事を作る・直す依頼では必ずこのスキルを使う。記事のアイキャッチ画像の配置、外部ページへ飛ばす記事（redirectTo）、Dreamy Records側のアーカイブ記事の追加にも使う。新作の作品追加と同時に告知記事を書く場合は add-release スキルからこの手順を呼ぶ。
---

# ニュース記事の追加

ニュースは Astro のコンテンツコレクション（`src/content.config.ts` の `news`）で管理している。
Markdownファイルを1つ置けば、一覧・個別ページ・RSS（`/rss`）・サイトマップ（`/sitemap.xml`）にすべて反映される。
一覧や検索は自動で全記事を対象にするので、記事ファイル以外を触る必要は基本的にない。

## 1. 依頼内容から決めること

足りない情報は推測で埋めず、ユーザーに聞く。特にタイトル・日付・本文の事実（日時、会場、価格、URL）は間違えると告知として致命的なので必ず確認する。

| 項目 | 決め方 |
|---|---|
| サークル | 今の活動は Phos'Prism。Dreamy Records は解散済みでアーカイブ専用。明示がなければ Phos'Prism |
| 置き場所 | Phos'Prism → `src/content/news/`、Dreamy Records → `src/content/news/dreamy-records/` |
| ファイル名 | URLになる。英小文字・数字・ハイフンのみ（例: `c110-event.md` → `/news/c110-event/`） |
| category | 既存の値から選ぶ: `RELEASE` / `EVENT` / `BOOTH` / `WEBSITE` / `BLOG` / `OTHER` |

ファイル名（slug）は全記事で一意である必要がある。サークルのフォルダが違っても URL は `/news/{slug}/` で共通なので、`ls src/content/news src/content/news/dreamy-records` で重複がないか確認する。`phosprism` や `dreamy-records` などサークルIDと同じ名前も、一覧ページのURLとぶつかるので使えない（ビルドがエラーで止まる）。ページ送りのURL（`/news/page/2/`）とぶつかる `page` も避ける。

## 2. frontmatter

```markdown
---
title: 'C110 参加のお知らせ'
date: 2026-12-01
category: 'EVENT'
description: '一覧やSNS共有に出る120字程度までの要約。省略すると本文の先頭から自動で作られる。'
image: '/assets/news/c110-header.png'
showImage: true
---
```

- `title`・`date`・`category` は必須。`date` は `YYYY-MM-DD`。一覧はこの日付の新しい順に並ぶ。
- `image` はOGP画像（SNSで共有したときの画像）になる。`showImage: true` にすると記事の先頭にも表示される。画像の指定がない Phos'Prism の記事は、4.5 の手順でタイトル入りの画像を作って設定する。
- タイトルに `'` が入るときは `"Phos'Prism..."` のようにダブルクォートで囲む。
- `slug` を書くとファイル名の代わりにそれがURLになる。普段はファイル名で十分なので書かない。

### 外部ページへ飛ばす記事（redirectTo）

告知の本体が特設サイトなどにある場合は `redirectTo: 'https://...'` を付ける。一覧からも個別URLからも指定先へ移動し、サイトマップから外れ、検索エンジンにも登録されない（noindex）。本文は短い説明だけでよい。

## 3. 画像

- 置き場所は `public/assets/news/`。`src/assets/` はビルド時に自動生成されるコピーなので、直接置かない。
- 本文から参照するときも `/assets/news/ファイル名` の絶対パスで書く: `![C110 お品書き](/assets/news/c110-menu.png)`
- 画像はビルド時にWebPへ変換されるので、元画像はPNGやJPEGのままでよい。ただし1枚数MBを超える場合は縮小を提案する。
- ファイル名にスペースや日本語が入っていても動くが、新しく置く画像は英小文字・数字・ハイフンにしておくと扱いやすい。
- alt（画像の説明）は空にせず、何の画像か分かる日本語を入れる。

## 4. 本文

- 既存記事（`src/content/news/site-migration.md` など）の書き方に合わせる。見出しは `##` から。
- 日本語の文章は、事実を先に、簡潔に書く。
- 本文を書き終えたら、必ず natural-japanese スキルを呼び出して、タイトル・description・本文を通す。不自然な言い回しや読みにくい箇所を直してから確認に進む。ユーザーが用意した文章（Xの投稿など）をもとにする場合も通す。ただし、日時・会場・URL・ドメインなどの事実や、ユーザーが指定した表現は変えない。
- メンバー名は `src/data/members.ts` の表記に合わせる。
- サイト内リンクは末尾スラッシュ付きの相対パス（`/music/`、`/news/xxx/`）。

## 4.5 OGP画像とアイキャッチ（Phos'Prism の記事）

Phos'Prism の記事で、ユーザーから画像の指定がない場合は、タイトル入りの画像を作ってOGP画像とアイキャッチに設定する。本文とタイトルが確定してから（natural-japanese を通したあとで）実行する。

```bash
npm run ogp:news -- {ファイル名}
```

- `public/assets/news/{ファイル名}-ogp.png` を作り、frontmatter に `image: '/assets/news/{ファイル名}-ogp.png'` と `showImage: true` を書き足す。
- 画像は黒い背景に白い枠、右下にサークルロゴ、タイトルを上下左右の中央に置いたもの。改行位置（文節の区切り、【】の見出しは独立した行、かぎかっこの中は改行しない）と文字の大きさは自動で決まる（`src/utils/ogp-images.ts`）。
- タイトルを変えたら、`image` と `showImage` の行を消してから実行し直す（`image` がある記事は上書きしない）。古い画像ファイルも消す。
- 作った画像は Read で開いて、改行位置や文字の大きさがおかしくないか確かめ、報告にも添える。
- ユーザーが画像を用意した場合や、Dreamy Records のアーカイブ記事には使わない。
- 引数なしの `npm run ogp:news` は、image のない Phos'Prism の記事すべてに設定する。
- 設定を忘れても、ビルド時に同じデザインのOGP画像が自動で作られる（`/ogp/news/{ファイル名}.png`）。ただしアイキャッチは出ないので、記事を作るときは上のコマンドで設定する。

## 4.6 シェア用の短縮URL（Phos'Prism の記事）

記事の「Xでシェア」「タイトルとURLをコピー」「その他のシェア」は、短縮URL（pspr.me）を使う。

- 短縮URLは、デプロイのたびにGitHub Actionsが自動で発行する（`scripts/shorten-news-urls.mjs`、キーは Repository secret の `URL_SHORTENER_API_KEY`）。記事を追加するときに何かする必要はない。
- 発行済みの記事は同じ短縮URLを使い回す。記事のファイル名（URL）を変えると、新しい短縮URLが発行される。
- 手元で発行して frontmatter に `shortUrl` を書き込むこともできる（`.env` にキーが必要）: `npm run short-url:news -- {ファイル名}`。`shortUrl` が書かれた記事は、デプロイ時もそれを使う。
- APIキーはチャット・Git・ブラウザで動くコードに絶対に書かない。

## 5. 確認

```bash
npm run build
git diff --check
```

ビルド後、次の3か所に記事が出ていることを確かめる。

- `dist/news/{slug}/index.html`（`redirectTo` 付きの記事はリダイレクト用のページ）
- `dist/rss` に記事のタイトルがある
- `dist/sitemap.xml` に `/news/{slug}/` がある（`redirectTo` 付きの記事は出ないのが正しい）

## 6. 報告とコミット

追加した記事のURL・タイトル・日付・カテゴリと、確認結果を短く報告する。natural-japanese で直した箇所があれば、それも短く伝える。コミット・プッシュは依頼があったときだけ `staging` に行う（CLAUDE.md のGit運用に従う）。コミットメッセージ例: `ニュース「C110 参加のお知らせ」を追加`
