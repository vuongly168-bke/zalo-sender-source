import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCsv, rowsToRecords } from '../src/lib/tabular-data.ts'

test('parses quoted CSV fields, embedded commas and newlines', () => {
  const rows = parseCsv('phone,name,notes\r\n0901,"An, Bình","dòng 1\ndòng 2"')
  assert.deepEqual(rows, [
    ['phone', 'name', 'notes'],
    ['0901', 'An, Bình', 'dòng 1\ndòng 2'],
  ])
})

test('converts the first spreadsheet row into record keys', () => {
  assert.deepEqual(rowsToRecords([
    ['phone', 'name'],
    ['0901', 'An'],
  ]), [{ phone: '0901', name: 'An' }])
})
