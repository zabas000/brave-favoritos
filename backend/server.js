const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'brave-favoritos-secret-key-2024';
const DATABASE_URL = process.env.DATABASE_URL;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

let db;

async function initPostgres() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      data TEXT NOT NULL,
      version INTEGER DEFAULT 1,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  db = {
    async query(text, params) {
      const result = await pool.query(text, params);
      return result;
    },
    async get(text, params) {
      const result = await pool.query(text, params);
      return result.rows[0] || null;
    },
    async all(text, params) {
      const result = await pool.query(text, params);
      return result.rows;
    }
  };
  console.log('Conectado a PostgreSQL');
}

async function initSQLite() {
  const initSqlJs = require('sql.js');
  const path = require('path');
  const fs = require('fs');
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'data.db');

  let sqlDb;
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(buffer);
  } else {
    sqlDb = new SQL.Database();
  }

  sqlDb.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  sqlDb.run(`CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  saveSQLite(sqlDb);

  db = {
    sqlDb,
    async query(text, params) {
      const stmt = sqlDb.prepare(text);
      if (params) stmt.bind(params);
      stmt.run();
      stmt.free();
      saveSQLite(sqlDb);
      return { rows: [] };
    },
    async get(text, params) {
      let query = text;
      if (params) {
        params.forEach((p, i) => {
          query = query.replace(`$${i + 1}`, typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : p);
        });
      }
      const result = sqlDb.exec(query);
      if (result.length === 0 || result[0].values.length === 0) return null;
      const cols = result[0].columns;
      const vals = result[0].values[0];
      const obj = {};
      cols.forEach((c, i) => { obj[c] = vals[i]; });
      return obj;
    },
    async all(text, params) {
      let query = text;
      if (params) {
        params.forEach((p, i) => {
          query = query.replace(`$${i + 1}`, typeof p === 'string' ? `'${p.replace(/'/g, "''")}'` : p);
        });
      }
      const result = sqlDb.exec(query);
      if (result.length === 0) return [];
      const cols = result[0].columns;
      return result[0].values.map(vals => {
        const obj = {};
        cols.forEach((c, i) => { obj[c] = vals[i]; });
        return obj;
      });
    }
  };
  console.log('Conectado a SQLite');
}

function saveSQLite(sqlDb) {
  try {
    const fs = require('fs');
    const path = require('path');
    const data = sqlDb.export();
    fs.writeFileSync(path.join(__dirname, 'data.db'), Buffer.from(data));
  } catch (e) {
    console.error('Error guardando SQLite:', e.message);
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' });
  }
  try {
    const decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    const existing = await db.get('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'El email ya está registrado' });

    const hashed = await bcrypt.hash(password, 10);
    const result = await db.query('INSERT INTO users (email, password) VALUES ($1, $2)', [email, hashed]);

    let userId;
    if (DATABASE_URL) {
      const user = await db.get('SELECT id FROM users WHERE email = $1', [email]);
      userId = user.id;
    } else {
      const user = await db.get('SELECT id FROM users WHERE email = $1', [email]);
      userId = user.id;
    }

    const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, email: user.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/bookmarks', authMiddleware, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY version DESC LIMIT 1', [req.userId]);
    res.json({ bookmarks: row ? JSON.parse(row.data) : null, version: row ? row.version : 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.post('/api/bookmarks', authMiddleware, async (req, res) => {
  try {
    const { bookmarks } = req.body;
    if (!bookmarks) return res.status(400).json({ error: 'Datos de marcadores requeridos' });

    const row = await db.get('SELECT version FROM bookmarks WHERE user_id = $1 ORDER BY version DESC LIMIT 1', [req.userId]);
    const newVersion = row ? row.version + 1 : 1;
    const data = JSON.stringify(bookmarks);

    await db.query('INSERT INTO bookmarks (user_id, data, version) VALUES ($1, $2, $3)', [req.userId, data, newVersion]);
    res.json({ success: true, version: newVersion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT email, created_at FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ email: user.email, created_at: user.created_at });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

async function init() {
  if (DATABASE_URL) {
    await initPostgres();
  } else {
    await initSQLite();
  }
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
  });
}

init().catch(err => {
  console.error('Error al iniciar:', err);
  process.exit(1);
});
