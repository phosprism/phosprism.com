import { defineConfig } from 'astro/config';
import { htaccessRedirects } from './src/utils/htaccess-redirects.ts';
import { markdownForAgents } from './src/utils/markdown-for-agents.ts';

const isStaging = process.env.DEPLOY_ENV === 'staging';

export default defineConfig({
  site: isStaging ? 'https://test.phosprism.com' : 'https://phosprism.com',
  base: '/',
  output: 'static',
  integrations: [htaccessRedirects(), markdownForAgents()],
  build: {
    // CSSをHTMLに埋め込み、表示を止めるCSSファイルの読み込みをなくす（PageSpeed Insights #13）
    inlineStylesheets: 'always',
  },
  image: {
    service: {
      entrypoint: './src/utils/lossless-png-image-service.ts',
    },
  },
});
