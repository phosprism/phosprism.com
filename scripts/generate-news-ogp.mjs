// Phos'Prism のニュース記事のうち、image（OGP画像）が設定されていない記事に、
// タイトル入りの画像を作って設定する。画像はアイキャッチとして記事の先頭にも表示する（showImage: true）。
//
//   npm run ogp:news            … image のない記事すべて
//   npm run ogp:news -- c110    … 指定した記事だけ（ファイル名。.md は省略可）
//
// 画像は public/assets/news/{ファイル名}-ogp.png に書き出す。
// Dreamy Records のアーカイブ記事（src/content/news/dreamy-records/）は対象外。
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createTitleImageRenderer } from '../src/utils/ogp-images.ts';

const newsDir = 'src/content/news';
const imageDir = 'public/assets/news';

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

const render = await createTitleImageRenderer();
let created = 0;

for (const name of files) {
  const file = path.join(newsDir, name);
  const source = await readFile(file, 'utf8');
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) continue;
  if (/^image:/m.test(frontmatter[1])) {
    if (requested.length > 0) console.log(`${name}: image が設定済みなので変更しません`);
    continue;
  }

  const rawTitle = frontmatter[1].match(/^title:\s*(.+)$/m)?.[1].trim();
  if (!rawTitle) continue;
  const title = rawTitle.startsWith("'")
    ? rawTitle.slice(1, -1).replace(/''/g, "'")
    : rawTitle.startsWith('"')
      ? JSON.parse(rawTitle)
      : rawTitle;

  const slug = name.replace(/\.md$/, '');
  const imageFile = `${slug}-ogp.png`;
  await sharp(await render(title)).toFile(path.join(imageDir, imageFile));

  // showImage がすでにあれば true にし、なければ image の後ろに足す
  let fields = frontmatter[1].replace(/^showImage:.*$/m, '');
  fields = `${fields.replace(/\n+$/, '')}\nimage: '/assets/news/${imageFile}'\nshowImage: true`;
  await writeFile(
    file,
    source.replace(frontmatter[0], `---\n${fields.replace(/\n{2,}/g, '\n')}\n---`),
  );
  console.log(`${name}: /assets/news/${imageFile} を作って設定しました`);
  created += 1;
}

console.log(`${created} 件の記事にOGP画像とアイキャッチを設定しました`);
