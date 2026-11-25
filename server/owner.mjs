import { randomBytes } from 'node:crypto';
import { dataDirectory } from './files.mjs';
import { editAccounts, openStore } from './storage.mjs';
import { newAccount, validName } from './service.mjs';

process.umask(0o077);
const [username, option, ...extra] = process.argv.slice(2);
const name = (username || '').toLowerCase();
if (!validName(name) || extra.length || (option && option !== '--password-stdin')) {
  throw new Error('Usage: node server/owner.mjs <username> [--password-stdin]. Use 3–40 letters, digits or . _ @ -.');
}
let password;
if (option === '--password-stdin') {
  const parts = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > 1024) throw new Error('Password too long.');
    parts.push(chunk);
  }
  password = Buffer.concat(parts).toString().replace(/\r?\n$/, '');
  if (password.length < 12 || password.length > 256) throw new Error('Use a 12–256 character password.');
} else {
  if (!process.stdout.isTTY) throw new Error('Use an interactive terminal or pass --password-stdin through a private pipe.');
  password = randomBytes(24).toString('base64url');
}
const store = openStore(dataDirectory());
try {
  const owner = await newAccount(name, password, 'reader', true);
  await editAccounts(store, accounts => {
    if (accounts.size) throw new Error('An account directory already exists; owner initialization is one-time.');
    return owner;
  });
  console.log('站主账户已创建：' + name);
  if (!option) console.log('初始密码（请保存并在首次登录后更改）：' + password);
} finally {
  store.close();
}
