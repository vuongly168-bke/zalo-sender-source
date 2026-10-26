export type TabularCell = string | number | boolean | Date | null

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index++
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(cell)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

export function parseCsv(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, '')
  const candidates = [',', ';', '\t'].map((delimiter) => ({
    delimiter,
    rows: parseDelimited(normalized, delimiter),
  }))
  return candidates.sort((left, right) =>
    (right.rows[0]?.length ?? 0) - (left.rows[0]?.length ?? 0)
  )[0].rows
}

export function rowsToRecords(rows: TabularCell[][]): Array<Record<string, TabularCell>> {
  const headers = (rows[0] ?? []).map((value) => String(value ?? '').trim())
  return rows.slice(1).map((row) => Object.fromEntries(
    headers.filter(Boolean).map((header, index) => [header, row[index] ?? '']),
  ))
}
