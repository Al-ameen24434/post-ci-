import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env files in order: project root .env, then server/.env (server overrides root)
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });
// Also load default dotenv from cwd for compatibility (no override if already set)
dotenv.config();

function requireEnv(name, fallback) {
  const val = process.env[name] ?? fallback;
  return val;
}

export const NODE_ENV = requireEnv('NODE_ENV', 'development');
export const PORT = parseInt(requireEnv('PORT', '4000'), 10) || 4000;
export const DATABASE_URL =
  requireEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/postapi');
export const JWT_SECRET = requireEnv('JWT_SECRET', 'dev-secret-change-me');
export const CORS_ORIGIN = requireEnv('CORS_ORIGIN', 'http://localhost:5173');
export const UPLOAD_DIR = requireEnv('UPLOAD_DIR', join(__dirname, '..', '..', 'uploads'));

// Validate critical env in production
if (NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-me') {
  console.warn('[config] WARNING: JWT_SECRET is using default dev value in production. Set a strong secret.');
}
if (!DATABASE_URL) {
  console.warn('[config] WARNING: DATABASE_URL is not set.');
}
