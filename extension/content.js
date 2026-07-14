(() => {
  if (window.top !== window || document.getElementById('gore-capture-root')) return
  const VERSION = '1.2.0'
  const voiceControlSelector = 'button[aria-label*="Reproducir" i],button[aria-label*="Play" i],[data-icon="audio-play"],[data-icon="audio-pause"],[data-testid*="audio-play"],[data-testid*="audio-pause"]'
  const state = { audioRecords: new Map(), messageRecords: new Map(), knownMessageKeys: new Set(), knownAudioKeys: new Set(), checkpointKey: '', checkpointFound: false, lastVoiceKey: '', discovery: 0, busy: false, cancelled: false }
  const encoder = new TextEncoder()
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const hex = buffer => Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, '0')).join('')
  const digest = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? encoder.encode(value) : value))
  const slug = value => (value || 'chat').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50) || 'chat'
  async function storageGet(key) { if (!globalThis.chrome?.storage?.local) return null; return (await chrome.storage.local.get(key))[key] || null }
  async function storageSet(key, value) { if (globalThis.chrome?.storage?.local) await chrome.storage.local.set({ [key]: value }) }
  async function storageRemove(key) { if (globalThis.chrome?.storage?.local) await chrome.storage.local.remove(key) }
  function setStatus(text) { document.getElementById('gore-capture-status').textContent = text }
  function updateCounters() {
    document.getElementById('gore-found').textContent = String(state.audioRecords.size)
    const processed = [...state.audioRecords.values()].filter(item => item.buffer || item.error).length
    document.getElementById('gore-processed').textContent = String(processed)
    document.querySelector('.gore-progress span').style.width = `${state.audioRecords.size ? processed / state.audioRecords.size * 100 : 0}%`
  }
  function chatName() {
    const header = document.querySelector('#main header,[data-testid="conversation-panel-wrapper"] header,header')
    return header?.querySelector('[title]')?.getAttribute('title') || header?.querySelector('[dir="auto"]')?.textContent?.trim() || 'Chat de WhatsApp'
  }
  function bubbleFor(element) { return element?.closest('[data-id]') || element?.closest('[data-testid="msg-container"]') || element?.closest('[role="row"]') || element?.closest('.message-in,.message-out') || element?.parentElement?.parentElement?.parentElement }
  function metadata(bubble) {
    if (!bubble) return { sender: 'Contacto', visibleTimestamp: null, direction: 'incoming' }
    const copyable = bubble.querySelector('[data-pre-plain-text]'); const pre = copyable?.getAttribute('data-pre-plain-text') || ''
    const match = pre.match(/^\[([^\]]+)]\s*([^:]+):/); const incoming = Boolean(bubble.closest('.message-in') || bubble.classList.contains('message-in'))
    return { sender: match?.[2]?.trim() || (incoming ? 'Contacto' : 'Yo'), visibleTimestamp: match?.[1]?.trim() || null, direction: incoming ? 'incoming' : 'outgoing' }
  }
  function bubbleKey(bubble) {
    const direct = bubble?.getAttribute('data-id') || bubble?.getAttribute('data-testid')
    if (direct && direct !== 'msg-container') return `id:${direct}`
    const copyable = bubble?.querySelector('[data-pre-plain-text]'); const pre = copyable?.getAttribute('data-pre-plain-text') || ''
    return `local:${pre}:${copyable?.textContent?.trim().slice(0, 120) || 'voice'}:${bubble?.classList.contains('message-in') ? 'in' : 'out'}`
  }
  function candidateBubbles() {
    const seen = new Set()
    return [...document.querySelectorAll('[data-id],[data-testid="msg-container"],[role="row"]')].filter(bubble => (bubble.querySelector('[data-pre-plain-text]') || bubble.querySelector('audio') || bubble.querySelector(voiceControlSelector)) && !seen.has(bubbleKey(bubble)) && seen.add(bubbleKey(bubble)))
  }
  function collectVisible() {
    const bubbles = candidateBubbles()
    for (const bubble of bubbles) {
      const key = bubbleKey(bubble); const info = metadata(bubble); const copyable = bubble.querySelector('[data-pre-plain-text]')
      if (state.knownMessageKeys.has(key)) { state.checkpointFound = true; continue }
      if (!state.messageRecords.has(key)) state.messageRecords.set(key, { key, ...info, text: copyable?.textContent?.trim() || null, discovered: state.discovery++ })
    }
    const seen = new Set()
    const elements = [...document.querySelectorAll('audio'), ...document.querySelectorAll(voiceControlSelector)]
    for (const element of elements) {
      const bubble = bubbleFor(element); if (!bubble) continue
      const key = bubbleKey(bubble); if (seen.has(key)) continue; seen.add(key)
      if (state.knownAudioKeys.has(key) || state.knownMessageKeys.has(key)) continue
      const audio = bubble.querySelector('audio') || (element.matches?.('audio') ? element : null); const existing = state.audioRecords.get(key)
      const record = existing || { key, ...metadata(bubble), discovered: state.discovery++, buffer: null, hash: '', mime: '', extension: '', durationMs: null, error: '' }
      record.bubble = bubble; record.audio = audio; record.control = bubble.querySelector(voiceControlSelector) || (element.matches?.(voiceControlSelector) ? element : null); record.source ||= audio?.currentSrc || audio?.src || ''
      state.audioRecords.set(key, record)
    }
    updateCounters(); return bubbles
  }
  function findScroller(bubbles) {
    const preferred = document.querySelector('[data-testid="conversation-panel-messages"]')
    if (preferred && preferred.scrollHeight > preferred.clientHeight + 100) return preferred
    let node = bubbles[0]?.parentElement
    while (node && node !== document.body) { if (node.scrollHeight > node.clientHeight + 150) return node; node = node.parentElement }
    return [...document.querySelectorAll('div')].find(item => item.scrollHeight > item.clientHeight + 500 && item.querySelector('[data-pre-plain-text]')) || null
  }
  async function ensureSource(record) {
    if (record.source) return record.source
    const currentBubble = record.bubble?.isConnected ? record.bubble : null; const control = currentBubble?.querySelector(voiceControlSelector) || record.control
    if (!control?.isConnected) throw new Error('El control de reproducción dejó de estar visible antes de capturarse')
    state.lastVoiceKey = record.key; control.click()
    for (let attempt = 0; attempt < 30 && !record.source; attempt++) {
      await sleep(100)
      record.source ||= record.audio?.currentSrc || record.audio?.src || ''
    }
    document.querySelectorAll('audio').forEach(audio => { if (!audio.paused) audio.pause() })
    if (!record.source) throw new Error('WhatsApp no expuso el archivo después de activar el reproductor')
    return record.source
  }
  async function preserveVisible(record) {
    if (record.buffer || record.error || state.cancelled) return
    try {
      record.bubble?.classList.add('gore-current')
      const source = await ensureSource(record); const response = await fetch(source)
      if (!response.ok) throw new Error(`No se pudo leer el audio (${response.status})`)
      record.buffer = await response.arrayBuffer(); if (!record.buffer.byteLength) throw new Error('Audio vacío')
      record.hash = await digest(record.buffer); record.mime = response.headers.get('content-type') || 'audio/ogg'; record.extension = record.mime.includes('mpeg') ? 'mp3' : record.mime.includes('mp4') ? 'm4a' : 'ogg'
      record.durationMs = Number.isFinite(record.audio?.duration) ? Math.round(record.audio.duration * 1000) : null
    } catch (error) { record.error = String(error?.message || error) }
    finally { record.bubble?.classList.remove('gore-current'); updateCounters() }
  }
  async function scanHistory() {
    if (state.busy) return
    state.audioRecords.clear(); state.messageRecords.clear(); state.knownMessageKeys.clear(); state.knownAudioKeys.clear(); state.discovery = 0; state.cancelled = false; state.checkpointFound = false; state.busy = true
    document.getElementById('gore-analyze').disabled = true; document.getElementById('gore-export').disabled = true; document.getElementById('gore-cancel').disabled = false
    state.checkpointKey = `gore-checkpoint-${(await digest(chatName())).slice(0, 24)}`
    const checkpoint = await storageGet(state.checkpointKey)
    if (checkpoint?.messageKeys) state.knownMessageKeys = new Set(checkpoint.messageKeys)
    if (checkpoint?.audioKeys) state.knownAudioKeys = new Set(checkpoint.audioKeys)
    let bubbles = candidateBubbles(); const scroller = findScroller(bubbles)
    if (!scroller) { collectVisible(); setStatus(`${state.audioRecords.size} audios visibles detectados. No pudimos identificar el contenedor desplazable.`); finishBusy(); return }
    setStatus(checkpoint ? 'Buscando audios nuevos hasta el último punto procesado…' : 'Primer uso: recorriendo el historial completo…'); scroller.scrollTop = scroller.scrollHeight; await sleep(900)
    let stableTopRounds = 0; let previousSignature = ''; let rounds = 0
    while (!state.cancelled && !state.checkpointFound && stableTopRounds < 4 && rounds++ < 1500) {
      bubbles = collectVisible()
      for (const record of [...state.audioRecords.values()].filter(item => item.bubble?.isConnected && !item.buffer && !item.error)) {
        setStatus(`Recorriendo historial · ${state.audioRecords.size} encontrados · ${[...state.audioRecords.values()].filter(item => item.buffer).length} preservados…`)
        await preserveVisible(record); if (state.cancelled) break
      }
      const first = bubbles[0]; const signature = first ? bubbleKey(first) : ''
      const previousTop = scroller.scrollTop; scroller.scrollTop = Math.max(0, previousTop - Math.max(420, scroller.clientHeight * .78)); await sleep(previousTop <= 5 ? 1300 : 650)
      if (scroller.scrollTop <= 5 && signature === previousSignature) stableTopRounds++; else stableTopRounds = 0
      previousSignature = signature
    }
    const captured = [...state.audioRecords.values()].filter(item => item.buffer).length; const errors = [...state.audioRecords.values()].filter(item => item.error).length
    setStatus(state.cancelled ? `Recorrido cancelado: ${captured} audios preservados.` : state.checkpointFound ? `Punto anterior encontrado: ${captured} audios nuevos preservados y ${errors} no disponibles.` : `Recorrido completo: ${state.audioRecords.size} encontrados, ${captured} preservados y ${errors} no disponibles.`)
    finishBusy()
  }
  function finishBusy() { state.busy = false; document.getElementById('gore-analyze').disabled = false; document.getElementById('gore-export').disabled = false; document.getElementById('gore-cancel').disabled = true }
  function timestampValue(value) {
    const text = value || ''; const date = text.match(/([0-3]?\d)[/.-]([01]?\d)[/.-](20\d{2}|\d{2})/); const time = text.match(/([0-2]?\d):([0-5]\d)/)
    if (!date || !time) return 0; const year = Number(date[3]) < 100 ? 2000 + Number(date[3]) : Number(date[3]); return new Date(year, Number(date[2]) - 1, Number(date[1]), Number(time[1]), Number(time[2])).getTime()
  }
  async function capture() {
    if (state.busy) return
    if (!state.audioRecords.size) await scanHistory()
    if (!state.audioRecords.size) return
    state.busy = true; state.cancelled = false; document.getElementById('gore-export').disabled = true; document.getElementById('gore-cancel').disabled = false
    const zip = new JSZip(); const media = []; const messages = []; const errors = []; const displayName = chatName(); const stableKey = (await digest(displayName)).slice(0, 24)
    for (const record of [...state.audioRecords.values()].filter(item => !item.buffer && !item.error && item.bubble?.isConnected)) await preserveVisible(record)
    const orderedMessages = [...state.messageRecords.values()].sort((left, right) => timestampValue(left.visibleTimestamp) - timestampValue(right.visibleTimestamp) || left.discovered - right.discovered)
    const positions = new Map(orderedMessages.map((item, index) => [item.key, index + 1])); let nextPosition = positions.size + 1
    for (const item of orderedMessages) {
      if (state.audioRecords.has(item.key)) continue
      const position = positions.get(item.key); messages.push({ id: `msg-${stableKey}-${String(position).padStart(6, '0')}`, position, sender: item.sender, direction: item.direction, visibleTimestamp: item.visibleTimestamp, type: 'text', text: item.text, mediaId: null, associationStatus: 'CAPTURED_FROM_SPECIFIC_BUBBLE', associationEvidence: ['message-order-observed-during-progressive-scan'] })
    }
    const orderedAudio = [...state.audioRecords.values()].sort((left, right) => timestampValue(left.visibleTimestamp) - timestampValue(right.visibleTimestamp) || left.discovered - right.discovered)
    for (let index = 0; index < orderedAudio.length; index++) {
      const item = orderedAudio[index]; const position = positions.get(item.key) || nextPosition++; const messageId = `msg-${stableKey}-${String(position).padStart(6, '0')}`
      if (!item.buffer) { errors.push({ messageId, error: item.error || 'Audio no disponible' }); messages.push({ id: messageId, position, sender: item.sender, direction: item.direction, visibleTimestamp: item.visibleTimestamp, type: 'voice_note', text: null, mediaId: null, associationStatus: 'UNSUPPORTED', associationEvidence: ['specific-bubble-detected', 'audio-content-not-readable'] }); continue }
      const exportedFilename = `media/${String(index + 1).padStart(6, '0')}__voice.${item.extension}`; const mediaId = `media-${item.hash.slice(0, 20)}`
      zip.file(exportedFilename, item.buffer); media.push({ id: mediaId, originalFilename: `WhatsApp-voice-${index + 1}.${item.extension}`, exportedFilename, mimeType: item.mime, size: item.buffer.byteLength, durationMs: item.durationMs, sha256: item.hash })
      messages.push({ id: messageId, position, sender: item.sender, direction: item.direction, visibleTimestamp: item.visibleTimestamp, type: 'voice_note', text: null, mediaId, associationStatus: 'CAPTURED_FROM_SPECIFIC_BUBBLE', associationEvidence: ['audio-read-from-specific-rendered-bubble', 'progressive-history-scan', 'sha256-calculated-before-package'] })
    }
    messages.sort((left, right) => left.position - right.position)
    const manifest = { schemaVersion: 1, createdAt: new Date().toISOString(), source: { application: 'WhatsApp Web', extractionMethod: 'chrome_extension', extensionVersion: VERSION }, chat: { stableKey, displayName, isGroup: false }, messages, media }
    zip.file('manifest.json', JSON.stringify(manifest, null, 2)); zip.file('checksums.json', JSON.stringify(Object.fromEntries(media.map(item => [item.exportedFilename, item.sha256])), null, 2)); zip.file('logs/extraction-summary.json', JSON.stringify({ captured: media.length, errors, cancelled: state.cancelled }, null, 2))
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `gore-whatsapp-${slug(displayName)}-${new Date().toISOString().slice(0, 10)}.zip`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000)
    const recentMessages = [...new Set([...state.messageRecords.keys(), ...state.knownMessageKeys])].slice(0, 500)
    const recentAudios = [...new Set([...state.audioRecords.keys(), ...state.knownAudioKeys])].slice(0, 500)
    state.checkpointKey ||= `gore-checkpoint-${(await digest(displayName)).slice(0, 24)}`
    await storageSet(state.checkpointKey, { schemaVersion: 1, chatName: displayName, savedAt: new Date().toISOString(), messageKeys: recentMessages, audioKeys: recentAudios })
    setStatus(`Paquete creado: ${media.length} audios capturados y ${errors.length} no disponibles.`); finishBusy()
  }
  async function resetCheckpoint() { const key = `gore-checkpoint-${(await digest(chatName())).slice(0, 24)}`; await storageRemove(key); state.knownMessageKeys.clear(); state.knownAudioKeys.clear(); setStatus('Punto de control eliminado. El próximo recorrido analizará todo el historial.') }
  async function markCurrentBoundary() {
    const initial = candidateBubbles(); const scroller = findScroller(initial)
    if (scroller) { scroller.scrollTop = scroller.scrollHeight; await sleep(900) }
    const bubbles = candidateBubbles(); const messageKeys = bubbles.map(bubbleKey); const audioKeys = [...document.querySelectorAll('audio'), ...document.querySelectorAll(voiceControlSelector)].map(element => bubbleFor(element)).filter(Boolean).map(bubbleKey)
    if (!messageKeys.length) { setStatus('No encontramos mensajes visibles para establecer el punto de control.'); return }
    const displayName = chatName(); const key = `gore-checkpoint-${(await digest(displayName)).slice(0, 24)}`
    await storageSet(key, { schemaVersion: 1, chatName: displayName, savedAt: new Date().toISOString(), messageKeys: [...new Set(messageKeys)].slice(-200), audioKeys: [...new Set(audioKeys)].slice(-200) })
    setStatus('Chat marcado al día. Los próximos recorridos se detendrán al encontrar esta zona.')
  }
  const root = document.createElement('section'); root.id = 'gore-capture-root'; root.innerHTML = `<header><strong>GORE · Captura verificable</strong><button id="gore-minimize" title="Minimizar">−</button></header><div id="gore-capture-body"><p>Recorre el chat hasta el último punto procesado y conserva solamente los audios nuevos.</p><div class="gore-stats"><div class="gore-stat"><strong id="gore-found">0</strong>audios nuevos</div><div class="gore-stat"><strong id="gore-processed">0</strong>procesados</div></div><div class="gore-progress"><span></span></div><div class="gore-actions"><button id="gore-analyze">Buscar audios nuevos</button><button class="primary" id="gore-export">Crear paquete GORE</button><button id="gore-mark">Marcar chat al día</button><button id="gore-reset">Reiniciar historial</button><button id="gore-cancel" disabled>Cancelar</button></div><div id="gore-capture-status">En el primer uso podés marcar el chat al día; luego se detendrá en ese punto.</div></div>`; document.body.appendChild(root)
  document.addEventListener('click', event => { const control = event.target.closest?.(voiceControlSelector); if (control) state.lastVoiceKey = bubbleKey(bubbleFor(control)) }, true)
  document.addEventListener('play', event => { const audio = event.target; if (!(audio instanceof HTMLMediaElement)) return; const bubble = bubbleFor(audio); const key = state.lastVoiceKey || (bubble ? bubbleKey(bubble) : ''); const record = state.audioRecords.get(key); const source = audio.currentSrc || audio.src; if (record && source) { record.source = source; record.audio = audio; state.lastVoiceKey = '' } }, true)
  document.getElementById('gore-analyze').addEventListener('click', scanHistory); document.getElementById('gore-export').addEventListener('click', capture); document.getElementById('gore-mark').addEventListener('click', markCurrentBoundary); document.getElementById('gore-reset').addEventListener('click', resetCheckpoint); document.getElementById('gore-cancel').addEventListener('click', () => { state.cancelled = true; setStatus('Cancelando después del audio actual…') }); document.getElementById('gore-minimize').addEventListener('click', event => { const body = document.getElementById('gore-capture-body'); body.hidden = !body.hidden; event.currentTarget.textContent = body.hidden ? '+' : '−' })
})()
