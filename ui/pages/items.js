'use strict'
/* Anbar — mallar: kod, ad, əlavə olunma tarixi, qalıq və dəyəri (FIFO) */
Pages.items = () => {
  const main = shell({
    title: 'Anbar',
    sub: 'Mallar, qalıq və dəyəri',
    iconName: 'warehouse',
    iconClass: 'c-green',
  })
  main.innerHTML = `
    <div class="stats" id="stats"></div>
    <div class="toolbar">
      <div class="search" style="width:320px">${icon('search', 16)}<input class="inp" id="q" placeholder="Kod və ya ad ilə axtar" autocomplete="off" /></div>
      <div class="seg sm" id="filter">
        <button class="on" data-f="all">Hamısı</button>
        <button data-f="stock">Qalığı var</button>
        <button data-f="zero">Qalığı yoxdur</button>
      </div>
      <div class="spacer"></div>
      <button class="btn" id="xls">${icon('excel', 17)}Excel</button>
    </div>
    <div class="card"><div class="tbl-wrap" id="wrap"></div></div>`

  let list = []
  let filter = 'all'
  const qEl = $('#q')

  async function load() {
    list = await api('items.list')
    const value = list.reduce((s, i) => s + i.value, 0)
    const withStock = list.filter((i) => i.stock > 0).length
    const t = todayIso()
    const monthStart = t.slice(0, 8) + '01'
    const newThisMonth = list.filter((i) => i.addedDate >= monthStart).length
    $('#stats').innerHTML = `
      <div class="stat"><div class="k">Mal sayı</div><div class="v">${list.length}</div></div>
      <div class="stat"><div class="k">Qalığı olan</div><div class="v">${withStock} <small>/ ${list.length}</small></div></div>
      <div class="stat"><div class="k">Anbarın dəyəri (FIFO)</div><div class="v">${fmtMoney(value)} <small>₼</small></div></div>
      <div class="stat"><div class="k">Bu ay əlavə olunan</div><div class="v">${newThisMonth}</div></div>`
    draw()
  }

  function draw() {
    const s = qEl.value.trim().toLocaleLowerCase('az')
    const rows = list.filter((i) => (!s || i.code.toLocaleLowerCase('az').includes(s) || i.name.toLocaleLowerCase('az').includes(s)) && (filter === 'all' || (filter === 'stock' ? i.stock > 0 : i.stock <= 0)))
    if (!list.length) {
      $('#wrap').innerHTML = emptyState('package', 'Anbar hələ boşdur', 'Ana səhifədə ilk alışı yazanda mallar bura özü əlavə olunur.')
      return
    }
    if (!rows.length) {
      $('#wrap').innerHTML = emptyState('search', 'Heç nə tapılmadı')
      return
    }
    $('#wrap').innerHTML = `<table class="tbl">
      <thead><tr><th>Kod</th><th>Mal adı</th><th>Vahid</th><th>Əlavə olunub</th><th class="num">Alınıb</th><th class="num">Çıxıb</th><th class="num">Qalıq</th><th class="num">Qalıq dəyəri</th><th>Son hərəkət</th></tr></thead>
      <tbody>${rows
        .map(
          (i) => `<tr class="click" data-id="${i.id}">
        <td><span class="code">${esc(i.code)}</span></td>
        <td style="font-weight:500">${esc(i.name)}</td>
        <td class="muted">${esc(i.unit || '')}</td>
        <td class="muted tabular">${dmy(i.addedDate)}</td>
        <td class="num">${fmtQty(i.qtyIn)}</td>
        <td class="num">${fmtQty(i.qtyOut)}</td>
        <td class="num"><b style="color:${i.stock > 0 ? 'var(--text)' : 'var(--faint)'}">${fmtQty(i.stock)}</b></td>
        <td class="num">${fmtMoney(i.value)} ₼</td>
        <td class="muted tabular">${dmy(i.lastDate)}</td>
      </tr>`,
        )
        .join('')}</tbody>
    </table>`
  }

  async function openItem(id) {
    try {
      const d = await api('items.get', { id })
      const it = d.item
      const stock = d.layers.reduce((s, l) => s + l.qtyLeft, 0)
      const value = d.layers.reduce((s, l) => s + l.amountLeft, 0)
      drawer({
        title: `<span class="code" style="font-size:15px;margin-right:8px">${esc(it.code)}</span>${esc(it.name)}`,
        sub: `Anbara əlavə olunub: ${dmy(it.addedDate)}${it.unit ? ` · ölçü vahidi: ${esc(it.unit)}` : ''}`,
        body: `
          <div class="stats" style="grid-template-columns:repeat(2,1fr)">
            <div class="stat"><div class="k">Qalıq</div><div class="v">${fmtQty(stock)}</div></div>
            <div class="stat"><div class="k">Dəyəri (FIFO)</div><div class="v">${fmtMoney(value)} <small>₼</small></div></div>
          </div>
          <div class="label" style="margin:6px 0 8px">Anbarda qalan partiyalar (FIFO sırası ilə)</div>
          ${
            d.layers.length
              ? `<div class="card" style="margin-bottom:18px"><table class="tbl"><thead><tr><th>Alış</th><th>Tarix</th><th class="num">Qalıq</th><th class="num">Qiymət</th><th class="num">Dəyər</th></tr></thead><tbody>
            ${d.layers.map((l, i) => `<tr><td>№${l.no} ${i === 0 ? '<span class="badge green">ilk çıxacaq</span>' : ''}</td><td class="tabular">${dmy(l.date)}</td><td class="num">${fmtQty(l.qtyLeft)} <span class="faint">/ ${fmtQty(l.qtyIn)}</span></td><td class="num">${fmtPrice(l.cost)}</td><td class="num">${fmtMoney(l.amountLeft)}</td></tr>`).join('')}
            </tbody></table></div>`
              : `<div class="alert blue" style="margin-bottom:18px">${icon('info', 17)}<div>Anbarda bu maldan qalmayıb.</div></div>`
          }
          <div class="label" style="margin:0 0 8px">Bütün hərəkətlər</div>
          <div class="card"><table class="tbl"><thead><tr><th>Tarix</th><th>Sənəd</th><th class="num">Say</th><th class="num">Qiymət</th><th class="num">Məbləğ</th><th class="num">Qalıq</th></tr></thead><tbody>
            ${
              d.moves
                .map(
                  (m) => `<tr class="${m.status !== 'ACTIVE' ? 'cancelled' : ''}">
              <td class="tabular">${dmy(m.date)}</td>
              <td>${m.kind === 'IN' ? '<span class="badge teal">Alış</span>' : '<span class="badge amber">Məxaric</span>'} <span class="strike">№${m.no}</span>${m.status !== 'ACTIVE' ? ' <span class="badge red">ləğv</span>' : ''}
                ${m.party || m.dqn || m.note ? `<div class="small muted" style="margin-top:3px">${[m.party, m.dqn && `DQN ${m.dqn}`, m.route && `xətt ${m.route}`, m.note].filter(Boolean).map(esc).join(' · ')}</div>` : ''}</td>
              <td class="num strike">${m.kind === 'IN' ? '+' : '−'}${fmtQty(m.qty)}</td>
              <td class="num strike">${fmtPrice(m.price)}</td>
              <td class="num strike">${fmtMoney(m.amount)}</td>
              <td class="num"><b>${fmtQty(m.balance)}</b></td>
            </tr>`,
                )
                .join('') || `<tr><td colspan="6" class="muted">Hərəkət yoxdur</td></tr>`
            }
          </tbody></table></div>`,
        foot: S.canWrite ? `<button class="btn" id="editItem">${icon('edit', 16)}Kodu / adı dəyiş</button>` : '',
        onOpen: (el) => {
          $('#editItem', el)?.addEventListener('click', () => editItem(it))
        },
      })
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  async function editItem(it) {
    const ok = await modal({
      title: 'Malı dəyiş',
      iconName: 'edit',
      body: `<div class="stack">
        <div class="field"><label>Mal kodu</label><input class="inp" name="code" value="${esc(it.code)}" autocomplete="off" /></div>
        <div class="field"><label>Mal adı</label><input class="inp" name="name" value="${esc(it.name)}" autocomplete="off" /></div>
        <div class="alert blue">${icon('info', 17)}<div>Köhnə sənədlər də yeni ad ilə görünəcək. Dəyişiklik tarixçədə qalır.</div></div>
      </div>`,
      onOk: (f) => api('items.update', { id: it.id, code: f.code.value, name: f.name.value }),
    })
    if (ok) {
      toast('Mal yeniləndi')
      openItem(it.id)
    }
  }

  qEl.addEventListener('input', draw)
  $('#filter').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    filter = b.dataset.f
    $$('#filter button').forEach((x) => x.classList.toggle('on', x === b))
    draw()
  })
  $('#wrap').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]')
    if (tr) openItem(Number(tr.dataset.id))
  })
  $('#xls').addEventListener('click', () => excelExport('items', { q: qEl.value }))
  load()
  onDataChanged(load)
  qEl.focus()
}
