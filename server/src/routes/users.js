import { Router } from 'express';
import multer from 'multer';
import { extname } from 'path';
import { pool } from '../db.js';
import { requireAuth, publicUser } from '../auth.js';
import { UPLOAD_DIR } from '../config.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

const router = Router();

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const term = (req.query.q || '').toString().trim();
    const { rows: users } = term
      ? await pool.query('SELECT * FROM users WHERE name ILIKE $1 ORDER BY name LIMIT 20', [`%${term}%`])
      : await pool.query('SELECT * FROM users ORDER BY name LIMIT 50');
    res.json({ users: users.map(publicUser) });
  } catch (err) {
    next(err);
  }
});

router.patch('/me', requireAuth, async (req, res, next) => {
  try {
    const { name, bio } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    const user = rows[0];

    const nextName = typeof name === 'string' && name.trim().length >= 2 ? name.trim() : user.name;
    const nextBio = typeof bio === 'string' && bio.length <= 300 ? bio.trim() : user.bio;

    await pool.query('UPDATE users SET name = $1, bio = $2 WHERE id = $3', [nextName, nextBio, req.userId]);
    const { rows: updatedRows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    res.json({ user: publicUser(updatedRows[0]) });
  } catch (err) {
    next(err);
  }
});

router.post('/upload', requireAuth, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const url = `/uploads/${req.file.filename}`;
    const { kind } = req.body || {};
    if (kind === 'avatar' || kind === 'cover') {
      const column = kind === 'avatar' ? 'avatar_url' : 'cover_url';
      // column is whitelisted, safe to interpolate
      await pool.query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [url, req.userId]);
    }
    res.status(201).json({ url });
  } catch (err) {
    next(err);
  }
});

export default router;
