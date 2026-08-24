import './config.js';
import bcrypt from 'bcryptjs';
import { pool, initDb } from './db.js';

await initDb();

async function reset() {
  // TRUNCATE cascades and restarts identities (equivalent to DELETE + sqlite_sequence reset)
  await pool.query(`
    TRUNCATE likes, comments, posts, friendships, users RESTART IDENTITY CASCADE
  `);
}

const people = [
  { name: 'Alice Chen', email: 'alice@example.com', bio: 'Coffee addict & weekend hiker.' },
  { name: 'Bob Martinez', email: 'bob@example.com', bio: 'Building things on the internet.' },
  { name: 'Carol Okafor', email: 'carol@example.com', bio: 'Photographer. Chasing golden hour.' },
  { name: 'David Kim', email: 'david@example.com', bio: 'Cycling every day until my legs quit.' },
  { name: 'Demo User', email: 'demo@example.com', bio: 'Just exploring the feed.' },
];

await reset();

const ids = {};
for (const p of people) {
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, bio) VALUES ($1, $2, $3, $4) RETURNING id`,
    [p.name, p.email, bcrypt.hashSync('password123', 10), p.bio]
  );
  ids[p.name] = rows[0].id;
}

const posts = [
  [ids['Alice Chen'], "Morning hike done. The view from the ridge was unreal. 🌄"],
  [ids['Bob Martinez'], 'Shipped a side project this week. Fast, simple, done.'],
  [ids['Carol Okafor'], 'Golden hour never gets old.'],
  [ids['David Kim'], '60km ride today. New personal best!'],
  [ids['Demo User'], 'Welcome to the feed — say hi!'],
  [ids['Alice Chen'], 'Who else is ready for the weekend?'],
  [ids['Bob Martinez'], 'Pro tip: write the boring parts of your app first.'],
];

const postIds = [];
for (const [userId, content] of posts) {
  const { rows } = await pool.query(
    `INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING id`,
    [userId, content, '']
  );
  postIds.push(rows[0].id);
}

async function insertLike(postId, userId) {
  await pool.query(`INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING`, [
    postId,
    userId,
  ]);
}
async function insertComment(postId, userId, content) {
  await pool.query(`INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3)`, [postId, userId, content]);
}
async function insertFriend(userId, friendId, status) {
  await pool.query(`INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3)`, [userId, friendId, status]);
}

await insertLike(postIds[0], ids['Bob Martinez']);
await insertLike(postIds[0], ids['Demo User']);
await insertLike(postIds[1], ids['Alice Chen']);
await insertLike(postIds[2], ids['Demo User']);
await insertLike(postIds[3], ids['Carol Okafor']);

await insertComment(postIds[0], ids['Bob Martinez'], 'Gorgeous shots, Alice!');
await insertComment(postIds[0], ids['Demo User'], 'Adding this trail to my list.');
await insertComment(postIds[1], ids['Carol Okafor'], 'Congrats Bob! 🎉');
await insertComment(postIds[4], ids['Alice Chen'], 'Hi!');

await insertFriend(ids['Demo User'], ids['Alice Chen'], 'accepted');
await insertFriend(ids['Demo User'], ids['Bob Martinez'], 'accepted');
await insertFriend(ids['Demo User'], ids['Carol Okafor'], 'accepted');
await insertFriend(ids['Alice Chen'], ids['Bob Martinez'], 'accepted');
await insertFriend(ids['Alice Chen'], ids['Carol Okafor'], 'accepted');
await insertFriend(ids['Bob Martinez'], ids['Carol Okafor'], 'accepted');
await insertFriend(ids['Demo User'], ids['David Kim'], 'pending');

console.log('Seeded database with 5 users.');
console.log('Demo login: demo@example.com / password123');
console.log('Other logins use <firstname-lowercase>@example.com, e.g. alice@example.com / password123');

await pool.end();
