# TiendaE en el mismo servidor que otra app (Nginx + Django/React)

Tu servidor ya tiene **Nginx en 80** con otra plataforma (GPS/SOFIA, Django + React). Acá tenés dos formas de sumar TiendaE sin bajar nada.

---

## Opción 1: Subdominio (recomendada, sin tocar código)

TiendaE en **`tienda.tudominio.com`** (o `tiendae.tudominio.com`). La app actual sigue en `tudominio.com`.

### 1. En el servidor: instalar Node, proyecto y PM2

```bash
# Node 18+ (si no lo tenés)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Carpeta del proyecto (elegí la que uses)
sudo mkdir -p /var/www/tiendae
cd /var/www/tiendae

# Clonar (o subir por rsync desde tu PC)
git clone https://github.com/macadriano/demoTiendaE.git .
# O desde tu PC: rsync -avz --exclude node_modules --exclude .env ./ root@200.58.98.187:/var/www/tiendae/

npm install --production
cp .env.example .env
nano .env   # PORT=3000, JWT_SECRET=algo-muy-seguro

# Probar y luego PM2
npm start   # Ctrl+C después de ver que arranca
pm2 start server.js --name tiendae
pm2 save
```

### 2. DNS

En tu proveedor de dominios, creá un **registro A** (o CNAME) para el subdominio apuntando a la IP del servidor:

- **Nombre:** `tienda` (o `tiendae`)
- **Valor / destino:** `200.58.98.187` (o el nombre del servidor si usás CNAME)

### 3. Nginx: nuevo server block (no tocar el actual)

```bash
sudo nano /etc/nginx/sites-available/tiendae
```

Pegá esto (reemplazá `tienda.tudominio.com` por tu subdominio real):

```nginx
server {
    listen 80;
    server_name tienda.tudominio.com;

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

Activar y recargar:

```bash
sudo ln -s /etc/nginx/sites-available/tiendae /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Opcional: HTTPS con Let's Encrypt solo para el subdominio:

```bash
sudo certbot --nginx -d tienda.tudominio.com
```

Listo: **TiendaE** en `https://tienda.tudominio.com` y la otra plataforma en `https://tudominio.com` sin cambios.

---

## Opción 2: Mismo dominio, en una ruta (ej. `/tienda`)

La tienda queda en **`https://tudominio.com/tienda`**. La app actual sigue en `https://tudominio.com/`.

### 1. Código: base path en el frontend

El frontend debe usar la API bajo `/tienda`. En el proyecto ya está soportado si existe la variable de entorno (ver más abajo). Solo hace falta que Nginx mande todo lo que empiece por `/tienda` al Node de TiendaE.

### 2. Nginx: location para `/tienda`

En el **mismo** `server` donde tenés Django/React (el que escucha por 80 y tiene tu dominio), agregá **dentro** del `server { ... }`:

```nginx
    # TiendaE en /tienda (convive con el resto del sitio)
    location /tienda {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

Importante: `proxy_pass http://127.0.0.1:3000/;` con **barra al final** para que Nginx reemplace `/tienda` por `/` al hablar con Node.

Recargar Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 3. Cómo abrir la tienda

Los usuarios entran a: **`https://tudominio.com/tienda/`** (con barra al final).  
Desde ahí todo (páginas, API, fotos) pasa por `/tienda` y Nginx lo envía al Node.

### 4. Base path en TiendaE

No hace falta configurar nada en el servidor. El frontend detecta solo si la URL contiene `/tienda` y usa esa base para la API. Solo hay que entrar siempre a `https://tudominio.com/tienda/` (con barra al final).

---

## Resumen

| Opción | URL TiendaE | Cambios en Nginx | Cambios en TiendaE |
|--------|--------------|-------------------|--------------------|
| **Subdominio** | `https://tienda.tudominio.com` | Nuevo `server` para `tienda.tudominio.com` | Ninguno |
| **Ruta** | `https://tudominio.com/tienda/` | Un `location /tienda` en el server actual | `BASE_PATH=/tienda` y build/config que lo use |

Recomendación: usar **subdominio**; es más simple y no tocás la config actual de la otra plataforma.
