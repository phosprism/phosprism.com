import { defineConfig } from 'astro/config';
import { htaccessRedirects } from './src/utils/htaccess-redirects.ts';

const isStaging = process.env.DEPLOY_ENV === 'staging';

export default defineConfig({
  site: isStaging ? 'https://test.phosprism.com' : 'https://phosprism.com',
  base: '/',
  output: 'static',
  integrations: [htaccessRedirects()],
  image: {
    service: {
      entrypoint: './src/utils/lossless-png-image-service.ts',
    },
  },
});
