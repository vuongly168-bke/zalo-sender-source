'use client'

import { readSheet } from 'read-excel-file/browser'
import writeXlsxFile from 'write-excel-file/browser'
import { parseCsv, rowsToRecords, type TabularCell } from '@/lib/tabular-data'

export async function readSpreadsheetRecords(file: File): Promise<Array<Record<string, TabularCell>>> {
  const rows = file.name.toLowerCase().endsWith('.csv')
    ? parseCsv(await file.text())
    : await readSheet(file)
  return rowsToRecords(rows as TabularCell[][])
}

export async function downloadXlsx(
  rows: TabularCell[][],
  fileName: string,
  sheetName: string,
): Promise<void> {
  await writeXlsxFile(rows, { sheet: sheetName }).toFile(fileName)
}
