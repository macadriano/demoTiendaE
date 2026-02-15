require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { MercadoPagoConfig, Preference } = require('mercadopago');
const db = require('./db');

const fotosDir = path.join(__dirname, 'fotos');
const uploadMulter = multer({
  dest: fotosDir,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype);
    cb(ok ? null : new Error('Solo imágenes (jpg, png, gif, webp)'), ok);
  },
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, fotosDir),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
      cb(null, 'prod_' + Date.now() + '_' + Math.random().toString(36).slice(2) + ext);
    }
  })
});

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tiendae-secret-cambiar-en-produccion';
const MP_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const mercadopago = MP_ACCESS_TOKEN ? (() => {
  const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN, options: { timeout: 5000 } });
  return { preference: new Preference(client) };
})() : null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/fotos', express.static(path.join(__dirname, 'fotos')));

// Resolver imagen: preferir ET_ si existe
function getImagenUrl(codigo) {
  const base = codigo.replace(/\.[^.]+$/, '');
  const etPath = path.join(__dirname, 'fotos', `ET_${base}.jpg`);
  const normalPath = path.join(__dirname, 'fotos', `${base}.jpg`);
  if (fs.existsSync(etPath)) return `/fotos/ET_${base}.jpg`;
  if (fs.existsSync(normalPath)) return `/fotos/${base}.jpg`;
  return `/fotos/${base}.jpg`;
}

// --- API Categorías ---
app.get('/api/categorias', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, nombre FROM categorias ORDER BY nombre').all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar categorías' });
  }
});

// --- API Productos (JSON + DB, filtro por categoría) ---
function getProductosPublic(categoriaFilter) {
  const list = [];
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'productos.json'), 'utf8'));
    for (const p of data) {
      const categoria = 'Electros';
      if (categoriaFilter && categoria !== categoriaFilter) continue;
      const imagenUrl = getImagenUrl(p.codigo);
      list.push({
        ...p,
        categoria,
        imagenUrl,
        imagenes: [imagenUrl],
        descripcion: p.descripcion || null
      });
    }
  } catch (err) {
    // ignorar si no existe productos.json
  }
  const dbRows = db.prepare(`
    SELECT p.id, p.codigo, p.nombre, p.precio, p.descripcion, p.created_at, c.nombre as categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE (p.deleted_at IS NULL)
  `).all();
  const codigosEnLista = new Set(list.map(x => (x.codigo || '').toString().toLowerCase()));
  for (const r of dbRows) {
    const catNombre = r.categoria_nombre || 'Electros';
    if (categoriaFilter && catNombre !== categoriaFilter) continue;
    if (codigosEnLista.has((r.codigo || '').toString().toLowerCase())) continue;
    codigosEnLista.add((r.codigo || '').toString().toLowerCase());
    const imagenes = db.prepare('SELECT ruta FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id').all(r.id).map(i => i.ruta);
    list.push({
      id: r.id,
      codigo: r.codigo,
      nombre: r.nombre,
      precio: r.precio,
      descripcion: r.descripcion || null,
      categoria: catNombre,
      imagenUrl: imagenes[0] || '',
      imagenes: imagenes.length ? imagenes : [],
      created_at: r.created_at
    });
  }
  return list;
}

app.get('/api/productos', (req, res) => {
  try {
    const categoria = (req.query.categoria || '').trim() || null;
    const productos = getProductosPublic(categoria);
    res.json(productos);
  } catch (e) {
    res.status(500).json({ error: 'Error al cargar productos' });
  }
});

// --- Auth Clientes ---
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombre, telefono, direccion } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password, nombre, telefono, direccion) VALUES (?, ?, ?, ?, ?)');
    stmt.run(email.toLowerCase(), hash, nombre || null, telefono || null, direccion || null);
    const user = db.prepare('SELECT id, email, nombre, rol FROM users WHERE email = ?').get(email.toLowerCase());
    const token = jwt.sign({ id: user.id, rol: 'cliente' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user, token });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El email ya está registrado' });
    res.status(500).json({ error: 'Error al registrar' });
  }
});

