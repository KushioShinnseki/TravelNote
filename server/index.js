const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
const adminUsername = process.env.SEED_ADMIN_USERNAME;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const defaultTags = ['自然风光', '文化历史', '美食探索', '建筑空间', '慢节奏', '周末短途', '艺术展览', '朋友同行'];
const defaultHome = '上海市 · 静安区';

if (!jwtSecret || !adminUsername || !adminPassword) {
  throw new Error('JWT_SECRET, SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD are required');
}

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'travelnote',
  user: process.env.DB_USER || 'travelnote',
  password: process.env.DB_PASSWORD
});

app.use(express.json({ limit: '1mb' }));

function requestHash(request) {
  return crypto.createHash('sha256').update(JSON.stringify(request.body ?? null)).digest('hex');
}

async function idempotency(request, response, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return next();
  const key = text(request.get('Idempotency-Key'));
  if (!key) return next();
  if (key.length < 8 || key.length > 200) return response.status(400).json({ message: 'Idempotency-Key 长度需为 8-200 位' });

  const session = readCookie(request, 'travelnote_session');
  const authRequest = request.path === '/api/auth/register' || request.path === '/api/auth/login';
  const actor = authRequest
    ? text(request.body?.username, 'anonymous')
    : session
      ? crypto.createHash('sha256').update(session).digest('hex')
      : 'anonymous';
  const scope = `${request.method}:${request.path}:${actor}`;
  const hash = requestHash(request);
  try {
    const inserted = await pool.query(
      `INSERT INTO idempotency_keys (scope, idempotency_key, request_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (scope, idempotency_key) DO NOTHING
       RETURNING idempotency_key`,
      [scope, key, hash]
    );
    if (inserted.rowCount === 0) {
      const existing = await pool.query(
        'SELECT request_hash, status_code, response_body, response_headers FROM idempotency_keys WHERE scope = $1 AND idempotency_key = $2',
        [scope, key]
      );
      const record = existing.rows[0];
      if (!record) return response.status(409).json({ message: '请求正在处理中，请稍后重试' });
      if (record.request_hash !== hash) return response.status(409).json({ message: '相同 Idempotency-Key 不能用于不同请求' });
      if (record.status_code === null) return response.status(409).json({ message: '请求正在处理中，请稍后重试' });
      if (record.response_headers?.setCookie) response.setHeader('Set-Cookie', record.response_headers.setCookie);
      response.status(record.status_code);
      if (record.status_code === 204) return response.end();
      return response.json(record.response_body);
    }

    let responseBody = null;
    const originalJson = response.json.bind(response);
    const originalSend = response.send.bind(response);
    response.json = body => { responseBody = body; return originalJson(body); };
    response.send = body => {
      if (body !== undefined) {
        try { responseBody = typeof body === 'string' ? JSON.parse(body) : body; } catch { responseBody = body; }
      }
      return originalSend(body);
    };
    response.once('finish', () => {
      const setCookie = response.getHeader('Set-Cookie') || null;
      pool.query(
        `UPDATE idempotency_keys
         SET status_code = $1, response_body = $2, response_headers = $3
         WHERE scope = $4 AND idempotency_key = $5`,
        [response.statusCode, responseBody, JSON.stringify({ setCookie }), scope, key]
      ).catch(error => console.error('Failed to store idempotency response', error));
    });
    return next();
  } catch (error) {
    return next(error);
  }
}

app.use(idempotency);

