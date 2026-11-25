import path from 'node:path';

export function contentWatcher() {
  let timer;
  return {
    name: 'paper-notes-content',
    apply: 'serve',
    config() {
      return {server:{fs:{deny:[
        '.env', '.env.*', '*.{crt,pem}', '**/.git/**',
        '**/content/**', '**/.paper-notes/**', '**/dist-private/**',
        '**/server-data/**', '**/*.{db,sqlite,sqlite3,sqlite-shm,sqlite-wal}',
      ]}}};
    },
    configureServer(server) {
      const root = server.config.root;
      const content = path.join(root, 'content');
      const manifest = path.join(root, '.paper-notes', 'imported', 'notes.json');
      server.watcher.add([content, manifest]);
      const update = (event, file) => {
        if (!['add', 'change', 'unlink'].includes(event)) return;
        if (!file.startsWith(content + path.sep) && file !== manifest) return;
        clearTimeout(timer);
        // Astro caches static-path lists. Restart the development server so
        // newly created and renamed pages are picked up along with edited text.
        timer = setTimeout(() => { void server.restart(); }, 120);
      };
      server.watcher.on('all', update);
      server.httpServer?.once('close', () => { clearTimeout(timer); server.watcher.off('all', update); });
    },
  };
}
