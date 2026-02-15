# TiendaE - Tienda de Electros y más

Tienda online con catálogo dinámico, carrito de compras, registro de usuarios, pagos con Stripe y panel de despacho para el personal.

## Requisitos

- Node.js 18 o superior

## Instalación

1. Clonar o copiar el proyecto en tu servidor.
2. Instalar dependencias:

```bash
npm install
```

3. (Opcional) Configurar variables de entorno. Copiar `.env.example` a `.env` y editar:

- `JWT_SECRET`: clave secreta para sesiones (cambiar en producción).
- `MERCADOPAGO_ACCESS_TOKEN`: para habilitar pagos con Mercado Pago (Checkout Pro). Si no se configura, los pedidos se crean y se puede coordinar el pago por otro medio.

4. Iniciar el servidor:

```bash
npm start
```

La tienda quedará disponible en `http://localhost:3000` (o el puerto indicado en `PORT`).

## Estructura

- **`public/`**: frontend (HTML, CSS, JS). La raíz es la tienda; `staff.html` es el panel de despacho.
- **`productos.json`**: catálogo de productos (codigo, nombre, precio, imagen).
- **`fotos/`**: imágenes de productos. Se usan las que tienen prefijo `ET_` cuando existen; si no, la que indica el JSON.
- **`tiendae.db`**: base SQLite (se crea al arrancar). Usuarios, pedidos y personal.

## Uso

### Clientes

- Ver catálogo, buscar, agregar al carrito.
- Registrarse o iniciar sesión para finalizar compra.
- En "Mis pedidos" pueden ver el estado (pendiente, pagado, enviado, etc.).

### Personal (despacho)

- Ir a **Personal (despacho)** en el pie de página o a `/staff.html`.
- Usuario por defecto (solo para pruebas): `admin@tiendae.com` / `admin123`. **Cambiar en producción** (agregar usuarios en la base o crear un script de alta).
- Listar pedidos, filtrar por estado, cambiar estado y marcar como "enviado".

## Subir a tu servidor

1. Subir todo el proyecto (carpetas `public`, `fotos`, archivos `server.js`, `db.js`, `package.json`, `productos.json`).
2. En el servidor: `npm install --production` y `npm start`.
3. Usar un proceso manager (PM2, systemd, etc.) para mantener el servidor corriendo.
4. Opcional: poner un reverse proxy (Nginx) con HTTPS delante del puerto 3000.

## Pagos (Mercado Pago)

1. Crear una aplicación en [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel/app).
2. Obtener el **Access Token** (producción o pruebas) y ponerlo en `MERCADOPAGO_ACCESS_TOKEN` en `.env`.
3. En producción, configurar la URL de notificaciones en la app de Mercado Pago: `https://tudominio.com/api/webhook/mercadopago`, para que los pedidos se marquen como "pagado" automáticamente cuando el cliente pague.

---

**TiendaE** — Tienda de Electros y más.
