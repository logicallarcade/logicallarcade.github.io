export function escapeHTML(str: string): string {
  if (!str) return ''
  return str.replace(/[&<>'"]/g, (tag) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[tag] ?? tag))
}

export function generateRoomCode(length = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export function getOrCreateUsername(): string {
  if (typeof window === 'undefined') return 'User_000'
  const saved = localStorage.getItem('logicall_username')
  if (saved) return saved
  const name = 'User_' + Math.floor(100 + Math.random() * 900)
  localStorage.setItem('logicall_username', name)
  return name
}

export function saveUsername(name: string): void {
  if (typeof window !== 'undefined' && name.trim()) {
    localStorage.setItem('logicall_username', name.trim())
  }
}
