import { defineConfig } from 'astro/config';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import theme from './theme.config.mjs';
import { contentWatcher } from './scripts/content-watcher.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const staging = new URL('./.astro/paper-build/', import.meta.url);
const privatePages = [
  ['/diary', 'calendar.astro'],
  ['/diary/posts/[slug]', 'post.astro'],
  ['/diary/search.json', 'search.ts'],
  ['/diary/media/[name]', 'media.ts'],
  ['/diary/threads.json', 'threads.ts'],
];

const separatePrivatePages = {
  name: 'paper-notes-private-output',
  hooks: {
    'astro:config:setup'({ command, updateConfig, injectRoute }) {
      if (command !== 'build') return;
      updateConfig({ outDir: staging });
      if (theme.services) {
        for (const [pattern, file] of privatePages) {
          injectRoute({ pattern, entrypoint: join(root, 'src/private', file) });
        }
      }
    },
    async 'astro:build:done'({ dir }) {
      const rendered = fileURLToPath(dir);
      const publicDir = join(root, 'dist');
      const privateDir = join(root, 'dist-private');
      if (!theme.services && (await readdir(rendered)).includes('diary')) {
        throw new Error('The /diary/ path is private. Remove it from the public content before publishing.');
      }
      await rm(privateDir, { recursive: true, force: true });
      if (theme.services) {
        await mkdir(privateDir, { mode: 0o700 });
        await rename(join(rendered, 'diary'), join(privateDir, 'diary'));
        await rename(join(privateDir, 'diary/threads.json'), join(privateDir, 'threads.json'));
      }
      await rm(publicDir, { recursive: true, force: true });
      await rename(rendered, publicDir);
    },
  },
};

export default defineConfig({
  ...(theme.site ? { site: theme.site } : {}),
  output: 'static',
  trailingSlash: 'ignore',
  integrations: [separatePrivatePages],
  vite: { plugins: [contentWatcher()] },
  server: { host: '127.0.0.1' },
  devToolbar: { enabled: false },
});
