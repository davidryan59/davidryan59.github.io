/* Northwind, rebuilt: the screens. model.js holds the data and the sums; this
   file turns an address after the # into a screen and handles the clicks.
   No libraries and no build step. */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function localToday() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function safeStorage() {
    try { localStorage.setItem('northwind.test', '1'); localStorage.removeItem('northwind.test'); return localStorage; }
    catch (e) { return null; }
  }

  var M = NorthwindModel.create(NORTHWIND_SEED, { today: localToday(), storage: safeStorage() });
  var main = $('#main'), tip = $('#tip');
  var actions = {};        // the current screen's click handlers, by data-action name
  var listState = {};      // search, filter and sort of each list, kept while the page is open
  var reportYear = null;
  var reportPeriod = 'month';

  /* ---- formatting ---- */
  var moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  var numFmt = new Intl.NumberFormat('en-GB');
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function esc(s) {
    return s == null ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return moneyFmt.format(n || 0); }
  function shortMoney(n) {
    if (n >= 1e6) return '$' + +(n / 1e6).toFixed(2) + 'm';
    if (n >= 1e3) return '$' + +(n / 1e3).toFixed(1) + 'k';
    return '$' + Math.round(n);
  }
  function num(n) { return numFmt.format(n || 0); }
  function date(s) {
    if (!s) return '';
    var p = s.split('-');
    return +p[2] + ' ' + MONTHS[p[1] - 1].slice(0, 3) + ' ' + p[0];
  }
  function monthName(key) { return MONTHS[+key.slice(5) - 1] + ' ' + key.slice(0, 4); }
  function address(o, prefix) {
    function g(k) { return o[prefix ? prefix + k.charAt(0).toUpperCase() + k.slice(1) : k]; }
    return [g('address'), [g('city'), g('region')].filter(Boolean).join(', '), g('postalCode'), g('country')]
      .filter(Boolean).map(esc).join('<br>');
  }
  function place(o) { return [o.city, o.country].filter(Boolean).join(', '); }
  var STATUS = { shipped: 'Shipped', open: 'To ship', late: 'Late' };
  function statusPill(o) { var s = M.status(o); return '<span class="pill ' + s + '">' + STATUS[s] + '</span>'; }
  function stockPill(p) {
    if (p.discontinued) return '<span class="pill off">Discontinued</span>';
    return M.needsReorder(p) ? '<span class="pill low">Reorder</span>' : '<span class="pill ok">In stock</span>';
  }
  function link(href, text) { return '<a href="' + href + '">' + esc(text) + '</a>'; }
  function customerName(id) { var c = M.get('customers', id); return c ? c.companyName : id || ''; }

  /* ---- page parts ---- */
  function show(nav, title, html) {
    actions = {};
    document.title = title + ' – Northwind, rebuilt';
    main.innerHTML = '<div class="page">' + html + '</div>';
    main.scrollTop = 0;
    $$('#nav a[data-nav]').forEach(function (a) {
      if (a.dataset.nav === nav || (a.dataset.nav === 'more' && /^(suppliers|staff|reports|about)$/.test(nav))) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    hideTip();
  }
  function head(title, buttons, crumb) {
    return (crumb ? '<div class="crumb">' + crumb + '</div>' : '') +
      '<div class="head"><h1>' + title + '</h1>' + (buttons || '') + '</div>';
  }
  function fields(pairs) {
    return '<dl class="fields">' + pairs.filter(function (p) { return p[1] !== '' && p[1] != null; }).map(function (p) {
      return '<div><dt>' + esc(p[0]) + '</dt><dd>' + p[1] + '</dd></div>';
    }).join('') + '</dl>';
  }
  function tile(label, value, note, href, noteClass) {
    var inner = '<div class="label">' + esc(label) + '</div><div class="value">' + value + '</div>' +
      (note ? '<div class="note ' + (noteClass || '') + '">' + esc(note) + '</div>' : '');
    return href ? '<a class="tile" href="' + href + '">' + inner + '</a>' : '<div class="tile">' + inner + '</div>';
  }

  /* A column is { label, value(row), html(row), cls, num, nolabel }. `cls` says
     where the cell goes when a narrow screen turns each row into a card:
     primary (the heading), side (top right), rest (a line below), skip. */
  function cell(col, row, href) {
    var v = col.html ? null : col.value(row);
    var inner = col.html ? col.html(row) : esc(col.num && typeof v === 'number' ? num(v) : v);
    if (col.cls === 'primary' && href) inner = '<a href="' + href + '">' + inner + '</a>';
    return '<td class="' + (col.cls || 'rest') + (col.num ? ' num' : '') + '"' +
      ((col.cls || 'rest') === 'rest' && !col.nolabel ? ' data-label="' + esc(col.label) + '"' : '') + '>' + inner + '</td>';
  }
  function rowsHtml(cols, rows, href) {
    return rows.map(function (r) {
      var h = href ? href(r) : null;
      return '<tr' + (h ? ' data-href="' + h + '"' : '') + '>' + cols.map(function (c) { return cell(c, r, h); }).join('') + '</tr>';
    }).join('');
  }
  function table(cols, rows, href, emptyText) {
    if (!rows.length) return '<div class="empty">' + esc(emptyText || 'Nothing to show.') + '</div>';
    return '<div class="tablewrap"><table class="list"><thead><tr>' + cols.map(function (c) {
      return '<th' + (c.num ? ' class="num"' : '') + '>' + esc(c.label) + '</th>';
    }).join('') + '</tr></thead><tbody>' + rowsHtml(cols, rows, href) + '</tbody></table></div>';
  }

  /* A full list screen: search, filter chips, sortable columns, more on demand. */
  function listView(cfg) {
    var st = listState[cfg.key] || (listState[cfg.key] = { q: '', filter: 'all', sort: cfg.sort || 0, dir: cfg.dir || 1, limit: 60 });
    if (cfg.query && cfg.query.filter) st.filter = cfg.query.filter;
    var filters = [{ id: 'all', label: 'All' }].concat(cfg.filters || []);
    show(cfg.nav, cfg.title, head(esc(cfg.title), cfg.buttons, cfg.crumb) +
      '<div class="toolbar"><input type="search" id="q" placeholder="Search ' + esc(cfg.title.toLowerCase()) + '" aria-label="Search ' + esc(cfg.title.toLowerCase()) + '" value="' + esc(st.q) + '">' +
      (cfg.filters ? '<div class="chips" role="group" aria-label="Show">' + filters.map(function (f) {
        return '<button type="button" data-filter="' + f.id + '">' + esc(f.label) + '</button>';
      }).join('') + '</div>' : '') +
      '<span class="count" id="count"></span></div>' +
      '<div class="tablewrap"><table class="list"><thead><tr>' + cfg.cols.map(function (c, i) {
        return '<th' + (c.num ? ' class="num"' : '') + '><button type="button" data-sort="' + i + '">' + esc(c.label) + '</button></th>';
      }).join('') + '</tr></thead><tbody id="rows"></tbody></table><div class="empty" id="none" hidden>Nothing matches.</div></div>' +
      '<button type="button" class="more" id="more">Show more</button>');

    function update() {
      var q = st.q.trim().toLowerCase(), f = filters.filter(function (x) { return x.id === st.filter; })[0] || filters[0];
      var col = cfg.cols[st.sort];
      var rows = cfg.rows.filter(function (r) {
        return (!f.test || f.test(r)) && (!q || M.matches(cfg.text(r), q));
      }).sort(function (a, b) {
        var x = col.value(a), y = col.value(b);
        if (x == null || x === '') return y == null || y === '' ? 0 : 1;
        if (y == null || y === '') return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * st.dir;
      });
      $('#rows').innerHTML = rowsHtml(cfg.cols, rows.slice(0, st.limit), cfg.href);
      $('#count').textContent = num(rows.length) + ' of ' + num(cfg.rows.length);
      $('#none').hidden = rows.length > 0;
      $('#more').hidden = rows.length <= st.limit;
      $$('[data-filter]', main).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.filter === f.id); });
      $$('th', main).forEach(function (th, i) {
        if (i === st.sort) th.setAttribute('aria-sort', st.dir > 0 ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
      });
    }
    $('#q').addEventListener('input', function () { st.q = this.value; st.limit = 60; update(); });
    $$('[data-filter]', main).forEach(function (b) {
      b.addEventListener('click', function () { st.filter = b.dataset.filter; st.limit = 60; update(); });
    });
    $$('[data-sort]', main).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.dataset.sort;
        if (st.sort === i) st.dir = -st.dir; else { st.sort = i; st.dir = cfg.cols[i].num ? -1 : 1; }
        update();
      });
    });
    $('#more').addEventListener('click', function () { st.limit += 120; update(); });
    update();
  }

  /* ---- forms ---- */
  function control(f, v) {
    var attrs = ' name="' + f.name + '"' + (f.required ? ' required' : '') + (f.attrs ? ' ' + f.attrs : '');
    var val = v == null ? '' : v, c;
    if (f.type === 'checkbox') {
      return '<label class="check"><input type="checkbox"' + attrs + (v ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
    }
    if (f.type === 'select') {
      c = '<select' + attrs + '>' + (f.blank ? '<option value="">' + esc(f.blank) + '</option>' : '') + f.options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>';
    } else {
      c = '<input type="' + (f.type || 'text') + '"' + attrs + ' value="' + esc(val) + '">';
    }
    return '<label' + (f.wide ? ' class="wide"' : '') + '>' + esc(f.label) + c + '</label>';
  }
  function readFields(form, defs) {
    var out = {};
    defs.forEach(function (f) {
      var el = form.elements[f.name], v = el.value.trim();
      if (f.type === 'checkbox') out[f.name] = el.checked ? 1 : 0;
      else if (f.type === 'number' || f.numeric) out[f.name] = v === '' ? (f.required ? 0 : null) : +v;
      else out[f.name] = v === '' ? null : v;
    });
    return out;
  }
  function simpleForm(cfg) {
    show(cfg.nav, cfg.title, head(esc(cfg.title), '', cfg.crumb) +
      '<form class="edit panel" id="form"><div class="fieldgrid">' + cfg.fields.map(function (f) { return control(f, cfg.values[f.name]); }).join('') +
      '</div><div class="actions"><button type="submit" class="primary">Save</button><a class="button" href="' + cfg.back + '">Cancel</a></div></form>');
    $('#form').addEventListener('submit', function (e) {
      e.preventDefault();
      location.hash = cfg.save(readFields(this, cfg.fields));
    });
  }
  function options(name, label) {
    return M.all(name).map(function (r) { return [r.id, label(r)]; }).sort(function (a, b) { return a[1].localeCompare(b[1]); });
  }

  /* ---- home ---- */
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 8 ? 8 : 10) * p;
  }
  function monthChart(data) {
    var max = niceMax(Math.max.apply(null, data.map(function (d) { return d.sales; })));
    return '<div class="chart"><div class="axis" aria-hidden="true">' + [0, 1, 2, 3, 4].map(function (i) {
      return '<span>' + shortMoney(max * i / 4) + '</span>';
    }).join('') + '</div><div class="plot" role="group" aria-label="Sales by month">' + data.map(function (d) {
      return '<a class="col" href="' + periodHref(d) + '" data-tip="' + esc(monthName(d.key) + '|' + money(d.sales) + ' from ' + num(d.orders) + ' orders') + '" aria-label="' +
        esc(monthName(d.key) + ', ' + money(d.sales)) + '"><i style="height:' + (100 * d.sales / max).toFixed(2) + '%"></i><b>' + MONTHS[+d.key.slice(5) - 1].charAt(0) + '</b></a>';
    }).join('') + '</div></div>';
  }
  var orderCols = [
    { label: 'Order', cls: 'primary', num: false, value: function (o) { return o.id; } },
    { label: 'Customer', nolabel: true, value: function (o) { return customerName(o.customerID); }, html: function (o) { return link('#/customers/' + o.customerID, customerName(o.customerID)); } },
    { label: 'Ordered', value: function (o) { return o.orderDate; }, html: function (o) { return date(o.orderDate); } },
    { label: 'Required', cls: 'skip', value: function (o) { return o.requiredDate; }, html: function (o) { return date(o.requiredDate); } },
    { label: 'Status', cls: 'side', value: function (o) { return M.status(o); }, html: statusPill },
    { label: 'Total', num: true, value: function (o) { return M.total(o); }, html: function (o) { return money(M.total(o)); } },
  ];
  function orderHref(o) { return '#/orders/' + o.id; }

  function home() {
    var k = M.reports.headline(), months = M.reports.monthly();
    var change = k.salesBefore ? Math.round(100 * (k.sales30 - k.salesBefore) / k.salesBefore) : 0;
    var waiting = M.all('orders').filter(function (o) { return !o.shippedDate; })
      .sort(function (a, b) { return (a.requiredDate || '') < (b.requiredDate || '') ? -1 : 1; });
    var low = M.reports.toReorder();
    var productCols = [
      { label: 'Product', cls: 'primary', value: function (p) { return p.productName; } },
      { label: 'In stock', num: true, cls: 'side', value: function (p) { return p.unitsInStock; } },
      { label: 'Reorder at', num: true, value: function (p) { return p.reorderLevel; } },
      { label: 'On order', num: true, value: function (p) { return p.unitsOnOrder; } },
    ];
    show('home', 'Home',
      '<h1 class="sr">Northwind Traders</h1><div class="stack">' +
      '<div class="panel intro"><p><strong>This is Northwind Traders, the sample database that shipped with Microsoft Access, rebuilt as a web app.</strong> ' +
      'Add an order, edit a customer, print an invoice, or open it on your phone. ' + link('#/about', 'About this rebuild') + '</p></div>' +
      '<div class="tiles">' +
      tile('Sales, last 30 days', money(k.sales30).replace(/\.\d\d$/, ''), change ? Math.abs(change) + '% ' + (change > 0 ? 'up' : 'down') + ' on the 30 days before' : '', '#/reports/sales-by-period?period=month', change > 0 ? 'up' : 'down') +
      tile('Orders to ship', num(k.toShip), 'Not yet sent to the customer', '#/orders?filter=open') +
      tile('Late orders', num(k.late), k.late ? 'Past the date the customer needs them' : 'None are late', '#/orders?filter=late', k.late ? 'alert' : '') +
      tile('Products to reorder', num(k.reorder), 'At or below the reorder level', '#/products?filter=reorder', k.reorder ? 'alert' : '') +
      '</div>' +
      '<div class="panel"><h2>Sales by month, ' + esc(monthName(months[0].key)) + ' to ' + esc(monthName(months[months.length - 1].key)) + '</h2>' + monthChart(months) + '</div>' +
      '<div class="grid two">' +
      '<div class="panel"><h2>Orders to ship ' + link('#/orders?filter=open', 'All ' + waiting.length) + '</h2>' +
      table(orderCols.filter(function (c) { return c.label !== 'Ordered'; }).map(function (c) {
        return c.label === 'Required' ? { label: 'Required', value: c.value, html: c.html } : c;
      }), waiting.slice(0, 7), orderHref, 'Every order is shipped.') + '</div>' +
      '<div class="panel"><h2>Stock to reorder ' + link('#/products?filter=reorder', 'All ' + low.length) + '</h2>' +
      table(productCols, low.slice(0, 7), function (p) { return '#/products/' + p.id; }, 'No product is low.') + '</div>' +
      '</div></div>');
  }

  /* ---- orders ---- */
  function ordersList(m, query) {
    listView({
      key: 'orders:' + (query.from || '') + ':' + (query.to || ''), nav: 'orders', title: 'Orders', query: query,
      crumb: query.from && query.to ? 'Ordered ' + date(query.from) + ' to ' + date(NorthwindModel.addDays(query.to, -1)) + ' · ' + link('#/orders', 'Clear period') : '',
      buttons: '<a class="button primary" href="#/orders/new">New order</a>',
      rows: M.ordersInPeriod(query.from, query.to), cols: orderCols, sort: 0, dir: -1, href: orderHref,
      text: function (o) { return o.id + ' ' + customerName(o.customerID) + ' ' + (o.shipCity || '') + ' ' + (o.shipCountry || ''); },
      filters: [
        { id: 'open', label: 'To ship', test: function (o) { return !o.shippedDate; } },
        { id: 'late', label: 'Late', test: function (o) { return M.status(o) === 'late'; } },
        { id: 'shipped', label: 'Shipped', test: function (o) { return !!o.shippedDate; } },
      ],
    });
  }
  function lineCols() {
    return [
      { label: 'Product', cls: 'primary', value: function (l) { var p = M.get('products', l.productID); return p ? p.productName : 'Product ' + l.productID; } },
      { label: 'Unit price', num: true, value: function (l) { return l.unitPrice; }, html: function (l) { return money(l.unitPrice); } },
      { label: 'Quantity', num: true, value: function (l) { return l.quantity; } },
      { label: 'Discount', num: true, value: function (l) { return l.discount; }, html: function (l) { return l.discount ? Math.round(l.discount * 100) + '%' : ''; } },
      { label: 'Amount', num: true, cls: 'side', value: M.lineTotal, html: function (l) { return money(M.lineTotal(l)); } },
    ];
  }
  function totalsHtml(o) {
    return '<div class="totals"><div><span>Items</span><span class="num">' + money(M.subtotal(o.id)) + '</span></div>' +
      '<div><span>Freight</span><span class="num">' + money(o.freight) + '</span></div>' +
      '<div class="grand"><span>Total</span><span class="num">' + money(M.total(o)) + '</span></div></div>';
  }
  function orderDetail(m) {
    var o = M.get('orders', +m[1]);
    if (!o) return missing('orders', 'Orders', 'That order');
    var staff = M.get('employees', o.employeeID), carrier = M.get('shippers', o.shipVia);
    show('orders', 'Order ' + o.id,
      head('Order ' + o.id + ' ' + statusPill(o),
        (o.shippedDate ? '' : '<button type="button" class="primary" data-action="ship">Mark as shipped</button>') +
        '<a class="button" href="#/orders/' + o.id + '/invoice">Invoice</a>' +
        '<a class="button" href="#/orders/' + o.id + '/edit">Edit</a>' +
        '<button type="button" class="danger" data-action="delete">Delete</button>', link('#/orders', 'Orders')) +
      '<div class="stack"><div class="panel">' + fields([
        ['Customer', link('#/customers/' + o.customerID, customerName(o.customerID))],
        ['Taken by', staff ? link('#/staff/' + staff.id, M.staffName(staff)) : ''],
        ['Ordered', date(o.orderDate)],
        ['Required', date(o.requiredDate)],
        ['Shipped', o.shippedDate ? date(o.shippedDate) : 'Not yet'],
        ['Carrier', carrier ? esc(carrier.companyName) : ''],
        ['Ship to', '<strong>' + esc(o.shipName) + '</strong><br>' + address(o, 'ship')],
      ]) + '</div>' +
      '<div class="panel"><h2>Items</h2>' + table(lineCols(), M.linesOf(o.id), function (l) { return '#/products/' + l.productID; }, 'This order has no items.') + '</div>' +
      '<div class="panel">' + totalsHtml(o) + '</div></div>');
    actions.ship = function () { M.shipOrder(o.id); route(); };
    actions.delete = function () {
      if (confirm('Delete order ' + o.id + '? This cannot be undone.')) { M.deleteOrder(o.id); location.hash = '#/orders'; }
    };
  }
  function invoice(m) {
    var o = M.get('orders', +m[1]);
    if (!o) return missing('orders', 'Orders', 'That order');
    var c = M.get('customers', o.customerID), carrier = M.get('shippers', o.shipVia), staff = M.get('employees', o.employeeID);
    show('orders', 'Invoice ' + o.id,
      '<div class="crumb no-print">' + link('#/orders', 'Orders') + ' › ' + link('#/orders/' + o.id, 'Order ' + o.id) + '</div>' +
      '<div class="head no-print"><h1>Invoice</h1><button type="button" class="primary" data-action="print">Print or save as PDF</button></div>' +
      '<div class="invoice"><div class="top"><div><h1>Northwind Traders</h1><div class="muted">One Portals Way, Twin Points WA 98156, USA</div></div>' +
      '<div><h3>Invoice</h3><strong>No. ' + o.id + '</strong><br>' + date(o.orderDate) + '</div></div>' +
      '<div class="parties"><div><h3>Bill to</h3><strong>' + (c ? link('#/customers/' + c.id, c.companyName) : esc(o.shipName)) + '</strong><br>' + (c ? address(c) : address(o, 'ship')) + '</div>' +
      '<div><h3>Ship to</h3><strong>' + esc(o.shipName) + '</strong><br>' + address(o, 'ship') + '</div>' +
      '<div><h3>Details</h3>' + [['Customer', o.customerID], ['Salesperson', M.staffName(staff)], ['Required', date(o.requiredDate)],
        ['Shipped', o.shippedDate ? date(o.shippedDate) : 'Not yet'], ['Carrier', carrier ? carrier.companyName : '']].filter(function (p) { return p[1]; })
        .map(function (p) { return esc(p[0]) + ': ' + (p[0] === 'Customer' ? link('#/customers/' + o.customerID, p[1]) : p[0] === 'Salesperson' && staff ? link('#/staff/' + staff.id, p[1]) : esc(p[1])); }).join('<br>') + '</div></div>' +
      table(lineCols(), M.linesOf(o.id), function (l) { return '#/products/' + l.productID; }) + totalsHtml(o) + '</div>');
    actions.print = function () { window.print(); };
  }

  function orderForm(m, query) {
    var existing = m[1] ? M.get('orders', +m[1]) : null;
    if (m[1] && !existing) return missing('orders', 'Orders', 'That order');
    var o = existing || {
      customerID: query.customer || '', employeeID: 1, orderDate: M.today, requiredDate: NorthwindModel.addDays(M.today, 28),
      shippedDate: null, shipVia: 1, freight: 0,
    };
    var rows = existing ? M.linesOf(existing.id).map(function (l) {
      return { productID: l.productID, unitPrice: l.unitPrice, quantity: l.quantity, discount: l.discount };
    }) : [{ productID: '', unitPrice: '', quantity: 1, discount: 0 }];
    var defs = [
      { name: 'customerID', label: 'Customer', type: 'select', required: true, blank: 'Choose a customer', options: options('customers', function (c) { return c.companyName; }) },
      { name: 'employeeID', label: 'Taken by', type: 'select', numeric: true, options: options('employees', M.staffName) },
      { name: 'orderDate', label: 'Ordered', type: 'date', required: true },
      { name: 'requiredDate', label: 'Required', type: 'date' },
      { name: 'shippedDate', label: 'Shipped', type: 'date' },
      { name: 'shipVia', label: 'Carrier', type: 'select', numeric: true, options: options('shippers', function (s) { return s.companyName; }) },
      { name: 'freight', label: 'Freight', type: 'number', attrs: 'min="0" step="0.01"' },
      { name: 'shipName', label: 'Ship to', required: true },
      { name: 'shipAddress', label: 'Address' },
      { name: 'shipCity', label: 'City' },
      { name: 'shipRegion', label: 'Region' },
      { name: 'shipPostalCode', label: 'Postcode' },
      { name: 'shipCountry', label: 'Country' },
    ];
    var title = existing ? 'Edit order ' + existing.id : 'New order';
    var back = existing ? '#/orders/' + existing.id : '#/orders';
    show('orders', title, head(esc(title), '', link('#/orders', 'Orders')) +
      '<form class="edit stack" id="form"><div class="panel"><div class="fieldgrid">' + defs.map(function (f) { return control(f, o[f.name]); }).join('') + '</div></div>' +
      '<div class="panel"><h2>Items</h2><table class="lines"><thead><tr><th>Product</th><th class="num">Quantity</th><th class="num">Unit price</th>' +
      '<th class="num">Discount %</th><th class="num">Amount</th><th></th></tr></thead><tbody id="lines"></tbody></table>' +
      '<div class="actions"><button type="button" data-action="add">Add an item</button></div>' +
      '<div class="totals"><div><span>Items</span><span class="num" id="t-items"></span></div><div><span>Freight</span><span class="num" id="t-freight"></span></div>' +
      '<div class="grand"><span>Total</span><span class="num" id="t-total"></span></div></div></div>' +
      '<div class="actions"><button type="submit" class="primary">Save order</button><a class="button" href="' + back + '">Cancel</a></div></form>');

    var form = $('#form'), body = $('#lines');
    function draw() {
      body.innerHTML = rows.map(function (l, i) {
        return '<tr data-i="' + i + '"><td class="product"><div class="product-picker"><input type="search" data-picker required role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="choices-' + i + '" autocomplete="off" aria-label="Product" placeholder="Search name or category" value="' + esc(l.productID ? productName(l.productID) : '') + '"><div class="product-choices" role="listbox" id="choices-' + i + '" aria-label="Products" hidden></div></div><div class="stock"></div></td>' +
          '<td data-label="Quantity"><input type="number" data-f="quantity" min="1" step="1" required value="' + esc(l.quantity) + '" aria-label="Quantity"></td>' +
          '<td data-label="Unit price"><input type="number" data-f="unitPrice" min="0" step="0.01" required value="' + esc(l.unitPrice) + '" aria-label="Unit price"></td>' +
          '<td data-label="Discount %"><input type="number" data-f="discount" min="0" max="100" step="1" value="' + Math.round((l.discount || 0) * 100) + '" aria-label="Discount per cent"></td>' +
          '<td class="num amount" data-label="Amount"></td>' +
          '<td><button type="button" class="icon" data-action="remove" aria-label="Remove this item">×</button></td></tr>';
      }).join('');
      $$('[data-picker]', body).forEach(function (input) { input.setCustomValidity(rows[+input.closest('tr').dataset.i].productID ? '' : 'Choose a product from the results.'); });
      sums();
    }
    function sums() {
      var items = 0;
      $$('tr', body).forEach(function (tr, i) {
        var l = rows[i], p = M.get('products', l.productID), stock = $('.stock', tr);
        var amount = l.productID ? M.lineTotal({ unitPrice: +l.unitPrice || 0, quantity: +l.quantity || 0, discount: l.discount || 0 }) : 0;
        items += amount;
        $('.amount', tr).textContent = money(amount);
        var short = p && +l.quantity > p.unitsInStock;
        stock.textContent = p ? (short ? 'Only ' + p.unitsInStock + ' in stock' : p.unitsInStock + ' in stock') + ', ' + p.quantityPerUnit : '';
        stock.className = 'stock' + (short ? ' short' : '');
      });
      var freight = +form.elements.freight.value || 0;
      $('#t-items').textContent = money(items);
      $('#t-freight').textContent = money(freight);
      $('#t-total').textContent = money(items + freight);
    }
    function closePickers() {
      $$('.product-choices', body).forEach(function (el) { el.hidden = true; });
      $$('[data-picker]', body).forEach(function (el) { el.setAttribute('aria-expanded', 'false'); el.removeAttribute('aria-activedescendant'); });
    }
    function pickResults(input, query) {
      closePickers();
      var choices = input.nextElementSibling, index = input.closest('tr').dataset.i;
      var list = M.productChoices(form.elements.customerID.value, query);
      choices.innerHTML = list.length ? list.map(function (entry, i) {
        var p = entry.product;
        return '<button type="button" role="option" aria-selected="false" tabindex="-1" id="pick-' + index + '-' + i + '" data-action="pick" data-product="' + p.id + '">' +
          esc(p.productName) + '<small>' + esc(categoryName(p)) + (entry.recent ? ' · Recent for this customer' : '') + (p.discontinued ? ' · Discontinued' : '') + '</small></button>';
      }).join('') : '<div class="empty">No products match.</div>';
      choices.hidden = false; input.setAttribute('aria-expanded', 'true');
    }
    body.addEventListener('focusin', function (e) { if (e.target.matches('[data-picker]')) pickResults(e.target, ''); });
    body.addEventListener('focusout', function (e) {
      if (e.target.closest('.product-picker') && (!e.relatedTarget || !e.target.closest('.product-picker').contains(e.relatedTarget))) closePickers();
    });
    body.addEventListener('input', function (e) {
      if (!e.target.matches('[data-picker]')) return;
      rows[+e.target.closest('tr').dataset.i].productID = '';
      e.target.setCustomValidity('Choose a product from the results.');
      pickResults(e.target, e.target.value); sums();
    });
    body.addEventListener('keydown', function (e) {
      if (!e.target.matches('[data-picker]')) return;
      var input = e.target, choices = input.nextElementSibling, items = $$('[data-product]', choices);
      var at = items.indexOf($('.on', choices));
      if (e.key === 'Escape') { closePickers(); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (choices.hidden) { pickResults(input, input.value); items = $$('[data-product]', choices); at = -1; }
        if (!items.length) return;
        var next = at < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
        items.forEach(function (el, i) { el.classList.toggle('on', i === next); el.setAttribute('aria-selected', i === next); });
        input.setAttribute('aria-activedescendant', items[next].id); items[next].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && !choices.hidden) {
        e.preventDefault(); if (items.length) actions.pick(items[Math.max(0, at)]);
      }
    });
    actions.pick = function (el) {
      var tr = el.closest('tr'), l = rows[+tr.dataset.i], p = M.get('products', +el.dataset.product), input = $('[data-picker]', tr);
      l.productID = p.id; l.unitPrice = p.unitPrice;
      input.value = p.productName; input.setCustomValidity('');
      $('[data-f="unitPrice"]', tr).value = p.unitPrice;
      input.focus(); closePickers(); sums();
    };
    body.addEventListener('input', function (e) {
      var tr = e.target.closest('tr'), f = e.target.dataset.f;
      if (!tr || !f) return;
      var l = rows[+tr.dataset.i], v = e.target.value;
      if (f === 'discount') l.discount = Math.min(100, Math.max(0, +v || 0)) / 100;
      else l[f] = v;
      sums();
    });
    form.elements.freight.addEventListener('input', sums);
    form.elements.customerID.addEventListener('change', function () {
      var c = M.get('customers', this.value);
      if (!c) return;
      form.elements.shipName.value = c.companyName || '';
      form.elements.shipAddress.value = c.address || '';
      form.elements.shipCity.value = c.city || '';
      form.elements.shipRegion.value = c.region || '';
      form.elements.shipPostalCode.value = c.postalCode || '';
      form.elements.shipCountry.value = c.country || '';
    });
    actions.add = function () { rows.push({ productID: '', unitPrice: '', quantity: 1, discount: 0 }); draw(); };
    actions.remove = function (el) {
      rows.splice(+el.closest('tr').dataset.i, 1);
      if (!rows.length) rows.push({ productID: '', unitPrice: '', quantity: 1, discount: 0 });
      draw();
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = readFields(form, defs);
      v.freight = v.freight || 0;
      if (existing) v.id = existing.id;
      var id = M.saveOrder(v, rows.map(function (l) {
        return { productID: +l.productID, unitPrice: +l.unitPrice || 0, quantity: +l.quantity || 0, discount: l.discount || 0 };
      }));
      location.hash = '#/orders/' + id;
    });
    draw();
    if (!existing && o.customerID) form.elements.customerID.dispatchEvent(new Event('change'));
  }

  /* ---- customers ---- */
  var customerFields = [
    { name: 'companyName', label: 'Company', required: true },
    { name: 'contactName', label: 'Contact' },
    { name: 'contactTitle', label: 'Job title' },
    { name: 'phone', label: 'Phone', type: 'tel' },
    { name: 'fax', label: 'Fax', type: 'tel' },
    { name: 'address', label: 'Address' },
    { name: 'city', label: 'City' },
    { name: 'region', label: 'Region' },
    { name: 'postalCode', label: 'Postcode' },
    { name: 'country', label: 'Country' },
  ];
  function customersList(m, query) {
    var stats = {};
    M.reports.byCustomer(null).forEach(function (e) { stats[e.key] = e; });
    function stat(c, k) { return stats[c.id] ? stats[c.id][k] : 0; }
    listView({
      key: 'customers', nav: 'customers', title: 'Customers', query: query,
      buttons: '<a class="button primary" href="#/customers/new">New customer</a>',
      rows: M.all('customers'), href: function (c) { return '#/customers/' + c.id; },
      text: function (c) { return [c.id, c.companyName, c.contactName, c.city, c.country].join(' '); },
      cols: [
        { label: 'Company', cls: 'primary', value: function (c) { return c.companyName; } },
        { label: 'Contact', nolabel: true, value: function (c) { return c.contactName; } },
        { label: 'Location', nolabel: true, value: place },
        { label: 'Phone', cls: 'skip', value: function (c) { return c.phone; } },
        { label: 'Orders', num: true, cls: 'skip', value: function (c) { return stat(c, 'orders'); } },
        { label: 'Sales', num: true, cls: 'side', value: function (c) { return stat(c, 'sales'); }, html: function (c) { return money(stat(c, 'sales')); } },
      ],
    });
  }
  function customerDetail(m) {
    var c = M.get('customers', m[1]);
    if (!c) return missing('customers', 'Customers', 'That customer');
    var orders = M.all('orders').filter(function (o) { return o.customerID === c.id; }).sort(function (a, b) { return b.id - a.id; });
    var sales = orders.reduce(function (s, o) { return s + M.subtotal(o.id); }, 0);
    show('customers', c.companyName,
      head(esc(c.companyName), '<a class="button primary" href="#/orders/new?customer=' + encodeURIComponent(c.id) + '">New order</a>' +
        '<a class="button" href="#/customers/' + encodeURIComponent(c.id) + '/edit">Edit</a>', link('#/customers', 'Customers')) +
      '<div class="stack"><div class="tiles">' + tile('Orders', num(orders.length)) + tile('Sales', money(sales)) +
      tile('Last order', orders.length ? date(orders[0].orderDate) : 'None') + '</div>' +
      '<div class="panel">' + fields([
        ['Contact', esc(c.contactName) + (c.contactTitle ? '<br><span class="muted">' + esc(c.contactTitle) + '</span>' : '')],
        ['Phone', c.phone ? '<a href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : ''],
        ['Fax', esc(c.fax)],
        ['Address', address(c)],
        ['Customer code', esc(c.id)],
      ]) + '</div>' +
      '<div class="panel"><h2>Orders</h2>' + table(orderCols.filter(function (col) { return col.label !== 'Customer'; }), orders.slice(0, 50), orderHref, 'No orders yet.') + '</div></div>');
  }
  function customerForm(m) {
    var c = m[1] ? M.get('customers', m[1]) : null;
    if (m[1] && !c) return missing('customers', 'Customers', 'That customer');
    simpleForm({
      nav: 'customers', title: c ? 'Edit ' + c.companyName : 'New customer', crumb: link('#/customers', 'Customers'),
      fields: customerFields, values: c || {}, back: c ? '#/customers/' + encodeURIComponent(c.id) : '#/customers',
      save: function (v) { if (c) v.id = c.id; return '#/customers/' + encodeURIComponent(M.saveCustomer(v)); },
    });
  }

  /* ---- products ---- */
  function categoryName(p) { var c = M.get('categories', p.categoryID); return c ? c.categoryName : ''; }
  function productsList(m, query) {
    listView({
      key: 'products', nav: 'products', title: 'Products', query: query,
      buttons: '<a class="button primary" href="#/products/new">New product</a>',
      rows: M.all('products'), href: function (p) { return '#/products/' + p.id; },
      text: function (p) { return p.productName + ' ' + categoryName(p); },
      filters: [
        { id: 'reorder', label: 'To reorder', test: M.needsReorder },
        { id: 'discontinued', label: 'Discontinued', test: function (p) { return !!p.discontinued; } },
      ],
      cols: [
        { label: 'Product', cls: 'primary', value: function (p) { return p.productName; } },
        { label: 'Category', nolabel: true, value: categoryName },
        { label: 'Pack', cls: 'skip', value: function (p) { return p.quantityPerUnit; } },
        { label: 'Price', num: true, cls: 'side', value: function (p) { return p.unitPrice; }, html: function (p) { return money(p.unitPrice); } },
        { label: 'In stock', num: true, value: function (p) { return p.unitsInStock; } },
        { label: 'Status', nolabel: true, value: function (p) { return p.discontinued ? 2 : M.needsReorder(p) ? 0 : 1; }, html: stockPill },
      ],
    });
  }
  function productDetail(m) {
    var p = M.get('products', +m[1]);
    if (!p) return missing('products', 'Products', 'That product');
    var s = M.get('suppliers', p.supplierID), units = 0, sales = 0, found = [];
    M.all('orders').forEach(function (o) {
      M.linesOf(o.id).forEach(function (l) {
        if (l.productID !== p.id) return;
        units += l.quantity; sales += M.lineTotal(l); found.push({ order: o, line: l });
      });
    });
    found.sort(function (a, b) { return b.order.id - a.order.id; });
    show('products', p.productName,
      head(esc(p.productName) + ' ' + stockPill(p), '<a class="button" href="#/products/' + p.id + '/edit">Edit</a>', link('#/products', 'Products')) +
      '<div class="stack"><div class="tiles">' + tile('In stock', num(p.unitsInStock), 'Reorder at ' + num(p.reorderLevel), null, M.needsReorder(p) ? 'alert' : '') +
      tile('On order', num(p.unitsOnOrder)) + tile('Units sold', num(units)) + tile('Sales', money(sales)) + '</div>' +
      '<div class="panel">' + fields([
        ['Category', esc(categoryName(p))],
        ['Supplier', s ? link('#/suppliers/' + s.id, s.companyName) : ''],
        ['Pack', esc(p.quantityPerUnit)],
        ['Price', money(p.unitPrice)],
      ]) + '</div>' +
      '<div class="panel"><h2>Latest orders</h2>' + table([
        { label: 'Order', cls: 'primary', value: function (r) { return r.order.id; } },
        { label: 'Customer', nolabel: true, value: function (r) { return customerName(r.order.customerID); }, html: function (r) { return link('#/customers/' + r.order.customerID, customerName(r.order.customerID)); } },
        { label: 'Ordered', value: function (r) { return r.order.orderDate; }, html: function (r) { return date(r.order.orderDate); } },
        { label: 'Quantity', num: true, cls: 'side', value: function (r) { return r.line.quantity; } },
        { label: 'Amount', num: true, value: function (r) { return M.lineTotal(r.line); }, html: function (r) { return money(M.lineTotal(r.line)); } },
      ], found.slice(0, 12), function (r) { return '#/orders/' + r.order.id; }, 'No order includes this product.') + '</div></div>');
  }
  function productForm(m) {
    var p = m[1] ? M.get('products', +m[1]) : null;
    if (m[1] && !p) return missing('products', 'Products', 'That product');
    simpleForm({
      nav: 'products', title: p ? 'Edit ' + p.productName : 'New product', crumb: link('#/products', 'Products'),
      back: p ? '#/products/' + p.id : '#/products',
      values: p || { unitPrice: 0, unitsInStock: 0, unitsOnOrder: 0, reorderLevel: 0 },
      fields: [
        { name: 'productName', label: 'Product', required: true },
        { name: 'categoryID', label: 'Category', type: 'select', numeric: true, options: options('categories', function (c) { return c.categoryName; }) },
        { name: 'supplierID', label: 'Supplier', type: 'select', numeric: true, options: options('suppliers', function (s) { return s.companyName; }) },
        { name: 'quantityPerUnit', label: 'Pack' },
        { name: 'unitPrice', label: 'Price', type: 'number', required: true, attrs: 'min="0" step="0.01"' },
        { name: 'unitsInStock', label: 'In stock', type: 'number', required: true, attrs: 'min="0" step="1"' },
        { name: 'unitsOnOrder', label: 'On order', type: 'number', required: true, attrs: 'min="0" step="1"' },
        { name: 'reorderLevel', label: 'Reorder at', type: 'number', required: true, attrs: 'min="0" step="1"' },
        { name: 'discontinued', label: 'Discontinued', type: 'checkbox' },
      ],
      save: function (v) { if (p) v.id = p.id; return '#/products/' + M.saveProduct(v); },
    });
  }

  /* ---- suppliers and staff ---- */
  function suppliersList(m, query) {
    var counts = {};
    M.all('products').forEach(function (p) { counts[p.supplierID] = (counts[p.supplierID] || 0) + 1; });
    listView({
      key: 'suppliers', nav: 'suppliers', title: 'Suppliers', query: query,
      rows: M.all('suppliers'), href: function (s) { return '#/suppliers/' + s.id; },
      text: function (s) { return [s.companyName, s.contactName, s.city, s.country].join(' '); },
      cols: [
        { label: 'Company', cls: 'primary', value: function (s) { return s.companyName; } },
        { label: 'Contact', nolabel: true, value: function (s) { return s.contactName; } },
        { label: 'Location', nolabel: true, value: place },
        { label: 'Phone', cls: 'skip', value: function (s) { return s.phone; } },
        { label: 'Products', num: true, cls: 'side', value: function (s) { return counts[s.id] || 0; } },
      ],
    });
  }
  function supplierDetail(m) {
    var s = M.get('suppliers', +m[1]);
    if (!s) return missing('suppliers', 'Suppliers', 'That supplier');
    var products = M.all('products').filter(function (p) { return p.supplierID === s.id; });
    show('suppliers', s.companyName, head(esc(s.companyName), '', link('#/suppliers', 'Suppliers')) +
      '<div class="stack"><div class="panel">' + fields([
        ['Contact', esc(s.contactName) + (s.contactTitle ? '<br><span class="muted">' + esc(s.contactTitle) + '</span>' : '')],
        ['Phone', s.phone ? '<a href="tel:' + esc(s.phone) + '">' + esc(s.phone) + '</a>' : ''],
        ['Address', address(s)],
      ]) + '</div><div class="panel"><h2>Products</h2>' + table([
        { label: 'Product', cls: 'primary', value: function (p) { return p.productName; } },
        { label: 'Category', nolabel: true, value: categoryName },
        { label: 'Price', num: true, cls: 'side', value: function (p) { return p.unitPrice; }, html: function (p) { return money(p.unitPrice); } },
        { label: 'In stock', num: true, value: function (p) { return p.unitsInStock; } },
        { label: 'Status', nolabel: true, value: function (p) { return p.discontinued; }, html: stockPill },
      ], products, function (p) { return '#/products/' + p.id; }) + '</div></div>');
  }
  function staffList(m, query) {
    var stats = {};
    M.reports.byStaff(null).forEach(function (e) { stats[e.key] = e; });
    function stat(e, k) { return stats[e.id] ? stats[e.id][k] : 0; }
    listView({
      key: 'staff', nav: 'staff', title: 'Staff', query: query,
      rows: M.all('employees'), href: function (e) { return '#/staff/' + e.id; },
      text: function (e) { return [M.staffName(e), e.title, e.city, e.country].join(' '); },
      cols: [
        { label: 'Name', cls: 'primary', value: M.staffName },
        { label: 'Job title', nolabel: true, value: function (e) { return e.title; } },
        { label: 'Office', cls: 'skip', value: place },
        { label: 'Joined', cls: 'skip', value: function (e) { return e.hireDate; }, html: function (e) { return date(e.hireDate); } },
        { label: 'Orders', num: true, value: function (e) { return stat(e, 'orders'); } },
        { label: 'Sales', num: true, cls: 'side', value: function (e) { return stat(e, 'sales'); }, html: function (e) { return money(stat(e, 'sales')); } },
      ],
    });
  }
  function staffDetail(m) {
    var e = M.get('employees', +m[1]);
    if (!e) return missing('staff', 'Staff', 'That member of staff');
    var boss = M.get('employees', e.reportsTo);
    var orders = M.all('orders').filter(function (o) { return o.employeeID === e.id; }).sort(function (a, b) { return b.id - a.id; });
    var sales = orders.reduce(function (s, o) { return s + M.subtotal(o.id); }, 0);
    show('staff', M.staffName(e), head(esc(M.staffName(e)), '', link('#/staff', 'Staff')) +
      '<div class="stack"><div class="tiles">' + tile('Orders taken', num(orders.length)) + tile('Sales', money(sales)) + '</div>' +
      '<div class="panel">' + fields([
        ['Job title', esc(e.title)],
        ['Office', esc(place(e))],
        ['Extension', esc(e.extension)],
        ['Joined', date(e.hireDate)],
        ['Reports to', boss ? link('#/staff/' + boss.id, M.staffName(boss)) : ''],
      ]) + (e.notes ? '<p style="margin:14px 0 0">' + esc(e.notes) + '</p>' : '') + '</div>' +
      '<div class="panel"><h2>Latest orders</h2>' + table(orderCols, orders.slice(0, 15), orderHref, 'No orders yet.') + '</div></div>');
  }

  /* ---- reports ---- */
  function productName(id) { var p = M.get('products', id); return p ? p.productName : 'Product ' + id; }
  var salesCol = { label: 'Sales', num: true, cls: 'side', value: function (r) { return r.sales; }, html: function (r) { return money(r.sales); } };
  var ordersCol = { label: 'Orders', num: true, value: function (r) { return r.orders; } };
  var unitsCol = { label: 'Units', num: true, value: function (r) { return r.units; } };
  function priceCols() {
    return [
      { label: 'Product', cls: 'primary', value: function (p) { return p.productName; } },
      { label: 'Category', nolabel: true, value: categoryName },
      { label: 'Price', num: true, cls: 'side', value: function (p) { return p.unitPrice; }, html: function (p) { return money(p.unitPrice); } },
    ];
  }
  var REPORTS = [
    { id: 'sales-by-category', title: 'Sales by category', was: 'the query “Sales by Category”', yearly: true,
      about: 'What each of the eight product categories sold.',
      build: function (y) {
        return { rows: M.reports.byCategory(y), bar: 'sales',
          cols: [{ label: 'Category', cls: 'primary', value: function (r) { var c = M.get('categories', r.key); return c ? c.categoryName : ''; } }, unitsCol, salesCol] };
      } },
    { id: 'sales-by-period', title: 'Sales by period', was: 'the query “Summary of Sales by Quarter”',
      about: 'Orders and sales by week, month, quarter or year. Weeks start on Monday.',
      build: function () {
        return { rows: M.reports.period(reportPeriod), bar: 'sales', href: periodHref,
          cols: [{ label: 'Period', cls: 'primary', value: periodLabel }, ordersCol, salesCol] };
      } },
    { id: 'sales-by-staff', title: 'Sales by staff member', was: 'the report “Employee Sales by Country”', yearly: true,
      about: 'Orders taken and sales made by each member of staff.',
      build: function (y) {
        return { rows: M.reports.byStaff(y), bar: 'sales', href: function (r) { return '#/staff/' + r.key; },
          cols: [{ label: 'Name', cls: 'primary', value: function (r) { return M.staffName(M.get('employees', r.key)); } },
            { label: 'Office', nolabel: true, value: function (r) { var e = M.get('employees', r.key); return e ? place(e) : ''; } }, ordersCol, salesCol] };
      } },
    { id: 'top-customers', title: 'Sales by customer', was: 'the query “Sales Totals by Amount”', yearly: true,
      about: 'Every customer, ranked by what they bought.',
      build: function (y) {
        return { rows: M.reports.byCustomer(y), bar: 'sales', href: function (r) { return '#/customers/' + r.key; },
          cols: [{ label: 'Customer', cls: 'primary', value: function (r) { return customerName(r.key); } },
            { label: 'Country', nolabel: true, value: function (r) { var c = M.get('customers', r.key); return c ? c.country : ''; } }, ordersCol, salesCol] };
      } },
    { id: 'sales-by-country', title: 'Sales by country', was: null, yearly: true,
      about: 'Where the orders ship to. Access had no report for this.',
      build: function (y) {
        return { rows: M.reports.byCountry(y), bar: 'sales',
          cols: [{ label: 'Country', cls: 'primary', value: function (r) { return r.key; } }, ordersCol, salesCol] };
      } },
    { id: 'product-sales', title: 'Sales by product', was: 'the query “Product Sales for 1997”, for any year', yearly: true,
      about: 'Units and sales for every product.',
      build: function (y) {
        return { rows: M.reports.byProduct(y), bar: 'sales', href: function (r) { return '#/products/' + r.key; },
          cols: [{ label: 'Product', cls: 'primary', value: function (r) { return productName(r.key); } }, unitsCol, salesCol] };
      } },
    { id: 'most-expensive', title: 'Ten most expensive products', was: 'the query “Ten Most Expensive Products”',
      about: 'The ten highest prices in the catalogue.',
      build: function () {
        return { rows: M.reports.mostExpensive(10), bar: 'unitPrice', href: function (p) { return '#/products/' + p.id; }, cols: priceCols() };
      } },
    { id: 'above-average', title: 'Products above the average price', was: 'the query “Products Above Average Price”',
      about: 'Every product that costs more than the average.',
      build: function () {
        var r = M.reports.aboveAverage();
        return { rows: r.rows, note: 'The average price is ' + money(r.mean) + '.', href: function (p) { return '#/products/' + p.id; }, cols: priceCols() };
      } },
    { id: 'reorder', title: 'Products to reorder', was: null,
      about: 'Stock at or below its reorder level. Access had no report for this.',
      build: function () {
        return { rows: M.reports.toReorder(), href: function (p) { return '#/products/' + p.id; },
          cols: [{ label: 'Product', cls: 'primary', value: function (p) { return p.productName; } },
            { label: 'Supplier', nolabel: true, value: function (p) { var s = M.get('suppliers', p.supplierID); return s ? s.companyName : ''; }, html: function (p) { var s = M.get('suppliers', p.supplierID); return s ? link('#/suppliers/' + s.id, s.companyName) : ''; } },
            { label: 'In stock', num: true, cls: 'side', value: function (p) { return p.unitsInStock; } },
            { label: 'Reorder at', num: true, value: function (p) { return p.reorderLevel; } },
            { label: 'On order', num: true, value: function (p) { return p.unitsOnOrder; } }] };
      } },
  ];
  function reportsIndex() {
    show('reports', 'Reports', head('Reports') + '<div class="cards">' + REPORTS.map(function (r) {
      return '<a class="card" href="#/reports/' + r.id + '"><h2>' + esc(r.title) + '</h2><p>' + esc(r.about) + '</p></a>';
    }).join('') + '</div>');
  }
  function periodHref(r) { return '#/orders?from=' + r.from + '&to=' + r.to; }
  function periodLabel(r) {
    if (reportPeriod === 'week') return 'Week of ' + date(r.from);
    if (reportPeriod === 'year') return r.from.slice(0, 4);
    if (reportPeriod === 'quarter') return r.from.slice(0, 4) + ' Q' + Math.ceil(+r.from.slice(5, 7) / 3);
    return monthName(r.from.slice(0, 7));
  }
  function hbars(rows, labelCol, key, href) {
    var top = rows.slice(0, 12), max = Math.max.apply(null, top.map(function (r) { return r[key]; }).concat([1]));
    return '<div class="hbars">' + top.map(function (r) {
      var label = labelCol.value(r), tip = esc(label + '|' + money(r[key]) + (r.orders != null ? ' from ' + num(r.orders) + ' orders' : ''));
      return '<span class="name">' + (href ? link(href(r), label) : esc(label)) + '</span>' +
        (href ? '<a class="track" href="' + href(r) + '" aria-label="' + esc(label + ', ' + money(r[key]) + ', see orders') + '"' : '<span class="track" tabindex="0"') +
        ' data-tip="' + tip + '"><i style="width:' + (100 * r[key] / max).toFixed(2) + '%"></i>' + (href ? '</a>' : '</span>') +
        '<span class="num">' + money(r[key]) + '</span>';
    }).join('') + '</div>';
  }
  function reportView(m, query) {
    if (m[1] === 'sales-by-quarter') { location.hash = '#/reports/sales-by-period?period=quarter'; return; }
    reportPeriod = /^(week|month|quarter|year)$/.test(query.period) ? query.period : 'month';
    var def = REPORTS.filter(function (r) { return r.id === m[1]; })[0];
    if (!def) return missing('reports', 'Reports', 'That report');
    var years = M.years();
    if (def.yearly && reportYear && years.indexOf(reportYear) < 0) reportYear = null;
    var year = def.yearly ? reportYear : null, r = def.build(year);
    var total = r.rows.length && r.rows[0].sales != null ? r.rows.reduce(function (s, x) { return s + x.sales; }, 0) : null;
    show('reports', def.title,
      head(esc(def.title), '<span class="no-print" style="display:contents"><button type="button" data-action="csv">Download as CSV</button>' +
        '<button type="button" data-action="print">Print</button></span>', link('#/reports', 'Reports')) +
      '<p class="sub">' + esc(def.about) + (def.was ? ' In Access this was ' + esc(def.was) + '.' : '') + (r.note ? ' ' + esc(r.note) : '') + '</p>' +
      (def.id === 'sales-by-period' ? '<div class="toolbar no-print"><div class="chips" role="group" aria-label="Period">' + ['week', 'month', 'quarter', 'year'].map(function (p) {
        return '<button type="button" data-action="period" data-period="' + p + '" aria-pressed="' + (p === reportPeriod) + '">' + p.charAt(0).toUpperCase() + p.slice(1) + '</button>';
      }).join('') + '</div><span class="count">Total ' + money(total) + '</span></div><p class="print-only">' + esc(reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)) + '</p>' : '') +
      (def.yearly ? '<div class="toolbar no-print"><div class="chips" role="group" aria-label="Year">' + [null].concat(years).map(function (y) {
        return '<button type="button" data-action="year" data-year="' + (y || '') + '" aria-pressed="' + (y === year) + '">' + (y || 'All years') + '</button>';
      }).join('') + '</div><span class="count">' + (total != null ? 'Total ' + money(total) : '') + '</span></div>' : '') +
      '<div class="stack">' + (r.bar && r.rows.length ? '<div class="panel">' + hbars(r.rows, r.cols[0], r.bar, def.id === 'sales-by-period' ? r.href : null) + '</div>' : '') +
      table(r.cols, r.rows, r.href, 'No orders in this period.') + '</div>');
    actions.period = function (el) { location.hash = '#/reports/sales-by-period?period=' + el.dataset.period; };
    actions.year = function (el) { reportYear = el.dataset.year || null; route(); };
    actions.print = function () { window.print(); };
    actions.csv = function () {
      var out = [r.cols.map(function (c) { return c.label; })].concat(r.rows.map(function (row) {
        return r.cols.map(function (c) { return c.value(row); });
      }));
      download(def.id + (def.id === 'sales-by-period' ? '-' + reportPeriod : '') + (year ? '-' + year : '') + '.csv', out);
    };
  }
  function download(name, rows) {
    var csv = rows.map(function (r) {
      return r.map(function (v) { v = v == null ? '' : String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---- more, about, missing ---- */
  function more() {
    show('more', 'More', head('More') + '<div class="cards">' + [
      ['#/suppliers', 'Suppliers', 'The 29 firms that Northwind buys from.'],
      ['#/staff', 'Staff', 'The nine people who take the orders.'],
      ['#/reports', 'Reports', 'Sales by category, period, customer and more.'],
      ['#/about', 'About this rebuild', 'What moved across from Access, and who built it.'],
    ].map(function (c) { return '<a class="card" href="' + c[0] + '"><h2>' + c[1] + '</h2><p>' + c[2] + '</p></a>'; }).join('') + '</div>');
  }
  function about() {
    var n = M.changeCount(), someOrder = M.all('orders').sort(function (a, b) { return b.id - a.id; })[0];
    var moved = [
      ['Eight linked tables hold the data.', 'The same tables hold the same data.'],
      ['A form shows one record at a time, on a PC.', 'Each screen fits a phone, a tablet and a monitor.'],
      ['Saved queries answer set questions.', 'One search box looks across orders, customers, products, suppliers and staff.'],
      ['Reports print on paper.', 'Reports show on screen, download as a spreadsheet file and print.'],
      ['The Invoices query feeds a printed invoice.', 'Every order has an invoice that prints or saves as a PDF.'],
      ['Each PC needs Access installed.', 'Any browser opens it from a web address.'],
    ];
    show('about', 'About this rebuild', head('About this rebuild') + '<div class="stack prose">' +
      '<div class="panel"><p>Northwind Traders is the sample database that Microsoft shipped with Access. Anyone who has built in Access has opened it. ' +
      'This is the same database, rebuilt as a web app: the same eight tables, the same 830 orders and the same reports.</p>' +
      '<p>It runs in a browser. It works on a phone, a Mac or a PC, with no Access licence and nothing to install.</p></div>' +
      '<div class="panel"><h2>What moved across</h2><div class="tablewrap"><table><thead><tr><th>In Access</th><th>In the web app</th></tr></thead><tbody>' +
      moved.map(function (r) { return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</tbody></table></div></div>' +
      '<div class="panel"><h2>Things to try</h2><ul>' +
      '<li>' + link('#/orders/new', 'Add an order') + '. The form warns you when stock runs short.</li>' +
      '<li>' + link('#/orders?filter=open', 'Find an order to ship') + ' and mark it as shipped.</li>' +
      (someOrder ? '<li>' + link('#/orders/' + someOrder.id + '/invoice', 'Print an invoice') + ', or save it as a PDF.</li>' : '') +
      '<li>' + link('#/reports/sales-by-category', 'Open a report') + ' and download it as a spreadsheet file.</li>' +
      '<li>Open this page on your phone.</li></ul></div>' +
      '<div class="panel"><h2>What a firm’s own app adds</h2><p>This example keeps your changes in your own browser, so each visitor has a private copy. ' +
      'A firm’s app runs on a hosted database, and adds:</p><ul>' +
      '<li>A sign-in for each member of staff, with the access that their job needs</li>' +
      '<li>Daily backups, and a record of who changed what</li>' +
      '<li>The firm’s own data, moved across from the old system and checked against it</li>' +
      '<li>Code and data that the firm owns, which any developer can maintain</li></ul></div>' +
      '<div class="panel"><h2>Who built it</h2><p>I’m David Ryan. I spent ten years building and running FileMaker business systems. ' +
      'I now rebuild old FileMaker, Access and Excel systems as web apps that the firm owns.</p>' +
      '<p>You send me the structure of the old system, with no business records in it. I send back a written plan and a fixed price.</p>' +
      '<p>Email <a href="mailto:david@drbuild.uk">david@drbuild.uk</a>, or see my other work at <a href="../../">drbuild.uk</a>.</p></div>' +
      '<div class="panel"><h2>The sample data</h2><p>The data is Microsoft’s Northwind sample, copyright Microsoft Corporation, used under the ' +
      '<a href="NOTICE.txt">MIT licence</a>. Two things differ from the source. Every order date is moved forward by a whole number of weeks, ' +
      'so the newest order always falls in the past week. The pictures and the staff’s home details are left out.</p>' +
      '<p>' + (n ? 'You have changed ' + n + ' record' + (n === 1 ? '' : 's') + ' in this browser.' : 'You have changed nothing yet.') + '</p>' +
      '<div class="actions"><button type="button" data-action="reset"' + (n ? '' : ' disabled') + '>Reset the sample data</button></div></div></div>');
    actions.reset = function () {
      if (confirm('Remove your changes and go back to the original sample data?')) { M.reset(); listState = {}; route(); }
    };
  }
  function missing(nav, listTitle, what) {
    show(nav, 'Not found', head('Not found') + '<div class="panel"><p>' + esc(what) + ' is not in the database.</p>' +
      '<a class="button" href="#/' + (nav === 'home' ? '' : nav) + '">' + esc(listTitle) + '</a></div>');
  }

  /* ---- routing ---- */
  var ROUTES = [
    [/^$/, home],
    [/^orders$/, ordersList], [/^orders\/new$/, orderForm], [/^orders\/(\d+)$/, orderDetail],
    [/^orders\/(\d+)\/edit$/, orderForm], [/^orders\/(\d+)\/invoice$/, invoice],
    [/^customers$/, customersList], [/^customers\/new$/, customerForm], [/^customers\/([^/]+)$/, customerDetail], [/^customers\/([^/]+)\/edit$/, customerForm],
    [/^products$/, productsList], [/^products\/new$/, productForm], [/^products\/(\d+)$/, productDetail], [/^products\/(\d+)\/edit$/, productForm],
    [/^suppliers$/, suppliersList], [/^suppliers\/(\d+)$/, supplierDetail],
    [/^staff$/, staffList], [/^staff\/(\d+)$/, staffDetail],
    [/^reports$/, reportsIndex], [/^reports\/([a-z-]+)$/, reportView],
    [/^search$/, searchView],
    [/^more$/, more], [/^about$/, about],
  ];
  function route() {
    var parts = location.hash.replace(/^#\/?/, '').split('?'), path = parts[0].replace(/\/$/, ''), query = {};
    (parts[1] || '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
    });
    for (var i = 0; i < ROUTES.length; i++) {
      var m = path.match(ROUTES[i][0]);
      if (m) {
        for (var j = 1; j < m.length; j++) m[j] = decodeURIComponent(m[j]);
        return ROUTES[i][1](m, query);
      }
    }
    missing('home', 'Home', 'That page');
  }

  /* ---- clicks, the search box, the tooltip, full screen ---- */
  main.addEventListener('click', function (e) {
    var act = e.target.closest('[data-action]');
    if (act && actions[act.dataset.action]) { actions[act.dataset.action](act, e); return; }
    if (e.target.closest('a, button, input, select, textarea, label')) return;
    var tr = e.target.closest('tr[data-href]');
    if (tr && matchMedia('(max-width: 760px)').matches && !window.getSelection().toString()) location.hash = tr.dataset.href;
  });

  var SEARCH_TYPES = ['Order', 'Customer', 'Product', 'Supplier', 'Staff'];
  function searchGroups(q, fullType) {
    var hits = M.search(q);
    if (!hits.length) return '<div class="empty">Nothing matches “' + esc(q) + '”.</div>';
    return SEARCH_TYPES.filter(function (type) { return !fullType || fullType === type; }).map(function (type) {
      var group = hits.filter(function (h) { return h.type === type; });
      if (!group.length) return '';
      var all = '#/search?q=' + encodeURIComponent(q) + '&type=' + type;
      return '<section class="search-group"><h2>' + (type === 'Staff' ? 'Staff' : type + 's') + ' (' + group.length + ')' +
        (!fullType ? link(all, 'Show all') : '') + '</h2>' + group.slice(0, fullType ? group.length : 3).map(function (h) {
          return '<a class="search-hit" href="' + h.href + '"><span>' + esc(h.label) + '</span><small>' + esc(h.sub) + '</small></a>';
        }).join('') + '</section>';
    }).join('');
  }
  function searchView(m, query) {
    var type = SEARCH_TYPES.indexOf(query.type) >= 0 ? query.type : null;
    show('', 'Search', head('Search results', '', link('#/', 'Home')) + '<p>Results for “' + esc(query.q || '') + '”</p>' +
      '<div class="panel search-results">' + searchGroups(query.q || '', type) + '</div>');
  }
  var find = $('#find'), found = $('#found');
  function closeFound() { found.hidden = true; found.innerHTML = ''; }
  find.addEventListener('input', function () {
    var q = find.value.trim();
    if (!q) return closeFound();
    found.innerHTML = searchGroups(q);
    var first = $('.search-hit', found);
    if (first) first.classList.add('on');
    found.hidden = false;
  });
  find.addEventListener('keydown', function (e) {
    var items = $$('a', found), at = items.indexOf($('a.on', found));
    if (e.key === 'Escape') { closeFound(); return; }
    if (!items.length) return;
    if (e.key === 'Enter') { e.preventDefault(); location.hash = items[Math.max(at, 0)].getAttribute('href'); find.blur(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      var next = (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items.forEach(function (a, i) { a.classList.toggle('on', i === next); });
      items[next].scrollIntoView({ block: 'nearest' });
    }
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.search')) closeFound(); });

  function hideTip() { tip.hidden = true; }
  function showTip(el) {
    var parts = el.dataset.tip.split('|'), r = el.getBoundingClientRect();
    tip.innerHTML = '<b>' + esc(parts[0]) + '</b>' + esc(parts[1] || '');
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight, bar = $('i', el), top = (bar ? bar.getBoundingClientRect().top : r.top) - h - 8;
    tip.style.left = Math.max(6, Math.min(document.documentElement.clientWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = Math.max(6, top) + 'px';
  }
  ['mouseover', 'focusin'].forEach(function (type) {
    main.addEventListener(type, function (e) { var el = e.target.closest('[data-tip]'); if (el) showTip(el); });
  });
  ['mouseout', 'focusout'].forEach(function (type) {
    main.addEventListener(type, function (e) { if (e.target.closest('[data-tip]')) hideTip(); });
  });
  main.addEventListener('scroll', function () {
    var focused = document.activeElement;
    if (main.contains(focused) && focused.matches('[data-tip]')) showTip(focused); else hideTip();
  });

  var fs = $('#fullscreen'), root = document.documentElement;
  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
    fs.hidden = false;
    fs.addEventListener('click', function () {
      var on = document.fullscreenElement || document.webkitFullscreenElement, p;
      if (on) p = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      if (p && p.catch) p.catch(function () {});
      fs.blur();
    });
  }
  if (window.Theme) Theme.wireThemeToggle();

  window.addEventListener('hashchange', function () { closeFound(); find.value = ''; route(); });
  route();
})();
