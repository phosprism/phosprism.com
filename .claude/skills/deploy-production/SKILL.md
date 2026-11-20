---
name: deploy-production
description: Phos'Prism公式サイトの staging を main にマージして本番（phosprism.com）へ反映する手順。「本番に反映して」「本番にあげて」「mainにマージして」「公開して」「リリースして」「本番デプロイ」など、本番サイトへの反映を頼まれたら必ずこのスキルを使う。stagingへのプッシュ（テスト反映）だけの依頼には使わない。
---

# 本番への反映

本番反映は、ユーザーが明示的に頼んだときだけ行う。「stagingにプッシュして」はテスト反映で、本番ではない。
`main` へプッシュすると GitHub Actions（`.github/workflows/deploy.yml`）がビルドし、rsync で本番サーバーへ送る。
戻すのが大変な操作なので、各段階で状態を確かめてから進める。

## 1. 事前確認

```bash
git status --short
git branch --show-current
git fetch origin
git log --oneline origin/main..origin/staging
```

- 未コミットの変更がある場合は止まって、ユーザーに扱いを聞く（コミットする／退避する）。勝手に捨てない。
- `staging` が `origin/staging` より進んでいる（未プッシュのコミットがある）場合も、先にプッシュするかを聞く。
- `origin/main..origin/staging` が空なら、反映するものがないと伝えて終わる。
- 反映されるコミットの一覧をユーザーに見せる。依頼が「全部反映」なら確認を待たずに進めてよいが、一覧は報告に含める。

ビルドが通る状態かも確かめる。

```bash
npm run build
git diff --check
```

## 2. プルリクエストでマージ

CLAUDE.md の運用どおり、`main` へのマージは必ずプルリクエストを通す。`main` へ直接マージ・プッシュはしない。

```bash
gh pr create --base main --head staging --title "（反映する内容の要約）" --body "（下記の本文）"
gh pr view <番号> --json mergeable,mergeStateStatus
gh pr merge <番号> --merge --subject "（タイトル） (#<番号>)"
```

- 本文には「概要」「含まれる変更」（反映するコミットの一覧）「確認」（ビルド・テスト環境で確かめたこと）を書く。コミットに `Closes #番号` があれば本文にも書く。末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)` を付ける。
- `--merge`（マージコミット）を使い、`staging` のコミットをそのまま残す。`--delete-branch` は付けない（`staging` を消さない）。
- `mergeable` が `CONFLICTING` なら、マージせずに止まって内容をユーザーに伝える。
- マージ後、手元の `main` を更新して `staging` に戻る。

```bash
git checkout main
git pull --ff-only origin main
git checkout staging
```

## 3. デプロイの確認

`gh` が使える場合は、本番デプロイのワークフローが成功したかを確かめる。

```bash
gh run list --branch main --limit 1
gh run watch <run-id> --exit-status
```

失敗した場合は `gh run view <run-id> --log-failed` でエラーを読み、原因をユーザーに報告する。Secrets（SSH接続情報など）の不足が原因なら、値を推測したり書き込んだりせず、ユーザーにGitHubの設定を確認してもらう。

## 4. 本番の動作確認

デプロイ成功後、本番を `curl` で確かめる。反映した変更に関係するページを選ぶ。

```bash
curl -sI https://phosprism.com/ | head -1
curl -s https://phosprism.com/ | grep -o '<title>[^<]*</title>'
```

- 新しい記事を出したなら `/news/{slug}/` が200で返る
- 旧URLのリダイレクトなら `curl -sI https://phosprism.com/2024/05/11/post-19/` が `301` と `location` を返す
- 本番のHTMLはキャッシュしない設定（`no-cache`）なので、反映直後から新しい内容が見える

## 5. Issueの確認

反映したコミットに `Closes #番号` があれば、`main` へのプッシュでIssueが自動で閉じる。`gh issue view <番号>` で閉じたことを確かめる。手動では閉じない（自動で閉じなかった場合は、原因をユーザーに伝えて判断を仰ぐ）。

## 6. 報告

- 反映したコミットの一覧
- デプロイの結果（成功／失敗、失敗なら原因）
- 本番で確認したURLと結果
- 閉じたIssue
- 今いるブランチが `staging` であること

認証情報（`SITE_GUERD.md` の内容、サーバーのホスト名やパスなど）は報告に書かない。
