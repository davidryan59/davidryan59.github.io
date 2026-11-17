# Northwind, rebuilt

## Summary

Northwind Traders is the sample database that Microsoft shipped with Access.
`app/northwind/` rebuilds it as a web app: the same eight tables, the same 830
orders and the same reports, in a browser and on a phone. It shows what an old
Access database looks like after a rebuild. A visitor can add an order, edit a
customer, mark an order as shipped, print an invoice and download a report.
The page is static. It keeps each visitor's changes in that visitor's own
browser, so it needs no server and no account.

## Implementation checklist

- [x] The sample's licence checked: MIT, copyright Microsoft Corporation
- [x] `tools/northwind/build_data.py` builds `data.js` from Microsoft's script
- [x] Data model with tests: `node tools/northwind/test.js`, 8 tests
- [x] Orders: list, detail, new, edit, delete, mark as shipped, invoice
- [x] Customers and products: list, detail, new, edit
- [x] Suppliers and staff: list and detail
- [x] Nine reports, each with a CSV download and a print view
- [x] Home screen: four headline figures, sales by month, orders to ship, stock to reorder
- [x] One search box across orders, customers, products, suppliers and staff
- [x] Light and dark themes, from the site's `assets/theme.js`
- [x] `tools/screen-fit/check.js` passes at all six sizes (2026-11-17)
- [ ] Try it on a real phone and a real iPad
- [ ] Share card in `social/`, and `og:image` in `index.html`
- [ ] Entry in `docs/inventory.md` and on the builder page
- [ ] Address in `tools/check-addresses/addresses.json`, and in `docs/site-layout.md`
- [ ] Short address `redirects/northwind.html`, if one is wanted
- [ ] Entry in the root `README.md`

## The sample and its licence

The data comes from `instnwnd.sql` in
[microsoft/sql-server-samples](https://github.com/microsoft/sql-server-samples/tree/master/samples/databases/northwind-pubs),
the SQL Server form of the Access sample. The repository's `license.txt` is
the MIT licence, with the notice "Copyright (c) Microsoft Corporation". The
MIT licence asks that the notice travels with every copy, so:

- `app/northwind/NOTICE.txt` is a copy of that `license.txt`;
- `data.js` opens with a comment that names the source and the licence;
- the About screen credits Microsoft and links the notice.

The app differs from the source in two ways, and the About screen states
both:

- **Order dates move forward.** The sample's orders run from July 1996 to May
  1998. The model adds a whole number of weeks to every order date, so the
  newest order falls in the week before today and each date keeps its
  weekday. The home screen then reads as a live business on any day.
- **Some columns are left out.** The pictures, and the staff's home
  addresses, home phones and birth dates.

## Files

| File | What it holds |
| --- | --- |
| `app/northwind/index.html` | The shell: menu, search box, buttons and the main panel |
| `app/northwind/style.css` | Three layouts, the list tables, the forms, the charts and the print view |
| `app/northwind/data.js` | The seed data, built by `tools/northwind/build_data.py`. Do not edit |
| `app/northwind/model.js` | Tables, sums, reports, search and the saved changes. No page code, so Node runs it |
| `app/northwind/app.js` | The screens, the routing and the clicks |
| `app/northwind/NOTICE.txt` | Microsoft's copyright and licence notice |
| `tools/northwind/build_data.py` | Reads `instnwnd.sql` and writes `data.js` |
| `tools/northwind/test.js` | Tests the model against figures known from the sample |

No libraries and no build step, as with every app in this repo.

## How it works

**Addresses.** Each screen has an address after the `#`, such as
`#/orders/10248` or `#/reports/sales-by-category`. `ROUTES` in `app.js` maps
each pattern to the function that draws the screen. The browser's back button
and a shared link both work.

**Changes.** `data.js` never changes. When a visitor saves a record, the model
stores the whole changed row under `northwind.changes.v1` in `localStorage`,
and lays the stored rows over the seed on the next visit. A deleted order is
stored as `null`. Stored order dates are sample dates, with the week shift
removed, so they stay correct as the shift grows. "Reset the sample data" on
the About screen removes the stored rows.

**Sums.** A line's amount is price × quantity × (1 − discount), rounded to the
cent. An order's items total is the sum of its lines, and its total adds the
freight. All sales come to $1,265,793.29, which is 25 cents above the sample's
unrounded $1,265,793.04, because each line is rounded first. A report's year
is the year of the order date.

**Status.** An order is Shipped when it has a shipped date, Late when its
required date is before today, and To ship otherwise. A product needs a
reorder when it is not discontinued and its stock is at or below its reorder
level.

**Lists.** `listView` draws every list: a search box, filter chips, sortable
headings and 60 rows at a time. Each column names where its cell goes when a
narrow screen turns the rows into cards: `primary`, `side`, `rest` or `skip`.

**Reports.** `REPORTS` in `app.js` holds the nine reports. Six replace a
query or a report in the Access sample, and each says which. Three are new:
sales by country, sales by product for any year, and products to reorder.

**Charts.** Both charts are single-series bars in plain HTML and CSS: sales by
month on the home screen, and the top twelve rows of a report. Each month's
bar shows its figures on hover, on focus and on a tap. The table below a
report carries every figure.

## Layouts

| Layout | When | Arrangement |
| --- | --- | --- |
| Wide | A window wider than 760 px | A menu down the left, the search bar across the top |
| Upright | 760 px wide or less | The search bar on top, a five-item tab bar along the bottom, lists as cards |
| Short | 480 px tall or less, as a phone held sideways | A slim rail of five items down the left |

The shell fills the window (`100dvh`), and only the main panel scrolls. On the
two narrow layouts, Suppliers, Staff, Reports and About sit behind More.

## Rebuilding the data

```sh
python3 tools/northwind/build_data.py                 # downloads instnwnd.sql
python3 tools/northwind/build_data.py <instnwnd.sql>   # or reads a local copy
node tools/northwind/test.js
```

## Checking

```sh
python3 -m http.server 8000
node tools/screen-fit/check.js http://localhost:8000/app/northwind/ '#app'
```

The page also opens straight from the file, with no server.

## Limits

- Each visitor's changes stay in one browser. A firm's app would use a hosted
  database with accounts and backups; the About screen says so.
- Stock does not fall when an order is saved. The Access sample does not
  change it either.
- Suppliers and staff are read-only.
- The app shows no version number, as no app on this site does yet.
