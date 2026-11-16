import type { APIRoute } from 'astro';

// テスト環境（test.phosprism.com）は検索エンジンに載せない。本番はサイトマップの場所を案内する。
export const GET: APIRoute = ({ site }) => {
  const baseUrl = site ?? new URL('https://phosprism.com');
  const isStaging = baseUrl.hostname.startsWith('test.');
  const body = isStaging
    ? ['User-agent: *', 'Disallow: /', '']
    : ['User-agent: *', 'Allow: /', '', `Sitemap: ${new URL('/sitemap.xml', baseUrl).href}`, ''];

  return new Response(body.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
