'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Upload, FileSpreadsheet, ClipboardPaste, Loader2, Sparkles,
  CheckCircle2, Download,
} from 'lucide-react'
import type { ZaloAccount } from '@/lib/types'
import { downloadXlsx, readSpreadsheetRecords } from '@/lib/spreadsheet-browser'

interface Props {
  workspaceId: string
  zaloAccounts: ZaloAccount[]
  onClose: () => void
  onSaved: () => void
}

interface RawRow {
  phone: string
  name?: string
  tags?: string
  notes?: string
}

interface ParsedRow extends RawRow {
  status: 'pending' | 'ok' | 'duplicate' | 'invalid'
  message?: string
}

function normalizePhone(p: string): string {
  let s = String(p).trim().replace(/[\s\-\(\)]/g, '')
  if (s.startsWith('+84')) s = '0' + s.substring(3)
  else if (s.startsWith('84') && s.length >= 11) s = '0' + s.substring(2)
  if (!s.startsWith('0') && /^\d/.test(s)) s = '0' + s
  return s
}

function isValidPhone(p: string): boolean {
  return /^0\d{8,10}$/.test(p)
}

export function ImportContactsModal({ workspaceId, zaloAccounts, onClose, onSaved }: Props) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'paste' | 'file'>('paste')
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [step, setStep] = useState<'input' | 'preview' | 'importing' | 'done'>('input')

  const [autoLookup, setAutoLookup] = useState(true)  // Default ON để auto-fill tên
  const [lookupZaloId, setLookupZaloId] = useState(zaloAccounts[0]?.id || '')

  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 })
  const [importBatchId, setImportBatchId] = useState<string | null>(null)

  async function downloadTemplate() {
    const data = [
      ['phone', 'name', 'tags', 'notes'],
      ['0901234567', 'Anh Nam', 'VIP, Khách cũ', 'Sinh nhật 15/3'],
      ['0987654321', 'Chị Hoa', 'Mới đăng ký', ''],
      ['0333123456', '', 'VIP', 'Để trống tên → tự lookup từ Zalo'],
    ]
    await downloadXlsx(data, 'zalo-sender-contacts-template.xlsx', 'Contacts')
  }

  function parseRawData(rawRows: RawRow[]): ParsedRow[] {
    const seen = new Set<string>()
    return rawRows
      .filter(r => r.phone) // bỏ dòng trống
      .map((r): ParsedRow => {
        const phone = normalizePhone(r.phone)
        if (!isValidPhone(phone)) {
          return { ...r, phone, status: 'invalid', message: 'SĐT không hợp lệ' }
        }
        if (seen.has(phone)) {
          return { ...r, phone, status: 'duplicate', message: 'Trùng trong file' }
        }
        seen.add(phone)
        return { ...r, phone, status: 'ok' }
      })
  }

  function handlePasteParse() {
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean)
    const raw: RawRow[] = lines.map(line => {
      // Hỗ trợ tab/comma/semicolon
      const cols = line.split(/\t|,|;/).map(c => c.trim())
      return {
        phone: cols[0] || '',
        name: cols[1] || undefined,
        tags: cols[2] || undefined,
        notes: cols[3] || undefined,
      }
    })
    const parsed = parseRawData(raw)
    if (parsed.length === 0) {
      alert('Không có dòng hợp lệ. Mỗi dòng 1 SĐT, các cột cách nhau bởi tab/dấu phẩy.')
      return
    }
    setRows(parsed)
    setStep('preview')
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
        const json = await readSpreadsheetRecords(file)

        // Detect column names (smart match)
        const raw: RawRow[] = json.map(row => {
          const lower: Record<string, unknown> = {}
          for (const k of Object.keys(row)) {
            lower[k.toLowerCase().trim()] = row[k]
          }
          // Try multiple field names
          const phone = lower.phone || lower['số điện thoại'] || lower['sđt'] || lower.sdt || lower.phone_number || ''
          const name = lower.name || lower['tên'] || lower.ten || lower.fullname || ''
          const tags = lower.tags || lower.tag || ''
          const notes = lower.notes || lower.note || lower['ghi chú'] || lower['ghi chu'] || ''
          return {
            phone: String(phone),
            name: String(name) || undefined,
            tags: String(tags) || undefined,
            notes: String(notes) || undefined,
          }
        })
        const parsed = parseRawData(raw)
        if (parsed.length === 0) {
          alert('File không có dòng hợp lệ. Cần có cột "phone" (hoặc "SĐT").')
          return
        }
        setRows(parsed)
        setStep('preview')
    } catch (err) {
      alert('Lỗi đọc file: ' + (err as Error).message)
    }
  }

  async function handleImport() {
    setStep('importing')
    const validRows = rows.filter(r => r.status === 'ok')
    setProgress({ current: 0, total: validRows.length, success: 0, failed: 0 })

    // Tạo import_batch
    const { data: { user } } = await supabase.auth.getUser()
    const { data: batch } = await supabase
      .from('import_batches')
      .insert({
        workspace_id: workspaceId,
        user_id: user!.id,
        type: 'contacts',
        file_name: tab === 'file' ? 'uploaded.xlsx' : 'pasted',
        total_rows: validRows.length,
      })
      .select()
      .single()

    if (!batch) {
      alert('Không thể tạo import batch')
      setStep('preview')
      return
    }
    setImportBatchId(batch.id)

    let success = 0
    let failed = 0
    const errors: { row: number; error: string }[] = []

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i]
      const tags = r.tags ? r.tags.split(/[,;]/).map(t => t.trim()).filter(Boolean) : []

      let userName = r.name?.trim() || null
      let zaloUserId: string | null = null

      // Auto lookup nếu bật
      if (autoLookup && lookupZaloId && !userName) {
        try {
          const res = await fetch('/api/zalo/user-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: r.phone, zaloAccountId: lookupZaloId }),
          })
          const data = await res.json()
          if (!data.error) {
            userName = data.userName || userName
            zaloUserId = data.userId || null
          }
        } catch {}
      }

      const { error: e } = await supabase.from('contacts').insert({
        workspace_id: workspaceId,
        phone: r.phone,
        name: userName,
        tags,
        notes: r.notes?.trim() || null,
        zalo_user_id: zaloUserId,
        last_synced_at: zaloUserId ? new Date().toISOString() : null,
        import_batch_id: batch.id,
        created_by: user!.id,
      })

      if (e) {
        if (e.code === '23505') {
          errors.push({ row: i + 1, error: 'SĐT đã tồn tại' })
        } else {
          errors.push({ row: i + 1, error: e.message })
        }
        failed++
      } else {
        success++
      }

      setProgress({ current: i + 1, total: validRows.length, success, failed })

      // Delay nhỏ giữa các request lookup để tránh rate limit
      if (autoLookup) await new Promise(r => setTimeout(r, 500))
    }

    // Update import_batch với stats cuối
    await supabase
      .from('import_batches')
      .update({
        success_rows: success,
        failed_rows: failed,
        error_log: errors,
      })
      .eq('id', batch.id)

    setStep('done')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Upload size={20} />
            Import khách hàng
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {step === 'input' && (
            <>
              {/* Tabs */}
              <div className="flex gap-2 mb-5 border-b border-gray-200">
                <button
                  onClick={() => setTab('paste')}
                  className={`pb-3 px-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                    tab === 'paste' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <ClipboardPaste size={16} />
                  Dán nhanh
                </button>
                <button
                  onClick={() => setTab('file')}
                  className={`pb-3 px-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                    tab === 'file' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <FileSpreadsheet size={16} />
                  Upload Excel/CSV
                </button>
              </div>

              {tab === 'paste' && (
                <div>
                  <p className="text-sm text-gray-700 mb-2">
                    Mỗi dòng 1 khách. Format: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">phone | name | tags | notes</code> (cách nhau bởi tab hoặc dấu phẩy)
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-mono text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder={`0901234567\tAnh Nam\tVIP\tSinh nhật 15/3\n0987654321\tChị Hoa\tMới\n0333123456`}
                  />
                  <button
                    onClick={handlePasteParse}
                    disabled={!pasteText.trim()}
                    className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    Xem trước →
                  </button>
                </div>
              )}

              {tab === 'file' && (
                <div>
                  <button
                    onClick={downloadTemplate}
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1.5 mb-3"
                  >
                    <Download size={14} />
                    Tải file mẫu Excel
                  </button>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
                  >
                    <FileSpreadsheet size={36} className="mx-auto text-gray-400" />
                    <p className="mt-2 text-sm text-gray-700 font-medium">Click để chọn file Excel/CSV</p>
                    <p className="text-xs text-gray-500 mt-1">Cần có cột <strong>phone</strong> (bắt buộc), tùy chọn: name, tags, notes</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}
            </>
          )}

          {step === 'preview' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900 font-medium">Xem trước {rows.length} dòng</p>
                <div className="flex flex-wrap gap-3 mt-2 text-sm">
                  <span className="text-green-700">✅ Hợp lệ: {rows.filter(r => r.status === 'ok').length}</span>
                  <span className="text-orange-700">⚠️ Trùng: {rows.filter(r => r.status === 'duplicate').length}</span>
                  <span className="text-red-700">❌ Sai: {rows.filter(r => r.status === 'invalid').length}</span>
                </div>
              </div>

              {/* Auto lookup toggle */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoLookup}
                    onChange={(e) => setAutoLookup(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-purple-900 flex items-center gap-1.5">
                      <Sparkles size={14} />
                      Tự động lấy tên từ Zalo cho dòng thiếu tên
                    </p>
                    <p className="text-xs text-purple-700 mt-1">
                      Sẽ gọi API <code>get_user_info</code> cho mỗi SĐT thiếu tên. Chậm hơn ~0.5s/dòng nhưng tự động hoàn thiện data.
                    </p>
                  </div>
                </label>
                {autoLookup && (
                  <select
                    value={lookupZaloId}
                    onChange={(e) => setLookupZaloId(e.target.value)}
                    className="mt-3 ml-6 px-2 py-1.5 border border-purple-300 rounded text-sm text-gray-900"
                  >
                    <option value="">-- Chọn Zalo Account --</option>
                    {zaloAccounts.map(za => (
                      <option key={za.id} value={za.id}>{za.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Preview table */}
              <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">SĐT</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Tên</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Tags</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.status !== 'ok' ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 font-mono text-xs">{r.phone}</td>
                        <td className="px-3 py-2 text-gray-700">{r.name || <span className="text-gray-400 italic">(trống)</span>}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{r.tags || ''}</td>
                        <td className="px-3 py-2 text-center text-xs">
                          {r.status === 'ok' && <span className="text-green-700">✓</span>}
                          {r.status === 'duplicate' && <span className="text-orange-700">Trùng</span>}
                          {r.status === 'invalid' && <span className="text-red-700">{r.message}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex gap-3 justify-end">
                <button
                  onClick={() => { setStep('input'); setRows([]); setPasteText('') }}
                  className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
                >
                  ← Quay lại
                </button>
                <button
                  onClick={handleImport}
                  disabled={rows.filter(r => r.status === 'ok').length === 0}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Import {rows.filter(r => r.status === 'ok').length} khách →
                </button>
              </div>
            </>
          )}

          {step === 'importing' && (
            <div className="text-center py-8">
              <Loader2 className="mx-auto animate-spin text-blue-600" size={40} />
              <p className="mt-4 text-gray-900 font-medium">Đang import...</p>
              <p className="text-sm text-gray-500 mt-1">{progress.current} / {progress.total}</p>
              <div className="mt-4 max-w-md mx-auto bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              <div className="mt-3 flex justify-center gap-4 text-sm">
                <span className="text-green-700">✓ {progress.success}</span>
                <span className="text-red-700">✗ {progress.failed}</span>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-6">
              <CheckCircle2 className="mx-auto text-green-600" size={48} />
              <p className="mt-3 text-lg font-semibold text-gray-900">Import xong!</p>
              <div className="mt-2 flex justify-center gap-4 text-sm">
                <span className="text-green-700 font-medium">✓ Thành công: {progress.success}</span>
                {progress.failed > 0 && (
                  <span className="text-red-700 font-medium">✗ Lỗi: {progress.failed}</span>
                )}
              </div>
              {progress.failed > 0 && importBatchId && (
                <p className="text-xs text-gray-500 mt-2">
                  Xem chi tiết lỗi: import_batch_id = <code className="bg-gray-100 px-1 rounded">{importBatchId.slice(0, 8)}</code>
                </p>
              )}
              <button
                onClick={onSaved}
                className="mt-5 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Xong
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
