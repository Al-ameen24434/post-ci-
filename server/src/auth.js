import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './config.js';

export { JWT_SECRET };
export const TOKEN_TTL = '7d';

export function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    bio: user.bio,
    avatar_url: user.avatar_url,
    cover_url: user.cover_url,
    created_at: user.created_at,
  };
}