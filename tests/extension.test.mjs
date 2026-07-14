import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { TextEncoder } from 'node:util'
import { webcrypto } from 'node:crypto'
import JSZip from 'jszip'
import { JSDOM } from 'jsdom'

const contentScript = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8')

test('la extensión detecta una nota de voz y genera un paquete local', async () => {
  const dom = new JSDOM(`<!doctype html><body><main id="main"><header><span title="Contacto de prueba">Contacto de prueba</span></header><div class="message-in" data-id="bubble-1"><div data-pre-plain-text="[15:09, 11/07/2026] Contacto:"><audio></audio></div></div></main></body>`, { url: 'https://web.whatsapp.com/', runScripts: 'outside-only' })
  const { window } = dom
  Object.defineProperty(window, 'crypto', { value: webcrypto })
  Object.defineProperty(window, 'TextEncoder', { value: TextEncoder })
  Object.defineProperty(window, 'JSZip', { value: JSZip })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'currentSrc', { configurable: true, get: () => 'blob:https://web.whatsapp.com/audio-test' })
  Object.defineProperty(window.HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 2.4 })
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.fetch = async () => new Response(new Uint8Array([79, 103, 103, 83, 1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/ogg' } })
  let packageBlob = null
  window.URL.createObjectURL = blob => { packageBlob = blob; return 'blob:gore-package' }
  window.URL.revokeObjectURL = () => {}
  let downloadedAs = ''
  window.HTMLAnchorElement.prototype.click = function () { downloadedAs = this.download }
  window.eval(contentScript)
  assert.ok(window.document.getElementById('gore-capture-root'))
  window.document.getElementById('gore-analyze').click()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(window.document.getElementById('gore-found').textContent, '1')
  window.document.getElementById('gore-export').click()
  for (let attempt = 0; attempt < 100 && !downloadedAs; attempt++) await new Promise(resolve => setTimeout(resolve, 20))
  assert.match(downloadedAs, /^gore-whatsapp-contacto-de-prueba-\d{4}-\d{2}-\d{2}\.zip$/)
  assert.ok(packageBlob)
  assert.match(window.document.getElementById('gore-capture-status').textContent, /1 audios capturados y 0 no disponibles/)
  dom.window.close()
})

test('el manifiesto solicita solamente WhatsApp Web y almacenamiento local', async () => {
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.manifest_version, 3)
  assert.deepEqual(manifest.host_permissions, ['https://web.whatsapp.com/*'])
  assert.deepEqual(manifest.permissions, ['storage'])
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://web.whatsapp.com/*'])
})
