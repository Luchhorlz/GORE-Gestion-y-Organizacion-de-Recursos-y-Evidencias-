const API_BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include' })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'DELETE', credentials: 'include' })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

export async function apiUpload<T>(path: string, file: File, eventId?: string, factDate?: string, metadata?: { chatMessageRef?: string; matchConfidence?: string; matchDetails?: string }): Promise<T> {
  const data = new FormData()
  data.append('file', file, file.name)
  data.append('device_origin', navigator.userAgent)
  if (eventId) data.append('event_id', eventId)
  if (factDate) data.append('fact_date', factDate)
  if (metadata?.chatMessageRef) data.append('chat_message_ref', metadata.chatMessageRef)
  if (metadata?.matchConfidence) data.append('match_confidence', metadata.matchConfidence)
  if (metadata?.matchDetails) data.append('match_details', metadata.matchDetails)
  const response = await fetch(`${API_BASE}${path}`, { method: 'POST', credentials: 'include', body: data })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json() as Promise<T>
}

export function evidenceDownloadUrl(id: string) {
  if (!id) return '#whatsapp-chat'
  return `${API_BASE}/api/evidence/${encodeURIComponent(id)}/download`
}

export function apiFileUrl(path: string) {
  return `${API_BASE}${path}`
}
