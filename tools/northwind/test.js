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

console.log('\n' + passed + ' tests passed');
