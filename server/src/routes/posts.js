import { Router } from 'express';
import { pool, ROWS_PER_PAGE } from '../db.js';
import { requireAuth, publicUser } from '../auth.js';

const router = Router();

const LIKE_COUNT = `(SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id)`;

async function postRow(post, viewerId) {
  const { rows: authorRows } = await pool.query('SELECT id, name, avatar_url FROM users WHERE id = $1', [post.user_id]);
  const author = authorRows[0];
  let liked = false;
  if (viewerId) {
    const { rows } = await pool.query('SELECT 1 FROM likes WHERE post_id = $1 AND user_id = $2', [post.id, viewerId]);
    liked = rows.length > 0;
  }
  // comments not returned here directly; kept for compatibility
  return {
    id: post.id,
    content: post.content,
    image_url: post.image_url,
    created_at: post.created_at,
    author: publicUser({ ...author, email: '', bio: '', cover_url: '', created_at: '' }),
    like_count: Number(post.like_count ?? 0),
    liked,
  };
}

router.get('/feed', requireAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * ROWS_PER_PAGE;

    const { rows: friendRows } = await pool.query(
      `SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END AS id
       FROM friendships WHERE status = 'accepted' AND (user_id = $1 OR friend_id = $1)`,
      [req.userId]
    );
    const friendIds = friendRows.map((r) => r.id);
    const ids = [req.userId, ...friendIds];

    // Build IN clause with $1..$n
    // For posts query we need placeholders for ids + limit/offset
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    const limitParam = `$${ids.length + 1}`;
    const offsetParam = `$${ids.length + 2}`;

    const { rows: posts } = await pool.query(
      `SELECT p.*, ${LIKE_COUNT} AS like_count
       FROM posts p
       WHERE p.user_id IN (${placeholders})
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      [...ids, ROWS_PER_PAGE, offset]
    );

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM posts p WHERE p.user_id IN (${placeholders})`,
      ids
    );
    const total = countRows[0].c;

    const mapped = await Promise.all(posts.map((p) => postRow(p, req.userId)));
    res.json({
      posts: mapped,
      page,
      hasMore: offset + posts.length < total,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/user/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows: userRows } = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!userRows.length) return res.status(404).json({ error: 'User not found' });

    const { rows: posts } = await pool.query(
      `SELECT p.*, ${LIKE_COUNT} AS like_count
       FROM posts p WHERE p.user_id = $1 ORDER BY p.created_at DESC, p.id DESC`,
      [req.params.id]
    );

    const mapped = await Promise.all(posts.map((p) => postRow(p, req.userId)));
    res.json({ posts: mapped });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { content } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const { rows } = await pool.query(
      'INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING *',
      [req.userId, content.trim(), req.body.image_url || '']
    );
    const post = rows[0];
    res.status(201).json({ post: await postRow(post, req.userId) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
    const post = rows[0];
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.user_id !== req.userId) return res.status(403).json({ error: 'Not your post' });
    await pool.query('DELETE FROM posts WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/like', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id FROM posts WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Post not found' });
    await pool.query('INSERT INTO likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING', [
      req.params.id,
      req.userId,
    ]);
    res.json({ liked: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/like', requireAuth, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM likes WHERE post_id = $1 AND user_id = $2', [req.params.id, req.userId]);
    res.json({ liked: false });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const { rows: comments } = await pool.query(
      `SELECT c.id, c.content, c.created_at,
              u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.post_id = $1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json({ comments });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const { content } = req.body || {};
    const { rows: postRows } = await pool.query('SELECT id FROM posts WHERE id = $1', [req.params.id]);
    if (!postRows.length) return res.status(404).json({ error: 'Post not found' });
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const { rows } = await pool.query(
      'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
      [req.params.id, req.userId, content.trim()]
    );
    const newId = rows[0].id;
    const { rows: commentRows } = await pool.query(
      `SELECT c.id, c.content, c.created_at,
              u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar
       FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [newId]
    );
    res.status(201).json({ comment: commentRows[0] });
  } catch (err) {
    next(err);
  }
});

router.delete('/comments/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM comments WHERE id = $1', [req.params.id]);
    const comment = rows[0];
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.user_id !== req.userId) return res.status(403).json({ error: 'Not your comment' });
    await pool.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
