import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';

const router = Router();

async function friendState(userId, otherId) {
  const { rows } = await pool.query(
    `SELECT id, user_id, friend_id, status FROM friendships
     WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [userId, otherId]
  );
  const row = rows[0];
  if (!row) return { status: 'none', requestId: null, incoming: false, outgoing: false };
  const incoming = row.user_id === otherId && row.status === 'pending';
  const outgoing = row.user_id === userId && row.status === 'pending';
  return {
    status: row.status,
    requestId: row.id,
    incoming,
    outgoing,
  };
}

router.get('/status/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    if (Number(req.params.id) === req.userId) return res.json({ status: 'self' });
    res.json(await friendState(req.userId, Number(req.params.id)));
  } catch (err) {
    next(err);
  }
});

router.post('/request/:id', requireAuth, async (req, res, next) => {
  try {
    const otherId = Number(req.params.id);
    if (otherId === req.userId) return res.status(400).json({ error: 'Cannot friend yourself' });
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [otherId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const state = await friendState(req.userId, otherId);
    if (state.status === 'pending' && state.incoming) {
      await pool.query(`UPDATE friendships SET status = 'accepted' WHERE id = $1`, [state.requestId]);
      return res.json({ status: 'accepted' });
    }
    if (state.status === 'accepted') return res.json({ status: 'accepted' });
    if (state.status === 'pending') return res.status(409).json({ error: 'Request already pending' });

    await pool.query('INSERT INTO friendships (user_id, friend_id, status) VALUES ($1, $2, $3)', [
      req.userId,
      otherId,
      'pending',
    ]);
    res.status(201).json({ status: 'pending' });
  } catch (err) {
    next(err);
  }
});

router.post('/accept/:id', requireAuth, async (req, res, next) => {
  try {
    const otherId = Number(req.params.id);
    const { rows } = await pool.query(
      'SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = $3',
      [otherId, req.userId, 'pending']
    );
    if (!rows.length) return res.status(404).json({ error: 'No pending request from this user' });
    await pool.query("UPDATE friendships SET status = 'accepted' WHERE id = $1", [rows[0].id]);
    res.json({ status: 'accepted' });
  } catch (err) {
    next(err);
  }
});

router.post('/decline/:id', requireAuth, async (req, res, next) => {
  try {
    const otherId = Number(req.params.id);
    const { rows } = await pool.query(
      'SELECT id FROM friendships WHERE user_id = $1 AND friend_id = $2 AND status = $3',
      [otherId, req.userId, 'pending']
    );
    if (!rows.length) return res.status(404).json({ error: 'No pending request from this user' });
    await pool.query('DELETE FROM friendships WHERE id = $1', [rows[0].id]);
    res.json({ status: 'none' });
  } catch (err) {
    next(err);
  }
});

router.post('/remove/:id', requireAuth, async (req, res, next) => {
  try {
    const otherId = Number(req.params.id);
    await pool.query(
      `DELETE FROM friendships
       WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [req.userId, otherId]
    );
    res.json({ status: 'none' });
  } catch (err) {
    next(err);
  }
});

router.get('/requests', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.id AS request_id, u.id, u.name, u.avatar_url, u.bio
       FROM friendships f JOIN users u ON u.id = f.user_id
       WHERE f.friend_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [req.userId]
    );
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/list/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name, u.avatar_url, u.bio
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
       WHERE f.status = 'accepted' AND (f.user_id = $1 OR f.friend_id = $1)
       ORDER BY u.name ASC`,
      [Number(req.params.id)]
    );
    res.json({ friends: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
