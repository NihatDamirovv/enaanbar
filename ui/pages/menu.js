'use strict'
/* Əsas menyu — hər bölmə öz pəncərəsində açılır */
Pages.menu = () => {
  document.title = 'ENA Anbar'
  document.body.classList.toggle('ro', !S.canWrite)
  $('#app').innerHTML = `
    <header class="topbar">
      <div class="logo">E</div>
      <div><h1>ENA Anbar</h1><div class="sub" id="greet"></div></div>
      <div class="spacer"></div>
      <span class="date-pill" id="todayPill">${icon('calendar', 16)}<span></span></span>
      <span class="role-pill ${S.canWrite ? 'role-anbar' : 'role-muhasib'}">${icon(S.canWrite ? 'user' : 'eye', 16)}${esc(S.roleName)}</span>
      <button class="btn btn-sm" id="logout">${icon('logout', 16)}Çıxış</button>
    </header>
    ${S.canWrite ? '' : `<div class="ro-banner">${icon('eye', 16)}<span><b>Mühasib — yalnız baxış.</b> Bütün bölmələrə baxa bilərsiniz, dəyişmək olmur.</span></div>`}
    <main class="content" id="main" style="padding:26px 30px"></main>`

  const TILES = {
    anbar: [
      { page: 'entry', icon: 'edit', cls: 'c-blue', title: 'Ana səhifə', desc: 'Alış və məxaric yazmaq — vərəqdən köçürmə', write: true },
      { page: 'items', icon: 'warehouse', cls: 'c-green', title: 'Anbar', desc: 'Mallar, kodlar, qalıq və dəyəri' },
      { page: 'purchases', icon: 'in', cls: 'c-teal', title: 'Alışlar', desc: 'Bütün alış sənədləri' },
      { page: 'issues', icon: 'out', cls: 'c-amber', title: 'Məxariclər', desc: 'FIFO ilə çıxışlar' },
    ],
    bus: [
      { page: 'buses', icon: 'bus', cls: 'c-teal', title: 'Avtobuslar', desc: 'Xətlərə görə siyahı, yerdəyişmə' },
      { page: 'notes', icon: 'note', cls: 'c-violet', title: 'Qeydlər', desc: 'Bugünkü və köhnə qeydlər' },
      { page: 'schedule', icon: 'clock', cls: 'c-blue', title: 'Çıxış cədvəli', desc: 'Avtobusların ilk çıxış saatı' },
    ],
    sys: [{ page: 'settings', icon: 'settings', cls: 'c-slate', title: 'Parametrlər', desc: 'Parollar və ehtiyat nüsxə', write: true }],
  }
  const tile = (t) => {
    const locked = t.write && !S.canWrite
    return `<button class="tile ${locked ? 'locked' : ''}" data-page="${t.page}" ${locked ? 'title="Yalnız anbardar üçün"' : ''}>
      <span class="t-open">${icon(locked ? 'lock' : 'arrowUpRight', 18)}</span>
      <div class="t-icon ${t.cls}">${icon(t.icon, 22)}</div>
      <div><div class="t-title">${t.title}</div><div class="t-desc">${t.desc}</div></div>
      <div class="t-stat" data-stat="${t.page}">${locked ? 'Yalnız anbardar' : '&nbsp;'}</div>
    </button>`
  }

  const main = $('#main')
  main.innerHTML = `
    <div class="section-title">Anbar</div>
    <div class="tiles">${TILES.anbar.map(tile).join('')}</div>
    <div class="section-title">Avtobuslar</div>
    <div class="tiles">${TILES.bus.map(tile).join('')}</div>
    ${S.canWrite ? `<div class="section-title">Sistem</div><div class="tiles">${TILES.sys.map(tile).join('')}</div>` : ''}`

  main.addEventListener('click', async (e) => {
    const t = e.target.closest('.tile')
    if (!t || t.classList.contains('locked')) return
    try {
      await api('win.open', { name: t.dataset.page })
    } catch (err) {
      toast(err.message, 'err')
    }
  })
  $('#logout').addEventListener('click', async () => {
    if (await confirmBox({ title: 'Çıxış', text: 'Proqramdan çıxıb giriş ekranına qayıtmaq istəyirsiniz? Bütün açıq pəncərələr bağlanacaq.', okText: 'Çıxış' })) api('auth.logout')
  })

  const setStat = (page, html) => {
    const el = $(`[data-stat="${page}"]`)
    if (el && !el.closest('.locked')) el.innerHTML = html
  }
  async function load() {
    const t = todayIso()
    $('#todayPill span').textContent = `${longDate(t)}, ${weekday(t)}`
    $('#greet').textContent = `Xoş gəldiniz — ${S.roleName}`
    try {
      const [items, ins, outs, board, notes] = await Promise.all([
        api('items.list'),
        api('docs.list', { kind: 'IN', from: t, to: t, status: 'ACTIVE' }),
        api('docs.list', { kind: 'OUT', from: t, to: t, status: 'ACTIVE' }),
        api('buses.board'),
        api('notes.today'),
      ])
      const value = items.reduce((s, i) => s + i.value, 0)
      setStat('entry', `Bu gün: ${ins.length} alış · ${outs.length} məxaric`)
      setStat('items', `${items.length} mal · ${fmtMoney(value)} ₼`)
      setStat('purchases', `Bu gün ${ins.length} sənəd · ${fmtMoney(ins.reduce((s, d) => s + d.total, 0))} ₼`)
      setStat('issues', `Bu gün ${outs.length} sənəd · ${fmtMoney(outs.reduce((s, d) => s + d.total, 0))} ₼`)
      setStat('buses', `${board.total} avtobus · ${board.groups.length} xətt${board.moved ? ` · <span style="color:var(--amber)">${board.moved} yerdəyişmə</span>` : ''}`)
      setStat('notes', `Bu gün ${notes.notes.length} qeyd`)
      const withTime = board.groups.reduce((s, g) => s + g.buses.filter((b) => b.depart).length, 0)
      setStat('schedule', `${withTime} / ${board.total} avtobusun saatı var`)
      setStat('settings', 'Parol, ehtiyat nüsxə')
    } catch (err) {
      toast(err.message, 'err')
    }
  }
  load()
  onDataChanged(load)
}
