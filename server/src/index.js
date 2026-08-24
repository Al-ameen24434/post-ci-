import { PORT } from './config.js';
import { app } from './app.js';
import { initDb } from './db.js';

await initDb();
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
