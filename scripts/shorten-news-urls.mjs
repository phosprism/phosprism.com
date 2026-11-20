// Phos'Prism のニュース記事の短縮URLを発行し、記事の frontmatter に shortUrl として書き込む。
// 記事の「Xでシェア」「タイトルとURLをコピー」「その他のシェア」は、shortUrl があればそれを使う。
//
//   npm run short-url:news            … shortUrl のない記事すべて
//   npm run short-url:news -- c110    … 指定した記事だけ（ファイル名。.md は省略可）
//
// APIキーは、Git管理外の .env に書く（.env.example を参照）。接続先は https://api.pspr.me。
// キーは管理者用なので、ブラウザで動くコードやGitには絶対に入れない。
// 短縮するのは本番のURL（https://phosprism.com/news/{ファイル名}/）。
// 同じURLの短縮URLがすでにあれば、新しく作らずにそれを使う。
// Dreamy Records のアーカイブ記事と、redirectTo のある記事は対象外。
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://phosprism.com';
const newsDir = 'src/content/news';

const apiBase = (process.env.URL_SHORTENER_API_BASE || 'https://api.pspr.me').replace(/\/$/, '');
const apiKey = process.env.URL_SHORTENER_API_KEY;
if (!apiBase || !apiKey) {
  console.error('.env に URL_SHORTENER_API_KEY を設定してください（.env.example を参照）');
  process.exit(1);
}

const api = async (method, pathname, body) => {
  const response = await fetch(`${apiBase}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = json.errors ? ` ${JSON.stringify(json.errors)}` : '';
    throw new Error(`${method} ${pathname}: ${response.status} ${json.message ?? ''}${detail}`);
  }
  return json;
};

/** これまでに発行した短縮URLを、元のURLごとにまとめる（同じURLを二重に発行しないため） */
const loadExistingLinks = async () => {
  const links = new Map();
  for (let page = 1; page <= 100; page += 1) {
    const { data = [] } = await api('GET', `/v1/links?page=${page}`);
    for (const link of data) {
      if (!link.expired && !link.password_protected && !links.has(link.original_url)) {
        links.set(link.original_url, link.short_url);
      }
    }
    if (data.length < 50) break;
  }
  return links;
};

const requested = process.argv.slice(2).map((name) => name.replace(/\.md$/, ''));
const files = (await readdir(newsDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => entry.name)
  .filter((name) => requested.length === 0 || requested.includes(name.replace(/\.md$/, '')));

if (requested.length > 0 && files.length !== requested.length) {
  const found = new Set(files.map((name) => name.replace(/\.md$/, '')));
  const missing = requested.filter((name) => !found.has(name));
  console.error(`Phos'Prism のニュースに見つかりません: ${missing.join(', ')}`);
  process.exit(1);
}

const existing = await loadExistingLinks();
let updated = 0;

for (const name of files) {
  const file = path.join(newsDir, name);
  const source = await readFile(file, 'utf8');
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) continue;
  if (/^shortUrl:/m.test(frontmatter[1])) {
    if (requested.length > 0) console.log(`${name}: shortUrl が設定済みなので変更しません`);
    continue;
  }
  if (/^redirectTo:/m.test(frontmatter[1])) continue;

  // frontmatter に slug があればそれが記事のURLになる
  const slug =
    frontmatter[1].match(/^slug:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1] ?? name.replace(/\.md$/, '');
  const articleUrl = `${SITE}/news/${slug}/`;

  let shortUrl = existing.get(articleUrl);
  if (shortUrl) {
    console.log(`${name}: 発行済みの ${shortUrl} を使います`);
  } else {
    const { data } = await api('POST', '/v1/links', { url: articleUrl });
    shortUrl = data.short_url;
    console.log(`${name}: ${shortUrl} を発行しました（${articleUrl}）`);
  }

  const fields = `${frontmatter[1].replace(/\n+$/, '')}\nshortUrl: '${shortUrl}'`;
  await writeFile(file, source.replace(frontmatter[0], `---\n${fields}\n---`));
  updated += 1;
}

console.log(`${updated} 件の記事に短縮URLを設定しました`);
