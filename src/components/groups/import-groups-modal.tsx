'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Upload, FileSpreadsheet, ClipboardPaste, Loader2,
  CheckCircle2, Download, Link as LinkIcon,
} from 'lucide-react'
import { downloadXlsx, readSpreadsheetRecords } from '@/lib/spreadsheet-browser'

interface Props {
  projectId: string
  workspaceId: string
  onClose: () => void
  onSaved: () => void
}

interface RawGroup {
  link: string
  tags?: string
  notes?: string
}

interface ParsedGroup extends RawGroup {
  status: 'pending' | 'ok' | 'duplicate' | 'invalid'
  message?: string
}

function isValidZaloGroupLink(link: string): boolean {
  // Hỗ trợ: zalo.me/g/xxx, https://zalo.me/g/xxx, ...
  return /zalo\.me\/g\//.test(link.trim().toLowerCase())
}

function normalizeLink(link: string): string {
  let s = String(link).trim()
  // Strip query string nếu có
  s = s.split('?')[0]
  // Đảm bảo có https://
  if (!s.startsWith('http')) s = 'https://' + s.replace(/^\/+/, '')
  return s
}

export function ImportGroupsModal({ projectId, workspaceId, onClose, onSaved }: Props) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<'paste' | 'file'>('paste')
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows] = useState<ParsedGroup[]>([])
  const [step, setStep] = useState<'input' | 'preview' | 'importing' | 'done'>('input')

  const [progress, setProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 })
  const [errors, setErrors] = useState<{ link: string; error: string }[]>([])

  async function downloadTemplate() {
    const data = [
      ['group_link', 'tags', 'notes'],
      ['https://zalo.me/g/abc123xyz', 'VIP, K29', 'Lớp khai giảng tháng 4'],
      ['https://zalo.me/g/def456uvw', 'Mới', ''],
      ['https://zalo.me/g/ghi789rst', 'Lớp cũ', 'Đã tốt nghiệp'],
    ]
    await downloadXlsx(data, 'zalo-sender-groups-template.xlsx', 'Zalo Groups')
  }

  function parseRaw(raw: RawGroup[]): ParsedGroup[] {
    const seen = new Set<string>()
    return raw
      .filter(r => r.link)
      .map((r): ParsedGroup => {
        const link = normalizeLink(r.link)
        if (!isValidZaloGroupLink(link)) {
          return { ...r, link, status: 'invalid', message: 'Link không đúng format zalo.me/g/...' }
        }
        if (seen.has(link)) {
          return { ...r, link, status: 'duplicate', message: 'Trùng trong file' }
        }
        seen.add(link)
        return { ...r, link, status: 'ok' }
      })
  }

  function handlePasteParse() {
    const lines = pasteText.split('\n').map(l => l.trim()).filter(Boolean)
    const raw: RawGroup[] = lines.map(line => {
      const cols = line.split(/\t|,|;/).map(c => c.trim())
      return {
        link: cols[0] || '',
        tags: cols[1] || undefined,
        notes: cols[2] || undefined,
      }
    })
    const parsed = parseRaw(raw)
    if (parsed.length === 0) {
      alert('Không có dòng hợp lệ. Mỗi dòng 1 link nhóm Zalo (https://zalo.me/g/...)')
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

        const raw: RawGroup[] = json.map(row => {
          const lower: Record<string, unknown> = {}
          for (const k of Object.keys(row)) {
            lower[k.toLowerCase().trim()] = row[k]
          }
          const link = lower.group_link || lower.link || lower['link nhóm'] || lower['link nhom'] || lower.url || ''
          const tags = lower.tags || lower.tag || ''
          const notes = lower.notes || lower.note || lower['ghi chú'] || lower['ghi chu'] || ''
          return {
            link: String(link),
            tags: String(tags) || undefined,
            notes: String(notes) || undefined,
          }
        })
        const parsed = parseRaw(raw)
        if (parsed.length === 0) {
          alert('File không có dòng hợp lệ. Cần có cột "group_link" hoặc "link"')
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

    const { data: { user } } = await supabase.auth.getUser()

    // Tạo import_batch
    const { data: batch } = await supabase
      .from('import_batches')
      .insert({
        workspace_id: workspaceId,
        user_id: user!.id,
        type: 'groups',
        file_name: tab === 'file' ? 'uploaded.xlsx' : 'pasted',
        total_rows: validRows.length,
      })
      .select()
      .single()

    let success = 0
    let failed = 0
    const allErrors: { link: string; error: string }[] = []

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i]

      try {
        // Lookup group info qua API
        const res = await fetch('/api/zalo/group-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupLink: r.link, projectId }),
        })
        const data = await res.json()

        if (data.error) {
          allErrors.push({ link: r.link, error: data.error })
          failed++
        } else {
          // Insert into zalo_groups
          const { error: insErr } = await supabase.from('zalo_groups').insert({
            project_id: projectId,
            group_name: data.name || 'Unknown',
            group_id: data.groupId,
            group_link: r.link,
            member_count: data.memberCount || 0,
            is_active: true,
            import_batch_id: batch?.id || null,
          })
          if (insErr) {
            allErrors.push({ link: r.link, error: insErr.message })
            failed++
          } else {
            success++
          }
        }
      } catch (err) {
        allErrors.push({ link: r.link, error: (err as Error).message })
        failed++
      }

      setProgress({ current: i + 1, total: validRows.length, success, failed })
      // Rate limit buffer (func.vn dễ bị limit)
      await new Promise(r => setTimeout(r, 1000))
    }

    // Update batch
    if (batch) {
      await supabase
        .from('import_batches')
        .update({
          success_rows: success,
          failed_rows: failed,
          error_log: allErrors,
        })
        .eq('id', batch.id)
    }

    setErrors(allErrors)
    setStep('done')
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Upload size={20} />
            Import nhóm Zalo hàng loạt
          </h3>
          <button
            onClick={() => !['importing'].includes(step) && onClose()}
            disabled={step === 'importing'}
            className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {step === 'input' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5 text-sm text-blue-900">
                <p className="font-medium mb-1">📖 Cách hoạt động:</p>
                <ul className="list-disc pl-5 space-y-0.5 text-blue-800">
                  <li>Dán hoặc upload danh sách link nhóm Zalo (<code>https://zalo.me/g/...</code>)</li>
                  <li>Hệ thống tự gọi API <code>get_group_info</code> để lấy <strong>tên nhóm</strong> + <strong>group ID</strong></li>
                  <li>~1s/nhóm để tránh rate limit Zalo</li>
                </ul>
              </div>

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
                    Mỗi dòng 1 link. Tùy chọn: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">link | tags | notes</code>
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-mono text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    placeholder={`https://zalo.me/g/abc123xyz\nhttps://zalo.me/g/def456uvw\thttps://zalo.me/g/ghi789rst\tVIP\tLớp cũ`}
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
                    <p className="text-xs text-gray-500 mt-1">Cần có cột <strong>group_link</strong> (bắt buộc), tùy chọn: tags, notes</p>
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
                <p className="text-sm text-blue-900 font-medium">Xem trước {rows.length} link</p>
                <div className="flex flex-wrap gap-3 mt-2 text-sm">
                  <span className="text-green-700">✅ Hợp lệ: {rows.filter(r => r.status === 'ok').length}</span>
                  <span className="text-orange-700">⚠️ Trùng: {rows.filter(r => r.status === 'duplicate').length}</span>
                  <span className="text-red-700">❌ Sai: {rows.filter(r => r.status === 'invalid').length}</span>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  ⏱️ Ước tính: ~{Math.ceil(rows.filter(r => r.status === 'ok').length)} giây để lookup tất cả
                </p>
              </div>

              <div className="border border-gray-200 rounded-lg max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Link nhóm</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Tags</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((r, i) => (
                      <tr key={i} className={r.status !== 'ok' ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 font-mono text-xs truncate max-w-md" title={r.link}>{r.link}</td>
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
                  Lookup & Import {rows.filter(r => r.status === 'ok').length} nhóm →
                </button>
              </div>
            </>
          )}

          {step === 'importing' && (
            <div className="text-center py-8">
              <Loader2 className="mx-auto animate-spin text-blue-600" size={40} />
              <p className="mt-4 text-gray-900 font-medium">Đang lookup từng nhóm từ Zalo...</p>
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
              <p className="text-xs text-gray-400 mt-3">
                Không tắt tab này — đang gọi API Zalo, cần khoảng 1s/nhóm
              </p>
            </div>
          )}

          {step === 'done' && (
            <div className="py-4">
              <div className="text-center mb-5">
                <CheckCircle2 className="mx-auto text-green-600" size={48} />
                <p className="mt-3 text-lg font-semibold text-gray-900">Import xong!</p>
                <div className="mt-2 flex justify-center gap-4 text-sm">
                  <span className="text-green-700 font-medium">✓ Thành công: {progress.success}</span>
                  {progress.failed > 0 && (
                    <span className="text-red-700 font-medium">✗ Lỗi: {progress.failed}</span>
                  )}
                </div>
              </div>

              {errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium text-red-900 mb-2">Chi tiết các link lỗi:</p>
                  <ul className="space-y-1 text-xs text-red-700">
                    {errors.slice(0, 20).map((e, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <LinkIcon size={11} className="flex-shrink-0 mt-0.5" />
                        <span className="font-mono truncate" title={e.link}>{e.link.replace('https://', '')}</span>
                        <span>→ {e.error}</span>
                      </li>
                    ))}
                    {errors.length > 20 && <li className="italic">... và {errors.length - 20} lỗi khác</li>}
                  </ul>
                </div>
              )}

              <div className="text-center">
                <button
                  onClick={onSaved}
                  className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  Xong
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