// Login unificado: si el email es de staff, ingresa como staff; si no, como cliente
app.post('/api/auth/login', async (req, res) => {
  const email = (req.body && req.body.email != null) ? String(req.body.email).trim().toLowerCase() : '';
  const password = (req.body && req.body.password != null) ? String(req.body.password).trim() : '';
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const staff = db.prepare('SELECT id, email, password, nombre FROM staff WHERE email = ?').get(email);
  if (staff) {
    const ok = await bcrypt.compare(password, staff.password);
    if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });
    const token = jwt.sign({ id: staff.id, rol: 'staff' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ user: { id: staff.id, email: staff.email, nombre: staff.nombre, rol: 'staff' }, token });
    return;
  }
  const user = db.prepare('SELECT id, email, password, nombre FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Credenciales incorrectas' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });
  const token = jwt.sign({ id: user.id, rol: 'cliente' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ user: { id: user.id, email: user.email, nombre: user.nombre, rol: 'cliente' }, token });
});

// --- Auth Staff ---
app.post('/api/staff/login', async (req, res) => {
  const email = (req.body && req.body.email != null) ? String(req.body.email).trim().toLowerCase() : '';
  const password = (req.body && req.body.password != null) ? String(req.body.password).trim() : '';
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const staff = db.prepare('SELECT id, email, password, nombre, rol FROM staff WHERE email = ?').get(email);
  if (!staff) return res.status(401).json({ error: 'Credenciales incorrectas' });
  const ok = await bcrypt.compare(password, staff.password);
  if (!ok) return res.status(401).json({ error: 'Credenciales incorrectas' });
  const token = jwt.sign({ id: staff.id, rol: 'staff' }, JWT_SECRET, { expiresIn: '24h' });
  delete staff.password;
  res.json({ user: staff, token });
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Sesión expirada' });
  }
}

function staffOnly(req, res, next) {
  if (req.user.rol !== 'staff') return res.status(403).json({ error: 'Solo personal autorizado' });
  next();
}

// --- Pedidos (clientes) ---
app.get('/api/mis-pedidos', authMiddleware, (req, res) => {
  if (req.user.rol !== 'cliente') return res.status(403).json({ error: 'Solo clientes' });
  const rows = db.prepare(`
    SELECT p.*, (SELECT json_group_array(json_object('codigo', i.codigo, 'nombre', i.nombre, 'precio', i.precio, 'cantidad', i.cantidad))
     FROM pedido_items i WHERE i.pedido_id = p.id) as items_json
    FROM pedidos p WHERE p.user_id = ? ORDER BY p.created_at DESC
  `).all(req.user.id);
  const pedidos = rows.map(r => ({ ...r, items: r.items_json ? JSON.parse(r.items_json) : [] }));
  res.json(pedidos);
});

app.post('/api/pedidos', authMiddleware, (req, res) => {
  if (req.user.rol !== 'cliente') return res.status(403).json({ error: 'Solo clientes' });
  const { items, direccion_envio, telefono, nota } = req.body || {};
  if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Carrito vacío' });
  const total = items.reduce((s, i) => s + (i.precio || 0) * (i.cantidad || 1), 0);
  const insert = db.prepare('INSERT INTO pedidos (user_id, total, direccion_envio, telefono, nota) VALUES (?, ?, ?, ?, ?)');
  const insertItem = db.prepare('INSERT INTO pedido_items (pedido_id, codigo, nombre, precio, cantidad) VALUES (?, ?, ?, ?, ?)');
  const run = db.transaction(() => {
    const r = insert.run(req.user.id, total, direccion_envio || null, telefono || null, nota || null);
    const pedidoId = r.lastInsertRowid;
    for (const i of items) {
      insertItem.run(pedidoId, i.codigo, i.nombre, i.precio, i.cantidad || 1);
    }
    return pedidoId;
  });
  const pedidoId = run();
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedidoId);
  res.status(201).json(pedido);
});

