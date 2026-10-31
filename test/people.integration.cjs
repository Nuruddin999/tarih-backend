// Every run gets a separate PostgreSQL schema. Never deletes application tables.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { NestFactory } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { PrismaClient, Prisma } = require('@prisma/client');

test('people API with PostgreSQL', async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to run integration tests');
  const schema = 'people_test_' + randomUUID().replaceAll('-', '');
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.searchParams.set('schema', schema);
  process.env.DATABASE_URL = url.toString();
  process.env.PERSON_WRITE_TOKEN = 'integration-test-token';
  const db = new PrismaClient();
  let app;
  try {
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      { env: process.env, stdio: 'pipe' });
    const { AppModule } = require('../dist/app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const root = await app.getUrl();
    async function request(method, suffix = '', body, token = process.env.PERSON_WRITE_TOKEN) {
      const response = await fetch(root + '/api/people' + suffix, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: await response.json() };
    }
    const person = {
      slug: 'first', name: 'Абу Тест', cities: ['Орёл', 'Багдад'], madhhabs: ['hanafi'],
      eras: [{ slug: 'first-era', title: 'Первая эпоха' }],
      specialties: [{ slug: 'muhaddith', title: 'Мухаддис' }],
      sources: [{ title: 'Тестовый источник', url: 'https://example.com/book' }], birthHijri: '100', deathHijri: '180',
    };
    await t.test('empty database returns an empty first page', async () => {
      assert.deepEqual((await request('GET')).data, { items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    });
    await t.test('write key required and absent server key disables creation', async () => {
      assert.equal((await request('POST', '', person, '')).status, 401);
      assert.equal((await request('POST', '', person, 'wrong')).status, 401);
      app.get(ConfigService).set('PERSON_WRITE_TOKEN', '');
      assert.equal((await request('POST', '', person)).status, 503);
      app.get(ConfigService).set('PERSON_WRITE_TOKEN', 'integration-test-token');
      assert.equal(await db.person.count(), 0);
    });
    await t.test('creates person with dictionaries and sources atomically', async () => {
      const result = await request('POST', '', person);
      assert.equal(result.status, 201);
      assert.deepEqual(result.data.birth, { hijri: '100', gregorian: '' });
      assert.deepEqual(result.data.categories, ['muhaddith', 'hanafi']);
      const stored = await db.person.findUnique({ where: { slug: 'first' }, include: { eras: true, specialties: true, sources: true } });
      assert.equal(stored.eras[0].slug, 'first-era');
      assert.equal(stored.specialties[0].slug, 'muhaddith');
      assert.equal(stored.sources[0].url, person.sources[0].url);
    });
    await t.test('duplicate slug conflicts and rolls back new dictionaries', async () => {
      assert.equal((await request('POST', '', { ...person, eras: [{ slug: 'rolled-back', title: 'X' }] })).status, 409);
      assert.equal(await db.era.count({ where: { slug: 'rolled-back' } }), 0);
      assert.equal(await db.person.count(), 1);
    });
    await t.test('reuses existing dictionaries without overwriting their titles', async () => {
      assert.equal((await request('POST', '', { ...person, slug: 'second', name: 'Я Второй', cities: ['Мекка'],
        madhhabs: ['shafii'], specialties: [{ slug: 'historian', title: 'Историк' }],
        eras: [{ slug: 'first-era', title: 'Не менять название' }] })).status, 201);
      assert.equal((await db.era.findUnique({ where: { slug: 'first-era' } })).title, 'Первая эпоха');
    });
    await t.test('name and city search is case insensitive and normalizes ё/е', async () => {
      for (const q of ['АБУ', 'орел', 'БАГДАД']) {
        const result = await request('GET', '?q=' + encodeURIComponent(q));
        assert.equal(result.status, 200);
        assert.deepEqual(result.data.items.map(p => p.slug), ['first']);
      }
      for (const q of ['%', '_', "' OR true --"]) {
        assert.equal((await request('GET', '?q=' + encodeURIComponent(q))).data.total, 0);
      }
    });
    await t.test('filters combine with AND and missing match returns empty list', async () => {
      for (const suffix of ['?category=hanafi', '?category=muhaddith', '?specialty=muhaddith&era=first-era&madhhab=hanafi']) {
        assert.deepEqual((await request('GET', suffix)).data.items.map(p => p.slug), ['first']);
      }
      assert.equal((await request('GET', '?category=muhaddith&madhhab=shafii')).data.total, 0);
      assert.equal((await request('GET', '?era=missing')).data.total, 0);
      assert.equal((await request('GET', '?category=all&q=%20')).data.total, 2);
    });
    await t.test('default ordering and pagination are deterministic', async () => {
      const first = (await request('GET', '?limit=1')).data;
      const second = (await request('GET', '?page=2&limit=1')).data;
      assert.equal(first.total, 2); assert.equal(first.totalPages, 2);
      assert.equal(first.items[0].slug, 'first'); assert.equal(second.items[0].slug, 'second');
      assert.deepEqual((await request('GET', '?page=3&limit=1')).data.items, []);
    });
    await t.test('HTTP boundary rejects invalid payloads and repeated query parameters', async () => {
      for (const suffix of ['?page=0', '?limit=101', '?q=a&q=b', '?madhhab=unknown', '?typo=x']) {
        assert.equal((await request('GET', suffix)).status, 400);
      }
      assert.equal((await request('POST', '', { ...person, name: '' })).status, 400);
      assert.equal(await db.person.count(), 2);
    });
  } finally {
    if (app) await app.close();
    await db.$executeRaw(Prisma.sql`DROP SCHEMA IF EXISTS ${Prisma.raw('"' + schema + '"')} CASCADE`);
    await db.$disconnect();
  }
});
