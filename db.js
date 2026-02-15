const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'tiendae.db');
const db = new Database(dbPath);

// Tablas
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nombre TEXT,
    telefono TEXT,
    direccion TEXT,
    rol TEXT DEFAULT 'cliente',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nombre TEXT,
    rol TEXT DEFAULT 'despacho',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    total INTEGER NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    direccion_envio TEXT,
    telefono TEXT,
    nota TEXT,
    stripe_session_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    enviado_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    precio INTEGER NOT NULL,
    cantidad INTEGER NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_pedidos_user ON pedidos(user_id);
  CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    precio INTEGER NOT NULL,
    descripcion TEXT,
    categoria_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
  );

  CREATE TABLE IF NOT EXISTS producto_imagenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL,
    ruta TEXT NOT NULL,
    orden INTEGER DEFAULT 0,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
  );

  CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
  CREATE INDEX IF NOT EXISTS idx_producto_imagenes_producto ON producto_imagenes(producto_id);
`);

// Borrado lógico: columna deleted_at (migración)
try {
  db.prepare('ALTER TABLE productos ADD COLUMN deleted_at DATETIME').run();
} catch (e) {
  if (!e.message || !e.message.includes('duplicate column')) throw e;
}

// Categorías por defecto
const catCount = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
if (catCount.c === 0) {
  db.prepare('INSERT INTO categorias (nombre) VALUES (?), (?)').run('Electros', 'Celulares');
}

module.exports = db;