function cookieOptions() {
  return [
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${7 * 24 * 60 * 60}`,
    process.env.NODE_ENV === 'production' ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function readCookie(request, name) {
  const header = request.headers.cookie || '';
  const match = header.split(';').map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function setSession(response, account) {
  const token = jwt.sign({ sub: String(account.id), username: account.username }, jwtSecret, { expiresIn: '7d' });
  response.setHeader('Set-Cookie', `travelnote_session=${encodeURIComponent(token)}; ${cookieOptions()}`);
}

function requireSession(request, response, next) {
  const token = readCookie(request, 'travelnote_session');
  if (!token) return response.status(401).json({ authenticated: false });
  try {
    request.account = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return response.status(401).json({ authenticated: false });
  }
}

function accountId(request) {
  return Number.parseInt(String(request.account.sub), 10);
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function passwordError(password) {
  if (password.length < 8 || password.length > 200) return '密码长度需为 8-200 位';
  return null;
}

function credentialError(username, password) {
  if (!/^[\p{L}\p{N}._-]{3,120}$/u.test(username)) return '账号需为 3-120 位字母、数字、中文、下划线、点或短横线';
  return passwordError(password);
}

function uniqueStrings(values, maxLength = 64) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => text(value).slice(0, maxLength))
    .filter(Boolean))];
}

function publicId(value, prefix) {
  const candidate = text(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return candidate || `${prefix}-${crypto.randomUUID()}`;
}

async function ensureAccountDefaults(client, id) {
  await client.query(
    'INSERT INTO profiles (account_id, home) VALUES ($1, $2) ON CONFLICT (account_id) DO NOTHING',
    [id, defaultHome]
  );
  for (const tag of defaultTags) {
    await client.query(
      'INSERT INTO tags (account_id, name) VALUES ($1, $2) ON CONFLICT (account_id, name) DO NOTHING',
      [id, tag]
    );
  }
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(120) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      scope VARCHAR(255) NOT NULL,
      idempotency_key VARCHAR(200) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      status_code INTEGER,
      response_body JSONB,
      response_headers JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (scope, idempotency_key)
    )
  `);
  await pool.query("DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '30 days'");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      account_id BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      home VARCHAR(255) NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tags (
      id BIGSERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      name VARCHAR(64) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (account_id, name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS destinations (
      id BIGSERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      public_id VARCHAR(80) NOT NULL,
      name VARCHAR(255) NOT NULL,
      region VARCHAR(255) NOT NULL DEFAULT '',
      location VARCHAR(255) NOT NULL DEFAULT '',
      transport TEXT NOT NULL DEFAULT '',
      arrangement TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      status VARCHAR(32) NOT NULL DEFAULT '想去',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (account_id, public_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS destination_tags (
      destination_id BIGINT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (destination_id, tag_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plans (
      id BIGSERIAL PRIMARY KEY,
      account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      public_id VARCHAR(80) NOT NULL,
      plan_date DATE NOT NULL,
      plan_time TIME NOT NULL DEFAULT '09:00',
      destination_id BIGINT REFERENCES destinations(id) ON DELETE SET NULL,
      destination VARCHAR(255) NOT NULL,
      other_destination VARCHAR(255) NOT NULL DEFAULT '',
      activity TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (account_id, public_id)
    )
  `);

  await pool.query("ALTER TABLE destinations ADD COLUMN IF NOT EXISTS arrangement TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS destination_id BIGINT REFERENCES destinations(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS other_destination VARCHAR(255) NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE plans ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''");

  await pool.query('CREATE INDEX IF NOT EXISTS destinations_account_idx ON destinations (account_id, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS plans_account_idx ON plans (account_id, plan_date, plan_time)');

  const existing = await pool.query('SELECT id FROM accounts WHERE username = $1 LIMIT 1', [adminUsername]);
  let seededAccount = existing.rows[0];
  if (!seededAccount) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const inserted = await pool.query(
      'INSERT INTO accounts (username, password_hash) VALUES ($1, $2) RETURNING id',
      [adminUsername, passwordHash]
    );
    seededAccount = inserted.rows[0];
    console.log(`Seeded local account: ${adminUsername}`);
  }

  const client = await pool.connect();
  try {
    await ensureAccountDefaults(client, seededAccount.id);
  } finally {
    client.release();
  }
}

async function readWorkspace(id) {
  const client = await pool.connect();
  try {
    await ensureAccountDefaults(client, id);
    const profileResult = await client.query('SELECT home FROM profiles WHERE account_id = $1', [id]);
    const tagResult = await client.query('SELECT name FROM tags WHERE account_id = $1 ORDER BY created_at, id', [id]);
    const destinationResult = await client.query(`
      SELECT d.public_id AS id, d.name, d.region, d.location, d.transport, d.arrangement, d.note, d.status,
        COALESCE(array_agg(t.name ORDER BY t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS tags
      FROM destinations d
      LEFT JOIN destination_tags dt ON dt.destination_id = d.id
      LEFT JOIN tags t ON t.id = dt.tag_id
      WHERE d.account_id = $1
      GROUP BY d.id
      ORDER BY d.created_at DESC, d.id DESC
    `, [id]);
    const planResult = await client.query(`
      SELECT p.public_id AS id, TO_CHAR(p.plan_date, 'YYYY-MM-DD') AS date,
        TO_CHAR(p.plan_time, 'HH24:MI') AS time, d.public_id AS "destinationId",
        p.destination, p.other_destination AS "otherDestination", p.activity, p.note
      FROM plans p
      LEFT JOIN destinations d ON d.id = p.destination_id
      WHERE p.account_id = $1
      ORDER BY p.plan_date, p.plan_time, p.id
    `, [id]);

    return {
      format: 'travelnote',
      version: 2,
      profile: { home: profileResult.rows[0]?.home || defaultHome },
      tagCatalog: tagResult.rows.map(row => row.name),
      destinations: destinationResult.rows,
      plans: planResult.rows
    };
  } finally {
    client.release();
  }
}

function validateWorkspace(workspace) {
  if (!workspace || !Array.isArray(workspace.destinations) || !Array.isArray(workspace.plans)) {
    return '数据格式不正确';
  }
  if (workspace.destinations.length > 5000 || workspace.plans.length > 10000) return '数据量超过限制';
  for (const item of workspace.destinations) {
    if (!text(item.name)) return '地点名称不能为空';
  }
  for (const plan of workspace.plans) {
    if (!text(plan.date) || !text(plan.destination)) return '日程日期和地点不能为空';
  }
  return null;
}

async function replaceWorkspace(id, workspace) {
  const validationError = validateWorkspace(workspace);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureAccountDefaults(client, id);
    await client.query('DELETE FROM destinations WHERE account_id = $1', [id]);
    await client.query('DELETE FROM plans WHERE account_id = $1', [id]);
    await client.query('DELETE FROM tags WHERE account_id = $1', [id]);

    const profileHome = text(workspace.profile?.home, defaultHome).slice(0, 255) || defaultHome;
    await client.query(
      `INSERT INTO profiles (account_id, home, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (account_id) DO UPDATE SET home = EXCLUDED.home, updated_at = NOW()`,
      [id, profileHome]
    );

    const destinationItems = workspace.destinations.map(item => ({
      id: publicId(item.id, 'd'),
      name: text(item.name).slice(0, 255),
      region: text(item.region).slice(0, 255),
      location: text(item.location).slice(0, 255),
      tags: uniqueStrings(item.tags),
      transport: text(item.transport),
      arrangement: text(item.arrangement),
      note: text(item.note),
      status: text(item.status, '想去').slice(0, 32) || '想去'
    }));
    const planItems = workspace.plans.map(item => ({
      id: publicId(item.id, 'p'),
      date: text(item.date),
      time: text(item.time, '09:00') || '09:00',
      destinationId: text(item.destinationId),
      destination: text(item.destination).slice(0, 255),
      otherDestination: text(item.otherDestination).slice(0, 255),
      note: text(item.note),
      activity: text(item.activity)
    }));
    const allTags = uniqueStrings([
      ...defaultTags,
      ...uniqueStrings(workspace.tagCatalog),
      ...destinationItems.flatMap(item => item.tags)
    ]);
    const tagIds = new Map();
    for (const tag of allTags) {
      const result = await client.query(
        'INSERT INTO tags (account_id, name) VALUES ($1, $2) RETURNING id',
        [id, tag]
      );
      tagIds.set(tag, result.rows[0].id);
    }

    const destinationIds = new Set();
    const destinationDatabaseIds = new Map();
    for (const item of destinationItems) {
      let itemId = item.id;
      while (destinationIds.has(itemId)) itemId = publicId('', 'd');
      destinationIds.add(itemId);
      const result = await client.query(
        `INSERT INTO destinations (account_id, public_id, name, region, location, transport, arrangement, note, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [id, itemId, item.name, item.region, item.location, item.transport, item.arrangement, item.note, item.status]
      );
      destinationDatabaseIds.set(itemId, result.rows[0].id);
      for (const tag of item.tags) {
        const tagId = tagIds.get(tag);
        if (tagId) await client.query('INSERT INTO destination_tags (destination_id, tag_id) VALUES ($1, $2)', [result.rows[0].id, tagId]);
      }
    }

    const planIds = new Set();
    for (const item of planItems) {
      let itemId = item.id;
      while (planIds.has(itemId)) itemId = publicId('', 'p');
      planIds.add(itemId);
      await client.query(
        `INSERT INTO plans (account_id, public_id, plan_date, plan_time, destination_id, destination, other_destination, activity, note)
         VALUES ($1, $2, $3::date, $4::time, $5, $6, $7, $8, $9)`,
        [
          id,
          itemId,
          item.date,
          item.time,
          destinationDatabaseIds.get(item.destinationId) || null,
          item.destination || item.otherDestination || '未指定地点',
          item.otherDestination,
          item.activity,
          item.note
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return readWorkspace(id);
}

app.get('/api/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ ok: true, service: 'travelnote-api' });
  } catch {
    response.status(503).json({ ok: false });
  }
});

app.get('/api/auth/me', requireSession, async (request, response) => {
  response.json({ authenticated: true, account: { id: String(request.account.sub), username: request.account.username } });
});

app.post('/api/auth/register', async (request, response) => {
  const username = text(request.body?.username);
  const password = String(request.body?.password || '');
  const validationError = credentialError(username, password);
  if (validationError) return response.status(400).json({ message: validationError });

  const existingResult = await pool.query(
    'SELECT id, username, password_hash FROM accounts WHERE username = $1 LIMIT 1',
    [username]
  );
  if (existingResult.rowCount > 0) {
    const existing = existingResult.rows[0];
    if (await bcrypt.compare(password, existing.password_hash)) {
      setSession(response, existing);
      return response.status(200).json({ authenticated: true, account: { id: String(existing.id), username: existing.username } });
    }
    return response.status(409).json({ message: '这个账号已经存在' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await client.query(
      'INSERT INTO accounts (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, passwordHash]
    );
    const account = result.rows[0];
    await ensureAccountDefaults(client, account.id);
    await client.query('COMMIT');
    setSession(response, account);
    response.status(201).json({ authenticated: true, account: { id: String(account.id), username: account.username } });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return response.status(409).json({ message: '这个账号已经存在' });
    console.error(error);
    response.status(500).json({ message: '注册失败' });
  } finally {
    client.release();
  }
});

app.post('/api/auth/login', async (request, response) => {
  const username = text(request.body?.username);
  const password = String(request.body?.password || '');
  if (!username || !password) return response.status(400).json({ message: '请输入账号和密码' });

  const result = await pool.query(
    'SELECT id, username, password_hash FROM accounts WHERE username = $1 LIMIT 1',
    [username]
  );
  const account = result.rows[0];
  const valid = account ? await bcrypt.compare(password, account.password_hash) : false;
  if (!valid) return response.status(401).json({ message: '账号或密码不正确' });

  setSession(response, account);
  response.json({ authenticated: true, account: { id: String(account.id), username: account.username } });
});

app.post('/api/auth/change-password', requireSession, async (request, response) => {
  const currentPassword = String(request.body?.currentPassword || '');
  const newPassword = String(request.body?.newPassword || '');
  const username = text(request.account.username);
  const validationError = passwordError(newPassword);
  if (validationError) return response.status(400).json({ message: `新${validationError}` });
  if (!newPassword) return response.status(400).json({ message: '请输入新密码' });
  if (!currentPassword) return response.status(400).json({ message: '请输入当前密码' });
  if (currentPassword === newPassword) return response.status(400).json({ message: '新密码不能与当前密码相同' });

  const result = await pool.query('SELECT id, username, password_hash FROM accounts WHERE id = $1 LIMIT 1', [accountId(request)]);
  const account = result.rows[0];
  const valid = account ? await bcrypt.compare(currentPassword, account.password_hash) : false;
  if (!valid) {
    const alreadyApplied = account ? await bcrypt.compare(newPassword, account.password_hash) : false;
    if (alreadyApplied) {
      setSession(response, account);
      return response.json({ changed: true, alreadyApplied: true });
    }
    return response.status(401).json({ message: '当前密码不正确' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await pool.query('UPDATE accounts SET password_hash = $1 WHERE id = $2', [passwordHash, account.id]);
  setSession(response, account);
  response.json({ changed: true });
});

app.post('/api/auth/logout', (_request, response) => {
  response.setHeader('Set-Cookie', 'travelnote_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
  response.status(204).end();
});

app.get('/api/workspace', requireSession, async (request, response) => {
  try {
    response.json(await readWorkspace(accountId(request)));
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: '读取旅行数据失败' });
  }
});

app.put('/api/workspace', requireSession, async (request, response) => {
  try {
    response.json(await replaceWorkspace(accountId(request), request.body));
  } catch (error) {
    console.error(error);
    response.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : '保存旅行数据失败' });
  }
});

async function start() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await ensureSchema();
      app.listen(port, () => console.log(`TravelNote API listening on ${port}`));
      return;
    } catch (error) {
      if (attempt === 30) throw error;
      console.log(`Database is not ready yet (${attempt}/30)`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

start().catch(error => {
  console.error(error);
  process.exit(1);
});
