export function authRedirectOrigin(requestUrl: string, configuredSiteUrl?: string): string {
  const candidate = configuredSiteUrl?.trim() || requestUrl
  const url = new URL(candidate)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid auth redirect origin')
  }
  return url.origin
}

export function safeInternalPath(
  value: string | null | undefined,
  fallback = '/dashboard',
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback

  try {
    const base = new URL('https://internal.invalid')
    const target = new URL(value, base)
    if (target.origin !== base.origin) return fallback
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return fallback
  }
}
