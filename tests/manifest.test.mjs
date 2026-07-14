import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sha256Hex, validateGoreWhatsAppManifest } from '../src/whatsappManifest.ts'

const hash = 'a'.repeat(64)
const valid = {
  schemaVersion: 1,
  createdAt: '2026-07-13T18:00:00-03:00',
  source: { application: 'WhatsApp Web', extractionMethod: 'chrome_extension', extensionVersion: '1.0.0' },
  chat: { stableKey: 'chat-test', displayName: 'Contacto', isGroup: false },
  messages: [{ id: 'msg-1', position: 1, sender: 'Contacto', direction: 'incoming', visibleTimestamp: '15:09, 11/07/2026', type: 'voice_note', text: null, mediaId: 'media-1', associationStatus: 'CAPTURED_FROM_SPECIFIC_BUBBLE', associationEvidence: ['specific-bubble'] }],
  media: [{ id: 'media-1', originalFilename: 'audio.ogg', exportedFilename: 'media/audio.ogg', mimeType: 'audio/ogg', size: 4, durationMs: 1000, sha256: hash }],
}

test('GORE acepta un manifiesto compatible y rechaza referencias rotas', () => {
  assert.equal(validateGoreWhatsAppManifest(valid).chat.stableKey, 'chat-test')
  assert.throws(() => validateGoreWhatsAppManifest({ ...valid, messages: [{ ...valid.messages[0], mediaId: 'missing' }] }), /inexistente/)
  assert.throws(() => validateGoreWhatsAppManifest({ ...valid, media: [{ ...valid.media[0], sha256: 'incorrecto' }] }), /multimedia/)
})

test('el SHA-256 compartido es determinístico', async () => {
  const bytes = new TextEncoder().encode('GORE').buffer
  assert.equal(await sha256Hex(bytes), '537ef8a709780e88a074297e1f5f964b60cc7b0b44c48e1fae11a26e18212723')
})
