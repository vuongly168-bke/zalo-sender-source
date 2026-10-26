export function canManuallyRunCron(
  workspaceRole: string | null | undefined,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || workspaceRole === 'owner' || workspaceRole === 'admin'
}
