/**
 * Community decks API for ankigammon.com.
 *
 * Storage layout in the DECKS bucket:
 *   pending/<id>/meta.json | deck.apkg | pack.json   submitted, awaiting review
 *   public/<id>/meta.json  | deck.apkg | pack.json   approved
 *   catalog.json                                     list served to the site and the app
 *   state.json                                       running byte and queue totals
 *
 * Cost guard: the R2 free tier is 10 GB-month of storage, 1M Class A and 10M
 * Class B operations. Storage is the only dimension a public upload form can
 * realistically blow through, so submissions are refused once the tracked
 * total reaches STORAGE_BUDGET_BYTES or the queue holds MAX_PENDING decks.
 * The pre-checks read state.json (Class B) so refused requests never cost a
 * Class A operation.
 */

const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_PENDING = 20;
const MAX_APKG_BYTES = 50 * 1024 * 1024;
const MAX_PACK_BYTES = 20 * 1024 * 1024;
const MAX_META_BYTES = 64 * 1024;
const LICENSE = 'CC-BY-4.0';
const XGID_RE = /^XGID=[a-pA-P-]{26}(:-?\d+){9}$/;
const NO_STORE = { 'Cache-Control': 'no-store' };

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const response = await route(request, url, env, ctx);
      for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
      // The site's own pages are the canonical copies; keep this host out of search results.
      response.headers.set('X-Robots-Tag', 'noindex');
      return response;
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message }, err.status, cors);
      }
      console.error(JSON.stringify({ event: 'unhandled_error', path: url.pathname, message: String(err && err.message) }));
      return json({ error: 'Internal error' }, 500, cors);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function route(request, url, env, ctx) {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  const isRead = request.method === 'GET' || request.method === 'HEAD';

  if (isRead && path === '/robots.txt') return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain' } });
  if (isRead && path === '/catalog') return getCatalog(env);
  if (isRead && parts[0] === 'decks' && parts.length === 3) return getPublicFile(env, parts[1], parts[2]);
  if (request.method === 'POST' && path === '/submit') return submit(request, env, ctx);

  if (parts[0] === 'admin') {
    await requireAdmin(request, env);
    if (request.method === 'GET' && path === '/admin/pending') return listPending(env);
    if (request.method === 'GET' && path === '/admin/state') return json(await readState(env), 200, NO_STORE);
    if (request.method === 'POST' && path === '/admin/recount') return recount(env);
    if (request.method === 'GET' && parts[1] === 'pending' && parts.length === 4) return getPendingFile(env, parts[2], parts[3]);
    if (request.method === 'POST' && parts[1] === 'approve' && parts.length === 3) return approve(env, parts[2]);
    if (request.method === 'POST' && parts[1] === 'reject' && parts.length === 3) return reject(env, parts[2]);
    if (request.method === 'DELETE' && parts[1] === 'decks' && parts.length === 3) return unpublish(env, parts[2]);
  }

  throw new HttpError(404, 'Not found');
}

// ── Public endpoints ──────────────────────────────────────────────────

async function getCatalog(env) {
  const obj = await env.DECKS.get('catalog.json');
  const body = obj ? await obj.text() : '{"decks":[]}';
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}

