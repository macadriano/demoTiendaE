# Guía de despliegue — TiendaE

Pasos para poner la tienda en un servidor (VPS Linux con Node.js). Si usás otro tipo de servidor (cPanel, Railway, Render, etc.), adaptá los pasos.

---

## 1. Requisitos del servidor

- **Node.js 18 o superior** (`node -v`)
- Acceso por **SSH** al servidor
- (Opcional) Dominio apuntando al servidor y Nginx para HTTPS

---

## 2. Subir el proyecto al servidor

### Opción A: Clonar desde GitHub

```bash
cd /var/www   # o la carpeta que uses
git clone https://github.com/macadriano/demoTiendaE.git tiendae
cd tiendae
```

### Opción B: Subir por FTP/RSYNC

Subí toda la carpeta del proyecto (incluyendo `public/`, `fotos/`, `server.js`, `db.js`, `package.json`, `productos.json`). No subas `node_modules/` ni `.env` (los creás en el servidor).

Con rsync desde tu PC:

```bash
rsync -avz --exclude node_modules --exclude .env --exclude .git ./ tu-usuario@tu-servidor:/var/www/tiendae/
```

---

## 3. Instalar dependencias

En el servidor:

```bash
cd /var/www/tiendae   # o la ruta donde dejaste el proyecto
npm install --production
```

`--production` evita instalar dependencias solo de desarrollo.

---

## 4. Configurar variables de entorno

```bash
cp .env.example .env
nano .env   # o el editor que uses
```

Configurá al menos:

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto (ej. `3000`). Si usás Nginx como proxy, puede quedarse 3000. |
| `JWT_SECRET` | Clave larga y aleatoria para las sesiones. **No uses la de ejemplo en producción.** |
| `MERCADOPAGO_ACCESS_TOKEN` | Token de tu app en Mercado Pago (opcional). |

Ejemplo mínimo:

```env
PORT=3000
JWT_SECRET=una-clave-muy-larga-y-aleatoria-de-al-menos-32-caracteres
```

Guardá el archivo (en nano: `Ctrl+O`, Enter, `Ctrl+X`).

---

## 5. Crear carpetas y permisos

La app escribe en `fotos/` (subida de imágenes) y crea `tiendae.db` en la raíz del proyecto. Asegurate de que el usuario que ejecuta Node pueda escribir ahí:

```bash
mkdir -p fotos
chmod 755 fotos
# Si corrés con otro usuario (ej. www-data):
# chown -R www-data:www-data /var/www/tiendae
```

---

## 6. Probar que arranca

```bash
npm start
```

Deberías ver algo como “Servidor en puerto 3000”. Probá desde el navegador: `http://IP-DEL-SERVIDOR:3000`. Si funciona, detené con `Ctrl+C` y pasá al siguiente paso.

---

## 7. Dejarlo corriendo con PM2 (recomendado)

PM2 reinicia la app si se cae y la mantiene activa al cerrar la sesión SSH.

```bash
# Instalar PM2 de forma global (una vez)
npm install -g pm2

# Arrancar la app
cd /var/www/tiendae
pm2 start server.js --name tiendae

# Ver estado
pm2 status

# Logs
pm2 logs tiendae

# Reiniciar al arrancar el servidor
pm2 startup
pm2 save
```

Comandos útiles:

- `pm2 restart tiendae` — reiniciar
- `pm2 stop tiendae` — detener
- `pm2 delete tiendae` — quitar del listado de PM2

---

## 8. (Opcional) Nginx como reverse proxy con HTTPS

Así la tienda se sirve por el puerto 80/443 y podés usar un certificado SSL (Let’s Encrypt).

1. Instalá Nginx y Certbot:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

2. Creá un sitio para tu dominio (ej. `tienda.ejemplo.com`):

```bash
sudo nano /etc/nginx/sites-available/tiendae
```

Contenido de ejemplo (reemplazá `tienda.ejemplo.com` por tu dominio):

```nginx
server {
    listen 80;
    server_name tienda.ejemplo.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

3. Activar sitio y obtener SSL:

```bash
sudo ln -s /etc/nginx/sites-available/tiendae /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d tienda.ejemplo.com
```

Certbot configurará HTTPS y renovará el certificado automáticamente.

---

## 9. Resumen rápido (checklist)

- [ ] Node.js 18+ instalado
- [ ] Proyecto en el servidor (git clone o rsync)
- [ ] `npm install --production`
- [ ] `.env` creado con `PORT`, `JWT_SECRET` (y Mercado Pago si aplica)
- [ ] Carpeta `fotos/` con permisos de escritura
- [ ] `npm start` probado
- [ ] PM2 configurado (`pm2 start server.js --name tiendae` y `pm2 save`)
- [ ] (Opcional) Nginx + Certbot para dominio y HTTPS

---

## 10. Actualizar después de cambios (redeploy)

Si subís cambios desde GitHub:

```bash
cd /var/www/tiendae
git pull
npm install --production
pm2 restart tiendae
```

Si la base de datos (`tiendae.db`) o `fotos/` tienen datos importantes, hacé copias de seguridad antes de sobrescribir.

---

**TiendaE** — Tienda de Electros y más.
