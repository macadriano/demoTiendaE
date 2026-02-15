(function () {
  const API = '/api';
  let productos = [];
  let token = localStorage.getItem('token');
  let user = JSON.parse(localStorage.getItem('user') || 'null');

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => el.querySelectorAll(s);

  function getCart() {
    return JSON.parse(localStorage.getItem('cart') || '[]');
  }
  function setCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
  }
  function updateCartCount() {
    var cart = getCart();
    var count = cart.reduce(function (s, i) { return s + (i.cantidad || 1); }, 0);
    document.querySelectorAll('.cart-count').forEach(function (el) {
      el.textContent = count;
      el.dataset.count = count;
      el.classList.toggle('d-none', count === 0);
    });
  }

  function showView(id) {
    $$('.view').forEach(v => v.style.display = 'none');
    const v = document.getElementById('view-' + id);
    if (v) v.style.display = 'block';
  }

  function formatPrice(n) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
  }

  function authHeaders() {
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  function showToast(message, type) {
    type = type || 'success';
    var container = document.getElementById('toastContainer');
    if (!container) return;
    var icons = { success: '✓', error: '✕', info: 'ℹ' };
    var el = document.createElement('div');
    el.className = 'toast-tiendae ' + type;
    el.setAttribute('role', 'alert');
    el.innerHTML = '<span class="toast-icon">' + (icons[type] || '') + '</span><span>' + String(message).replace(/</g, '&lt;') + '</span>';
    container.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transform = 'translateX(1rem)';
      el.style.transition = 'opacity 0.25s, transform 0.25s';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
    }, 3200);
  }
  window.showToast = showToast;

  let categorias = [];

  async function fetchCategorias() {
    const res = await fetch(API + '/categorias');
    if (!res.ok) return [];
    categorias = await res.json();
    return categorias;
  }

  async function fetchProductos(categoria) {
    const url = categoria ? API + '/productos?categoria=' + encodeURIComponent(categoria) : API + '/productos';
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al cargar productos');
    productos = await res.json();
    return productos;
  }

  function renderProductCard(p, compact) {
    var nombre = (p.nombre || '').trim().replace(/\s*_+$/g, '');
    var imgSrc = (p.imagenes && p.imagenes[0]) ? p.imagenes[0] : (p.imagenUrl || p.imagen || '');
    var codigo = encodeURIComponent(p.codigo);
    var imgAttr = (imgSrc ? ' data-imagen="' + String(imgSrc).replace(/"/g, '&quot;') + '"' : '');
    return '<div class="col">' +
      '<div class="card h-100 shadow-sm">' +
        '<a href="#/producto/' + codigo + '" class="text-decoration-none text-dark">' +
          '<div class="ratio ratio-1x1 bg-light">' +
            '<img class="card-img-top object-fit-contain p-2" src="' + imgSrc + '" alt="' + nombre.replace(/"/g, '&quot;') + '" loading="lazy" onerror="this.src=\'/fotos/ET_' + p.codigo + '.jpg\'; this.onerror=null;">' +
          '</div>' +
          '<div class="card-body d-flex flex-column p-2 p-sm-3">' +
            '<h3 class="card-title small fw-semibold text-truncate mb-1" title="' + nombre.replace(/"/g, '&quot;') + '">' + nombre + '</h3>' +
            '<p class="card-text text-primary fw-bold mb-2">' + formatPrice(p.precio) + '</p>' +
          '</div>' +
        '</a>' +
        '<div class="card-footer border-0 bg-white p-2 p-sm-3 pt-0">' +
          '<button type="button" class="btn btn-primary btn-sm w-100 add-to-cart" data-codigo="' + p.codigo + '" data-nombre="' + nombre.replace(/"/g, '&quot;') + '" data-precio="' + p.precio + '"' + imgAttr + '>Agregar</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function filterProductos(q) {
    const qq = (q || '').toLowerCase().trim();
    if (!qq) return productos;
    return productos.filter(p =>
      (p.nombre && p.nombre.toLowerCase().includes(qq)) ||
      (p.codigo && p.codigo.toLowerCase().includes(qq))
    );
  }

  function route() {
    var hash = (window.location.hash || '#/').slice(1);
    var parts = hash.split('/').filter(function (p) { return p.length > 0; });
    var view = parts[0] || '';
    var param = parts[1];
    var views = {
      '': 'home',
      'productos': 'productos',
      'producto': 'producto',
      'carrito': 'carrito',
      'checkout': 'checkout',
      'login': 'login',
      'registro': 'registro',
      'mis-pedidos': 'mis-pedidos',
      'gracias': 'gracias',
      'administracion': 'administracion'
    };
    var id = param ? view + '-' + param : (views[view] !== undefined ? views[view] : view || 'home');
    if (view === 'administracion' && param) id = 'administracion-' + param;

    if (id === 'home') {
      showView('home');
      loadHomeProducts();
    } else if (id === 'productos') {
      showView('productos');
      var gridEl = document.getElementById('productosGrid');
      var emptyEl = document.getElementById('productosEmpty');
      if (productos.length === 0 && gridEl) {
        gridEl.innerHTML = '<div class="col-12 text-center text-muted py-4">Cargando productos...</div>';
        if (emptyEl) emptyEl.style.display = 'none';
        var countEl = document.getElementById('productosCount');
        if (countEl) countEl.textContent = '(…)';
      }
      (async function () {
        if (productos.length === 0) await fetchProductos().catch(function () {});
        var savedQuery = sessionStorage.getItem('tiendae_search');
        if (savedQuery && $('#searchProducts')) {
          $('#searchProducts').value = savedQuery;
          sessionStorage.removeItem('tiendae_search');
        }
        renderProductos();
        setTimeout(function () { var s = $('#searchProducts'); if (s) s.focus(); }, 150);
      })();
    } else if (id.startsWith('producto-')) {
      showView('producto');
      renderProductoDetail(param);
    } else if (id === 'carrito') {
      if (token && user && user.rol === 'staff') { window.location.hash = '#/'; return; }
      showView('carrito');
      if (productos.length === 0) fetchProductos().then(renderCarrito).catch(renderCarrito);
      else renderCarrito();
    } else if (id === 'checkout') {
      showView('checkout');
      if (productos.length === 0) fetchProductos().then(renderCheckout).catch(renderCheckout);
      else renderCheckout();
    } else if (id === 'login') {
      showView('login');
    } else if (id === 'registro') {
      showView('registro');
    } else if (id === 'mis-pedidos') {
      showView('mis-pedidos');
      if (token) loadMisPedidos(); else window.location.hash = '#/login';
    } else if (id === 'gracias') {
      showView('gracias');
    } else if (id === 'administracion' || id === 'administracion-claves' || id === 'administracion-pedidos' || id === 'administracion-productos') {
      if (!token || !user || user.rol !== 'staff') {
        window.location.hash = '#/login';
        return;
      }
      if (id === 'administracion') showView('administracion');
      else if (id === 'administracion-claves') { showView('administracion-claves'); loadAdminClaves(); }
      else if (id === 'administracion-pedidos') { showView('administracion-pedidos'); loadAdminPedidos(); }
      else if (id === 'administracion-productos') { showView('administracion-productos'); loadAdminProductos(); }
    } else {
      showView('home');
      loadHomeProducts();
    }

    updateNav();
  }

  function updateNav() {
    var auth = document.getElementById('navAuth');
    var logged = document.getElementById('navLogged');
    var nameEl = document.getElementById('navUserName');
    var navAdmin = document.getElementById('navAdministracion');
    var navMisPedidos = document.getElementById('navMisPedidos');
    var navCarritoMobile = document.getElementById('navCarritoMobile');
    var navCarritoDesktop = document.getElementById('navCarritoDesktop');
    if (auth && logged) {
      if (token && user) {
        auth.classList.add('d-none');
        logged.classList.remove('d-none');
        if (nameEl) nameEl.textContent = (user.nombre && user.nombre.trim()) ? 'Hola, ' + user.nombre.trim() : (user.email || '');
        if (navAdmin) navAdmin.classList.toggle('d-none', user.rol !== 'staff');
        if (navMisPedidos) navMisPedidos.style.display = (user.rol === 'staff') ? 'none' : '';
        var isStaff = user.rol === 'staff';
        if (navCarritoMobile) navCarritoMobile.classList.toggle('d-none', isStaff);
        if (navCarritoDesktop) navCarritoDesktop.classList.toggle('d-none', isStaff);
      } else {
        auth.classList.remove('d-none');
        logged.classList.add('d-none');
        if (nameEl) nameEl.textContent = '';
        if (navAdmin) navAdmin.classList.add('d-none');
      }
    }
  }

  async function loadHomeProducts() {
    const grid = document.getElementById('homeProducts');
    if (!grid) return;
    if (productos.length === 0) await fetchProductos();
    const dest = productos.slice(0, 8);
    grid.innerHTML = dest.map(p => renderProductCard(p, true)).join('');
    grid.querySelectorAll('.add-to-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(btn.dataset.codigo, btn.dataset.nombre, parseInt(btn.dataset.precio, 10), 1, btn.dataset.imagen || undefined);
      });
    });
  }

  function renderProductos() {
    var q = ($('#searchProducts') && $('#searchProducts').value) || '';
    var list = filterProductos(q);
    var grid = document.getElementById('productosGrid');
    var empty = document.getElementById('productosEmpty');
    var countEl = document.getElementById('productosCount');
    if (countEl) countEl.textContent = '(' + list.length + ')';
    if (!grid) return;
    if (list.length === 0) {
      grid.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        empty.textContent = q ? 'No hay productos que coincidan con la búsqueda.' : 'No hay productos.';
      }
      return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = list.map(function (p) { return renderProductCard(p, false); }).join('');
    grid.querySelectorAll('.add-to-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(btn.dataset.codigo, btn.dataset.nombre, parseInt(btn.dataset.precio, 10), 1, btn.dataset.imagen || undefined);
      });
    });
  }

  function renderProductoDetail(codigo) {
    const p = productos.find(x => x.codigo === codigo) || productos.find(x => x.codigo === decodeURIComponent(codigo));
    const wrap = document.getElementById('productoDetail');
    if (!wrap) return;
    if (!p) {
      wrap.innerHTML = '<p>Producto no encontrado.</p>';
      return;
    }
    const nombre = (p.nombre || '').trim().replace(/\s*_+$/g, '');
    wrap.innerHTML =
      '<div class="col-12 col-md-6">' +
        '<div class="ratio ratio-1x1 bg-light rounded-3 overflow-hidden">' +
          '<img class="object-fit-contain p-3" src="' + (p.imagenUrl || p.imagen || '') + '" alt="' + nombre.replace(/"/g, '&quot;') + '" onerror="this.src=\'/fotos/ET_' + p.codigo + '.jpg\'; this.onerror=null;">' +
        '</div>' +
      '</div>' +
      '<div class="col-12 col-md-6">' +
        '<h1 class="h5 fw-bold mb-2">' + nombre + '</h1>' +
        '<p class="text-muted small mb-2">Código: ' + p.codigo + '</p>' +
        '<p class="fs-4 fw-bold text-primary mb-4">' + formatPrice(p.precio) + '</p>' +
        '<button type="button" class="btn btn-primary add-to-cart" data-codigo="' + p.codigo + '" data-nombre="' + nombre.replace(/"/g, '&quot;') + '" data-precio="' + p.precio + '">Agregar al carrito</button>' +
      '</div>';
    var imgSrc = (p.imagenes && p.imagenes[0]) ? p.imagenes[0] : (p.imagenUrl || p.imagen || '');
    wrap.querySelector('.add-to-cart').addEventListener('click', () => {
      addToCart(p.codigo, nombre, p.precio, 1, imgSrc);
    });
  }

  function addToCart(codigo, nombre, precio, cantidad = 1, imagenUrl) {
    const cart = getCart();
    const i = cart.find(x => x.codigo === codigo);
    if (i) {
      i.cantidad += cantidad;
      if (imagenUrl) i.imagenUrl = imagenUrl;
    } else {
      cart.push({ codigo, nombre, precio, cantidad: cantidad, imagenUrl: imagenUrl || null });
    }
    setCart(cart);
    const count = cart.reduce((s, x) => s + (x.cantidad || 1), 0);
    showToast('Agregado al carrito. Total: ' + count + ' ' + (count === 1 ? 'ítem' : 'ítems'));
  }

  function renderCarrito() {
    const cart = getCart();
    const content = document.getElementById('carritoContent');
    const empty = document.getElementById('carritoEmpty');
    if (!content) return;
    if (cart.length === 0) {
      content.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    const total = cart.reduce((s, i) => s + i.precio * (i.cantidad || 1), 0);
    function itemImgSrc(it) {
      if (it.imagenUrl && it.imagenUrl.length) return it.imagenUrl;
      var prod = productos.find(function (x) { return x.codigo === it.codigo; });
      if (prod && ((prod.imagenes && prod.imagenes[0]) || prod.imagenUrl || prod.imagen)) return (prod.imagenes && prod.imagenes[0]) || prod.imagenUrl || prod.imagen;
      return '/fotos/ET_' + it.codigo + '.jpg';
    }
    content.innerHTML =
      '<div class="list-group list-group-flush mb-4">' +
        cart.map(function (i, idx) {
          return '<div class="list-group-item d-flex flex-wrap align-items-center gap-2 gap-md-3 py-3" data-idx="' + idx + '">' +
            '<img src="' + itemImgSrc(i) + '" alt="" class="rounded flex-shrink-0" style="width:64px;height:64px;object-fit:contain" onerror="this.src=\'/fotos/' + i.codigo + '.jpg\'; this.onerror=null;">' +
            '<div class="flex-grow-1 min-width-0">' +
              '<div class="fw-semibold text-truncate">' + i.nombre + '</div>' +
              '<small class="text-muted">' + formatPrice(i.precio) + ' c/u</small>' +
            '</div>' +
            '<div class="d-flex align-items-center gap-1">' +
              '<button type="button" class="btn btn-outline-secondary btn-sm qty-minus" data-idx="' + idx + '">−</button>' +
              '<span class="px-2">' + (i.cantidad || 1) + '</span>' +
              '<button type="button" class="btn btn-outline-secondary btn-sm qty-plus" data-idx="' + idx + '">+</button>' +
            '</div>' +
            '<div class="d-flex align-items-center gap-2">' +
              '<span class="fw-bold text-primary">' + formatPrice(i.precio * (i.cantidad || 1)) + '</span>' +
              '<button type="button" class="btn btn-outline-danger btn-sm cart-remove" data-idx="' + idx + '" title="Quitar del carrito">✕</button>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">' +
        '<span class="fs-5 fw-bold">Total: ' + formatPrice(total) + '</span>' +
        '<div class="d-flex gap-2">' +
          '<a href="#/productos" class="btn btn-outline-secondary">Seguir comprando</a>' +
          '<a href="#/checkout" class="btn btn-primary">Finalizar compra</a>' +
        '</div>' +
      '</div>';
    content.querySelectorAll('.qty-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const c = getCart();
        if (c[idx].cantidad <= 1) { c.splice(idx, 1); } else { c[idx].cantidad--; }
        setCart(c);
        renderCarrito();
      });
    });
    content.querySelectorAll('.qty-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const c = getCart();
        c[idx].cantidad = (c[idx].cantidad || 1) + 1;
        setCart(c);
        renderCarrito();
      });
    });
    content.querySelectorAll('.cart-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const c = getCart();
        c.splice(idx, 1);
        setCart(c);
        showToast('Producto quitado del carrito.');
        renderCarrito();
      });
    });
  }

  function renderCheckout() {
    const cart = getCart();
    const content = document.getElementById('checkoutContent');
    if (!content) return;
    if (cart.length === 0) {
      content.innerHTML = '<p>Carrito vacío. <a href="#/productos">Ir a productos</a></p>';
      return;
    }
    const total = cart.reduce((s, i) => s + i.precio * (i.cantidad || 1), 0);
    function itemImgSrc(it) {
      if (it.imagenUrl && it.imagenUrl.length) return it.imagenUrl;
      var prod = productos.find(function (x) { return x.codigo === it.codigo; });
      if (prod && ((prod.imagenes && prod.imagenes[0]) || prod.imagenUrl || prod.imagen)) return (prod.imagenes && prod.imagenes[0]) || prod.imagenUrl || prod.imagen;
      return '/fotos/ET_' + it.codigo + '.jpg';
    }
    content.innerHTML =
      '<div class="list-group list-group-flush mb-4">' +
        cart.map(function (i) {
          return '<div class="list-group-item d-flex align-items-center gap-3">' +
            '<img src="' + itemImgSrc(i) + '" alt="" class="rounded flex-shrink-0" style="width:56px;height:56px;object-fit:contain" onerror="this.src=\'/fotos/' + i.codigo + '.jpg\'; this.onerror=null;">' +
            '<div class="flex-grow-1"><div class="fw-semibold">' + i.nombre + '</div><small>' + (i.cantidad || 1) + ' × ' + formatPrice(i.precio) + '</small></div>' +
            '<span class="fw-bold text-primary">' + formatPrice(i.precio * (i.cantidad || 1)) + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<p class="fw-bold fs-5 mb-4">Total: ' + formatPrice(total) + '</p>' +
      (!token
        ? '<p class="mb-4">Para finalizar necesitás <a href="#/login">iniciar sesión</a> o <a href="#/registro">registrarte</a>.</p>'
        : '<form id="formCheckout" class="mb-3">' +
            '<div class="mb-3"><label class="form-label">Dirección de envío</label><input type="text" name="direccion_envio" class="form-control" placeholder="Calle, número, ciudad, CP" required></div>' +
            '<div class="mb-3"><label class="form-label">Teléfono de contacto</label><input type="tel" name="telefono" class="form-control" required></div>' +
            '<div class="mb-3"><label class="form-label">Nota (opcional)</label><input type="text" name="nota" class="form-control" placeholder="Instrucciones para el envío"></div>' +
            '<button type="submit" class="btn btn-primary w-100 btn-lg">Pagar con Mercado Pago</button></form>' +
            '<p class="text-muted small">Al confirmar serás redirigido al procesador de pagos seguro.</p>');
    if (token && content.querySelector('#formCheckout')) {
      content.querySelector('#formCheckout').addEventListener('submit', submitCheckout);
    }
  }

  async function submitCheckout(e) {
    e.preventDefault();
    const form = e.target;
    var direccion_envio = (form.querySelector('[name="direccion_envio"]') || {}).value || '';
    var telefono = (form.querySelector('[name="telefono"]') || {}).value || '';
    var nota = (form.querySelector('[name="nota"]') || {}).value || '';
    direccion_envio = direccion_envio.trim();
    telefono = telefono.trim();
    nota = nota.trim();
    const cart = getCart();
    const items = cart.map(i => ({ codigo: i.codigo, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad || 1 }));
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creando pedido...';
    try {
      const res = await fetch(API + '/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ items, direccion_envio, telefono, nota })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error al crear pedido');
      const pedidoId = data.id;
      const payRes = await fetch(API + '/crear-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          pedidoId,
          successUrl: window.location.origin + window.location.pathname + '#/gracias',
          cancelUrl: window.location.origin + window.location.pathname + '#/carrito'
        })
      });
      const payData = await payRes.json().catch(() => ({}));
      if (payRes.ok && payData.url) {
        setCart([]);
        updateCartCount();
        window.location.href = payData.url;
        return;
      }
      if (!payRes.ok && payData.error && payData.error.includes('no configurados')) {
        setCart([]);
        updateCartCount();
        showToast('Pedido #' + pedidoId + ' creado. Te contactaremos para coordinar el pago.', 'info');
        window.location.hash = '#/gracias';
        return;
      }
      throw new Error(payData.error || 'Error al crear pago');
    } catch (err) {
      showToast(err.message || 'Error al procesar. Intentá de nuevo.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Pagar con Mercado Pago';
    }
  }

  var estadoLabelsCliente = {
    pendiente: 'Pendiente',
    pagado: 'Pagado',
    preparado: 'En preparación',
    enviado: 'Enviando',
    finalizado: 'Finalizado',
    entregado: 'Finalizado',
    cancelado: 'Cancelado'
  };

  async function loadMisPedidos() {
    const content = document.getElementById('misPedidosContent');
    if (!content) return;
    try {
      const res = await fetch(API + '/mis-pedidos', { headers: authHeaders() });
      if (!res.ok) throw new Error('No autorizado');
      const pedidos = await res.json();
      if (pedidos.length === 0) {
        content.innerHTML = '<p class="text-muted text-center py-4">Aún no tenés pedidos.</p>';
        return;
      }
      content.innerHTML = pedidos.map(function (p) {
        var itemsHtml = (p.items || []).map(function (i) {
          return '<li class="list-group-item py-2">' + i.nombre + ' × ' + i.cantidad + ' — ' + formatPrice(i.precio * i.cantidad) + '</li>';
        }).join('');
        var e = p.estado || 'pendiente';
        var estadoLabel = estadoLabelsCliente[e] || e;
        var estadoClass = 'bg-secondary';
        if (e === 'pagado' || e === 'preparado') estadoClass = 'bg-primary';
        else if (e === 'enviado') estadoClass = 'bg-info';
        else if (e === 'finalizado' || e === 'entregado') estadoClass = 'bg-success';
        else if (e === 'cancelado') estadoClass = 'bg-danger';
        var btnRecibido = (e === 'enviado') ? '<button type="button" class="btn btn-success btn-sm mt-2 btn-marcar-recibido" data-id="' + p.id + '">Marcar como recibido</button>' : '';
        return '<div class="card shadow-sm mb-3" data-pedido-id="' + p.id + '">' +
          '<div class="card-body">' +
            '<div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">' +
              '<div><strong class="text-primary">Pedido #' + p.id + '</strong><br><small class="text-muted">' + new Date(p.created_at).toLocaleDateString('es-AR') + '</small></div>' +
              '<span class="badge ' + estadoClass + '">' + estadoLabel + '</span>' +
            '</div>' +
            '<ul class="list-group list-group-flush">' + itemsHtml + '</ul>' +
            '<p class="fw-bold text-primary mb-0 mt-2">Total: ' + formatPrice(p.total) + '</p>' +
            btnRecibido +
          '</div></div>';
      }).join('');
      content.querySelectorAll('.btn-marcar-recibido').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var id = btn.dataset.id;
          try {
            var r = await fetch(API + '/mis-pedidos/' + id + '/recibido', { method: 'PATCH', headers: authHeaders() });
            if (r.ok) { showToast('Pedido marcado como recibido.'); loadMisPedidos(); }
            else { var d = await r.json().catch(function(){}); showToast(d.error || 'No se pudo actualizar.', 'error'); }
          } catch (err) { showToast('Error de conexión.', 'error'); }
        });
      });
    } catch {
      content.innerHTML = '<p class="text-muted text-center py-4">No se pudieron cargar los pedidos. <a href="#/login">Iniciar sesión</a></p>';
    }
  }

  async function loadAdminClaves() {
    var el = document.getElementById('adminClavesContent');
    if (!el) return;
    el.innerHTML = '<p class="text-muted">Cargando...</p>';
    try {
      var rC = await fetch(API + '/staff/lista-clientes', { headers: authHeaders() });
      var rS = await fetch(API + '/staff/lista-staff', { headers: authHeaders() });
      if (rC.status === 403 || rS.status === 403) { el.innerHTML = '<p class="text-danger">Sin permiso.</p>'; return; }
      var clientes = rC.ok ? await rC.json() : [];
      var staff = rS.ok ? await rS.json() : [];
      var optC = clientes.map(function (c) { return '<option value="' + c.id + '">' + (c.email || '') + (c.nombre ? ' — ' + c.nombre : '') + '</option>'; }).join('');
      var optS = staff.map(function (s) { return '<option value="' + s.id + '">' + (s.email || '') + (s.nombre ? ' — ' + s.nombre : '') + '</option>'; }).join('');
      el.innerHTML =
        '<div class="row g-4"><div class="col-12 col-md-6"><div class="card shadow-sm"><div class="card-body">' +
        '<h2 class="h6 fw-bold">Regenerar clave (cliente)</h2>' +
        '<select id="adminSelectCliente" class="form-select form-select-sm mb-2"><option value="">Seleccionar...</option>' + optC + '</select>' +
        '<input type="password" id="adminNuevaClaveCliente" class="form-control form-control-sm mb-2" placeholder="Nueva contraseña (mín. 6)">' +
        '<button type="button" class="btn btn-primary btn-sm" id="adminBtnRegenerarCliente">Regenerar</button></div></div></div>' +
        '<div class="col-12 col-md-6"><div class="card shadow-sm"><div class="card-body">' +
        '<h2 class="h6 fw-bold">Regenerar clave (staff)</h2>' +
        '<select id="adminSelectStaff" class="form-select form-select-sm mb-2"><option value="">Seleccionar...</option>' + optS + '</select>' +
        '<input type="password" id="adminNuevaClaveStaff" class="form-control form-control-sm mb-2" placeholder="Nueva contraseña (mín. 6)">' +
        '<button type="button" class="btn btn-primary btn-sm" id="adminBtnRegenerarStaff">Regenerar</button></div></div></div>' +
        '<div class="col-12"><div class="card shadow-sm"><div class="card-body">' +
        '<h2 class="h6 fw-bold">Crear usuario staff</h2>' +
        '<input type="text" id="adminNuevoStaffEmail" class="form-control form-control-sm mb-2" placeholder="Email">' +
        '<input type="text" id="adminNuevoStaffNombre" class="form-control form-control-sm mb-2" placeholder="Nombre (opcional)">' +
        '<input type="password" id="adminNuevoStaffClave" class="form-control form-control-sm mb-2" placeholder="Contraseña (mín. 6)">' +
        '<button type="button" class="btn btn-success btn-sm" id="adminBtnCrearStaff">Crear staff</button></div></div></div></div>';
      document.getElementById('adminBtnRegenerarCliente').onclick = async function () {
        var id = document.getElementById('adminSelectCliente').value;
        var clave = document.getElementById('adminNuevaClaveCliente').value;
        if (!id || !clave || clave.length < 6) { showToast('Seleccioná usuario y contraseña (mín. 6).', 'error'); return; }
        var r = await fetch(API + '/staff/regenerar-clave-cliente/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ nuevaClave: clave }) });
        if (r.ok) { showToast('Clave actualizada.'); document.getElementById('adminNuevaClaveCliente').value = ''; }
        else { var d = await r.json().catch(function(){}); showToast(d.error || 'Error', 'error'); }
      };
      document.getElementById('adminBtnRegenerarStaff').onclick = async function () {
        var id = document.getElementById('adminSelectStaff').value;
        var clave = document.getElementById('adminNuevaClaveStaff').value;
        if (!id || !clave || clave.length < 6) { showToast('Seleccioná usuario y contraseña (mín. 6).', 'error'); return; }
        var r = await fetch(API + '/staff/regenerar-clave-staff/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ nuevaClave: clave }) });
        if (r.ok) { showToast('Clave actualizada.'); document.getElementById('adminNuevaClaveStaff').value = ''; }
        else { var d = await r.json().catch(function(){}); showToast(d.error || 'Error', 'error'); }
      };
      document.getElementById('adminBtnCrearStaff').onclick = async function () {
        var email = (document.getElementById('adminNuevoStaffEmail').value || '').trim();
        var nombre = (document.getElementById('adminNuevoStaffNombre').value || '').trim() || null;
        var clave = document.getElementById('adminNuevoStaffClave').value;
        if (!email || !clave || clave.length < 6) { showToast('Email y contraseña (mín. 6) requeridos.', 'error'); return; }
        var r = await fetch(API + '/staff/crear-staff', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ email: email, password: clave, nombre: nombre }) });
        if (r.ok) { showToast('Usuario staff creado.'); loadAdminClaves(); document.getElementById('adminNuevoStaffEmail').value = ''; document.getElementById('adminNuevoStaffNombre').value = ''; document.getElementById('adminNuevoStaffClave').value = ''; }
        else { var d = await r.json().catch(function(){}); showToast(d.error || 'Error', 'error'); }
      };
    } catch (err) {
      el.innerHTML = '<p class="text-danger">Error al cargar.</p>';
    }
  }

  function loadAdminPedidos() {
    var el = document.getElementById('adminPedidosContent');
    if (!el) return;
    el.innerHTML = '<p class="text-muted">Cargando...</p>';
    var estado = '';
    var cliente = '';
    function buildPedidosList(pedidos) {
      if (!pedidos.length) return '<p class="text-muted">No hay pedidos.</p>';
      var estadosStaff = [{ v: 'pendiente', l: 'Pendiente' }, { v: 'pagado', l: 'Pagado' }, { v: 'preparado', l: 'Preparado' }, { v: 'enviado', l: 'Enviado' }, { v: 'finalizado', l: 'Finalizado' }, { v: 'cancelado', l: 'Cancelado' }];
      return pedidos.map(function (p) {
        var pe = (p.estado === 'entregado' ? 'finalizado' : p.estado) || p.estado;
        var opts = estadosStaff.map(function (e) { return '<option value="' + e.v + '"' + (e.v === pe ? ' selected' : '') + '>' + e.l + '</option>'; }).join('');
        var label = (estadosStaff.find(function (x) { return x.v === pe; }) || {}).l || pe;
        var badgeClass = pe === 'pagado' || pe === 'preparado' ? 'bg-primary' : pe === 'enviado' ? 'bg-info' : pe === 'finalizado' ? 'bg-success' : pe === 'cancelado' ? 'bg-danger' : 'bg-secondary';
        var itemsHtml = (p.items || []).map(function (i) { return '<li class="list-group-item py-2">' + i.nombre + ' × ' + i.cantidad + ' — ' + formatPrice(i.precio * i.cantidad) + '</li>'; }).join('');
        var envioHtml = '<div class="border rounded p-2 bg-light mb-2 small"><strong>Envío:</strong> ' + (p.direccion_envio || '—') + ' <strong>Tel:</strong> ' + (p.telefono || '—') + (p.nota ? ' <strong>Nota:</strong> ' + p.nota : '') + '</div>';
        return '<div class="card shadow-sm mb-3"><div class="card-body">' +
          '<div class="d-flex justify-content-between flex-wrap gap-2 mb-2"><div><strong class="text-primary">Pedido #' + p.id + '</strong><br><small>' + new Date(p.created_at).toLocaleString('es-AR') + '</small><br><small>Cliente: ' + (p.user_nombre || p.user_email || '') + ' (' + p.user_email + ')</small></div><span class="badge ' + badgeClass + '">' + label + '</span></div>' +
          envioHtml + '<ul class="list-group list-group-flush mb-2">' + itemsHtml + '</ul><p class="fw-bold text-primary mb-2">Total: ' + formatPrice(p.total) + '</p>' +
          '<select class="form-select form-select-sm estado-select d-inline-block w-auto" data-id="' + p.id + '">' + opts + '</select> <button type="button" class="btn btn-primary btn-sm btn-marcar-enviado" data-id="' + p.id + '">Marcar Enviado</button></div></div>';
      }).join('');
    }
    async function fetchPedidos() {
      var params = [];
      if (estado) params.push('estado=' + encodeURIComponent(estado));
      if (cliente.trim()) params.push('cliente=' + encodeURIComponent(cliente.trim()));
      var url = API + '/staff/pedidos' + (params.length ? '?' + params.join('&') : '');
      var r = await fetch(url, { headers: authHeaders() });
      if (r.status === 403 || r.status === 401) { el.innerHTML = '<p class="text-danger">Sesión inválida.</p>'; return; }
      var list = await r.json();
      el.innerHTML = '<div class="mb-3"><label class="form-label small">Estado</label> <select id="adminFilterEstado" class="form-select form-select-sm d-inline-block w-auto"><option value="">Todos</option><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option><option value="preparado">Preparado</option><option value="enviado">Enviado</option><option value="finalizado">Finalizado</option><option value="cancelado">Cancelado</option></select> ' +
        '<label class="form-label small ms-2">Cliente</label> <input type="text" id="adminFilterCliente" class="form-control form-control-sm d-inline-block" style="width:180px" placeholder="Email o nombre"> ' +
        '<button type="button" class="btn btn-primary btn-sm ms-2" id="adminPedidosFiltrar">Filtrar</button></div><div id="adminPedidosList"></div>';
      document.getElementById('adminFilterEstado').value = estado;
      document.getElementById('adminFilterCliente').value = cliente;
      document.getElementById('adminPedidosList').innerHTML = buildPedidosList(list);
      window._adminPedidosActuales = list;
      document.getElementById('adminPedidosFiltrar').onclick = function () { estado = document.getElementById('adminFilterEstado').value; cliente = document.getElementById('adminFilterCliente').value; fetchPedidos(); };
      document.getElementById('adminPedidosList').querySelectorAll('.estado-select').forEach(function (sel) {
        sel.addEventListener('change', async function () {
          var id = sel.dataset.id;
          var r = await fetch(API + '/staff/pedidos/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ estado: sel.value }) });
          if (r.ok) { showToast('Estado actualizado.'); fetchPedidos(); } else showToast('Error', 'error');
        });
      });
      document.getElementById('adminPedidosList').querySelectorAll('.btn-marcar-enviado').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var r = await fetch(API + '/staff/pedidos/' + btn.dataset.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ estado: 'enviado' }) });
          if (r.ok) { showToast('Estado actualizado.'); fetchPedidos(); } else showToast('Error', 'error');
        });
      });
    }
    fetchPedidos();
  }

  function loadAdminProductos() {
    var el = document.getElementById('adminProductosContent');
    if (!el) return;
    el.innerHTML = '<p class="text-muted">Cargando...</p>';
    async function fetchProductosAdmin() {
      var r = await fetch(API + '/admin/productos', { headers: authHeaders() });
      if (r.status === 403 || r.status === 401) { el.innerHTML = '<p class="text-danger">Sin permiso.</p>'; return; }
      var list = await r.json();
      var categorias = [];
      try { var rCat = await fetch(API + '/categorias'); if (rCat.ok) categorias = await rCat.json(); } catch (e) {}
      var formCats = categorias.map(function (c) { return '<option value="' + c.id + '">' + (c.nombre || '') + '</option>'; }).join('');
      el.innerHTML =
        '<div class="card shadow-sm mb-3"><div class="card-body"><h2 class="h6 fw-bold">Nuevo producto</h2>' +
        '<div class="row g-2"><div class="col-6 col-md-3"><input type="text" id="apCodigo" class="form-control form-control-sm" placeholder="Código"></div>' +
        '<div class="col-6 col-md-3"><input type="text" id="apNombre" class="form-control form-control-sm" placeholder="Nombre"></div>' +
        '<div class="col-6 col-md-2"><input type="number" id="apPrecio" class="form-control form-control-sm" placeholder="Precio" min="0"></div>' +
        '<div class="col-6 col-md-2"><select id="apCategoria" class="form-select form-select-sm"><option value="">Categoría</option>' + formCats + '</select></div>' +
        '<div class="col-12"><textarea id="apDescripcion" class="form-control form-control-sm" rows="2" placeholder="Descripción"></textarea></div>' +
        '<div class="col-12"><input type="file" id="apFotos" class="form-control form-control-sm" multiple accept="image/*"></div>' +
        '<div class="col-12"><input type="hidden" id="apEditId" value=""><button type="button" class="btn btn-primary btn-sm" id="apBtnCrear">Guardar producto</button></div></div></div></div>' +
        '<div id="adminProductosList"></div>';
      var listEl = document.getElementById('adminProductosList');
      listEl.innerHTML = list.length === 0 ? '<p class="text-muted">No hay productos.</p>' : list.map(function (p) {
        var eliminado = !!p.deleted_at;
        var img = (p.imagenes && p.imagenes[0] && p.imagenes[0].ruta) ? p.imagenes[0].ruta : '';
        var imgHtml = img ? '<img src="' + img + '" alt="" class="rounded me-2" style="width:48px;height:48px;object-fit:cover">' : '';
        return '<div class="list-group-item d-flex align-items-center flex-wrap gap-2' + (eliminado ? ' bg-light' : '') + '">' + imgHtml +
          '<div class="flex-grow-1"><strong>' + (p.nombre || '') + '</strong> ' + p.codigo + ' — ' + formatPrice(p.precio) + (p.categoria_nombre ? ' <span class="badge bg-secondary">' + p.categoria_nombre + '</span>' : '') + (eliminado ? ' <span class="badge bg-danger">Eliminado</span>' : '') + '</div>' +
          '<button type="button" class="btn btn-outline-primary btn-sm btn-ap-edit" data-id="' + p.id + '">Editar</button>' +
          (eliminado ? '<button type="button" class="btn btn-outline-success btn-sm btn-ap-restore" data-id="' + p.id + '">Restaurar</button>' : '<button type="button" class="btn btn-outline-danger btn-sm btn-ap-delete" data-id="' + p.id + '">Eliminar</button>') + '</div>';
      }).join('');
      document.getElementById('apBtnCrear').onclick = async function () {
        var editId = (document.getElementById('apEditId') && document.getElementById('apEditId').value) || '';
        var codigo = (document.getElementById('apCodigo').value || '').trim();
        var nombre = (document.getElementById('apNombre').value || '').trim();
        var precio = parseInt(document.getElementById('apPrecio').value, 10);
        var categoria_id = parseInt(document.getElementById('apCategoria').value, 10);
        var descripcion = (document.getElementById('apDescripcion').value || '').trim() || null;
        if (!codigo || !nombre || !Number.isFinite(precio) || precio < 0 || !Number.isFinite(categoria_id) || categoria_id < 1) { showToast('Completá código, nombre, precio y categoría.', 'error'); return; }
        if (editId) {
          var r = await fetch(API + '/admin/productos/' + editId, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ codigo: codigo, nombre: nombre, precio: precio, descripcion: descripcion, categoria_id: categoria_id }) });
          if (r.ok) { showToast('Producto actualizado.'); document.getElementById('apEditId').value = ''; document.getElementById('apBtnCrear').textContent = 'Guardar producto'; fetchProductosAdmin(); document.getElementById('apCodigo').value = ''; document.getElementById('apNombre').value = ''; document.getElementById('apPrecio').value = ''; document.getElementById('apDescripcion').value = ''; }
          else { var d = await r.json().catch(function(){}); showToast(d.error || 'Error', 'error'); }
          return;
        }
        var fd = new FormData();
        fd.append('codigo', codigo);
        fd.append('nombre', nombre);
        fd.append('precio', String(precio));
        fd.append('categoria_id', String(categoria_id));
        fd.append('descripcion', descripcion || '');
        var files = document.getElementById('apFotos').files || [];
        for (var i = 0; i < files.length; i++) fd.append('fotos', files[i]);
        var r = await fetch(API + '/admin/productos', { method: 'POST', headers: authHeaders(), body: fd });
        if (r.ok) { showToast('Producto creado.'); fetchProductosAdmin(); document.getElementById('apCodigo').value = ''; document.getElementById('apNombre').value = ''; document.getElementById('apPrecio').value = ''; document.getElementById('apDescripcion').value = ''; document.getElementById('apFotos').value = ''; }
        else { var d = await r.json().catch(function(){}); showToast(d.error || 'Error', 'error'); }
      };
      listEl.querySelectorAll('.btn-ap-delete').forEach(function (btn) {
        btn.onclick = async function () {
          if (!confirm('¿Eliminar este producto? (borrado lógico)')) return;
          var r = await fetch(API + '/admin/productos/' + btn.dataset.id, { method: 'DELETE', headers: authHeaders() });
          if (r.ok) { showToast('Producto eliminado.'); fetchProductosAdmin(); } else showToast('Error', 'error');
        };
      });
      listEl.querySelectorAll('.btn-ap-restore').forEach(function (btn) {
        btn.onclick = async function () {
          var r = await fetch(API + '/admin/productos/' + btn.dataset.id + '/restore', { method: 'PATCH', headers: authHeaders() });
          if (r.ok) { showToast('Producto restaurado.'); fetchProductosAdmin(); } else showToast('Error', 'error');
        };
      });
      listEl.querySelectorAll('.btn-ap-edit').forEach(function (btn) {
        btn.onclick = async function () {
          var r = await fetch(API + '/admin/productos/' + btn.dataset.id, { headers: authHeaders() });
          if (!r.ok) return;
          var p = await r.json();
          document.getElementById('apCodigo').value = p.codigo || '';
          document.getElementById('apNombre').value = p.nombre || '';
          document.getElementById('apPrecio').value = p.precio || '';
          document.getElementById('apCategoria').value = p.categoria_id || '';
          document.getElementById('apDescripcion').value = p.descripcion || '';
          document.getElementById('apBtnCrear').textContent = 'Actualizar producto';
          if (document.getElementById('apEditId')) document.getElementById('apEditId').value = p.id;
        };
      });
    }
    fetchProductosAdmin();
  }

  document.getElementById('formLogin') && document.getElementById('formLogin').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.target;
    var email = (form.querySelector('[name="email"]') || {}).value || '';
    var password = (form.querySelector('[name="password"]') || {}).value || '';
    if (!email || !password) {
      showToast('Ingresá email y contraseña.', 'error');
      return;
    }
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }
    try {
      var res = await fetch(API + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Revisá email y contraseña.');
      token = data.token;
      user = data.user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      updateNav();
      window.location.hash = (user && user.rol === 'staff') ? '#/administracion' : '#/';
    } catch (err) {
      showToast(err.message || 'Error de conexión.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    }
  });

  document.getElementById('formRegistro') && document.getElementById('formRegistro').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.target;
    var emailEl = form.querySelector('[name="email"]');
    var passwordEl = form.querySelector('[name="password"]');
    var nombreEl = form.querySelector('[name="nombre"]');
    var telefonoEl = form.querySelector('[name="telefono"]');
    var direccionEl = form.querySelector('[name="direccion"]');
    var payload = {
      email: (emailEl && emailEl.value) ? String(emailEl.value).trim() : '',
      password: (passwordEl && passwordEl.value) ? String(passwordEl.value) : '',
      nombre: (nombreEl && nombreEl.value) ? String(nombreEl.value).trim() : undefined,
      telefono: (telefonoEl && telefonoEl.value) ? String(telefonoEl.value).trim() : undefined,
      direccion: (direccionEl && direccionEl.value) ? String(direccionEl.value).trim() : undefined
    };
    if (!payload.email || !payload.password) {
      showToast('Email y contraseña son obligatorios.', 'error');
      return;
    }
    var btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creando cuenta...'; }
    try {
      var res = await fetch(API + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la cuenta. Revisá los datos.');
      token = data.token;
      user = data.user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      updateNav();
      window.location.hash = '#/';
    } catch (err) {
      showToast(err.message || 'Error de conexión. Intentá de nuevo.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Registrarme'; }
    }
  });

  document.getElementById('btnLogout') && document.getElementById('btnLogout').addEventListener('click', () => {
    token = null;
    user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    updateNav();
    window.location.hash = '#/';
  });

  function applySearchFilter(q) {
    var val = (q != null ? q : '').toString().trim();
    var searchEl = document.getElementById('searchProducts');
    if (searchEl) searchEl.value = val;
    if (productos.length === 0) return;
    renderProductos();
  }

  document.getElementById('searchProducts') && document.getElementById('searchProducts').addEventListener('input', function () {
    applySearchFilter(this.value);
  });
  document.getElementById('searchProducts') && document.getElementById('searchProducts').addEventListener('keyup', function () {
    applySearchFilter(this.value);
  });

  window.addEventListener('hashchange', function () {
    var collapse = document.querySelector('.navbar-collapse');
    if (collapse && collapse.classList.contains('show')) collapse.classList.remove('show');
    route();
  });
  route();
  updateCartCount();
  fetchProductos().catch(() => {});
})();
