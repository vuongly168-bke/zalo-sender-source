import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { getActiveServerWorkspace } from '@/lib/workspace-context-server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const { currentWorkspace, workspaces } = await getActiveServerWorkspace(supabase, user.id)

  if (!currentWorkspace) redirect('/setup-workspace')

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('workspace_id', currentWorkspace.id)
    .order('created_at', { ascending: false })

  // Lấy global help URL (fallback nếu workspace không có riêng)
  const { data: globalSettings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'global_help_url')
    .single()
  const globalHelpUrl = globalSettings?.value || null

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        user={user}
        profile={profile}
        workspace={currentWorkspace}
        workspaces={workspaces}
        projects={projects || []}
        role={currentWorkspace.role}
        globalHelpUrl={globalHelpUrl}
      />
      <main className="flex-1 lg:ml-64 p-4 sm:p-6 lg:p-8 pt-16 lg:pt-8 w-full min-w-0">
        {children}
      </main>
    </div>
  )
}
