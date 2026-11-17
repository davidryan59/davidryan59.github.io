/* The Northwind data model: the tables, the sums and the reports, with no
   page code, so it runs in the browser and in Node (tools/northwind/test.js).

   The seed in data.js never changes. Every change a visitor makes is kept as
   a changed row in `storage` (the browser's localStorage) and laid over the
   seed on the next visit.

   Dates. The sample's orders run from July 1996 to May 1998. The model moves
   every order date forward by a whole number of weeks, so the last order
   falls in the week before `today` and each date keeps its weekday. Stored
   changes hold sample dates, so they stay right as the weeks pass. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NorthwindModel = factory();
})(this, function () {
  'use strict';

  var KEY = 'northwind.changes.v1';
  var PK = { categories: 'categoryID', customers: 'customerID', employees: 'employeeID', shippers: 'shipperID',
             suppliers: 'supplierID', orders: 'orderID', products: 'productID' };
  var ORDER_DATES = ['orderDate', 'requiredDate', 'shippedDate'];
  var EDITABLE = ['orders', 'customers', 'products'];

  function days(s) { var p = s.split('-'); return Date.UTC(+p[0], p[1] - 1, +p[2]) / 864e5; }
  function iso(d) { return new Date(d * 864e5).toISOString().slice(0, 10); }
  function addDays(s, n) { return s ? iso(days(s) + n) : s; }
  function round2(x) { return Math.round(x * 100 + (x < 0 ? -1e-7 : 1e-7)) / 100; }
  function copy(o) { var c = {}; for (var k in o) c[k] = o[k]; return c; }

  function create(seed, options) {
    options = options || {};
    var storage = options.storage || null;
    var db = {}, lines = new Map(), subtotals = new Map();
    var changes = { rows: { orders: {}, customers: {}, products: {} }, lines: {} };

    var lastSeedOrder = seed.orders.rows.reduce(function (a, r) { return r[3] > a ? r[3] : a; }, '');
    var today = options.today || lastSeedOrder;
    var shift = Math.max(0, Math.floor((days(today) - days(lastSeedOrder)) / 7)) * 7;

    function shiftOrder(o, n) { ORDER_DATES.forEach(function (k) { o[k] = addDays(o[k], n); }); return o; }

    function load() {
      lines = new Map(); subtotals = new Map();
      Object.keys(PK).forEach(function (name) {
        var t = seed[name], map = new Map();
        t.rows.forEach(function (r) {
          var o = {};
          t.cols.forEach(function (c, i) { if (c === PK[name]) o.id = r[i]; else o[c] = r[i]; });
          if (name === 'orders') shiftOrder(o, shift);
          map.set(o.id, o);
        });
        db[name] = map;
      });
      seed.lines.rows.forEach(function (r) {
        if (!lines.has(r[0])) lines.set(r[0], []);
        lines.get(r[0]).push({ productID: r[1], unitPrice: r[2], quantity: r[3], discount: r[4] });
      });
      EDITABLE.forEach(function (name) {
        var rows = changes.rows[name];
        Object.keys(rows).forEach(function (key) {
          var id = name === 'customers' ? key : +key, row = rows[key];
          if (row === null) { db[name].delete(id); if (name === 'orders') lines.delete(id); return; }
          row = copy(row); row.id = id;
          db[name].set(id, name === 'orders' ? shiftOrder(row, shift) : row);
        });
      });
      Object.keys(changes.lines).forEach(function (key) {
        if (db.orders.has(+key)) lines.set(+key, changes.lines[key].map(copy));
      });
    }

    function read() {
      if (!storage) return;
      try {
        var saved = JSON.parse(storage.getItem(KEY) || 'null');
        if (saved && saved.rows && saved.lines) {
          EDITABLE.forEach(function (n) { changes.rows[n] = saved.rows[n] || {}; });
          changes.lines = saved.lines;
        }
      } catch (e) {}
    }
    function write() {
      if (!storage) return;
      try { storage.setItem(KEY, JSON.stringify(changes)); } catch (e) {}
    }
    function keep(name, id) {
      var row = db[name].get(id);
      if (!row) { changes.rows[name][id] = null; if (name === 'orders') delete changes.lines[id]; }
      else {
        row = copy(row); delete row.id;
        changes.rows[name][id] = name === 'orders' ? shiftOrder(row, -shift) : row;
        if (name === 'orders') changes.lines[id] = (lines.get(id) || []).map(copy);
      }
      write();
    }

    read(); load();

    /* ---- reading ---- */
    function all(name) { return Array.from(db[name].values()); }
    function get(name, id) { return db[name].get(id) || null; }
    function linesOf(orderId) { return lines.get(orderId) || []; }
    function lineTotal(l) { return round2(l.unitPrice * l.quantity * (1 - l.discount)); }
    function subtotal(orderId) {
      if (!subtotals.has(orderId)) {
        subtotals.set(orderId, round2(linesOf(orderId).reduce(function (s, l) { return s + lineTotal(l); }, 0)));
      }
      return subtotals.get(orderId);
    }
    function total(order) { return round2(subtotal(order.id) + (order.freight || 0)); }
    function status(order) {
      if (order.shippedDate) return 'shipped';
      return order.requiredDate && order.requiredDate < today ? 'late' : 'open';
    }
    function staffName(e) { return e ? e.firstName + ' ' + e.lastName : ''; }
    function needsReorder(p) { return !p.discontinued && p.unitsInStock <= p.reorderLevel; }

    /* ---- writing ---- */
    function nextId(name, floor) {
      var max = floor || 0;
      db[name].forEach(function (v, id) { if (id > max) max = id; });
      return max + 1;
    }
    function customerCode(name) {
      var base = (name.toUpperCase().replace(/[^A-Z]/g, '') + 'XXXXX').slice(0, 5), code = base, n = 1;
      while (db.customers.has(code)) code = base.slice(0, 5 - String(++n).length) + n;
      return code;
    }
    function saveOrder(order, orderLines) {
      order = copy(order);
      if (order.id == null) order.id = nextId('orders', 11077);
      db.orders.set(order.id, order);
      lines.set(order.id, orderLines.map(copy));
      subtotals.delete(order.id);
      keep('orders', order.id);
      return order.id;
    }
    function shipOrder(id) {
      var o = db.orders.get(id);
      if (!o || o.shippedDate) return;
      o.shippedDate = today;
      keep('orders', id);
    }
    function deleteOrder(id) {
      db.orders.delete(id); lines.delete(id); subtotals.delete(id);
      keep('orders', id);
    }
    function saveCustomer(c) {
      c = copy(c);
      if (c.id == null) c.id = customerCode(c.companyName || '');
      db.customers.set(c.id, c);
      keep('customers', c.id);
      return c.id;
    }
    function saveProduct(p) {
      p = copy(p);
      if (p.id == null) p.id = nextId('products');
      db.products.set(p.id, p);
      keep('products', p.id);
      return p.id;
    }
    function changeCount() {
      return EDITABLE.reduce(function (n, name) { return n + Object.keys(changes.rows[name]).length; }, 0);
    }
    function reset() {
      changes = { rows: { orders: {}, customers: {}, products: {} }, lines: {} };
      if (storage) { try { storage.removeItem(KEY); } catch (e) {} }
      load();
    }

    /* ---- reports ---- */
    function inYear(o, year) { return !year || o.orderDate.slice(0, 4) === String(year); }
    function years() {
      var set = {};
      db.orders.forEach(function (o) { set[o.orderDate.slice(0, 4)] = 1; });
      return Object.keys(set).sort();
    }
    /* Sum sales by a key of the order: { key: { sales, orders } }. */
    function byOrder(year, keyOf) {
      var out = new Map();
      db.orders.forEach(function (o) {
        if (!inYear(o, year)) return;
        var k = keyOf(o); if (k == null) return;
        var e = out.get(k); if (!e) out.set(k, e = { key: k, sales: 0, orders: 0 });
        e.sales += subtotal(o.id); e.orders++;
      });
      out.forEach(function (e) { e.sales = round2(e.sales); });
      return Array.from(out.values());
    }
    /* Sum sales by a key of the order line: { key: { sales, units } }. */
    function byLine(year, keyOf) {
      var out = new Map();
      db.orders.forEach(function (o) {
        if (!inYear(o, year)) return;
        linesOf(o.id).forEach(function (l) {
          var k = keyOf(l, o); if (k == null) return;
          var e = out.get(k); if (!e) out.set(k, e = { key: k, sales: 0, units: 0 });
          e.sales += lineTotal(l); e.units += l.quantity;
        });
      });
      out.forEach(function (e) { e.sales = round2(e.sales); });
      return Array.from(out.values());
    }
    function desc(a, b) { return b.sales - a.sales; }
    var reports = {
      monthly: function () {
        var got = new Map(byOrder(null, function (o) { return o.orderDate.slice(0, 7); }).map(function (e) { return [e.key, e]; }));
        var keys = Array.from(got.keys()).sort(), out = [];
        if (!keys.length) return out;
        var y = +keys[0].slice(0, 4), m = +keys[0].slice(5), last = keys[keys.length - 1];
        for (;;) {
          var k = y + '-' + (m < 10 ? '0' : '') + m;
          out.push(got.get(k) || { key: k, sales: 0, orders: 0 });
          if (k >= last) break;
          if (++m > 12) { m = 1; y++; }
        }
        return out;
      },
      quarterly: function () {
        return byOrder(null, function (o) { return o.orderDate.slice(0, 4) + ' Q' + Math.ceil(+o.orderDate.slice(5, 7) / 3); })
          .sort(function (a, b) { return a.key < b.key ? -1 : 1; });
      },
      byCategory: function (year) {
        return byLine(year, function (l) { var p = db.products.get(l.productID); return p ? p.categoryID : null; }).sort(desc);
      },
      byProduct: function (year) { return byLine(year, function (l) { return l.productID; }).sort(desc); },
      byCustomer: function (year) { return byOrder(year, function (o) { return o.customerID; }).sort(desc); },
      byStaff: function (year) { return byOrder(year, function (o) { return o.employeeID; }).sort(desc); },
      byCountry: function (year) { return byOrder(year, function (o) { return o.shipCountry; }).sort(desc); },
      mostExpensive: function (n) {
        return all('products').sort(function (a, b) { return b.unitPrice - a.unitPrice; }).slice(0, n);
      },
      aboveAverage: function () {
        var list = all('products'), mean = list.reduce(function (s, p) { return s + p.unitPrice; }, 0) / (list.length || 1);
        return { mean: round2(mean), rows: list.filter(function (p) { return p.unitPrice > mean; }).sort(function (a, b) { return b.unitPrice - a.unitPrice; }) };
      },
      toReorder: function () {
        return all('products').filter(needsReorder).sort(function (a, b) { return a.unitsInStock - b.unitsInStock; });
      },
      headline: function () {
        var t = days(today), now = 0, before = 0, toShip = 0, late = 0;
        db.orders.forEach(function (o) {
          var age = t - days(o.orderDate);
          if (age >= 0 && age < 30) now += subtotal(o.id);
          else if (age >= 30 && age < 60) before += subtotal(o.id);
          var s = status(o);
          if (s !== 'shipped') toShip++;
          if (s === 'late') late++;
        });
        return { sales30: round2(now), salesBefore: round2(before), toShip: toShip, late: late, reorder: reports.toReorder().length };
      },
    };

    /* ---- search across the tables ---- */
    function search(text, limit) {
      var q = text.trim().toLowerCase(), out = [];
      if (!q) return out;
      function has(s) { return s != null && String(s).toLowerCase().indexOf(q) >= 0; }
      if (/^\d+$/.test(q)) {
        db.orders.forEach(function (o) {
          if (String(o.id).indexOf(q) === 0) out.push({ type: 'Order', label: 'Order ' + o.id, sub: o.shipName, href: '#/orders/' + o.id });
        });
      }
      db.customers.forEach(function (c) {
        if (has(c.companyName) || has(c.contactName) || has(c.city) || has(c.id)) {
          out.push({ type: 'Customer', label: c.companyName, sub: [c.contactName, c.city].filter(Boolean).join(', '), href: '#/customers/' + c.id });
        }
      });
      db.products.forEach(function (p) {
        if (has(p.productName)) out.push({ type: 'Product', label: p.productName, sub: p.quantityPerUnit, href: '#/products/' + p.id });
      });
      db.suppliers.forEach(function (s) {
        if (has(s.companyName) || has(s.contactName)) out.push({ type: 'Supplier', label: s.companyName, sub: [s.city, s.country].filter(Boolean).join(', '), href: '#/suppliers/' + s.id });
      });
      db.employees.forEach(function (e) {
        if (has(staffName(e))) out.push({ type: 'Staff', label: staffName(e), sub: e.title, href: '#/staff/' + e.id });
      });
      return out.slice(0, limit || 10);
    }

    return {
      today: today, shiftDays: shift,
      all: all, get: get, linesOf: linesOf, lineTotal: lineTotal, subtotal: subtotal, total: total,
      status: status, staffName: staffName, needsReorder: needsReorder,
      saveOrder: saveOrder, shipOrder: shipOrder, deleteOrder: deleteOrder,
      saveCustomer: saveCustomer, saveProduct: saveProduct,
      changeCount: changeCount, reset: reset,
      years: years, reports: reports, search: search,
    };
  }

  return { create: create, addDays: addDays, round2: round2 };
});
