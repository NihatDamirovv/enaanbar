'use strict'
/* ENA Köməkçi — bazaya baxıb suallara cavab verir (yalnız oxuyur) */
Pages.assistant = () => {
  const main = shell({
    title: 'Köməkçi',
    sub: 'Anbar və avtobuslar haqqında soruşun',
    iconName: 'chat',
    iconClass: 'c-violet',
    actions: `<span class="badge violet" id="quota"></span><button class="btn btn-sm" id="clearChat">${icon('x', 15)}Yeni söhbət</button>`,
  })
  main.style.cssText = 'display:flex;flex-direction:column;padding:0;overflow:hidden'
  main.innerHTML = `
    <div class="chat-scroll" id="scroll"><div class="chat-col" id="log"></div></div>
    <form class="chat-input" id="f">
      <div class="chat-col row" style="gap:10px;align-items:flex-end">
        <textarea class="inp grow" name="q" rows="1" maxlength="600" placeholder="Sualınızı yazın… (Enter — göndər, Shift+Enter — yeni sətir)"></textarea>
        <button class="btn btn-primary btn-lg" type="submit" id="send">${icon('send', 18)}</button>
      </div>
    </form>`

  const EXAMPLES = [
    'Anbarda hava filtri varmı?',
    'Dünən hansı avtobus xəttini dəyişib?',
    'Bu ay neçə manatlıq alış olub?',
    '084 nömrəli avtobusa bu ay nə verilib?',
    'Bu gün 12 xəttində hansı avtobuslar var?',
    'Anbarın ümumi dəyəri nə qədərdir?',
  ]
  let history = []
  const log = $('#log')
  const scroll = $('#scroll')
  const f = $('#f')
  const KEY = 'ena-chat'
  try {
    history = JSON.parse(sessionStorage.getItem(KEY) || '[]')
  } catch {
    history = []
  }

  // sadə markdown: **qalın**, siyahı, cədvəl
  function md(text) {
    const lines = esc(text).split('\n')
    let html = ''
    let i = 0
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
    while (i < lines.length) {
      const l = lines[i]
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
        const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()))
        const head = cells(l)
        i += 2
        const body = []
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]))
        html += `<div class="chat-table"><table class="tbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        continue
      }
      if (/^\s*([-*•]|\d+\.)\s+/.test(l)) {
        const ordered = /^\s*\d+\./.test(l)
        const items = []
        while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*([-*•]|\d+\.)\s+/, '')))
        html += `<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${x}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`
        continue
      }
      html += l.trim() ? `<p>${inline(l.replace(/^#+\s*/, ''))}</p>` : ''
      i++
    }
    return html
  }

  function render() {
    if (!history.length) {
      log.innerHTML = `
        <div class="chat-hello">
          <div class="page-icon c-violet" style="width:54px;height:54px;border-radius:16px">${icon('chat', 26)}</div>
          <h2>Salam! Mən ENA Köməkçiyəm</h2>
          <p class="muted">Anbar, alış-məxaric, avtobuslar və qeydlər haqqında soruşun — bazaya baxıb cavab verirəm. Heç nəyi dəyişmirəm.</p>
          <div class="chips">${EXAMPLES.map((e) => `<button type="button" class="chip" data-q="${esc(e)}">${esc(e)}</button>`).join('')}</div>
        </div>`
    } else {
      log.innerHTML = history
        .map((m) =>
          m.role === 'user'
            ? `<div class="msg me"><div class="bubble">${esc(m.content)}</div></div>`
            : `<div class="msg bot"><div class="avatar">${icon('chat', 16)}</div><div class="bubble ${m.error ? 'err' : ''}">${m.error ? esc(m.content) : md(m.content)}</div></div>`,
        )
        .join('')
    }
    scroll.scrollTop = scroll.scrollHeight
  }
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(history.slice(-30)))
    } catch {
      /* boş */
    }
  }

  async function loadQuota() {
    try {
      const u = await api('chat.usage')
      $('#quota').textContent = u.enabled ? `Bu gün qalan: ${u.left} / ${u.limit}` : 'Qoşulmayıb'
    } catch {
      /* boş */
    }
  }

  let busy = false
  async function send(text) {
    const q = text.trim()
    if (!q || busy) return
    busy = true
    $('#send').disabled = true
    history.push({ role: 'user', content: q })
    render()
    log.insertAdjacentHTML('beforeend', `<div class="msg bot" id="typing"><div class="avatar">${icon('chat', 16)}</div><div class="bubble"><span class="dots"><i></i><i></i><i></i></span></div></div>`)
    scroll.scrollTop = scroll.scrollHeight
    try {
      const r = await api('chat.ask', { messages: history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })) })
      history.push({ role: 'assistant', content: r.answer })
      if (r.usage) $('#quota').textContent = `Bu gün qalan: ${r.usage.left} / ${r.usage.limit}`
    } catch (e) {
      history.push({ role: 'assistant', content: e.message, error: true })
    }
    save()
    busy = false
    $('#send').disabled = false
    render()
    f.q.focus()
  }

  f.addEventListener('submit', (e) => {
    e.preventDefault()
    const v = f.q.value
    f.q.value = ''
    f.q.style.height = ''
    send(v)
  })
  f.q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      f.requestSubmit()
    }
  })
  f.q.addEventListener('input', () => {
    f.q.style.height = 'auto'
    f.q.style.height = Math.min(f.q.scrollHeight, 140) + 'px'
  })
  log.addEventListener('click', (e) => {
    const c = e.target.closest('[data-q]')
    if (c) send(c.dataset.q)
  })
  $('#clearChat').addEventListener('click', () => {
    history = []
    save()
    render()
    f.q.focus()
  })
  render()
  loadQuota()
  f.q.focus()
}
