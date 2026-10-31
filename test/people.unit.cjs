const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePerson, parsePeopleQuery } = require('../dist/people/people.input');
const valid = () => ({ slug: 'test-person', name: '  Имя  ', eras: [{ slug: 'era', title: 'Эпоха' }] });

test('query defaults, trimming and all category', () => {
  assert.deepEqual(parsePeopleQuery({}), { page: 1, limit: 20 });
  assert.deepEqual(parsePeopleQuery({ q: '  ', category: 'all', page: '2', limit: '5' }),
    { page: 2, limit: 5, q: undefined, category: undefined });
});
test('reject malformed queries instead of silently broadening the search', () => {
  for (const query of [{ page: '0' }, { limit: '101' }, { limit: '2x' }, { q: ['a', 'b'] },
    { era: {} }, { madhhab: 'unknown' }, { typo: 'x' }, { page: '1e3' }]) {
    assert.throws(() => parsePeopleQuery(query), { status: 400 });
  }
});
test('creation trims strings, removes duplicate cities and preserves uncertain dates', () => {
  const result = parsePerson({ ...valid(), cities: [' Багдад ', 'Багдад'], birthHijri: 'ок. 150–155',
    madhhabs: ['hanafi'], sources: [{ title: 'Источник', url: 'https://example.com/book' }] });
  assert.equal(result.name, 'Имя');
  assert.deepEqual(result.cities, ['Багдад']);
  assert.equal(result.birthHijri, 'ок. 150–155');
});
test('reject invalid creation payloads', () => {
  for (const value of [null, [], {}, { ...valid(), name: '' }, { ...valid(), slug: 'Bad slug' },
    { ...valid(), eras: [] }, { ...valid(), extra: true }, { ...valid(), madhhabs: ['unknown'] },
    { ...valid(), eras: [valid().eras[0], valid().eras[0]] },
    { ...valid(), sources: [{ title: 'X', url: 'javascript:alert(1)' }] }]) {
    assert.throws(() => parsePerson(value), { status: 400 });
  }
});