// --- Mercado Pago Checkout Pro (crear preferencia para un pedido ya creado) ---
app.post('/api/crear-pago', authMiddleware, async (req, res) => {
  const { pedidoId, successUrl, cancelUrl } = req.body || {};
  if (!mercadopago) return res.status(503).json({ error: 'Pagos no configurados. Configure MERCADOPAGO_ACCESS_TOKEN en .env' });
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND user_id = ?').get(pedidoId, req.user.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  const items = db.prepare('SELECT * FROM pedido_items WHERE pedido_id = ?').all(pedidoId);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  try {
    const body = {
      items: items.map(i => ({
        id: String(i.id),
        title: (i.nombre || '').slice(0, 255),
        description: `Cód: ${i.codigo}`,
        quantity: i.cantidad,
        unit_price: Number(i.precio),
        currency_id: 'ARS'
      })),
      back_urls: {
        success: successUrl || `${baseUrl}/#/gracias`,
        failure: cancelUrl || `${baseUrl}/#/carrito`,
        pending: cancelUrl || `${baseUrl}/#/carrito`
      },
      auto_return: 'approved',
      external_reference: String(pedidoId),
      notification_url: process.env.MERCADOPAGO_NOTIFICATION_URL || `${baseUrl}/api/webhook/mercadopago`
    };
    const result = await mercadopago.preference.create({ body });
    const pref = result.body || result;
    const initPoint = pref.init_point || result.init_point;
    const prefId = pref.id || result.id;
    if (prefId) db.prepare('UPDATE pedidos SET stripe_session_id = ? WHERE id = ?').run(String(prefId), pedidoId);
    res.json({ url: initPoint, preferenceId: prefId });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al crear pago con Mercado Pago' });
  }
});

// --- Webhook Mercado Pago (notificaciones de pago / IPN) ---
app.post('/api/webhook/mercadopago', async (req, res) => {
  const { type, data } = req.body || {};
  if (!MP_ACCESS_TOKEN || type !== 'payment' || !data?.id) {
    return res.status(200).send('OK');
  }
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { Authorization: 'Bearer ' + MP_ACCESS_TOKEN }
    });
    const pay = await resp.json();
    const status = pay.status;
    const extRef = pay.external_reference;
    if ((status === 'approved' || status === 'authorized') && extRef) {
      db.prepare("UPDATE pedidos SET estado = 'pagado' WHERE id = ?").run(extRef);
    }
  } catch (err) {
    console.error('Webhook MP:', err.message);
  }
  res.status(200).send('OK');
});

// --- Admin Productos (CRUD, solo staff) ---
app.get('/api/admin/productos', authMiddleware, staffOnly, (req, res) => {
  try {
    const incluirEliminados = req.query.eliminados === '1';
    let sql = `
      SELECT p.id, p.codigo, p.nombre, p.precio, p.descripcion, p.categoria_id, p.created_at, p.deleted_at, c.nombre as categoria_nombre
      FROM productos p
      JOIN categorias c ON c.id = p.categoria_id
    `;
    if (!incluirEliminados) sql += ' WHERE (p.deleted_at IS NULL)';
    sql += ' ORDER BY p.deleted_at IS NULL DESC, p.created_at DESC';
    const rows = db.prepare(sql).all();
    const withImagenes = rows.map(r => {
      const imagenes = db.prepare('SELECT id, ruta FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id').all(r.id);
      return { ...r, imagenes };
    });
    res.json(withImagenes);
  } catch (e) {
    res.status(500).json({ error: 'Error al listar productos' });
  }
});

app.get('/api/admin/productos/:id', authMiddleware, staffOnly, (req, res) => {
  const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
  const imagenes = db.prepare('SELECT id, ruta, orden FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id').all(prod.id);
  res.json({ ...prod, imagenes });
});

app.post('/api/admin/productos', authMiddleware, staffOnly, uploadMulter.array('fotos', 10), (req, res) => {
  const b = req.body || {};
  const codigo = (b.codigo || '').trim();
  const nombre = (b.nombre || '').trim();
  const precio = parseInt(b.precio, 10);
  const descripcion = (b.descripcion || '').trim() || null;
  const categoria_id = parseInt(b.categoria_id, 10);
  if (!codigo || !nombre || !Number.isInteger(precio) || precio < 0 || !Number.isInteger(categoria_id) || categoria_id < 1) {
    return res.status(400).json({ error: 'Faltan codigo, nombre, precio o categoria_id válidos' });
  }
  try {
    const r = db.prepare('INSERT INTO productos (codigo, nombre, precio, descripcion, categoria_id) VALUES (?, ?, ?, ?, ?)').run(codigo, nombre, precio, descripcion, categoria_id);
    const productoId = r.lastInsertRowid;
    const files = req.files || [];
    const insertImg = db.prepare('INSERT INTO producto_imagenes (producto_id, ruta, orden) VALUES (?, ?, ?)');
    for (let i = 0; i < files.length; i++) {
      const ruta = '/fotos/' + files[i].filename;
      insertImg.run(productoId, ruta, i);
    }
    const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(productoId);
    const imagenes = db.prepare('SELECT id, ruta FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id').all(productoId);
    res.status(201).json({ ...prod, imagenes });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El código ya existe' });
    res.status(500).json({ error: e.message || 'Error al crear producto' });
  }
});

