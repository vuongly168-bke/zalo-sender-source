'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Building2, Clock, Mail, LogOut } from 'lucide-react'

export default function SetupWorkspacePage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userInfo, setUserInfo] = useState<{ name: string; email: string; isSuperAdmin: boolean } | null>(null)
  const [checking, setChecking] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // Đã có workspace → đẩy về dashboard
      const { data: existing } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)

      if (existing && existing.length > 0) {
        router.push('/dashboard')
        return
      }

      // Lấy profile (xem có phải super admin không)
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin, full_name, email')
        .eq('id', user.id)
        .single()

      setUserInfo({
        name: profile?.full_name || user.user_metadata?.full_name || user.email || '',
        email: profile?.email || user.email || '',
        isSuperAdmin: !!profile?.is_super_admin,
      })
      setChecking(false)
    }
    check()
  }, [supabase, router])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')

    const { error: rpcError } = await supabase.rpc('create_workspace_with_owner', {
      workspace_name: name.trim(),
      workspace_desc: description.trim() || null,
    })

    if (rpcError) {
      setError('Không thể tạo: ' + rpcError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (checking || !userInfo) {
    return <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100" />
  }

  // ===== Super Admin: Tạo workspace =====
  if (userInfo.isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <div className="inline-flex w-16 h-16 bg-blue-100 rounded-2xl items-center justify-center mb-4">
              <Building2 className="text-blue-600" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Chào {userInfo.name}!</h1>
            <p className="text-gray-600 mt-2">Bạn là Super Admin — tạo workspace đầu tiên</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl p-8">
            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  Tên workspace <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900"
                  placeholder="VD: BKE Team, Công ty ABC..."
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">Mô tả (tùy chọn)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition text-gray-900 resize-none"
                  placeholder="VD: Workspace cho phòng marketing và CSKH"
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Đang tạo...' : 'Tạo workspace'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // ===== User thường: Trang chờ duyệt =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 bg-orange-100 rounded-2xl items-center justify-center mb-4">
            <Clock className="text-orange-600" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Chào {userInfo.name}!</h1>
          <p className="text-gray-600 mt-2">Tài khoản của bạn đang chờ phê duyệt</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>📧 Email đăng ký:</strong> {userInfo.email}
            </p>
          </div>

          <div className="space-y-3 text-sm text-gray-700">
            <h3 className="font-semibold text-gray-900 text-base">Bước tiếp theo:</h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>Liên hệ với <strong>Super Admin</strong> hoặc <strong>Owner workspace</strong> của bạn</li>
              <li>Cung cấp email Google của bạn (xem trên ô màu xanh ở trên)</li>
              <li>Admin sẽ duyệt và thêm bạn vào workspace</li>
              <li>Đăng nhập lại để sử dụng hệ thống</li>
            </ol>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-900 flex items-start gap-2">
              <Mail className="flex-shrink-0 mt-0.5" size={16} />
              <span>Hệ thống dành cho team BKE và đối tác. Mỗi tài khoản cần được Super Admin phê duyệt trước khi sử dụng.</span>
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 text-gray-600 border border-gray-300 py-3 rounded-lg font-medium hover:bg-gray-50 transition"
          >
            <LogOut size={16} />
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  )
}
