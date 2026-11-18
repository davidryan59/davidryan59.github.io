/* Tests the Northwind data model against figures known from the sample
   database, and checks that a visitor's changes survive a reload.

   Run from the repo root: node tools/northwind/test.js */
const assert = require('assert');
const seed = require('../../app/northwind/data.js');
const Model = require('../../app/northwind/model.js');

function memory() {
  const data = {};
  return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
}
const weekday = s => new Date(s + 'T00:00:00Z').getUTCDay();
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok   ' + name); }

test('the seed holds the eight tables', () => {
  const m = Model.create(seed);
  assert.deepStrictEqual(['categories', 'customers', 'employees', 'shippers', 'suppliers', 'products', 'orders'].map(t => m.all(t).length),
    [8, 91, 9, 3, 29, 77, 830]);
  assert.strictEqual(m.all('orders').reduce((n, o) => n + m.linesOf(o.id).length, 0), 2155);
});

test('order 10248 comes to 440.00 plus 32.38 freight', () => {
  const m = Model.create(seed), o = m.get('orders', 10248);
  assert.strictEqual(m.subtotal(10248), 440);
  assert.strictEqual(m.total(o), 472.38);
  assert.strictEqual(o.orderDate, '1996-07-04');
});

test('a discount applies to its line: order 10250', () => {
  assert.strictEqual(Model.create(seed).subtotal(10250), 1552.6);
});

test('all sales come to 1,265,793.04, within a pound of rounding', () => {
  const m = Model.create(seed);
  const sum = m.all('orders').reduce((s, o) => s + m.subtotal(o.id), 0);
  assert.ok(Math.abs(sum - 1265793.04) < 1, 'got ' + sum);
  const byCategory = m.reports.byCategory(null).reduce((s, e) => s + e.sales, 0);
  assert.ok(Math.abs(byCategory - sum) < 0.01);
  const beverages = m.reports.byCategory(null).find(e => e.key === 1);
  assert.ok(Math.abs(beverages.sales - 267868.18) < 1, 'beverages ' + beverages.sales);
});

test('dates move forward by whole weeks, to the week before today', () => {
  const m = Model.create(seed, { today: '2026-11-17' });
  assert.strictEqual(m.shiftDays % 7, 0);
  const o = m.get('orders', 10248);
  assert.strictEqual(weekday(o.orderDate), weekday('1996-07-04'));
  const last = m.all('orders').reduce((a, x) => (x.orderDate > a ? x.orderDate : a), '');
  assert.ok(last <= '2026-11-17' && last > '2026-11-10', last);
  assert.strictEqual(m.all('orders').filter(x => !x.shippedDate).length, 21);
  assert.strictEqual(m.reports.monthly().length, 23);
});

test('status reads shipped, to ship or late', () => {
  const m = Model.create(seed, { today: '2026-11-17' });
  const count = { shipped: 0, open: 0, late: 0 };
  m.all('orders').forEach(o => { count[m.status(o)]++; });
  assert.strictEqual(count.shipped, 809);
  assert.strictEqual(count.open + count.late, 21);
});

test('a new order, a shipped order and an edit survive a reload', () => {
  const storage = memory();
  let m = Model.create(seed, { today: '2026-11-17', storage });
  const id = m.saveOrder({ customerID: 'ALFKI', employeeID: 1, orderDate: '2026-11-17', requiredDate: '2026-12-15', shippedDate: null,
    shipVia: 1, freight: 10, shipName: 'Alfreds Futterkiste' }, [{ productID: 1, unitPrice: 18, quantity: 3, discount: 0.1 }]);
  assert.strictEqual(id, 11078);
  const open = m.all('orders').find(o => !o.shippedDate && o.id !== id);
  m.shipOrder(open.id);
  const chai = Object.assign({}, m.get('products', 1), { unitPrice: 20 });
  m.saveProduct(chai);
  const cust = m.saveCustomer({ companyName: 'Alfresco Ltd', city: 'Leeds', country: 'UK' });
  assert.strictEqual(cust, 'ALFRE');
  m.deleteOrder(10248);

  // Four weeks later, on a fresh load.
  m = Model.create(seed, { today: '2026-12-15', storage });
  assert.strictEqual(m.get('orders', id).orderDate, '2026-12-15');
  assert.strictEqual(m.subtotal(id), 48.6);
  assert.strictEqual(m.total(m.get('orders', id)), 58.6);
  assert.strictEqual(m.get('orders', open.id).shippedDate, '2026-12-15');
  assert.strictEqual(m.get('products', 1).unitPrice, 20);
  assert.strictEqual(m.get('customers', 'ALFRE').city, 'Leeds');
  assert.strictEqual(m.get('orders', 10248), null);
  assert.strictEqual(m.changeCount(), 5);

  m.reset();
  assert.strictEqual(m.all('orders').length, 830);
  assert.strictEqual(m.get('products', 1).unitPrice, 18);
  assert.strictEqual(Model.create(seed, { storage }).changeCount(), 0);
});

test('search finds an order, a customer and a product', () => {
  const m = Model.create(seed);
  assert.strictEqual(m.search('10248')[0].href, '#/orders/10248');
  assert.ok(m.search('alfreds').some(h => h.href === '#/customers/ALFKI'));
  assert.ok(m.search('chai').some(h => h.href === '#/products/1'));
});

