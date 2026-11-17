#!/usr/bin/env python3
"""Build app/northwind/data.js from Microsoft's Northwind sample database.

The source is instnwnd.sql, the SQL Server form of the sample that shipped
with Microsoft Access. Microsoft publishes it under the MIT licence in
github.com/microsoft/sql-server-samples. The script reads the INSERT
statements of eight tables and writes them as compact rows. It leaves out
the pictures, and the staff's home addresses, home phones and birth dates.

Run with Python 3.8 or later:
    python3 tools/northwind/build_data.py              # downloads the source
    python3 tools/northwind/build_data.py <instnwnd.sql>  # reads a local copy
"""

import json
import os
import re
import sys
import urllib.request

SOURCE = ('https://raw.githubusercontent.com/microsoft/sql-server-samples/'
          'master/samples/databases/northwind-pubs/instnwnd.sql')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'app', 'northwind', 'data.js')

# table in the source -> (key in data.js, columns kept, in the source's order)
TABLES = {
    'Categories': ('categories', ['CategoryID', 'CategoryName', 'Description']),
    'Customers': ('customers', ['CustomerID', 'CompanyName', 'ContactName', 'ContactTitle', 'Address',
                                'City', 'Region', 'PostalCode', 'Country', 'Phone', 'Fax']),
    'Employees': ('employees', ['EmployeeID', 'LastName', 'FirstName', 'Title', 'TitleOfCourtesy',
                                'HireDate', 'City', 'Country', 'Extension', 'Notes', 'ReportsTo']),
    'Shippers': ('shippers', ['ShipperID', 'CompanyName', 'Phone']),
    'Suppliers': ('suppliers', ['SupplierID', 'CompanyName', 'ContactName', 'ContactTitle', 'Address',
                                'City', 'Region', 'PostalCode', 'Country', 'Phone']),
    'Orders': ('orders', ['OrderID', 'CustomerID', 'EmployeeID', 'OrderDate', 'RequiredDate',
                          'ShippedDate', 'ShipVia', 'Freight', 'ShipName', 'ShipAddress', 'ShipCity',
                          'ShipRegion', 'ShipPostalCode', 'ShipCountry']),
    'Products': ('products', ['ProductID', 'ProductName', 'SupplierID', 'CategoryID', 'QuantityPerUnit',
                              'UnitPrice', 'UnitsInStock', 'UnitsOnOrder', 'ReorderLevel', 'Discontinued']),
    'Order Details': ('lines', ['OrderID', 'ProductID', 'UnitPrice', 'Quantity', 'Discount']),
}
# Columns of the tables whose INSERT names none, in table order.
IMPLICIT = {
    'Customers': TABLES['Customers'][1],
    'Order Details': TABLES['Order Details'][1],
}
DATES = {'HireDate', 'OrderDate', 'RequiredDate', 'ShippedDate'}
EXPECT = {'categories': 8, 'customers': 91, 'employees': 9, 'shippers': 3, 'suppliers': 29,
          'orders': 830, 'products': 77, 'lines': 2155}

NOTICE = """/* Northwind sample data. Built by tools/northwind/build_data.py; do not edit.

   Source: instnwnd.sql in github.com/microsoft/sql-server-samples
   Copyright (c) Microsoft Corporation. MIT License. The full notice is in
   NOTICE.txt beside this file.

   Changes from the source: pictures are left out, and so are the staff's
   home addresses, home phones and birth dates. */
"""


def values(text, start):
    """Parse one SQL VALUES(...) tuple that opens at text[start] == '('."""
    out, i = [], start + 1
    while True:
        while text[i] in ' \t\r\n,':
            i += 1
        c = text[i]
        if c == ')':
            return out, i + 1
        if c == 'N' and text[i + 1] == "'":
            i += 1
            c = "'"
        if c == "'":
            j, parts = i + 1, []
            while True:
                k = text.index("'", j)
                parts.append(text[j:k])
                if text[k + 1:k + 2] == "'":
                    parts.append("'")
                    j = k + 2
                else:
                    i = k + 1
                    break
            out.append(''.join(parts))
        else:
            j = i
            while text[j] not in ',)':
                j += 1
            token = text[i:j].strip()
            i = j
            if token.upper() == 'NULL':
                out.append(None)
            elif token.startswith('0x'):
                out.append(None)  # a picture
            elif re.fullmatch(r'-?\d+', token):
                out.append(int(token))
            else:
                out.append(float(token))


def iso(us):
    """'7/4/1996' -> '1996-07-04'."""
    if us is None:
        return None
    m, d, y = us.split(' ')[0].split('/')
    return '%04d-%02d-%02d' % (int(y), int(m), int(d))


def main():
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'rb') as f:
            text = f.read().decode('utf-8')
    else:
        text = urllib.request.urlopen(SOURCE).read().decode('utf-8')

    data = {key: {'cols': [c[0].lower() + c[1:] for c in cols], 'rows': []} for key, cols in TABLES.values()}
    pattern = re.compile(r'INSERT\s+(?:INTO\s+)?"([^"]+)"\s*(\(([^)]*)\))?\s*VALUES\s*\(', re.I)
    for m in pattern.finditer(text):
        table = m.group(1)
        if table not in TABLES:
            continue
        key, keep = TABLES[table]
        named = [c.strip().strip('"') for c in m.group(3).split(',')] if m.group(3) else IMPLICIT[table]
        row, _ = values(text, m.end() - 1)
        if len(row) != len(named):
            raise SystemExit('%s: %d values for %d columns' % (table, len(row), len(named)))
        got = dict(zip(named, row))
        data[key]['rows'].append([iso(got[c]) if c in DATES else got[c] for c in keep])

    for key, n in EXPECT.items():
        if len(data[key]['rows']) != n:
            raise SystemExit('%s: %d rows, expected %d' % (key, len(data[key]['rows']), n))

    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    body = body.replace('],[', '],\n[')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(NOTICE)
        f.write('(function (root) {\nvar seed = ' + body + ';\n'
                "if (typeof module === 'object' && module.exports) module.exports = seed;\n"
                'else root.NORTHWIND_SEED = seed;\n})(this);\n')
    print('wrote %s, %d bytes' % (os.path.normpath(OUT), os.path.getsize(OUT)))


if __name__ == '__main__':
    main()
