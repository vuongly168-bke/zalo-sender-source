'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, FolderOpen, Settings, Users, LogOut, Plus,
  ChevronDown, ChevronRight, Shield, Building2, Mail, ChevronUp,
  Menu, X, BookOpen, ExternalLink, Phone, Send, History,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'

interface SidebarProps {
  user: User
  profile: Profile | null
  workspace: { id: string; name: string; role: string; help_url?: string | null }
  workspaces: { id: string; name: string; role: string; help_url?: string | null }[]
  projects: { id: string; name: string }[]
  role: string
  globalHelpUrl?: string | null
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: 'bg-purple-100 text-purple-700' },
  admin: { label: 'Admin', color: 'bg-blue-100 text-blue-700' },
  member: { label: 'Member', color: 'bg-gray-100 text-gray-700' },
}

export function Sidebar({ user, profile, workspace, workspaces, projects, role, globalHelpUrl }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Click outside to close dropdown
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Auto close mobile sidebar khi đổi route
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Lock body scroll khi mobile sidebar mở
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleWorkspaceChange(workspaceId: string) {
    if (!workspaceId || workspaceId === workspace.id) return
    const response = await fetch('/api/workspace/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId }),
    })
    if (!response.ok) {
      alert('Không thể chuyển workspace. Vui lòng thử lại.')
      return
    }
    setMobileOpen(false)
    router.push('/dashboard')
    router.refresh()
  }

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/')
  const roleInfo = ROLE_LABELS[role] || ROLE_LABELS.member

  return (
    <>
      {/* Mobile hamburger button (chỉ hiện trên mobile) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-30 bg-white border border-gray-200 rounded-lg p-2 shadow-sm hover:bg-gray-50"
        aria-label="Mở menu"
      >
        <Menu size={20} className="text-gray-700" />
      </button>

      {/* Backdrop overlay (mobile) */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="lg:hidden fixed inset-0 bg-black/40 z-40 transition-opacity"
        />
      )}

      <aside
        className={`bg-white border-r border-gray-200 fixed top-0 left-0 h-screen flex flex-col transition-transform z-50
          [height:100svh]
          w-64
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
      {/* Close button (mobile only) */}
      <button
        onClick={() => setMobileOpen(false)}
        className="lg:hidden absolute top-3 right-3 z-10 bg-gray-100 hover:bg-gray-200 rounded-lg p-1.5"
        aria-label="Đóng menu"
      >
        <X size={18} className="text-gray-700" />
      </button>

      {/* Header với workspace info rõ ràng */}
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-lg font-bold text-blue-600">Zalo Sender</h1>
        <div className="mt-2 px-2 py-2 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
          <p className="text-xs text-blue-700 font-medium uppercase tracking-wider">Workspace</p>
          <div className="flex items-center gap-2 mt-1">
            <Building2 size={14} className="text-blue-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-gray-900 truncate" title={workspace.name}>
              {workspace.name}
            </p>
          </div>
          {workspaces.length > 1 && (
            <select
              value={workspace.id}
              onChange={(event) => handleWorkspaceChange(event.target.value)}
              className="mt-2 w-full bg-white border border-blue-200 rounded-md px-2 py-1.5 text-xs text-gray-800"
              aria-label="Chuyển workspace"
            >
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>{item.name} · {ROLE_LABELS[item.role]?.label || item.role}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
            pathname === '/dashboard'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <LayoutDashboard size={18} />
          Tổng quan
        </Link>

        <div className="mt-4">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            👥 Gửi nhóm Zalo
          </p>
        </div>

        <div className="mt-1">
          <button
            onClick={() => setProjectsOpen(!projectsOpen)}
            className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider"
          >
            <span className="flex items-center gap-2">
              <FolderOpen size={14} />
              Dự án
            </span>
            {projectsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {projectsOpen && (
            <div className="space-y-0.5 ml-2">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
                    isActive(`/dashboard/projects/${project.id}`)
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                  <span className="truncate">{project.name}</span>
                </Link>
              ))}

              <Link
                href="/dashboard/projects?new=true"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 transition"
              >
                <Plus size={14} />
                Tạo dự án mới
              </Link>
            </div>
          )}
        </div>

        {/* Section: Gửi cá nhân */}
        <div className="mt-6">
          <p className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            📞 Gửi cá nhân (SĐT)
          </p>
          <Link
            href="/dashboard/contacts"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              isActive('/dashboard/contacts')
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Phone size={16} />
            Khách hàng
          </Link>
          <Link
            href="/dashboard/personal-campaigns"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
              isActive('/dashboard/personal-campaigns')
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Send size={16} />
            Đợt gửi cá nhân
          </Link>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-100 space-y-1">
          {(role === 'owner' || role === 'admin' || profile?.is_super_admin) && (
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive('/dashboard/settings')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Settings size={18} />
              Cài đặt API
            </Link>
          )}

          {(role === 'owner' || role === 'admin') && (
            <Link
              href="/dashboard/members"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive('/dashboard/members')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Users size={18} />
              Quản lý thành viên
            </Link>
          )}

          {(role === 'owner' || role === 'admin' || profile?.is_super_admin) && (
            <Link
              href="/dashboard/audit-log"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive('/dashboard/audit-log')
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <History size={18} />
              Lịch sử hoạt động
            </Link>
          )}

          {profile?.is_super_admin && (
            <Link
              href="/dashboard/admin"
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive('/dashboard/admin')
                  ? 'bg-purple-50 text-purple-700'
                  : 'text-purple-700 hover:bg-purple-50'
              }`}
            >
              <Shield size={18} />
              Super Admin
            </Link>
          )}
        </div>

        {/* Đăng xuất menu item — luôn nằm trong nav (scrollable) để truy cập được */}
        {/* trên mọi browser, kể cả Chrome iOS khi bottom toolbar che footer */}
        <div className="mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition"
          >
            <LogOut size={18} />
            Đăng xuất
          </button>
        </div>

        {/* Help link: ưu tiên workspace.help_url, fallback globalHelpUrl */}
        {(workspace.help_url || globalHelpUrl) && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <a
              href={workspace.help_url || globalHelpUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition group"
            >
              <BookOpen size={18} />
              <span className="flex-1">Hướng dẫn sử dụng</span>
              <ExternalLink size={14} className="opacity-50 group-hover:opacity-100 transition" />
            </a>
          </div>
        )}
      </nav>

      {/* User dropdown menu — flex-shrink-0 để không bị scroll mất, pb-safe cho iOS notch */}
      <div
        className="p-3 border-t border-gray-200 relative flex-shrink-0 bg-white"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        ref={userMenuRef}
      >
        {userMenuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 max-h-[70vh] overflow-y-auto">
            {/* User info */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0">
                  {(profile?.full_name || user.email || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {profile?.full_name || 'User'}
                  </p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${roleInfo.color}`}>
                    {profile?.is_super_admin ? '👑 Super Admin' : roleInfo.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="p-4 space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Mail size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-gray-900 truncate" title={user.email}>{user.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Building2 size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500">Workspace</p>
                  <p className="text-gray-900 truncate">{workspace.name}</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 p-3 text-sm font-medium text-red-600 hover:bg-red-50 transition border-t border-gray-100"
            >
              <LogOut size={16} />
              Đăng xuất
            </button>
          </div>
        )}

        <div className="flex items-stretch gap-1">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg transition ${
              userMenuOpen ? 'bg-gray-100' : 'hover:bg-gray-100'
            }`}
          >
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-medium text-sm flex-shrink-0">
              {(profile?.full_name || user.email || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900 truncate">{profile?.full_name || 'User'}</p>
              <p className="text-xs text-gray-500 truncate">
                {profile?.is_super_admin ? '👑 Super Admin' : roleInfo.label}
              </p>
            </div>
            {userMenuOpen ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronUp size={16} className="text-gray-400" />}
          </button>

          {/* Nút Đăng xuất nhanh — luôn hiển thị (đặc biệt cần cho mobile) */}
          <button
            onClick={handleLogout}
            className="flex items-center justify-center w-10 rounded-lg text-red-600 hover:bg-red-50 transition border border-transparent hover:border-red-200"
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
    </>
  )
}
