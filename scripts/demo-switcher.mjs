import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWallet, secretDir } from './wallet-store.mjs';

const site = 'https://guardlink.ajnasnb.com';
const local = 'http://127.0.0.1:8899';
const csrf = randomBytes(24).toString('hex');
const stored = JSON.parse(readFileSync(join(secretDir, 'actors.local.json'), 'utf8'));
const roles = [
  ['member-a', 'Member', '0x6E70…ebF6', 'Coverage, claims and document requests'],
  ['juror-1', 'Claim juror', '0x1106…Ff8B', 'Initial review and voting history'],
  ['appeal-1', 'Appeal juror', '0xB1e9…201f', 'Independent appeal review'],
].filter(([id]) => stored.some((actor) => actor.id === id && actor.demo));
if (roles.length !== 3) throw new Error('The local test wallets have not been provisioned.');

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GuardLink · Demo roles</title><style>
body{background:#11170f;color:#f2f5ee;font:17px/1.5 system-ui;margin:0}main{max-width:650px;margin:10vh auto;padding:28px}h1{font-size:clamp(2.2rem,6vw,4rem);margin:.2em 0}.brand{color:#c7fb63;font-weight:700}button{display:block;text-align:left;width:100%;border:1px solid #57634b;border-radius:12px;background:#1c2519;color:inherit;padding:16px 20px;margin:12px 0;font:inherit;cursor:pointer}button:hover,button:focus-visible{border-color:#c7fb63}strong{color:#c7fb63}small{color:#c5cdbd}a{color:#c7fb63}
</style></head><body><main><span class="brand">GuardLink · Arc Testnet</span><h1>Choose a demo role.</h1><p>Choose a test account. Use Chrome’s Back button to return here and switch roles. Your MetaMask account is unchanged.</p><form method="post" action="/switch"><input type="hidden" name="token" value="${csrf}">${roles.map(([id,label,address,description])=>`<button name="role" value="${id}"><strong>${label}</strong> · ${address}<br><small>${description}</small></button>`).join('')}</form><p><small>All GuardLink tabs in this Chrome profile share the active role. Refresh older tabs before presenting. Transactions require the matching wallet.</small></p></main></body></html>`;

async function api(path, body, cookie) {
  const response = await fetch(`${site}/api/v1${path}/`, { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('GuardLink sign-in failed.');
  return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://guardlink.ajnasnb.com; frame-ancestors 'none'; base-uri 'none'");
  if (req.headers.host !== '127.0.0.1:8899') { res.writeHead(403).end(); return; }
  if (req.method === 'GET' && req.url === '/') {
    res.setHeader('Referrer-Policy', 'same-origin');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
    return;
  }
  if (req.method !== 'POST' || req.url !== '/switch' || req.headers.origin !== local) {
    res.writeHead(403).end(); return;
  }
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 512) { res.writeHead(413).end(); return; }
    }
    const form = new URLSearchParams(body), role = form.get('role');
    if (form.get('token') !== csrf || !roles.some(([id]) => id === role)) {
      res.writeHead(403).end(); return;
    }
    const actor = stored.find(({ id }) => id === role);
    const wallet = await loadWallet(actor);
    if (wallet.address.toLowerCase() !== actor.address.toLowerCase()) throw new Error('Wrong demo wallet.');
    const { data: challenge } = await api('/auth/challenge', { wallet: actor.address });
    const login = await api('/auth/verify', { id: challenge.id, signature: await wallet.signMessage(challenge.message) });
    const { data: handoff } = await api('/auth/handoff', {}, login.cookie);
    const target = new URL(handoff.path, site);
    if (target.origin !== site || target.pathname !== '/api/v1/auth/consume') throw new Error('Invalid sign-in destination.');
    target.pathname += '/';
    res.writeHead(303, { Location: target.href }).end();
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Could not switch roles. Return to the Demo roles tab and try again.');
  }
});
server.listen(8899, '127.0.0.1', () => console.log(`GuardLink demo role switcher: ${local}`));
setTimeout(() => server.close(), 2 * 60 * 60 * 1000).unref();
