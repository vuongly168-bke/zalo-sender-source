export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  is_super_admin: boolean
  is_banned: boolean
  created_at: string
  updated_at: string
}

export interface Workspace {
  id: string
  name: string
  description: string | null
  help_url: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
  profiles?: Profile
}

export interface ZaloAccount {
  id: string
  workspace_id: string
  name: string
  phone_number: string | null
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  api_keys?: ApiKey[]
}

export interface ApiKey {
  id: string
  zalo_account_id: string
  key_type: 'group_send_images' | 'group_send_message' | 'get_group_info' | 'user_send_message' | 'user_send_images' | 'get_user_info'
  api_url: string
  bearer_token: string
  account_token: string | null
  created_at: string
  updated_at: string
}

// Các key_type yêu cầu thêm header Account-Token (ngoài Bearer token)
export const KEYS_NEED_ACCOUNT_TOKEN: ApiKey['key_type'][] = [
  'user_send_message',
  'user_send_images',
  'get_user_info',
]

export interface Project {
  id: string
  workspace_id: string
  zalo_account_id: string | null
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  zalo_accounts?: ZaloAccount
  zalo_groups?: ZaloGroup[]
  campaigns?: Campaign[]
}

export interface ZaloGroup {
  id: string
  project_id: string
  group_name: string
  group_id: string
  group_link: string | null
  member_count: number
  is_active: boolean
  import_batch_id: string | null
  created_at: string
}

export interface Campaign {
  id: string
  project_id: string
  name: string
  message: string | null
  image_url: string | null
  image_urls: string[]
  scheduled_at: string | null
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'partial' | 'failed' | 'active' | 'completed' | 'paused'
  // Recurring fields
  is_recurring?: boolean
  recurrence_unit?: 'day' | 'week' | 'month' | null
  recurrence_interval?: number | null
  recurrence_days_of_week?: number[] | null
  recurrence_end_type?: 'never' | 'date' | 'count' | null
  recurrence_end_date?: string | null
  recurrence_end_count?: number | null
  recurrence_count_done?: number
  recurring_parent_id?: string | null
  next_run_at?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  campaign_groups?: CampaignGroup[]
}

export interface CampaignGroup {
  id: string
  campaign_id: string
  zalo_group_id: string
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error_message: string | null
  zalo_groups?: ZaloGroup
}