app.put('/api/admin/productos/:id', authMiddleware, staffOnly, (req, res) => {
  const id = req.params.id;
  const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
  const b = req.body || {};
  const codigo = (b.codigo || b.codigo === '' ? (b.codigo + '').trim() : prod.codigo);
  const nombre = (b.nombre || b.nombre === '' ? (b.nombre + '').trim() : prod.nombre);
  const precio = b.precio !== undefined ? parseInt(b.precio, 10) : prod.precio;
  const descripcion = b.descripcion !== undefined ? (b.descripcion + '').trim() || null : prod.descripcion;
  const categoria_id = b.categoria_id !== undefined ? parseInt(b.categoria_id, 10) : prod.categoria_id;
  if (!codigo || !nombre || !Number.isInteger(precio) || precio < 0 || !Number.isInteger(categoria_id) || categoria_id < 1) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  try {
    db.prepare('UPDATE productos SET codigo = ?, nombre = ?, precio = ?, descripcion = ?, categoria_id = ? WHERE id = ?').run(codigo, nombre, precio, descripcion, categoria_id, id);
    const updated = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
    const imagenes = db.prepare('SELECT id, ruta FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id').all(id);
    res.json({ ...updated, imagenes });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El código ya existe' });
    res.status(500).json({ error: e.message || 'Error al actualizar' });
  }
});

// Borrado lógico: no se elimina el registro (integridad con pedidos)
app.delete('/api/admin/productos/:id', authMiddleware, staffOnly, (req, res) => {
  const id = req.params.id;
  const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
  db.prepare('UPDATE productos SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
  res.status(204).end();
});

app.patch('/api/admin/productos/:id/restore', authMiddleware, staffOnly, (req, res) => {
  const id = req.params.id;
  const prod = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });
  db.prepare('UPDATE productos SET deleted_at = NULL WHERE id = ?').run(id);
  const updated = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  const imagenes = db.prepare('SELECT id, ruta FROM producto_imagenes WHERE producto_id = ? ORDER BY orden, id').all(id);
  res.json({ ...updated, imagenes });
});

// --- Panel Staff ---
app.get('/api/staff/pedidos', authMiddleware, staffOnly, (req, res) => {
  const estado = req.query.estado;
  const cliente = (req.query.cliente || '').trim().toLowerCase();
  let sql = `
    SELECT p.*, u.email as user_email, u.nombre as user_nombre,
      (SELECT json_group_array(json_object('codigo', i.codigo, 'nombre', i.nombre, 'precio', i.precio, 'cantidad', i.cantidad))
       FROM pedido_items i WHERE i.pedido_id = p.id) as items_json
    FROM pedidos p
    JOIN users u ON u.id = p.user_id
    WHERE 1=1
  `;
  const params = [];
  if (estado) { sql += ' AND p.estado = ?'; params.push(estado); }
  if (cliente) {
    sql += ' AND (LOWER(u.email) LIKE ? OR LOWER(COALESCE(u.nombre,\'\')) LIKE ?)';
    const term = '%' + cliente + '%';
    params.push(term, term);
  }
  sql += ' ORDER BY p.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  const pedidos = rows.map(r => ({ ...r, items: r.items_json ? JSON.parse(r.items_json) : [] }));
  res.json(pedidos);
});

app.patch('/api/staff/pedidos/:id', authMiddleware, staffOnly, (req, res) => {
  const { id } = req.params;
  const { estado } = req.body || {};
  if (!estado) return res.status(400).json({ error: 'estado requerido' });
  const allow = ['pendiente', 'pagado', 'preparado', 'enviado', 'finalizado', 'cancelado'];
  if (!allow.includes(estado)) return res.status(400).json({ error: 'Estado no válido' });
  db.prepare('UPDATE pedidos SET estado = ?, enviado_at = CASE WHEN ? = ? THEN CURRENT_TIMESTAMP ELSE enviado_at END WHERE id = ?')
    .run(estado, estado, 'enviado', id);
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json(pedido);
});

