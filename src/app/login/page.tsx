'use client'

import { useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { explainAuthFailure } from '@/lib/auth-error'

function LoginContent() {
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const reason = searchParams.get('reason')
  const [clientError, setClientError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleGoogleLogin() {
    setLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
    if (error) {
      console.error(error)
      setClientError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Zalo Sender</h1>
          <p className="text-gray-600 mt-2">Nền tảng gửi tin nhắn Zalo tự động</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Đăng nhập</h2>
          <p className="text-sm text-gray-500 mb-6">Sử dụng tài khoản Google của bạn</p>

          {(error || clientError) && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p>{explainAuthFailure(clientError ?? reason)}</p>
                {(clientError ?? reason) && (
                  <p className="mt-1 text-xs text-red-500 break-words">Chi tiết: {clientError ?? reason}</p>
                )}
              </div>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:border-blue-500 hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
              <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
              <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
              <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
            </svg>
            <span>{loading ? 'Đang chuyển hướng...' : 'Đăng nhập với Google'}</span>
          </button>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              Bằng cách đăng nhập, bạn đồng ý cho phép Zalo Sender truy cập email và tên hiển thị của tài khoản Google. Chúng tôi không lưu mật khẩu.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Hệ thống dành cho team BKE và đối tác. Liên hệ admin nếu bạn cần truy cập.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100" />}>
      <LoginContent />
    </Suspense>
  )
}
