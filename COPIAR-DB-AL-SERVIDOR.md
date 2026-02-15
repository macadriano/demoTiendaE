# Copiar la base de datos local al servidor

Para que en el servidor tengas los mismos usuarios (clientes y staff) y pedidos que en tu PC.

## En tu PC

1. Detené la app si está corriendo (para no corromper la base).
2. La base está en la carpeta del proyecto: **`tiendae.db`**.
3. Subila al servidor por SCP (reemplazá la IP y la ruta si es distinta):

```bash
scp C:\proyectosGIT\DemoTiendaE\tiendae.db root@200.58.98.187:/var/www/tiendae/
```

Si usás otra carpeta en el servidor, cambiá `/var/www/tiendae/` por la ruta correcta.

## En el servidor

1. Parar la app para no usar la base mientras la reemplazás:

```bash
pm2 stop tiendae
```

2. Hacer backup de la base actual (por si querés volver):

```bash
cd /var/www/tiendae
cp tiendae.db tiendae.db.backup
```

3. La base que subiste desde tu PC ya reemplazó a la del servidor. Si en el paso de SCP usaste otro nombre de archivo, renombrá en el servidor: `mv nombre-subido.db tiendae.db`.

4. Arrancar de nuevo la app:

```bash
pm2 start tiendae
```

Listo: en el servidor deberías poder entrar con los mismos usuarios que en tu PC.

**Nota:** Si después creás usuarios o pedidos solo en el servidor, esa base ya no será igual a la de tu PC. Podés repetir este proceso cuando quieras “sincronizar” de nuevo desde tu PC.