async function getPublicFile(env, id, file) {
  assertId(id);
  if (file !== 'deck.apkg' && file !== 'pack.json') throw new HttpError(404, 'Not found');
  const obj = await env.DECKS.get(`public/${id}/${file}`);
  if (!obj) throw new HttpError(404, 'Not found');
  const headers = new Headers({ 'Cache-Control': 'public, max-age=86400', ETag: obj.httpEtag });
  if (file === 'deck.apkg') {
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${obj.customMetadata?.filename || id + '.apkg'}"`);
  } else {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new Response(obj.body, { headers });
}

async function submit(request, env, ctx) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_APKG_BYTES + MAX_PACK_BYTES + MAX_META_BYTES) {
    throw new HttpError(413, 'Submission too large');
  }

  const state = await readState(env);
  if (state.pending_count >= MAX_PENDING) {
    throw new HttpError(503, 'The review queue is full right now. Please try again in a few days.');
  }
  if (state.pending_bytes + state.public_bytes + contentLength > STORAGE_BUDGET_BYTES) {
    throw new HttpError(507, 'The deck library is out of storage space right now. Please try again later.');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'Expected multipart form data');
  }

  const metaRaw = form.get('meta');
  const apkg = form.get('apkg');
  const pack = form.get('pack');
  if (typeof metaRaw !== 'string' || metaRaw.length > MAX_META_BYTES) throw new HttpError(400, 'Missing or oversized meta');
  if (!(apkg instanceof File)) throw new HttpError(400, 'Missing apkg file');
  if (!(pack instanceof File)) throw new HttpError(400, 'Missing position pack');
  if (apkg.size > MAX_APKG_BYTES) throw new HttpError(413, 'Deck file exceeds 50 MB');
  if (pack.size > MAX_PACK_BYTES) throw new HttpError(413, 'Position pack exceeds 20 MB');

  const meta = validateMeta(parseJson(metaRaw, 'meta'));
  const packJson = parseJson(await pack.text(), 'pack');
  validatePack(packJson, meta);

  const id = makeId(meta.title);
  const submittedAt = new Date().toISOString();
  const bytes = apkg.size + pack.size;
  const stored = {
    id,
    ...meta,
    submitted_at: submittedAt,
    apkg_bytes: apkg.size,
    pack_bytes: pack.size,
    stored_bytes: bytes,
    apkg_filename: safeFilename(apkg.name, id),
  };

  await Promise.all([
    env.DECKS.put(`pending/${id}/meta.json`, JSON.stringify(stored), { httpMetadata: { contentType: 'application/json' } }),
    env.DECKS.put(`pending/${id}/deck.apkg`, apkg.stream(), {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { filename: stored.apkg_filename },
    }),
    env.DECKS.put(`pending/${id}/pack.json`, JSON.stringify(packJson), { httpMetadata: { contentType: 'application/json' } }),
  ]);
  await writeState(env, {
    ...state,
    pending_count: state.pending_count + 1,
    pending_bytes: state.pending_bytes + bytes,
  });

  console.log(JSON.stringify({ event: 'deck_submitted', id, positions: meta.summary.positions, apkg_bytes: apkg.size }));
  if (env.DISCORD_WEBHOOK_URL) ctx.waitUntil(notifyDiscord(env, stored));
  return json({ id, status: 'pending' }, 202);
}

/** Posts a short review notice; failures are logged and never affect the submission. */
async function notifyDiscord(env, meta) {
  const mb = (meta.apkg_bytes / (1024 * 1024)).toFixed(1);
  const content = [
    `New deck waiting for review: **${meta.title}** by ${meta.author}`,
    `${meta.summary.positions} positions, ${mb} MB, ref \`${meta.id}\``,
    'https://ankigammon.com/decks/review.html',
  ].join('\n');
  try {
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!res.ok) console.error(JSON.stringify({ event: 'discord_notify_failed', status: res.status }));
  } catch (err) {
    console.error(JSON.stringify({ event: 'discord_notify_failed', message: String(err && err.message) }));
  }
}

// ── Admin endpoints ───────────────────────────────────────────────────

async function requireAdmin(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !env.ADMIN_TOKEN || !(await tokensMatch(token, env.ADMIN_TOKEN))) {
    throw new HttpError(401, 'Unauthorized');
  }
}

async function tokensMatch(a, b) {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(da, db);
}

async function listPending(env) {
  const listed = await env.DECKS.list({ prefix: 'pending/', delimiter: '/' });
  const ids = listed.delimitedPrefixes.map((p) => p.split('/')[1]).filter(Boolean);
  const metas = await Promise.all(ids.map(async (id) => {
    const obj = await env.DECKS.get(`pending/${id}/meta.json`);
    return obj ? obj.json() : null;
  }));
  const pending = metas.filter(Boolean).sort((a, b) => (a.submitted_at < b.submitted_at ? -1 : 1));
  return json({ pending, state: await readState(env) }, 200, NO_STORE);
}

