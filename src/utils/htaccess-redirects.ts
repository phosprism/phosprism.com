import { appendFile } from 'node:fs/promises';
import type { AstroIntegration } from 'astro';
import { legacyRedirects } from '../data/legacyRedirects';

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 本番サーバー（Apache）用に、旧URLの301リダイレクトを dist/.htaccess の末尾へ書き出す。
 * 静的ビルドのリダイレクトページ（[...legacy].astro）はmeta refreshで200を返すため、
 * 検索エンジンに恒久的な移転として伝えるにはサーバー側で301を返す必要がある。
 * テスト環境（Cloudflare Pages）は public/_redirects を使う。
 */
export const htaccessRedirects = (): AstroIntegration => ({
  name: 'htaccess-redirects',
  hooks: {
    'astro:build:done': async ({ dir, logger }) => {
      const rules = legacyRedirects.map(({ source, destination }) => {
        // 末尾のスラッシュがあってもなくても同じ移転先へ送る
        const pattern = `^${escapeRegExp(source.replace(/\/$/, ''))}/?$`;
        return `  RedirectMatch 301 ${pattern} ${destination}`;
      });
      const block = [
        '',
        '# 旧URLから新URLへの恒久リダイレクト（ビルド時に src/data/legacyRedirects.ts から生成）',
        '<IfModule mod_alias.c>',
        ...rules,
        '</IfModule>',
        '',
      ].join('\n');

      await appendFile(new URL('.htaccess', dir), block);
      logger.info(`.htaccess に ${rules.length} 件の301リダイレクトを追加しました`);
    },
  },
});
