const MAX_REASON_LENGTH = 200

/**
 * Lý do đăng nhập thất bại, rút gọn để đi qua query string. Đây là thông báo
 * của Google/GoTrue (không chứa mã hay token), React sẽ escape khi hiển thị.
 */
export function compactAuthReason(raw: string | null | undefined): string | null {
  const text = raw?.replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, MAX_REASON_LENGTH) : null
}

/** Dịch các lỗi đăng nhập hay gặp sang hướng dẫn người dùng tự xử lý được. */
export function explainAuthFailure(reason: string | null): string {
  const lower = (reason ?? '').toLowerCase()
  if (lower.includes('access_denied') || lower.includes('access denied')) {
    return 'Bạn đã huỷ hoặc chưa cho phép đăng nhập bằng Google. Bấm đăng nhập lại và chọn "Cho phép".'
  }
  if (lower.includes('flow state') || lower.includes('code verifier') || lower.includes('code_verifier')) {
    return 'Phiên đăng nhập đã hết hạn hoặc được mở ở tab/trình duyệt khác. Đóng các tab đăng nhập cũ rồi bấm đăng nhập lại trong cùng một tab.'
  }
  if (lower.includes('signup') || lower.includes('signups not allowed')) {
    return 'Tài khoản Google này chưa được cấp quyền vào hệ thống. Liên hệ admin để được thêm.'
  }
  if (lower.includes('unable to exchange external code')) {
    return 'Google từ chối mã đăng nhập. Thử lại sau ít phút; nếu vẫn lỗi, báo admin kiểm tra cấu hình Google OAuth.'
  }
  if (lower.includes('fetch') || lower.includes('network')) {
    return 'Không kết nối được máy chủ đăng nhập. Kiểm tra mạng rồi thử lại.'
  }
  return 'Đăng nhập thất bại. Vui lòng thử lại.'
}