async function getPendingFile(env, id, file) {
  assertId(id);
  if (file !== 'deck.apkg' && file !== 'pack.json') throw new HttpError(404, 'Not found');
  const obj = await env.DECKS.get(`pending/${id}/${file}`);
  if (!obj) throw new HttpError(404, 'Not found');
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  if (file === 'deck.apkg') {
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename="${obj.customMetadata?.filename || id + '.apkg'}"`);
  } else {
    headers.set('Content-Type', 'application/json; charset=utf-8');
  }
  return new Response(obj.body, { headers });
}

async function approve(env, id) {
  assertId(id);
  const metaObj = await env.DECKS.get(`pending/${id}/meta.json`);
  if (!metaObj) throw new HttpError(404, 'No pending submission with that id');
  const meta = await metaObj.json();

  for (const file of ['deck.apkg', 'pack.json']) {
    const src = await env.DECKS.get(`pending/${id}/${file}`);
    if (!src) throw new HttpError(409, `Submission is missing ${file}`);
    await env.DECKS.put(`public/${id}/${file}`, src.body, {
      httpMetadata: src.httpMetadata,
      customMetadata: src.customMetadata,
    });
  }

  const publishedAt = new Date().toISOString();
  const published = { ...meta, published_at: publishedAt };
  await env.DECKS.put(`public/${id}/meta.json`, JSON.stringify(published), {
    httpMetadata: { contentType: 'application/json' },
  });

  const catalog = await readCatalog(env);
  catalog.decks = catalog.decks.filter((d) => d.id !== id);
  catalog.decks.unshift(catalogEntry(published));
  await writeCatalog(env, catalog);

  // The catalog write above is the commit point; cleanup problems are logged, not surfaced.
  try {
    await env.DECKS.delete([`pending/${id}/meta.json`, `pending/${id}/deck.apkg`, `pending/${id}/pack.json`]);
    const state = await readState(env);
    const bytes = storedBytes(meta);
    await writeState(env, {
      pending_count: Math.max(0, state.pending_count - 1),
      pending_bytes: Math.max(0, state.pending_bytes - bytes),
      public_bytes: state.public_bytes + bytes,
    });
  } catch (err) {
    console.error(JSON.stringify({ event: 'approve_cleanup_failed', id, message: String(err && err.message) }));
  }

  console.log(JSON.stringify({ event: 'deck_approved', id }));
  return json({ id, status: 'published' }, 200, NO_STORE);
}

async function reject(env, id) {
  assertId(id);
  const metaObj = await env.DECKS.get(`pending/${id}/meta.json`);
  if (!metaObj) throw new HttpError(404, 'No pending submission with that id');
  const meta = await metaObj.json();
  await env.DECKS.delete([`pending/${id}/meta.json`, `pending/${id}/deck.apkg`, `pending/${id}/pack.json`]);

  const state = await readState(env);
  await writeState(env, {
    ...state,
    pending_count: Math.max(0, state.pending_count - 1),
    pending_bytes: Math.max(0, state.pending_bytes - storedBytes(meta)),
  });

  console.log(JSON.stringify({ event: 'deck_rejected', id }));
  return json({ id, status: 'rejected' }, 200, NO_STORE);
}

async function unpublish(env, id) {
  assertId(id);
  const catalog = await readCatalog(env);
  const before = catalog.decks.length;
  catalog.decks = catalog.decks.filter((d) => d.id !== id);
  if (catalog.decks.length === before) throw new HttpError(404, 'No published deck with that id');
  await writeCatalog(env, catalog);

  const metaObj = await env.DECKS.get(`public/${id}/meta.json`);
  const meta = metaObj ? await metaObj.json() : null;
  await env.DECKS.delete([`public/${id}/meta.json`, `public/${id}/deck.apkg`, `public/${id}/pack.json`]);

  if (meta) {
    const state = await readState(env);
    await writeState(env, { ...state, public_bytes: Math.max(0, state.public_bytes - storedBytes(meta)) });
  }

  console.log(JSON.stringify({ event: 'deck_unpublished', id }));
  return json({ id, status: 'removed' }, 200, NO_STORE);
}

/** Rebuilds state.json from a full listing, for when the running totals drift. */
async function recount(env) {
  const state = { pending_count: 0, pending_bytes: 0, public_bytes: 0 };
  const seen = new Set();
  let cursor;
  do {
    const page = await env.DECKS.list({ cursor });
    for (const obj of page.objects) {
      const [area, id] = obj.key.split('/');
      if (area === 'pending') {
        state.pending_bytes += obj.size;
        if (!seen.has(id)) { seen.add(id); state.pending_count++; }
      } else if (area === 'public') {
        state.public_bytes += obj.size;
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await writeState(env, state);
  return json(state, 200, NO_STORE);
}

// ── State and catalog ─────────────────────────────────────────────────

async function readState(env) {
  const obj = await env.DECKS.get('state.json');
  const parsed = obj ? await obj.json() : {};
  return {
    pending_count: nonNegOr0(parsed.pending_count),
    pending_bytes: nonNegOr0(parsed.pending_bytes),
    public_bytes: nonNegOr0(parsed.public_bytes),
  };
}

async function writeState(env, state) {
  await env.DECKS.put('state.json', JSON.stringify(state), { httpMetadata: { contentType: 'application/json' } });
}

function nonNegOr0(v) {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function storedBytes(meta) {
  return nonNegOr0(meta.stored_bytes) || nonNegOr0(meta.apkg_bytes) + nonNegOr0(meta.pack_bytes);
}

async function readCatalog(env) {
  const obj = await env.DECKS.get('catalog.json');
  if (!obj) return { decks: [] };
  const parsed = await obj.json();
  return { decks: Array.isArray(parsed.decks) ? parsed.decks : [] };
}

async function writeCatalog(env, catalog) {
  await env.DECKS.put('catalog.json', JSON.stringify(catalog), { httpMetadata: { contentType: 'application/json' } });
}

function catalogEntry(meta) {
  return {
    id: meta.id,
    title: meta.title,
    author: meta.author,
    description: meta.description,
    license: meta.license,
    summary: meta.summary,
    apkg_bytes: meta.apkg_bytes,
    apkg_url: `/decks/${meta.id}/deck.apkg`,
    pack_url: `/decks/${meta.id}/pack.json`,
    published_at: meta.published_at,
  };
}

// ── Validation helpers ────────────────────────────────────────────────

function parseJson(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, `Invalid JSON in ${what}`);
  }
}

function cleanText(value, max, field, required) {
  const s = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (required && !s) throw new HttpError(400, `Missing ${field}`);
  if (s.length > max) throw new HttpError(400, `${field} is too long`);
  return s;
}

function validateMeta(meta) {
  if (!meta || typeof meta !== 'object') throw new HttpError(400, 'Invalid meta');
  const title = cleanText(meta.title, 80, 'title', true);
  const author = cleanText(meta.author, 60, 'author', true);
  const description = typeof meta.description === 'string' ? meta.description.trim() : '';
  if (!description) throw new HttpError(400, 'Missing description');
  if (description.length > 2000) throw new HttpError(400, 'description is too long');
  const contact = cleanText(meta.contact_email, 200, 'contact_email', false);
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw new HttpError(400, 'Invalid contact email');
  const att = meta.attestations;
  if (!att || att.own_work !== true || att.no_paid_content !== true || att.license_grant !== true) {
    throw new HttpError(400, 'All attestations must be accepted');
  }
  const s = meta.summary;
  if (!s || typeof s !== 'object') throw new HttpError(400, 'Missing summary');
  const summary = {
    positions: nonNegInt(s.positions, 'summary.positions'),
    checkerPlays: nonNegInt(s.checkerPlays, 'summary.checkerPlays'),
    cubeActions: nonNegInt(s.cubeActions, 'summary.cubeActions'),
    annotated: nonNegInt(s.annotated, 'summary.annotated'),
    matchLengths: countMap(s.matchLengths, 'summary.matchLengths', 20),
    sourceDescriptions: countMap(s.sourceDescriptions, 'summary.sourceDescriptions', 50),
    sourceFiles: countMap(s.sourceFiles, 'summary.sourceFiles', 200),
    previewXgids: Array.isArray(s.previewXgids)
      ? s.previewXgids.slice(0, 4).filter((x) => typeof x === 'string' && XGID_RE.test(x))
      : [],
  };
  if (summary.positions < 1) throw new HttpError(400, 'Deck has no positions');
  return {
    title,
    author,
    description,
    contact_email: contact || undefined,
    license: LICENSE,
    attestations: { own_work: true, no_paid_content: true, license_grant: true },
    summary,
  };
}

function nonNegInt(v, field) {
  if (!Number.isInteger(v) || v < 0) throw new HttpError(400, `Invalid ${field}`);
  return v;
}

function countMap(v, field, maxKeys) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, `Invalid ${field}`);
  const out = {};
  for (const [k, n] of Object.entries(v).slice(0, maxKeys)) {
    out[String(k).slice(0, 200)] = nonNegInt(n, field);
  }
  return out;
}

function validatePack(pack, meta) {
  if (!pack || pack.format !== 'ankigammon-position-pack' || pack.version !== 1) {
    throw new HttpError(400, 'Unrecognized position pack format');
  }
  if (!Array.isArray(pack.positions) || pack.positions.length !== meta.summary.positions) {
    throw new HttpError(400, 'Position pack does not match the summary');
  }
  for (const p of pack.positions) {
    if (!p || typeof p.xgid !== 'string' || !XGID_RE.test(p.xgid)) throw new HttpError(400, 'Position pack contains an invalid XGID');
    const d = p.analysis && p.analysis.decision;
    if (!d || !d.position || !Array.isArray(d.position.points) || d.position.points.length !== 26) {
      throw new HttpError(400, 'Position pack contains malformed analysis data');
    }
  }
}

function assertId(id) {
  if (!/^[a-z0-9-]{3,80}$/.test(id)) throw new HttpError(400, 'Invalid id');
}

function makeId(title) {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'deck';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${slug}-${suffix}`;
}

function safeFilename(name, id) {
  const base = String(name || '').split(/[\\/]/).pop().replace(/[^A-Za-z0-9._ -]/g, '').trim();
  const stem = base.replace(/\.apkg$/i, '') || id;
  return `${stem.slice(0, 80)}.apkg`;
}

// ── Response helpers ──────────────────────────────────────────────────

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}