// --- Staff: listar clientes y staff para regenerar claves ---
app.get('/api/staff/lista-clientes', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare('SELECT id, email, nombre FROM users ORDER BY email').all();
  res.json(rows);
});

app.get('/api/staff/lista-staff', authMiddleware, staffOnly, (req, res) => {
  const rows = db.prepare('SELECT id, email, nombre FROM staff ORDER BY email').all();
  res.json(rows);
});

app.patch('/api/staff/regenerar-clave-cliente/:id', authMiddleware, staffOnly, async (req, res) => {
  const id = req.params.id;
  const nuevaClave = (req.body && req.body.nuevaClave != null) ? String(req.body.nuevaClave).trim() : '';
  if (!nuevaClave || nuevaClave.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  const hash = await bcrypt.hash(nuevaClave, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, id);
  res.json({ ok: true, message: 'Clave actualizada' });
});

app.patch('/api/staff/regenerar-clave-staff/:id', authMiddleware, staffOnly, async (req, res) => {
  const id = req.params.id;
  const nuevaClave = (req.body && req.body.nuevaClave != null) ? String(req.body.nuevaClave).trim() : '';
  if (!nuevaClave || nuevaClave.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  const staff = db.prepare('SELECT id FROM staff WHERE id = ?').get(id);
  if (!staff) return res.status(404).json({ error: 'Usuario staff no encontrado' });
  const hash = await bcrypt.hash(nuevaClave, 10);
  db.prepare('UPDATE staff SET password = ? WHERE id = ?').run(hash, id);
  res.json({ ok: true, message: 'Clave actualizada' });
});

app.post('/api/staff/crear-staff', authMiddleware, staffOnly, async (req, res) => {
  const email = (req.body && req.body.email != null) ? String(req.body.email).trim().toLowerCase() : '';
  const password = (req.body && req.body.password != null) ? String(req.body.password).trim() : '';
  const nombre = (req.body && req.body.nombre != null) ? String(req.body.nombre).trim() : null;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  try {
    const hash = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO staff (email, password, nombre, rol) VALUES (?, ?, ?, ?)').run(email, hash, nombre || null, 'despacho');
    const nuevo = db.prepare('SELECT id, email, nombre FROM staff WHERE email = ?').get(email);
    res.status(201).json(nuevo);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El email ya está registrado como staff' });
    res.status(500).json({ error: e.message || 'Error al crear' });
  }
});

// Cliente marca pedido como recibido (finalizado)
app.patch('/api/mis-pedidos/:id/recibido', authMiddleware, (req, res) => {
  if (req.user.rol !== 'cliente') return res.status(403).json({ error: 'Solo clientes' });
  const id = req.params.id;
  const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (pedido.estado !== 'enviado') return res.status(400).json({ error: 'Solo podés marcar como recibido un pedido en estado Enviado' });
  db.prepare("UPDATE pedidos SET estado = 'finalizado' WHERE id = ?").run(id);
  const updated = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  res.json(updated);
});

// Migrar estado antiguo entregado -> finalizado
try {
  db.prepare("UPDATE pedidos SET estado = 'finalizado' WHERE estado = 'entregado'").run();
} catch (e) { /* ignore */ }

// Usuario staff para despacho y admin productos: admin@tiendae.com (clave ver abajo)
function ensureStaff() {
  const adminEmail = 'admin@tiendae.com';
  const adminPassword = 'Admin#TiendaE2025';
  const hash = bcrypt.hashSync(adminPassword, 10);
  const existing = db.prepare('SELECT id, email FROM staff WHERE LOWER(email) = ?').get(adminEmail);
  if (!existing) {
    db.prepare('INSERT INTO staff (email, password, nombre, rol) VALUES (?, ?, ?, ?)').run(adminEmail, hash, 'Administrador', 'despacho');
    console.log('Staff creado: ' + adminEmail + ' / ' + adminPassword);
  } else {
    db.prepare('UPDATE staff SET password = ?, email = ? WHERE id = ?').run(hash, adminEmail, existing.id);
    console.log('Staff admin: ' + adminEmail + ' — Clave: ' + adminPassword);
  }
}

ensureStaff();

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/fotos')) return res.status(404).end();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TiendaE corriendo en http://localhost:${PORT}`);
  if (!MP_ACCESS_TOKEN) console.log('Aviso: MERCADOPAGO_ACCESS_TOKEN no configurado. Configure .env para habilitar pagos con Mercado Pago.');
});
