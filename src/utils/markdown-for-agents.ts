import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { AstroIntegration } from 'astro';
import TurndownService from 'turndown';

/**
 * AIエージェント向けに、各ページのMarkdown版を作る（Markdown for Agents）。
 *
 * ビルド後の dist/**\/index.html から本文（<main>）を取り出してMarkdownへ変換し、
 * 同じフォルダに index.md として書き出す。
 * リクエストに `Accept: text/markdown` があるときだけ、このMarkdownを返す。HTMLが標準のまま。
 *   - 本番（Apache）: dist/.htaccess に振り分けのルールを追記する
 *   - テスト（Cloudflare Pages）: functions/_middleware.ts が振り分ける
 */

/** トークン数の目安。英数字は約4文字で1トークン、日本語などはおおむね1文字1トークンとして数える */
export const estimateMarkdownTokens = (text: string) => {
  let ascii = 0;
  let other = 0;
  for (const char of text) {
    if (char.charCodeAt(0) < 128) ascii += 1;
    else other += 1;
  }
  return Math.ceil(ascii / 4) + other;
};

const decodeEntities = (value: string) =>
  value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const getMeta = (html: string, attribute: 'name' | 'property', key: string) => {
  const tag = html.match(new RegExp(`<meta[^>]*${attribute}="${key}"[^>]*>`, 'i'))?.[0];
  const content = tag?.match(/content="([^"]*)"/i)?.[1];
  return content ? decodeEntities(content) : undefined;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createTurndown = () => {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    codeBlockStyle: 'fenced',
  });
  // 画面の操作部品や飾り、迷惑メール対策の隠し欄などは、文章として意味がないので除く
  turndown.remove(['script', 'style', 'noscript', 'template', 'button', 'svg', 'canvas']);
  turndown.addRule('skip-decorative', {
    filter: (node) =>
      node.getAttribute?.('aria-hidden') === 'true' ||
      node.hasAttribute?.('data-markdown-skip') ||
      node.classList?.contains('contact-honeypot'),
    replacement: () => '',
  });
  // 見た目のために文字を分けている部分（キャッチコピーなど）は、data-markdown-text の文章に置き換える
  turndown.addRule('markdown-text', {
    filter: (node) => node.hasAttribute?.('data-markdown-text'),
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const text = element.getAttribute('data-markdown-text') ?? '';
      const level = /^H([1-6])$/.exec(element.nodeName)?.[1];
      return `\n\n${level ? `${'#'.repeat(Number(level))} ` : ''}${text}\n\n`;
    },
  });
  // 埋め込み動画などは、中身の代わりにリンクとして残す
  turndown.addRule('iframe-link', {
    filter: 'iframe',
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const src = element.getAttribute('src') || element.getAttribute('data-src');
      if (!src) return '';
      const title = element.getAttribute('title') || src;
      return `\n\n[${title}](${src})\n\n`;
    },
  });
  // 見出しなどを含むカード型のリンクは、中身を先に書き、リンク先をその下に置く
  // （Markdownのリンク [...] の中に見出しを入れると崩れるため）
  turndown.addRule('block-link', {
    filter: (node) =>
      node.nodeName === 'A' &&
      Boolean(node.getAttribute('href')) &&
      Boolean(node.querySelector('h1, h2, h3, h4, h5, h6, p, div, ul, ol')),
    replacement: (content, node) => {
      const href = (node as HTMLElement).getAttribute('href');
      return `\n\n${content.trim()}\n\n<${href}>\n\n`;
    },
  });
  // 入力欄は文章に出ないので、ラベルの文字だけを残す
  turndown.addRule('form-controls', {
    filter: ['input', 'select', 'textarea'],
    replacement: () => '',
  });
  return turndown;
};

const findIndexFiles = async (dir: string): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // ビルド成果物や画像のフォルダにはページがない
        if (entry.name === '_astro' || entry.name === 'assets') return [];
        return findIndexFiles(fullPath);
      }
      return entry.name === 'index.html' ? [fullPath] : [];
    }),
  );
  return files.flat();
};

export const markdownForAgents = (): AstroIntegration => {
  let site: URL | undefined;

  return {
    name: 'markdown-for-agents',
    hooks: {
      'astro:config:done': ({ config }) => {
        site = config.site ? new URL(config.site) : undefined;
      },
      'astro:build:done': async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const turndown = createTurndown();
        const pages: { pathname: string; tokens: number }[] = [];

        for (const file of await findIndexFiles(distDir)) {
          const html = await readFile(file, 'utf8');
          // 転送用のページ（旧URLや redirectTo の記事）と、本文のないページは対象外
          if (/http-equiv="refresh"/i.test(html)) continue;
          const main = html.match(/<main[\s\S]*<\/main>/i)?.[0];
          if (!main) continue;

          const relativeDir = path.relative(distDir, path.dirname(file)).split(path.sep).join('/');
          const pathname = relativeDir ? `/${relativeDir}/` : '/';
          const pageUrl = site ? new URL(pathname, site).href : pathname;

          // サイト内のリンクと画像は、Markdownだけを読んでもたどれるよう完全なURLにする
          const absoluteMain = site
            ? main.replace(
                /(href|src)="(\/[^"]*)"/g,
                (_match, attribute: string, url: string) =>
                  `${attribute}="${new URL(url, site).href}"`,
              )
            : main;
          const body = turndown
            .turndown(absoluteMain)
            .replace(/[ \t]+\n/g, '\n')
            // ボタンだけの項目など、中身が空になったリストの行を消す
            .replace(/^-\s*$/gm, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          const title =
            html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? getMeta(html, 'property', 'og:title');
          const frontmatter = [
            '---',
            title && `title: ${JSON.stringify(decodeEntities(title))}`,
            ((description) => description && `description: ${JSON.stringify(description)}`)(
              getMeta(html, 'name', 'description'),
            ),
            ((image) => image && `image: ${JSON.stringify(image)}`)(
              getMeta(html, 'property', 'og:image'),
            ),
            `url: ${JSON.stringify(pageUrl)}`,
            '---',
          ]
            .filter(Boolean)
            .join('\n');

          const markdown = `${frontmatter}\n\n${body}\n`;
          await writeFile(path.join(path.dirname(file), 'index.md'), markdown);
          pages.push({ pathname, tokens: estimateMarkdownTokens(markdown) });
        }

        pages.sort((a, b) => a.pathname.localeCompare(b.pathname));

        // 本番（Apache）用: Accept: text/markdown のときだけ index.md を返す
        const rules = pages.flatMap(({ pathname, tokens }) => {
          const pattern = pathname === '/' ? '^$' : `^${escapeRegExp(pathname.slice(1, -1))}/$`;
          return [
            '  RewriteCond %{HTTP:Accept} text/markdown [NC]',
            `  RewriteRule ${pattern} ${pathname}index.md [L,E=MD_TOKENS:${tokens}]`,
          ];
        });
        const block = [
          '',
          '# Accept: text/markdown のリクエストに、ページのMarkdown版を返す（ビルド時に生成）',
          '<IfModule mod_rewrite.c>',
          '  RewriteEngine On',
          ...rules,
          '</IfModule>',
          '',
        ].join('\n');
        await appendFile(new URL('.htaccess', dir), block);

        logger.info(`${pages.length} ページのMarkdown版（index.md）を書き出しました`);
      },
    },
  };
};
