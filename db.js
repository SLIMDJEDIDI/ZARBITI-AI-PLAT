const Database = require('better-sqlite3');
const path = require('path');

const dbFile = path.join(__dirname, 'data.sqlite');
const db = new Database(dbFile);

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_code TEXT UNIQUE,
      brand TEXT NOT NULL,
      usage_type TEXT,
      customer_name TEXT,
      customer_phone TEXT NOT NULL,
      customer_address TEXT,
      customer_city TEXT,
      status TEXT NOT NULL DEFAULT 'NOUVEAU',
      expected_cod INTEGER DEFAULT 0,
      delivery_fee INTEGER DEFAULT 0,
      internal_notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      design_name TEXT NOT NULL,
      design_image TEXT,
      size_text TEXT,
      width_cm INTEGER,
      height_cm INTEGER,
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      line_total INTEGER NOT NULL,
      item_status TEXT NOT NULL DEFAULT 'A_PRODUIRE',
      batch_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY(batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS jax_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedUsers() {
  const existing = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (existing.count === 0) {
    const insert = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
    insert.run('sales', 'password', 'sales');
    insert.run('production', 'password', 'production');
    insert.run('admin', 'password', 'admin');
  }
}

createTables();
seedUsers();

module.exports = db;
