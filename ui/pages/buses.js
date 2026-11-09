'use strict'
/* Avtobuslar — xətlərə görə qruplaşdırılmış siyahı, müvəqqəti yerdəyişmə, tarixçə */
Pages.buses = () => {
  const main = shell({
    title: 'Avtobuslar',
    sub: 'Xətlərə görə siyahı',
    iconName: 'bus',
    iconClass: 'c-teal',
  })
  main.innerHTML = `
    <div class="toolbar">
      <div class="search" style="width:260px">${icon('search', 16)}<input class="inp" id="q" placeholder="Nişan və ya xətt axtar" autocomplete="off" /></div>
      <div class="spacer"></div>
      <button class="btn" id="openNotes">${icon('note', 17)}Qeydlər</button>
      <button class="btn" id="xls">${icon('excel', 17)}Excel</button>
      <button class="btn w-only" id="routesBtn">${icon('route', 17)}Xətlər</button>
      <button class="btn btn-primary w-only" id="addBus">${icon('plus', 17)}Yeni avtobus</button>
    </div>
    <div class="stats" id="stats"></div>
    <div id="upcoming"></div>
    <div id="board"></div>`

  let board = null
  let routes = []

  async function load() {
    try {
      ;[board, routes] = await Promise.all([api('buses.board'), api('routes.list')])
      $('#stats').innerHTML = `
        <div class="stat"><div class="k">Bu gün</div><div class="v" style="font-size:17px">${longDate(board.date)} <small>${weekday(board.date)}</small></div></div>
        <div class="stat"><div class="k">Avtobus</div><div class="v">${board.total}</div></div>
        <div class="stat"><div class="k">Xətt</div><div class="v">${board.groups.length}</div></div>
        <div class="stat"><div class="k">Bu gün başqa xətdə</div><div class="v" style="color:${board.moved ? 'var(--amber)' : 'inherit'}">${board.moved}</div></div>`
      $('#upcoming').innerHTML = board.upcoming.length
        ? `<div class="alert blue" style="margin-bottom:14px">${icon('calendar', 17)}<div><b>Planlanan yerdəyişmələr:</b> ${board.upcoming.map((u) => `${esc(u.plate)} → ${esc(u.toRouteName)} (${dm(u.dateFrom)}${u.dateTo !== u.dateFrom ? ` – ${dm(u.dateTo)}` : ''})`).join(' · ')}</div></div>`
        : ''
      draw()
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  function busRow(b, away) {
    const moved = b.move
    const back = moved && (moved.dateTo === board.date ? 'sabah qayıdır' : `${dm(addDays(moved.dateTo, 1))} qayıdır`)
    const tag = away
      ? `<span class="info nowrap">${icon('swap', 14)} <b>${esc(moved.toRouteName)}</b> xəttində · ${back}</span>`
      : moved
        ? `<span class="badge amber" title="${esc(`${b.routeName} xəttindən gəlib, ${back}${moved.reason ? '. Səbəb: ' + moved.reason : ''}`)}">${icon('swap', 13)}${esc(b.routeName)} xəttindən</span>`
        : ''
    return `<div class="bus-row ${away ? 'away' : ''}" data-id="${b.id}">
      ${plate(b.plate, away ? 'faded' : '')}
      ${!away ? `<span class="time">${b.depart ? `${icon('clock', 14)}${b.depart}` : ''}</span>` : ''}
      <div class="grow" style="display:flex;justify-content:flex-end">${tag}</div>
      <div class="acts">
        <button class="btn btn-ghost btn-icon btn-sm" data-act="history" title="Tarixçə">${icon('history', 16)}</button>
        ${S.canWrite && moved ? `<button class="btn btn-ghost btn-icon btn-sm" data-act="return" title="Öz xəttinə qaytar">${icon('undo', 16)}</button>` : ''}
        ${S.canWrite && !moved ? `<button class="btn btn-ghost btn-icon btn-sm" data-act="move" title="Başqa xəttə keçir">${icon('swap', 16)}</button>` : ''}
        ${S.canWrite ? `<button class="btn btn-ghost btn-icon btn-sm" data-act="edit" title="Dəyiş">${icon('edit', 16)}</button>` : ''}
      </div>
    </div>`
  }

  function draw() {
    const s = $('#q').value.trim().toUpperCase().replace(/\s/g, '')
    if (!board.groups.length) {
      $('#board').innerHTML = `<div class="card">${emptyState('route', 'Hələ xətt yoxdur', S.canWrite ? 'Əvvəlcə «Xətlər» düyməsi ilə xətləri (məs. 5, 12, 88A) yazın, sonra avtobusları əlavə edin.' : 'Anbardar xətləri və avtobusları əlavə edəndə burada görünəcək.')}</div>`
      return
    }
    const match = (b) => !s || b.plate.replace(/-/g, '').includes(s.replace(/-/g, ''))
    const groups = board.groups
      .map((g) => ({ ...g, list: g.name.toUpperCase() === s ? g.buses : g.buses.filter(match), awayList: g.name.toUpperCase() === s ? g.away : g.away.filter(match) }))
      .filter((g) => !s || g.list.length || g.awayList.length)
    if (!groups.length) {
      $('#board').innerHTML = `<div class="card">${emptyState('search', 'Heç nə tapılmadı')}</div>`
      return
    }
    $('#board').innerHTML = `<div class="routes-grid">${groups
      .map(
        (g) => `<section class="card route-card">
        <div class="card-head">
          <span class="route-no">${esc(g.name)}</span>
          <div class="grow"><h3>${esc(g.name)} nömrəli xətt</h3><div class="muted small">${g.buses.length} avtobus${g.away.length ? ` · ${g.away.length} başqa xətdə` : ''}</div></div>
          ${S.canWrite ? `<button class="btn btn-ghost btn-icon btn-sm" data-add-route="${g.id}" title="Bu xəttə avtobus əlavə et">${icon('plus', 17)}</button>` : ''}
        </div>
        ${g.list.map((b) => busRow(b, false)).join('')}
        ${g.awayList.map((b) => busRow(b, true)).join('')}
        ${!g.list.length && !g.awayList.length ? `<div class="muted small" style="padding:16px">Bu xətdə avtobus yoxdur</div>` : ''}
      </section>`,
      )
      .join('')}</div>`
  }

  const findBus = (id) => {
    for (const g of board.groups) for (const b of [...g.buses, ...g.away]) if (b.id === id) return b
    return null
  }
  const routeOptions = (sel, exclude) => routes.filter((r) => r.id !== exclude).map((r) => `<option value="${r.id}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('')

  async function editBus(b, routeId) {
    if (!routes.length) return toast('Əvvəlcə «Xətlər» bölməsində xətt yazın', 'err')
    const ok = await modal({
      title: b ? `${b.plate} — dəyiş` : 'Yeni avtobus',
      iconName: 'bus',
      iconClass: 'c-teal',
      body: `<div class="stack">
        <div class="field"><label>Dövlət qeydiyyat nişanı</label><input class="inp" name="plate" value="${esc(b?.plate || '')}" placeholder="10-AB-123" autocomplete="off" style="text-transform:uppercase;font:600 16px 'Bahnschrift','Segoe UI';letter-spacing:.6px" /></div>
        <div class="field"><label>Xətt (daimi)</label><select class="sel" name="routeId"><option value="">— seçin —</option>${routeOptions(b?.routeId ?? routeId)}</select>
          ${b ? '<span class="hint">Daimi xətt dəyişir. Bir neçə günlük keçid üçün «Başqa xəttə keçir» düyməsindən istifadə edin.</span>' : ''}</div>
        <div class="field"><label>İlk çıxış saatı</label><input class="inp" name="depart" type="time" value="${esc(b?.depart || '')}" style="width:160px" /><span class="hint">Boş qala bilər — sonra «Çıxış cədvəli»ndə yazılır</span></div>
        ${b ? `<button type="button" class="btn btn-danger btn-sm" id="removeBus" style="align-self:flex-start">${icon('trash', 15)}Siyahıdan çıxar</button>` : ''}
      </div>`,
      onOk: (f) => api('buses.save', { id: b?.id, plate: f.plate.value, routeId: f.routeId.value, depart: f.depart.value }),
      onOpen: (m, close) => {
        enterAsTab(m)
        $('#removeBus', m)?.addEventListener('click', async () => {
          close(null)
          removeBus(b)
        })
      },
    })
    if (ok) toast(b ? 'Avtobus yeniləndi' : 'Avtobus əlavə olundu')
  }

  async function removeBus(b) {
    const ok = await modal({
      title: `${b.plate} siyahıdan çıxarılsın?`,
      iconName: 'alert',
      iconClass: 'c-red',
      danger: true,
      okText: 'Çıxar',
      body: `<div class="stack"><p style="margin:0;color:var(--text-2)">Avtobus siyahıdan çıxır, amma bütün qeydləri və tarixçəsi arxivdə qalır.</p>
        <div class="field"><label>Səbəb</label><input class="inp" name="reason" placeholder="Məs. satılıb, uzunmüddətli təmir" autocomplete="off" /></div></div>`,
      onOk: (f) => api('buses.remove', { id: b.id, reason: f.reason.value }),
    })
    if (ok) toast(`${b.plate} siyahıdan çıxarıldı`)
  }

  async function moveBus(b) {
    const today = board.date
    const ok = await modal({
      title: 'Başqa xəttə keçir',
      iconName: 'swap',
      iconClass: 'c-amber',
      okText: 'Keçir',
      body: `<div class="stack">
        <div class="row" style="gap:12px;padding:12px 14px;background:var(--surface-2);border-radius:10px;border:1px solid var(--border)">
          ${plate(b.plate)}<span class="muted">hazırda</span><span class="route-no" style="height:28px;min-width:34px;font-size:14px">${esc(b.routeName)}</span><span class="muted">xəttində</span>
        </div>
        <div class="field"><label>Hansı xəttə keçir?</label><select class="sel" name="toRouteId"><option value="">— seçin —</option>${routeOptions(null, b.routeId)}</select></div>
        <div class="row" style="gap:12px;align-items:flex-start">
          <div class="field" style="width:180px"><label>Başlayır</label><input class="inp" type="date" name="dateFrom" value="${today}" min="${addDays(today, -7)}" /></div>
          <div class="field grow"><label>Neçə gün?</label>
            <div class="row" style="gap:6px">
              <input class="inp" name="days" type="number" min="1" max="60" value="1" style="width:84px" />
              <div class="seg sm" id="dayChips"><button type="button" data-d="1" class="on">1 gün</button><button type="button" data-d="2">2 gün</button><button type="button" data-d="3">3 gün</button></div>
            </div>
          </div>
        </div>
        <div class="alert amber" id="moveInfo">${icon('info', 17)}<div></div></div>
        <div class="field"><label>Səbəb (istəyə görə)</label><input class="inp" name="reason" placeholder="Məs. o xətdə sürücü çatışmır" autocomplete="off" /></div>
      </div>`,
      onOk: (f) => api('moves.create', { busId: b.id, toRouteId: f.toRouteId.value, dateFrom: f.dateFrom.value, days: Number(f.days.value), reason: f.reason.value }),
      onOpen: (m) => {
        const upd = () => {
          const n = Math.max(1, Math.min(60, Number(m.days.value) || 1))
          const from = m.dateFrom.value || today
          const to = addDays(from, n - 1)
          const back = addDays(to, 1)
          $$('#dayChips button', m).forEach((x) => x.classList.toggle('on', Number(x.dataset.d) === n))
          const r = routes.find((x) => x.id === Number(m.toRouteId.value))
          $('#moveInfo div', m).innerHTML = `${r ? `<b>${esc(r.name)}</b> xəttində: ` : ''}${n === 1 ? dmy(from) : `${dmy(from)} – ${dmy(to)}`} (${n} gün).<br/><b>${dmy(back)}</b> tarixində avtomatik öz xəttinə (<b>${esc(b.routeName)}</b>) qayıdacaq. Hamısı qeydlərdə qalır.`
        }
        $('#dayChips', m).addEventListener('click', (e) => {
          const x = e.target.closest('button')
          if (!x) return
          m.days.value = x.dataset.d
          upd()
        })
        for (const n of ['days', 'dateFrom', 'toRouteId']) m[n].addEventListener('input', upd)
        upd()
      },
    })
    if (ok) toast(`${b.plate} başqa xəttə keçirildi`)
  }

  async function returnBus(b) {
    const ok = await confirmBox({
      title: 'Öz xəttinə qaytar',
      text: `<b>${esc(b.plate)}</b> indi <b>${esc(b.move.toRouteName)}</b> xəttindədir. Vaxtından əvvəl öz xəttinə (<b>${esc(b.routeName)}</b>) qaytarılsın? Bu da qeydlərə yazılacaq.`,
      okText: 'Qaytar',
    })
    if (!ok) return
    try {
      await api('moves.end', { id: b.move.id })
      toast(`${b.plate} öz xəttinə qaytarıldı`)
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  async function history(b) {
    try {
      const h = await api('buses.history', { id: b.id })
      drawer({
        title: `${plate(h.bus.plate)} <span style="margin-left:8px">tarixçə</span>`,
        sub: `Daimi xətt: ${esc(h.bus.routeName)}${h.bus.depart ? ` · ilk çıxış ${h.bus.depart}` : ''}`,
        body: `
          <div class="label" style="margin-bottom:8px">Yerdəyişmələr</div>
          ${
            h.moves.length
              ? `<div class="card" style="margin-bottom:18px"><table class="tbl"><thead><tr><th>Tarix</th><th>Haradan → hara</th><th>Səbəb</th></tr></thead><tbody>
            ${h.moves.map((m) => `<tr><td class="tabular nowrap">${m.dateFrom === m.dateTo ? dmy(m.dateFrom) : `${dm(m.dateFrom)} – ${dmy(m.dateTo)}`}${m.endedEarly ? ' <span class="badge">vaxtından əvvəl bitdi</span>' : ''}</td><td class="nowrap"><b>${esc(m.fromRouteName)}</b> → <b>${esc(m.toRouteName)}</b></td><td class="muted">${esc(m.reason) || '—'}</td></tr>`).join('')}
            </tbody></table></div>`
              : `<div class="muted small" style="margin-bottom:18px">Yerdəyişmə olmayıb</div>`
          }
          <div class="label" style="margin-bottom:8px">Qeydlərdə</div>
          <div class="card">${h.notes.map((n) => `<div class="note"><div class="grow"><div class="n-text">${esc(n.text)}</div><div class="n-time">${dmy(n.date)} · ${hm(n.at)}</div></div></div>`).join('') || '<div class="muted small" style="padding:14px">Qeyd yoxdur</div>'}</div>`,
      })
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  async function manageRoutes() {
    const render = () => `
      <div class="stack">
        <div class="row"><input class="inp" name="name" placeholder="Yeni xəttin nömrəsi, məs. 5 və ya 88A" autocomplete="off" /><button class="btn btn-primary" type="submit">${icon('plus', 16)}Əlavə et</button></div>
        <div class="card">${
          routes.length
            ? routes
                .map(
                  (r) => `<div class="bus-row" data-rid="${r.id}"><span class="route-no" style="height:30px;font-size:14px">${esc(r.name)}</span><div class="grow muted small">${board.groups.find((g) => g.id === r.id)?.buses.length ?? 0} avtobus</div>
              <div class="acts" style="opacity:1"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-ract="rename" title="Adını dəyiş">${icon('edit', 15)}</button><button type="button" class="btn btn-ghost btn-icon btn-sm" data-ract="remove" title="Sil">${icon('trash', 15)}</button></div></div>`,
                )
                .join('')
            : '<div class="muted small" style="padding:14px">Hələ xətt yoxdur</div>'
        }</div>
      </div>`
    await modal({
      title: 'Xətlər',
      iconName: 'route',
      iconClass: 'c-teal',
      okText: 'Əlavə et',
      body: '<div id="rbox"></div>',
      noFoot: true,
      onOk: async (f) => {
        await api('routes.save', { name: f.name.value })
        ;[board, routes] = await Promise.all([api('buses.board'), api('routes.list')])
        $('#rbox', f).innerHTML = render()
        f.name.value = ''
        f.name.focus()
        return KEEP_OPEN
      },
      onOpen: (m) => {
        $('#rbox', m).innerHTML = render()
        m.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-ract]')
          if (!b) return
          const id = Number(b.closest('[data-rid]').dataset.rid)
          const r = routes.find((x) => x.id === id)
          try {
            if (b.dataset.ract === 'remove') {
              if (!(await confirmBox({ title: `${r.name} xətti silinsin?`, text: 'Xətt siyahıdan çıxır. Köhnə qeydlər qalır.', okText: 'Sil', danger: true }))) return
              await api('routes.remove', { id })
            } else {
              const ok = await modal({ title: 'Xəttin adı', body: `<div class="field"><label>Yeni ad (nömrə)</label><input class="inp" name="n" value="${esc(r.name)}" /></div>`, onOk: (f) => api('routes.save', { id, name: f.n.value }) })
              if (!ok) return
            }
            ;[board, routes] = await Promise.all([api('buses.board'), api('routes.list')])
            $('#rbox', m).innerHTML = render()
          } catch (err) {
            toast(err.message, 'err')
          }
        })
      },
    })
  }

  $('#q').addEventListener('input', () => board && draw())
  $('#addBus').addEventListener('click', () => editBus(null))
  $('#routesBtn').addEventListener('click', manageRoutes)
  $('#openNotes').addEventListener('click', () => api('win.open', { name: 'notes' }))
  $('#xls').addEventListener('click', () => excelExport('buses', {}))
  $('#board').addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-route]')
    if (add) return editBus(null, Number(add.dataset.addRoute))
    const btn = e.target.closest('[data-act]')
    const row = e.target.closest('.bus-row[data-id]')
    if (!row) return
    const b = findBus(Number(row.dataset.id))
    if (!b) return
    const act = btn?.dataset.act || 'history'
    if (act === 'history') history(b)
    else if (act === 'move') moveBus(b)
    else if (act === 'return') returnBus(b)
    else if (act === 'edit') editBus(b)
  })
  load()
  onDataChanged(load)
}
