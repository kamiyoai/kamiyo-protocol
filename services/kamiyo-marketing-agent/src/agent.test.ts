import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDraftPosts } from './agent';

test('parseDraftPosts extracts the JSON array from surrounding text', () => {
  const posts = parseDraftPosts(
    `Here you go:\n[{"text":"Shared runtime landed","reason":"real platform migration"}]`,
    2
  );

  assert.deepEqual(posts, [
    {
      text: 'Shared runtime landed',
      reason: 'real platform migration',
    },
  ]);
});

test('parseDraftPosts caps the number of returned posts', () => {
  const posts = parseDraftPosts(
    JSON.stringify([
      { text: 'one', reason: 'first' },
      { text: 'two', reason: 'second' },
      { text: 'three', reason: 'third' },
    ]),
    2
  );

  assert.equal(posts.length, 2);
  assert.equal(posts[0]?.text, 'one');
  assert.equal(posts[1]?.text, 'two');
});

test('parseDraftPosts rejects posts that exceed the X length cap', () => {
  const tooLong = 'x'.repeat(281);
  assert.throws(
    () => parseDraftPosts(JSON.stringify([{ text: tooLong, reason: 'too long' }]), 1),
    /String must contain at most 280 character\(s\)/
  );
});
