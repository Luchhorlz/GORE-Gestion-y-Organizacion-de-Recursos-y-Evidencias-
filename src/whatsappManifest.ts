export type AssociationStatus = 'CAPTURED_FROM_SPECIFIC_BUBBLE' | 'DIRECT_USER_CONFIRMED' | 'PROBABLE' | 'AMBIGUOUS' | 'MISSING_FILE' | 'UNSUPPORTED'

export type GoreWhatsAppMessage = {
  id: string
  position: number
  sender: string | null
  direction: 'incoming' | 'outgoing' | 'system'
  visibleTimestamp: string | null
  type: 'text' | 'voice_note' | 'system'
  text: string | null
  mediaId: string | null
  associationStatus: AssociationStatus
  associationEvidence: string[]
}

export type GoreWhatsAppMedia = {
  id: string
  originalFilename: string
  exportedFilename: string
  mimeType: string
  size: number
  durationMs: number | null
  sha256: string
}

export type GoreWhatsAppManifest = {
  schemaVersion: 1
  createdAt: string
  source: { application: 'WhatsApp Web'; extractionMethod: 'chrome_extension'; extensionVersion: string }
  chat: { stableKey: string; displayName: string; isGroup: boolean }
  messages: GoreWhatsAppMessage[]
  media: GoreWhatsAppMedia[]
}

export function validateGoreWhatsAppManifest(value: unknown): GoreWhatsAppManifest {
  if (!value || typeof value !== 'object') throw new Error('El manifiesto no es válido.')
  const manifest = value as Partial<GoreWhatsAppManifest>
  if (manifest.schemaVersion !== 1 || manifest.source?.application !== 'WhatsApp Web' || manifest.source.extractionMethod !== 'chrome_extension') throw new Error('El paquete no fue generado por una extensión GORE compatible.')
  if (!manifest.chat?.stableKey || !manifest.chat.displayName || !Array.isArray(manifest.messages) || !Array.isArray(manifest.media)) throw new Error('El manifiesto está incompleto.')
  const mediaIds = new Set(manifest.media.map(item => item.id))
  for (const item of manifest.media) {
    if (!item.id || !item.exportedFilename.startsWith('media/') || !/^[a-f0-9]{64}$/i.test(item.sha256) || item.size < 0) throw new Error('El inventario multimedia es inválido.')
  }
  for (const message of manifest.messages) {
    if (!message.id || !Number.isInteger(message.position) || !Array.isArray(message.associationEvidence)) throw new Error('El inventario de mensajes es inválido.')
    if (message.mediaId && !mediaIds.has(message.mediaId)) throw new Error('Un mensaje referencia un audio inexistente.')
  }
  return manifest as GoreWhatsAppManifest
}

export async function sha256Hex(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
