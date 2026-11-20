---
name: add-release
description: Phos'Prism公式サイトに新作（CD・配信などの作品）を追加する手順。MUSICへの作品追加、MEDIAへのXFD・MVの追加、告知ニュースの作成を1つの流れで行う。「新譜を追加して」「〇〇（作品名）を載せて」「リリースを追加」「XFDを追加して」「ジャケットを差し替えて」「作品のリンクを更新して」など、作品やその動画をサイトに載せる・直す依頼では必ずこのスキルを使う。作品のリンク先URLや品番だけを直す小さな依頼にも使う。
---

# 新作リリースの追加

1つの作品は、サイトの3か所に関係する。追加し忘れが起きやすいので、依頼がどこまでか（作品だけ／動画も／告知記事も）を最初に確認し、確認したものは全部まとめて対応する。

| 場所 | ファイル | 内容 |
|---|---|---|
| MUSIC | `src/pages/music.astro` の `releases` | ジャケット・品番・年・リンク |
| MEDIA | `src/pages/media.astro` の `xfdVideos` / `musicVideos` | YouTube動画 |
| NEWS | `src/content/news/` | 告知記事（add-news スキルの手順で書く） |

必要に応じて、トップのスライド（`src/pages/index.astro`）やEVENTSページにも載せるかを聞く。勝手には変えない。

## 1. 集める情報

足りないものはユーザーに聞く。品番やURLは推測で作らない。

- サークル: `phosprism`（今の活動。明示がなければこちら）か `dreamy-records`（解散済み、アーカイブ）。IDは `src/data/labels.ts`
- 作品名（表記どおり。大文字小文字・記号もそのまま）
- 品番（`code`）: Dreamy Records は `DMERCD–011` の形式（ハイフンはエンダッシュ `–`）。Phos'Prism の品番の形式はまだ決まっていないので、最初の1作は必ずユーザーに確認する
- 発売年（`year`、文字列）
- ジャケット画像
- 作品ページのリンク（`link`）。まだない場合は省略してよい。省略するとボタンが灰色の「NOT AVAILABLE」になる
- XFD・MVの YouTube 動画ID（`https://www.youtube.com/watch?v=XXXX` の `XXXX` 部分）

## 2. ジャケット画像

- `public/assets/` の直下に置く（例: `public/assets/lunar_reverie.png`）。`src/assets/` は自動生成のコピーなので置かない。
- 正方形の画像を使う。MUSICは正方形の枠で表示する。
- 元画像はPNGのままでよい。ビルド時に可逆WebPへ変換される。

## 3. MUSIC（`releases` 配列）

配列は新しい作品が先頭。新作は配列の一番上に足す。サークルごとの通し番号（01, 02…）はこの順番から自動で付くので、番号を手で書く必要はない。

```ts
const releases: Release[] = [
  {
    label: 'phosprism',
    code: '（品番）',
    year: '2026',
    title: '作品名',
    image: '/assets/作品の画像.png',
    link: 'https://...',
  },
  // 既存の作品…
];
```

`link` にはサイト内の告知記事（`/news/xxx/`）も指定できる。外部の特設ページがない作品はこれを使う。

Phos'Prism の作品がまだ1つもない状態から最初の1作を足す場合、MUSICの初期表示（Phos'Prism）が空表示から作品表示に変わる。ビルド後に `dist/music/index.html` でカバーフローが出ることを確認する。

## 4. MEDIA（`xfdVideos` / `musicVideos`）

どちらも新しいものが先頭。`title` はMUSICの作品名と表記をそろえる。

```ts
{ label: 'phosprism', title: '作品名', videoId: 'XXXXXXXXXXX' },
```

XFD（クロスフェード）は `xfdVideos`、MV は `musicVideos`。壁紙（`wallpapers`）は Phos'Prism では非表示の設定になっている（`hiddenTabsByLabel`）ので、Phos'Prism の壁紙を出したい依頼があればその設定も外す必要がある。

## 5. 告知ニュース

告知記事も頼まれている場合は add-news スキルの手順で書く。カテゴリは `RELEASE`。特設ページが本体なら `redirectTo` を使う。MUSICの `link` とニュースの `redirectTo` は同じURLにそろえる。

## 6. 確認

```bash
npm run build
git diff --check
```

- `dist/music/index.html` に作品名と品番がある
- `dist/media/index.html` に動画IDがある（動画を足した場合）
- 告知記事を足した場合は add-news の確認項目も行う

## 7. 報告とコミット

どのページに何を足したかを表で短く報告する。聞いたけれど未定だった項目（リンク未定など）があれば、後で足す必要があることを書き添える。コミット・プッシュは依頼があったときだけ `staging` に行う。コミットメッセージ例: `新作「〇〇」をMUSIC・MEDIAに追加し、リリースのお知らせを掲載`
