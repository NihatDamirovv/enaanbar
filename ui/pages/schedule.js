'use strict'
/* Çıxış cədvəli — avtobusların ilk çıxış saatı (bu günkü xəttinə görə) */
Pages.schedule = () => {
  const main = shell({
    title: 'Çıxış cədvəli',
    sub: 'Avtobusların ilk çıxış saatı',
    iconName: 'clock',
    iconClass: 'c-blue',
  })
  main.innerHTML = `
    <div class="toolbar">
      <div class="seg sm" id="view"><button class="on" data-v="route">Xətlərə görə</button><button data-v="time">Saata görə</button></div>
      <div class="spacer"></div>
      <span class="muted small w-only">Saatı dəyişmək üçün xanaya yazın — dərhal yadda saxlanılır</span>
      <button class="btn" id="print">${icon('printer', 17)}Çap et</button>
    </div>
    <div id="printHead" class="hidden" style="margin-bottom:12px"></div>
    <div id="body"></div>`

  let board = null
  let view = 'route'

  async function load() {
    try {
      board = await api('buses.board')
      draw()
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  const timeCell = (b) =>
    S.canWrite ? `<input class="inp tabular" type="time" value="${esc(b.depart)}" data-bus="${b.id}" style="width:130px;height:34px" />` : `<b class="tabular" style="font-size:15px">${b.depart || '<span class="faint">—</span>'}</b>`
  const noteCell = (b) => (b.move ? `<span class="badge amber">${icon('swap', 13)}${esc(b.routeName)} xəttindən · ${b.move.dateTo === board.date ? 'bu gün' : `${dm(b.move.dateTo)}-dək`}</span>` : '')

  function draw() {
    $('#printHead').innerHTML = `<h2 style="margin:0;font:600 18px var(--font-display)">İlk çıxış cədvəli — ${longDate(board.date)}, ${weekday(board.date)}</h2>`
    if (!board.total) {
      $('#body').innerHTML = `<div class="card">${emptyState('bus', 'Avtobus yoxdur', 'Avtobuslar pəncərəsində əlavə edin.')}</div>`
      return
    }
    if (view === 'route') {
      $('#body').innerHTML = `<div class="stack" style="gap:14px">${board.groups
        .filter((g) => g.buses.length)
        .map((g) => {
          const first = g.buses.find((b) => b.depart)
          return `<section class="card route-card">
            <div class="card-head"><span class="route-no">${esc(g.name)}</span><div class="grow"><h3>${esc(g.name)} nömrəli xətt</h3><div class="muted small">${g.buses.length} avtobus${first ? ` · ilk çıxış ${first.depart}` : ''}</div></div></div>
            <table class="tbl"><thead><tr><th style="width:60px">Sıra</th><th style="width:190px">Nişan</th><th style="width:170px">İlk çıxış</th><th>Qeyd</th></tr></thead>
            <tbody>${g.buses.map((b, i) => `<tr><td class="muted tabular">${i + 1}</td><td>${plate(b.plate)}</td><td>${timeCell(b)}</td><td>${noteCell(b)}</td></tr>`).join('')}</tbody></table>
          </section>`
        })
        .join('')}</div>`
    } else {
      const all = board.groups.flatMap((g) => g.buses.map((b) => ({ ...b, groupName: g.name })))
      all.sort((a, b) => (a.depart || '99:99').localeCompare(b.depart || '99:99') || a.groupName.localeCompare(b.groupName, 'az', { numeric: true }))
      $('#body').innerHTML = `<div class="card"><table class="tbl"><thead><tr><th style="width:60px">Sıra</th><th style="width:170px">İlk çıxış</th><th style="width:110px">Xətt</th><th style="width:190px">Nişan</th><th>Qeyd</th></tr></thead>
        <tbody>${all.map((b, i) => `<tr><td class="muted tabular">${i + 1}</td><td>${timeCell(b)}</td><td><span class="route-no" style="height:28px;min-width:36px;font-size:14px">${esc(b.groupName)}</span></td><td>${plate(b.plate)}</td><td>${noteCell(b)}</td></tr>`).join('')}</tbody></table></div>`
    }
  }

  $('#body').addEventListener('change', async (e) => {
    const inp = e.target.closest('[data-bus]')
    if (!inp) return
    try {
      await api('buses.setDepart', { id: Number(inp.dataset.bus), depart: inp.value })
      toast('Çıxış saatı yadda saxlandı')
    } catch (err) {
      toast(err.message, 'err')
      load()
    }
  })
  $('#view').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    view = b.dataset.v
    $$('#view button').forEach((x) => x.classList.toggle('on', x === b))
    draw()
  })
  $('#print').addEventListener('click', () => {
    $('#printHead').classList.remove('hidden')
    window.print()
    $('#printHead').classList.add('hidden')
  })
  load()
  onDataChanged((d) => {
    // yazarkən fokusu itirməmək üçün — öz dəyişikliyimizdə yalnız lazım olanda yenilə
    if (d?.method === 'buses.setDepart' && document.activeElement?.dataset?.bus) return
    load()
  })
}