export interface Contact {
  id: string
  workspace_id: string
  phone: string
  name: string | null
  zalo_user_id: string | null
  avatar_url: string | null
  tags: string[]
  notes: string | null
  last_synced_at: string | null
  import_batch_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ContactList {
  id: string
  workspace_id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  contact_count?: number
}

export interface PersonalCampaign {
  id: string
  workspace_id: string
  zalo_account_id: string | null
  name: string
  message: string | null
  image_url: string | null
  image_urls: string[]
  scheduled_at: string | null
  batch_size: number
  batch_delay_minutes: number
  message_delay_seconds?: number
  current_batch: number
  last_batch_sent_at: string | null
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'partial' | 'failed' | 'paused'
  created_by: string | null
  created_at: string
  updated_at: string
  zalo_accounts?: ZaloAccount
}

export interface PersonalCampaignRecipient {
  id: string
  campaign_id: string
  contact_id: string
  batch_number: number | null
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error_message: string | null
  contacts?: Contact
}

export interface ImportBatch {
  id: string
  workspace_id: string
  user_id: string | null
  type: 'contacts' | 'groups' | 'campaigns'
  file_name: string | null
  total_rows: number
  success_rows: number
  failed_rows: number
  error_log: Array<{ row: number; error: string }>
  created_at: string
}

// Tên API HOA theo đúng tên func.vn để user dễ đối chiếu
export const API_KEY_LABELS: Record<ApiKey['key_type'], string> = {
  get_group_info: 'GET_GROUP_INFO_BY_LINK',
  group_send_message: 'GROUP_SEND_MESSAGE',
  group_send_images: 'GROUP_SEND_IMAGES',
  get_user_info: 'GET_USER_INFO',
  user_send_message: 'USER_SEND_MESSAGE',
  user_send_images: 'USER_SEND_IMAGES',
}

// Mô tả ngắn dưới label (giúp user hiểu chức năng)
export const API_KEY_DESCRIPTIONS: Record<ApiKey['key_type'], string> = {
  get_group_info: 'Lấy thông tin Group (tên + group_id) từ link Zalo',
  group_send_message: 'Gửi tin nhắn text tới nhóm Zalo',
  group_send_images: 'Gửi ảnh tới nhóm Zalo',
  get_user_info: 'Lấy thông tin User (tên + user_id) từ SĐT',
  user_send_message: 'Gửi tin nhắn text cá nhân theo SĐT / User ID',
  user_send_images: 'Gửi ảnh cá nhân theo SĐT / User ID',
}

// Các key đặc biệt cần highlight (lookup-type, cần config trước khi gửi)
export const HIGHLIGHTED_KEYS: ApiKey['key_type'][] = ['get_group_info', 'get_user_info']

// Thứ tự ưu tiên hiển thị: GET đầu tiên (cần config trước), rồi đến SEND
export const API_KEY_GROUPS: { title: string; keys: ApiKey['key_type'][]; icon: string; description: string }[] = [
  {
    title: 'Gửi tin nhóm Zalo',
    icon: '👥',
    description: 'Cần 3 API để gửi tin tới nhóm Zalo',
    keys: ['get_group_info', 'group_send_message', 'group_send_images'],
  },
  {
    title: 'Gửi tin cá nhân (SĐT)',
    icon: '📞',
    description: 'Cần 3 API để gửi tin tới khách hàng theo SĐT',
    keys: ['get_user_info', 'user_send_message', 'user_send_images'],
  },
]

export const CAMPAIGN_STATUS_LABELS: Record<Campaign['status'], { label: string; color: string; icon: string }> = {
  draft: { label: 'Nháp', color: 'bg-gray-100 text-gray-700', icon: '📝' },
  scheduled: { label: 'Chờ gửi', color: 'bg-blue-100 text-blue-700', icon: '⏳' },
  sending: { label: 'Đang gửi', color: 'bg-yellow-100 text-yellow-700', icon: '🔄' },
  sent: { label: 'Đã gửi', color: 'bg-green-100 text-green-700', icon: '✅' },
  partial: { label: 'Gửi 1 phần', color: 'bg-orange-100 text-orange-700', icon: '⚠️' },
  failed: { label: 'Lỗi', color: 'bg-red-100 text-red-700', icon: '❌' },
  active: { label: 'Đang lặp', color: 'bg-purple-100 text-purple-700', icon: '🔁' },
  completed: { label: 'Đã xong', color: 'bg-emerald-100 text-emerald-700', icon: '🏁' },
  paused: { label: 'Tạm dừng', color: 'bg-purple-100 text-purple-700', icon: '⏸️' },
}

const DOW_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export function describeRecurrence(c: Campaign): string {
  if (!c.is_recurring) return ''
  const parts: string[] = []
  if (c.recurrence_unit === 'day') {
    parts.push(c.recurrence_interval === 1 ? 'Mỗi ngày' : `Mỗi ${c.recurrence_interval} ngày`)
  } else if (c.recurrence_unit === 'week') {
    parts.push(c.recurrence_interval === 1 ? 'Mỗi tuần' : `Mỗi ${c.recurrence_interval} tuần`)
    if (c.recurrence_days_of_week && c.recurrence_days_of_week.length > 0) {
      parts.push('vào ' + c.recurrence_days_of_week.map(d => DOW_LABELS[d - 1] || `?`).join(', '))
    }
  } else if (c.recurrence_unit === 'month') {
    parts.push(c.recurrence_interval === 1 ? 'Mỗi tháng' : `Mỗi ${c.recurrence_interval} tháng`)
  }
  if (c.recurrence_end_type === 'date' && c.recurrence_end_date) {
    parts.push(`đến ${new Date(c.recurrence_end_date).toLocaleDateString('vi-VN')}`)
  } else if (c.recurrence_end_type === 'count' && c.recurrence_end_count) {
    parts.push(`${c.recurrence_count_done || 0}/${c.recurrence_end_count} lần`)
  }
  return parts.join(' ')
}

export const PERSONAL_CAMPAIGN_STATUS_LABELS: Record<PersonalCampaign['status'], { label: string; color: string; icon: string }> = {
  draft: { label: 'Nháp', color: 'bg-gray-100 text-gray-700', icon: '📝' },
  scheduled: { label: 'Chờ gửi', color: 'bg-blue-100 text-blue-700', icon: '⏳' },
  sending: { label: 'Đang gửi', color: 'bg-yellow-100 text-yellow-700', icon: '🔄' },
  sent: { label: 'Đã gửi', color: 'bg-green-100 text-green-700', icon: '✅' },
  partial: { label: 'Gửi 1 phần', color: 'bg-orange-100 text-orange-700', icon: '⚠️' },
  failed: { label: 'Lỗi', color: 'bg-red-100 text-red-700', icon: '❌' },
  paused: { label: 'Tạm dừng', color: 'bg-purple-100 text-purple-700', icon: '⏸️' },
}
