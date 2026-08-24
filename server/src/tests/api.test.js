import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../app.js';

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

function makeUser(name) {
  const email = `${name.toLowerCase()}${Date.now()}@test.dev`;
  return { name, email, password: 'password123' };
}

test('register + login + me', async () => {
  const u = makeUser('Zoe');
  const reg = await api('POST', '/api/auth/register', { body: u });
  assert.equal(reg.status, 201);
  assert.ok(reg.token);
  assert.equal(reg.user.email, u.email);

  const dup = await api('POST', '/api/auth/register', { body: u });
  assert.equal(dup.status, 409);

  const login = await api('POST', '/api/auth/login', { body: { email: u.email, password: 'password123' } });
  assert.equal(login.status, 200);
  assert.ok(login.token);

  const bad = await api('POST', '/api/auth/login', { body: { email: u.email, password: 'wrong' } });
  assert.equal(bad.status, 401);

  const me = await api('GET', '/api/auth/me', { token: login.token });
  assert.equal(me.user.id, reg.user.id);
});

test('posts: create, feed, like, comment, delete', async () => {
  const a = await api('POST', '/api/auth/register', { body: makeUser('Ann') });
  const b = await api('POST', '/api/auth/register', { body: makeUser('Ben') });

  await api('POST', `/api/friends/request/${b.user.id}`, { token: a.token });
  await api('POST', `/api/friends/accept/${a.user.id}`, { token: b.token });

  const created = await api('POST', '/api/posts', { token: a.token, body: { content: 'Hello world' } });
  assert.equal(created.status, 201);
  assert.equal(created.post.content, 'Hello world');

  const feed = await api('GET', '/api/posts/feed', { token: b.token });
  assert.ok(feed.posts.some((p) => p.id === created.post.id));

  const like = await api('POST', `/api/posts/${created.post.id}/like`, { token: b.token });
  assert.equal(like.liked, true);
  const feed2 = await api('GET', '/api/posts/feed', { token: b.token });
  const found = feed2.posts.find((p) => p.id === created.post.id);
  assert.equal(found.like_count, 1);
  assert.equal(found.liked, true);

  const unlike = await api('DELETE', `/api/posts/${created.post.id}/like`, { token: b.token });
  assert.equal(unlike.liked, false);

  const comment = await api('POST', `/api/posts/${created.post.id}/comments`, {
    token: b.token,
    body: { content: 'Nice!' },
  });
  assert.equal(comment.status, 201);
  const comments = await api('GET', `/api/posts/${created.post.id}/comments`, { token: a.token });
  assert.equal(comments.comments.length, 1);

  const del = await api('DELETE', `/api/posts/${created.post.id}`, { token: b.token });
  assert.equal(del.status, 403);
  const delOwner = await api('DELETE', `/api/posts/${created.post.id}`, { token: a.token });
  assert.equal(delOwner.ok, true);
});

test('friends: request, accept, list, status', async () => {
  const x = await api('POST', '/api/auth/register', { body: makeUser('Xavier') });
  const y = await api('POST', '/api/auth/register', { body: makeUser('Yara') });

  const status0 = await api('GET', `/api/friends/status/${y.user.id}`, { token: x.token });
  assert.equal(status0.status, 'none');

  const req = await api('POST', `/api/friends/request/${y.user.id}`, { token: x.token });
  assert.equal(req.status, 'pending');

  const reqs = await api('GET', '/api/friends/requests', { token: y.token });
  assert.equal(reqs.requests.length, 1);

  const accept = await api('POST', `/api/friends/accept/${x.user.id}`, { token: y.token });
  assert.equal(accept.status, 'accepted');

  const list = await api('GET', `/api/friends/list/${y.user.id}`, { token: y.token });
  assert.ok(list.friends.some((f) => f.id === x.user.id));

  const status1 = await api('GET', `/api/friends/status/${y.user.id}`, { token: x.token });
  assert.equal(status1.status, 'accepted');

  const remove = await api('POST', `/api/friends/remove/${y.user.id}`, { token: x.token });
  assert.equal(remove.status, 'none');
});

test('profile: get, search, update', async () => {
  const u = await api('POST', '/api/auth/register', { body: makeUser('Uma') });

  const prof = await api('GET', `/api/users/${u.user.id}`, { token: u.token });
  assert.equal(prof.user.name, u.user.name);

  const search = await api('GET', `/api/users?q=${encodeURIComponent(u.user.name)}`, { token: u.token });
  assert.ok(search.users.some((x) => x.id === u.user.id));

  const patch = await api('PATCH', '/api/users/me', { token: u.token, body: { bio: 'new bio' } });
  assert.equal(patch.user.bio, 'new bio');
});