test('short searches include products after more than ten customers', () => {
  const hits = Model.create(seed).search('no');
  assert.ok(hits.filter(h => h.type === 'Customer').length > 10);
  assert.ok(hits.some(h => h.label === 'Northwoods Cranberry Sauce'));
  assert.ok(hits.some(h => h.type === 'Supplier'));
});

test('search folds case and accents, trims spaces and matches every word', () => {
  const m = Model.create(seed);
  assert.ok(m.search('COTE').some(h => h.label === 'Côte de Blaye'));
  assert.deepStrictEqual(m.search('  CHO  '), m.search('cho'));
  assert.deepStrictEqual(m.search('  blaye   COTE '), m.search('cote blaye'));
  assert.ok(m.search('mexico antonio').some(h => h.href === '#/customers/ANTON'));
  assert.ok(m.search('chai beverages').some(h => h.href === '#/products/1'));
  assert.ok(!m.search('chai seafood').some(h => h.href === '#/products/1'));
  assert.deepStrictEqual(m.search('   '), []);
  assert.deepStrictEqual(m.search('no-such-record-zzzz'), []);
});

test('search reaches all five types without a shared cutoff', () => {
  const m = Model.create(seed);
  for (const [q, type] of [['10248', 'Order'], ['alfreds', 'Customer'], ['no', 'Product'], ['exotic', 'Supplier'], ['nancy', 'Staff']]) {
    assert.ok(m.search(q).some(h => h.type === type), q + ': ' + type);
  }
  const hits = m.search('no');
  for (const type of ['Order', 'Customer', 'Product', 'Supplier']) assert.ok(hits.some(h => h.type === type), type);
  const expected = m.all('products').filter(p => m.matches(p.productName, 'no'));
  for (const p of expected) assert.ok(hits.some(h => h.href === '#/products/' + p.id));
});

function periodFixture() {
  const m = Model.create(seed);
  m.all('orders').forEach(o => m.deleteOrder(o.id));
  ['2023-12-31', '2024-01-01', '2024-01-07', '2024-01-08', '2024-02-29', '2024-04-01', '2025-01-01'].forEach((day, i) => {
    m.saveOrder({ customerID: 'ALFKI', orderDate: day, freight: 99 }, [{ productID: 1, unitPrice: 10, quantity: i + 1, discount: 0.1 }]);
  });
  return m;
}

test('sales periods use calendar boundaries and Monday weeks', () => {
  const m = periodFixture();
  const weeks = m.reports.period('week');
  assert.strictEqual(weeks[0].from, '2023-12-25');
  assert.deepStrictEqual(weeks.find(r => r.from === '2024-01-01'), { key: '2024-01-01', from: '2024-01-01', to: '2024-01-08', orders: 2, sales: 45 });
  const months = m.reports.period('month');
  assert.strictEqual(months.find(r => r.from === '2024-01-01').sales, 81);
  assert.strictEqual(months.find(r => r.from === '2024-02-01').to, '2024-03-01');
  assert.strictEqual(months.find(r => r.from === '2024-03-01').sales, 0);
  assert.strictEqual(m.reports.period('quarter').find(r => r.from === '2024-01-01').sales, 126);
  assert.strictEqual(m.reports.period('year').find(r => r.from === '2024-01-01').sales, 180);
  assert.deepStrictEqual(m.reports.period(), months);
});

test('every period total and its order drill-down agree', () => {
  const m = periodFixture();
  for (const period of ['week', 'month', 'quarter', 'year']) {
    const rows = m.reports.period(period);
    assert.strictEqual(rows.reduce((n, r) => n + r.sales, 0), 252);
    assert.strictEqual(rows.reduce((n, r) => n + r.orders, 0), 7);
    for (const r of rows) {
      const orders = m.ordersInPeriod(r.from, r.to);
      assert.strictEqual(orders.length, r.orders);
      assert.strictEqual(orders.reduce((n, o) => n + m.subtotal(o.id), 0), r.sales);
    }
  }
  m.all('orders').forEach(o => m.deleteOrder(o.id));
  assert.deepStrictEqual(m.reports.period('week'), []);
});

test('period totals remain correct when dates move and orders change', () => {
  const m = Model.create(seed, { today: '2026-11-18' });
  m.saveOrder({ customerID: 'ALFKI', orderDate: '2026-12-31' }, [{ productID: 1, unitPrice: 12.34, quantity: 3, discount: 0.1 }]);
  m.deleteOrder(10248);
  const expected = m.all('orders').reduce((n, o) => n + m.subtotal(o.id), 0);
  for (const period of ['week', 'month', 'quarter', 'year']) {
    assert.ok(Math.abs(m.reports.period(period).reduce((n, r) => n + r.sales, 0) - expected) < 0.001);
  }
});

test('the product picker searches name and category and ranks recent purchases first', () => {
  const m = Model.create(seed);
  const choices = m.productChoices('ALFKI', '');
  assert.strictEqual(choices.length, 77);
  assert.ok(choices[0].recent);
  const firstOther = choices.findIndex(e => !e.recent);
  assert.ok(choices.slice(firstOther).every(e => !e.recent));
  assert.ok(m.productChoices('', 'BEVERAGES chai').some(e => e.product.id === 1));
  assert.ok(m.productChoices('', 'cote').some(e => e.product.productName === 'Côte de Blaye'));
  const id = m.saveProduct({ productName: 'A new product', categoryID: 1, discontinued: 1 });
  assert.ok(m.productChoices('ALFKI', '').some(e => e.product.id === id));
});

console.log('\n' + passed + ' tests passed');
