import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { buildReader } from './files.mjs';

const execute = promisify(execFile);
const outputs = ['dist','dist-private'];

function workDir(root) { return join(root,'.astro','article-publication'); }

// Until both outputs have been installed the old directories remain available
// for recovery. A completed swap is marked by renaming the whole work directory.
export function recoverArticleBuild(root) {
  const work = workDir(root);
  for (const name of outputs) {
    const previous = join(work,'previous',name);
    if (existsSync(previous)) {
      rmSync(join(root,name), {recursive:true,force:true});
      renameSync(previous,join(root,name));
    }
  }
  rmSync(work,{recursive:true,force:true});
  rmSync(work + '-complete',{recursive:true,force:true});
}

export async function buildArticles(root, isCurrent) {
  const work = workDir(root);
  mkdirSync(join(work,'previous'), {recursive:true,mode:0o700});
  try {
    await execute(process.execPath, [join(root,'node_modules','astro','bin','astro.mjs'),'build'], {
      cwd:root, env:{...process.env,PAPER_NOTES_BUILD_DEST:work,ASTRO_TELEMETRY_DISABLED:'1'},
      timeout:600000,maxBuffer:16 * 1024 * 1024,
    });
    const release = buildReader(join(work,'dist'),join(work,'dist-private')).threads();
    if (!release.articles) throw new Error('Rebuild the theme with article management enabled.');
    if (!isCurrent()) return;
    for (const name of outputs) {
      renameSync(join(root,name),join(work,'previous',name));
      renameSync(join(work,name),join(root,name));
    }
    // Commit both directory replacements before deleting either backup.
    const finished = work + '-complete';
    renameSync(work,finished);
    rmSync(finished,{recursive:true,force:true});
  } finally { recoverArticleBuild(root); }
}

export function articlePublisher(build) {
  let generation = 0;
  let active = null;
  let status = 'ready';
  return {
    get status() { return status; },
    schedule() {
      generation++;
      if (active) return active;
      status = 'building';
      active = (async () => {
        let started;
        do {
          started = generation;
          try {
            await build(() => started === generation);
            status = started === generation ? 'ready' : 'building';
          } catch (error) {
            status = started === generation ? 'failed' : 'building';
            const diagnostic = String(error.stderr || error.message || error).trim();
            console.error('Article build failed:', diagnostic.slice(0,1200));
          }
        } while (started !== generation);
      })().finally(() => { active = null; });
      return active;
    },
  };
}
