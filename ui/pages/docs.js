'use strict'
/* Alışlar və Məxariclər — sənədlərin siyahısı, ətraflı baxış, ləğv */
function docsPage(kind) {
  const IN = kind === 'IN'
  const main = shell({
    title: IN ? 'Alışlar' : 'Məxariclər',
    sub: IN ? 'Bütün alış sənədləri — arxiv' : 'Bütün məxaric sənədləri — FIFO ilə',
    iconName: IN ? 'in' : 'out',
    iconClass: IN ? 'c-teal' : 'c-amber',
  })
  const t = todayIso()
  main.innerHTML = `
    <div class="toolbar">
      <div class="field" style="flex-direction:row;align-items:center;gap:8px">
        <input class="inp" type="date" id="from" style="width:160px" />
        <span class="muted">—</span>
        <input class="inp" type="date" id="to" style="width:160px" />
      </div>
      <div class="seg sm" id="quick">
        <button data-r="today">Bu gün</button>
        <button data-r="month" class="on">Bu ay</button>
        <button data-r="all">Hamısı</button>
      </div>
      <div class="search" style="width:260px">${icon('search', 16)}<input class="inp" id="q" placeholder="VÖEN, kod, mal adı, №" autocomplete="off" /></div>
      <select class="sel" id="status" style="width:150px">
        <option value="">Bütün sənədlər</option>
        <option value="ACTIVE">Aktiv</option>
        <option value="CANCELLED">Ləğv edilmiş</option>
      </select>
      <div class="spacer"></div>
      <button class="btn" id="xls">${icon('excel', 17)}Excel</button>
    </div>
    <div class="stats" id="stats"></div>
    <div class="card"><div class="tbl-wrap" id="wrap"></div></div>`

  const fromEl = $('#from')
  const toEl = $('#to')
  const setRange = (r) => {
    if (r === 'today') (fromEl.value = t), (toEl.value = t)
    else if (r === 'month') (fromEl.value = t.slice(0, 8) + '01'), (toEl.value = t)
    else (fromEl.value = ''), (toEl.value = '')
    $$('#quick button').forEach((b) => b.classList.toggle('on', b.dataset.r === r))
  }
  setRange('month')
  const filters = () => ({ kind, from: fromEl.value, to: toEl.value, q: $('#q').value, status: $('#status').value })

  async function load() {
    try {
      const docs = await api('docs.list', filters())
      const active = docs.filter((d) => d.status === 'ACTIVE')
      const sum = active.reduce((s, d) => s + d.total, 0)
      const lines = active.reduce((s, d) => s + d.lineCount, 0)
      $('#stats').innerHTML = `
        <div class="stat"><div class="k">Sənəd</div><div class="v">${active.length}${docs.length !== active.length ? ` <small>+ ${docs.length - active.length} ləğv</small>` : ''}</div></div>
        <div class="stat"><div class="k">Sətir</div><div class="v">${lines}</div></div>
        <div class="stat"><div class="k">Cəmi məbləğ</div><div class="v">${fmtMoney(sum)} <small>₼</small></div></div>`
      if (!docs.length) {
        $('#wrap').innerHTML = emptyState(IN ? 'in' : 'out', 'Bu dövrdə sənəd yoxdur', S.canWrite ? 'Sənəd yazmaq üçün əsas menyudan «Ana səhifə»ni açın.' : '')
        return
      }
      $('#wrap').innerHTML = `<table class="tbl">
        <thead><tr><th style="width:70px">№</th><th style="width:110px">Tarix</th><th style="width:200px">VÖEN / kontragent</th><th>Mallar</th><th class="num" style="width:70px">Sətir</th><th class="num" style="width:140px">Məbləğ</th><th style="width:120px">Status</th></tr></thead>
        <tbody>${docs
          .map((d) => {
            const names = d.lines.slice(0, 3).map((l) => esc(l.name)).join(', ')
            return `<tr class="click ${d.status !== 'ACTIVE' ? 'cancelled' : ''}" data-id="${d.id}">
            <td><b class="strike tabular">№${d.no}</b></td>
            <td class="tabular">${dmy(d.date)}</td>
            <td>${d.voen ? `<div class="tabular">${esc(d.voen)}</div>${d.party ? `<div class="small muted" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.party)}</div>` : ''}` : '<span class="faint">—</span>'}</td>
            <td style="max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${names}${d.lines.length > 3 ? ` <span class="faint">+${d.lines.length - 3}</span>` : ''}</td>
            <td class="num">${d.lineCount}</td>
            <td class="num"><b class="strike">${fmtMoney(d.total)} ₼</b></td>
            <td>${d.status === 'ACTIVE' ? '<span class="badge green">Aktiv</span>' : '<span class="badge red">Ləğv edilib</span>'}</td>
          </tr>`
          })
          .join('')}</tbody>
      </table>`
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  async function openDoc(id) {
    try {
      const d = await api('docs.get', { id })
      const cancelled = d.status !== 'ACTIVE'
      drawer({
        title: `${IN ? 'Alış' : 'Məxaric'} №${d.no}`,
        sub: `${dmy(d.date)}${d.voen ? ` · VÖEN ${esc(d.voen)}` : ''}${d.party ? ` · ${esc(d.party)}` : ''}${d.ref ? ` · köhnə № ${esc(d.ref)}` : ''} · yazılıb ${dmy(d.createdAt.slice(0, 10))} ${hm(d.createdAt)}`,
        body: `
          ${cancelled ? `<div class="alert red" style="margin-bottom:14px">${icon('alert', 17)}<div><b>Ləğv edilib</b> — ${dmy(d.cancelledAt.slice(0, 10))} ${hm(d.cancelledAt)}<br/>Səbəb: ${esc(d.cancelReason)}</div></div>` : ''}
          <div class="card"><table class="tbl">
            <thead><tr><th>#</th><th>Kod</th><th>Mal adı</th><th class="num">Say</th><th class="num">${IN ? 'Qiymət' : 'Qiymət (FIFO)'}</th><th class="num">Məbləğ</th></tr></thead>
            <tbody>${d.lines
              .map(
                (l) => `<tr>
                <td class="muted">${l.lineNo}</td>
                <td><span class="code">${esc(l.code)}</span></td>
                <td>${esc(l.name)}${l.unit ? ` <span class="faint small">${esc(l.unit)}</span>` : ''}
                  ${l.note || l.dqn || l.route ? `<div class="small" style="margin-top:3px;color:var(--text-2)">${[l.dqn && `DQN ${esc(l.dqn)}`, l.route && `xətt ${esc(l.route)}`, l.note && esc(l.note)].filter(Boolean).join(' · ')}</div>` : ''}
                  ${!IN && l.takes?.length ? `<div class="small muted" style="margin-top:4px">${l.takes.map((t) => `Alış №${t.inNo} (${dm(t.date)}): ${fmtQty(t.qty)} × ${fmtPrice(t.cost)} = ${fmtMoney(t.amount)}`).join('<br/>')}</div>` : ''}
                  ${IN && l.used?.length ? `<div class="small muted" style="margin-top:4px">Məxaric olunub: ${l.used.map((n) => `№${n}`).join(', ')}</div>` : ''}
                </td>
                <td class="num">${fmtQty(l.qty)}</td>
                <td class="num">${fmtPrice(l.price)}</td>
                <td class="num"><b>${fmtMoney(l.amount)}</b></td>
              </tr>`,
              )
              .join('')}</tbody>
            <tfoot><tr><td colspan="5">Cəmi</td><td class="num">${fmtMoney(d.total)} ₼</td></tr></tfoot>
          </table></div>
          ${!IN ? `<div class="alert blue" style="margin-top:14px">${icon('info', 17)}<div>Məbləğ FIFO ilə hesablanıb: əvvəlcə ən köhnə alışdan götürülür.</div></div>` : ''}`,
        foot: S.canWrite && !cancelled ? `<button class="btn btn-danger" id="cancelDoc">${icon('trash', 16)}Sənədi ləğv et</button>` : '',
        onOpen: (el, close) => {
          $('#cancelDoc', el)?.addEventListener('click', async () => {
            const ok = await modal({
              title: `${IN ? 'Alış' : 'Məxaric'} №${d.no} ləğv edilsin?`,
              iconName: 'alert',
              iconClass: 'c-red',
              danger: true,
              okText: 'Ləğv et',
              body: `<div class="stack">
                <p style="margin:0;color:var(--text-2)">Sənəd silinmir — arxivdə «Ləğv edilib» kimi qalır. ${IN ? 'Mallar anbardan çıxarılır.' : 'Mallar anbara geri qayıdır.'}</p>
                <div class="field"><label>Səbəb</label><input class="inp" name="reason" placeholder="Məs. səhv yazılıb" autocomplete="off" /></div>
              </div>`,
              onOk: (f) => api('docs.cancel', { id: d.id, reason: f.reason.value }),
            })
            if (ok) {
              toast(`№${d.no} ləğv edildi`)
              close()
            }
          })
        },
      })
    } catch (err) {
      toast(err.message, 'err')
    }
  }

  $('#quick').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    setRange(b.dataset.r)
    load()
  })
  for (const el of [fromEl, toEl, $('#status')])
    el.addEventListener('change', () => {
      $$('#quick button').forEach((b) => b.classList.remove('on'))
      load()
    })
  $('#q').addEventListener('input', debounce(load, 250))
  $('#wrap').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]')
    if (tr) openDoc(Number(tr.dataset.id))
  })
  $('#xls').addEventListener('click', () => excelExport(kind, filters()))
  load()
  onDataChanged(load)
}
