interface Env {
  BASIC_AUTH_USER?: string;
  BASIC_AUTH_PASSWORD?: string;
  ASSETS: { fetch: (request: Request | string) => Promise<Response> };
}

/** src/utils/markdown-for-agents.ts と同じ数え方のトークン数の目安 */
const estimateMarkdownTokens = (text: string) => {
  let ascii = 0;
  let other = 0;
  for (const char of text) {
    if (char.charCodeAt(0) < 128) ascii += 1;
    else other += 1;
  }
  return Math.ceil(ascii / 4) + other;
};

/**
 * Accept: text/markdown のリクエストには、ビルド時に作ったページのMarkdown版（index.md）を返す。
 * Markdown版がないページや、ほかのリクエストは undefined を返して通常どおりHTMLを返す。
 */
const getMarkdownResponse = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const wantsMarkdown = request.headers.get('Accept')?.toLowerCase().includes('text/markdown');
  if (!wantsMarkdown || request.method !== 'GET' || !url.pathname.endsWith('/')) return;

  const markdownUrl = new URL(`${url.pathname}index.md`, url);
  const asset = await env.ASSETS.fetch(markdownUrl.href);
  if (!asset.ok) return;

  const markdown = await asset.text();
  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': String(estimateMarkdownTokens(markdown)),
    },
  });
};

interface PagesContext {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

export const onRequest = async ({ request, env, next }: PagesContext) => {
  const noIndexHeaders = {
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  };

  if (!env.BASIC_AUTH_USER || !env.BASIC_AUTH_PASSWORD) {
    return new Response('Staging authentication is not configured.', {
      status: 503,
      headers: noIndexHeaders,
    });
  }

  const authorization = request.headers.get('Authorization');
  let username = '';
  let password = '';

  if (authorization?.startsWith('Basic ')) {
    try {
      [username, password] = atob(authorization.slice(6)).split(/:(.*)/s, 2);
    } catch {
      // Invalid credentials are handled by the unauthorized response below.
    }
  }

  if (username !== env.BASIC_AUTH_USER || password !== env.BASIC_AUTH_PASSWORD) {
    return new Response('Authentication required.', {
      status: 401,
      headers: {
        ...noIndexHeaders,
        'WWW-Authenticate': `Basic realm="Phos'Prism Staging", charset="UTF-8"`,
      },
    });
  }

  const markdownResponse = await getMarkdownResponse(request, env);
  const response = markdownResponse ?? (await next());
  const protectedResponse = new Response(response.body, response);

  for (const [name, value] of Object.entries(noIndexHeaders)) {
    protectedResponse.headers.set(name, value);
  }
  // 同じURLでも Accept によってHTMLとMarkdownを返し分けるため、キャッシュにそれを伝える
  if (!new URL(request.url).pathname.startsWith('/_astro/')) {
    protectedResponse.headers.append('Vary', 'Accept');
  }

  return protectedResponse;
};
