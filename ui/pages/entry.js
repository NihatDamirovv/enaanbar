'use strict'
/* Ana səhifə — vərəqdəki kodları köçürmək: VÖEN, tarix, mal kodu → mal adı avtomatik, say, qiymət */
Pages.entry = () => {
  const main = shell({ title: 'Ana səhifə', sub: 'Alış və məxaric yazmaq', iconName: 'edit', iconClass: 'c-blue' })
  main.classList.add('tight')
  const ROWS = 8
  let kind = 'IN'
  let items = new Map() // kod (kiçik hərf) → mal
  let rows = []
  let key = 0
  const newRow = () => ({ key: ++key, code: '', name: '', qty: '', price: '' })

  main.innerHTML = `
    <div class="card" style="display:flex;flex-direction:column;height:100%;min-height:520px">
      <div class="card-body" style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap;border-bottom:1px solid var(--border)">
        <div class="field">
          <label>Növ</label>
          <div class="seg" id="kind">
            <button type="button" class="in on" data-k="IN">${icon('in', 17)}Alış</button>
            <button type="button" class="out" data-k="OUT">${icon('out', 17)}Məxaric</button>
          </div>
        </div>
        <div class="field" style="width:120px"><label>Sənəd №</label><input class="inp tabular" id="docNo" readonly /></div>
        <div class="field" style="width:170px"><label>Tarix</label><input class="inp" id="date" type="date" /></div>
        <div class="field" style="width:200px"><label>VÖEN</label><input class="inp tabular" id="voen" inputmode="numeric" maxlength="10" placeholder="10 rəqəm" autocomplete="off" /></div>
      </div>
      <div class="muted small" style="padding:9px 18px;background:var(--surface-2);border-bottom:1px solid var(--border)" id="hint"></div>
      <div style="flex:1;overflow:auto">
        <table class="sheet" id="sheet">
          <thead><tr>
            <th style="width:46px;text-align:center">#</th>
            <th style="width:170px">Mal kodu</th>
            <th>Mal adı</th>
            <th class="num" style="width:120px" id="thStock">Qalıq</th>
            <th class="num" style="width:120px">Say</th>
            <th class="num" style="width:140px" id="thPrice">Qiymət</th>
            <th class="num" style="width:140px">Məbləğ</th>
            <th style="width:44px"></th>
          </tr></thead>
          <tbody></tbody>
        </table>
        <div style="padding:10px 12px"><button class="btn btn-sm btn-ghost" id="addRow">${icon('plus', 16)}Sətir əlavə et</button></div>
      </div>
      <div id="err" style="padding:0 18px"></div>
      <div style="display:flex;align-items:center;gap:16px;padding:14px 18px;border-top:1px solid var(--border);background:var(--surface-2);border-radius:0 0 var(--radius) var(--radius)">
        <div class="row" style="gap:22px">
          <div><div class="muted small">Sətir</div><div style="font:600 18px/1.2 var(--font-display)" class="tabular" id="cnt">0</div></div>
          <div><div class="muted small">Cəmi məbləğ</div><div style="font:600 18px/1.2 var(--font-display)" class="tabular" id="sum">0.00 ₼</div></div>
        </div>
        <div class="grow"></div>
        <button class="btn" id="clear">${icon('x', 16)}Təmizlə</button>
        <button class="btn btn-primary btn-lg" id="save">${icon('save', 18)}Yadda saxla <span class="kbd">Ctrl+S</span></button>
      </div>
    </div>
    <datalist id="codes"></datalist>`

  const tbody = $('#sheet tbody')
  const dateEl = $('#date')
  dateEl.value = todayIso()
  dateEl.max = todayIso()

  async function loadItems() {
    const list = await api('items.list')
    items = new Map(list.map((i) => [i.code.toLocaleLowerCase('az'), i]))
    $('#codes').innerHTML = list.map((i) => `<option value="${esc(i.code)}">${esc(i.name)}</option>`).join('')
    refreshAll()
  }
  async function loadNo() {
    $('#docNo').value = `№ ${await api('docs.nextNo', { kind })}`
  }

  function setKind(k) {
    kind = k
    $$('#kind button').forEach((b) => b.classList.toggle('on', b.dataset.k === k))
    $('#thStock').style.display = k === 'OUT' ? '' : 'none'
    $('#thPrice').textContent = k === 'OUT' ? 'Qiymət (FIFO)' : 'Qiymət'
    $('#hint').innerHTML =
      k === 'IN'
        ? `${icon('info', 15)} Kodu yazanda mal adı özü çıxır. <b>Yeni kod</b> olsa, adını bir dəfə yazın — mal <b>Anbar</b>a özü əlavə olunur.`
        : `${icon('info', 15)} Qiymət yazılmır — <b>FIFO</b> ilə ilk alınan maldan hesablanır. Anbarda olandan çox çıxmaq olmaz.`
    $('#save').classList.toggle('btn-primary', true)
    render()
    loadNo()
  }

  const itemOf = (r) => (r.code.trim() ? items.get(r.code.trim().toLocaleLowerCase('az')) : null)
  const parse = (v) => {
    const s = String(v).replace(/\s/g, '').replace(',', '.')
    return /^\d+(\.\d+)?$/.test(s) ? Number(s) : null
  }

  const stateOf = (r) => {
    const it = itemOf(r)
    const c = r.code.trim()
    return { it, isNew: !it && !!c && kind === 'IN', missing: !it && !!c && kind === 'OUT' }
  }
  function nameCell(r) {
    const { it, isNew, missing } = stateOf(r)
    return `<div class="row" style="gap:0">
        <input data-f="name" value="${esc(it ? it.name : missing ? '' : r.name)}" ${it || kind === 'OUT' ? 'readonly tabindex="-1"' : ''} placeholder="${isNew ? 'Yeni mal — adını yazın' : missing ? 'Belə kod anbarda yoxdur' : ''}" autocomplete="off" />
        ${isNew ? '<span class="badge blue" style="margin-right:10px">Yeni</span>' : ''}${missing ? '<span class="badge red" style="margin-right:10px">Yoxdur</span>' : ''}
      </div>`
  }
  function rowHtml(r, i) {
    const { it, missing } = stateOf(r)
    return `<tr data-key="${r.key}" class="${missing ? 'bad' : ''}">
      <td class="idx">${i + 1}</td>
      <td><input class="code-inp" data-f="code" value="${esc(r.code)}" list="codes" autocomplete="off" spellcheck="false" /></td>
      <td data-namecell>${nameCell(r)}</td>
      <td class="ro-cell num muted tabular" data-stock style="${kind === 'OUT' ? '' : 'display:none'}">${it ? fmtQty(it.stock) : ''}</td>
      <td><input class="num" data-f="qty" value="${esc(r.qty)}" inputmode="decimal" autocomplete="off" /></td>
      <td>${kind === 'IN' ? `<input class="num" data-f="price" value="${esc(r.price)}" inputmode="decimal" autocomplete="off" />` : `<div class="ro-cell num muted tabular" data-fifo></div>`}</td>
      <td class="ro-cell num tabular" data-amount style="font-weight:600"></td>
      <td><button class="btn btn-ghost btn-icon btn-sm del" data-del tabindex="-1" title="Sətri sil">${icon('x', 15)}</button></td>
    </tr>`
  }

  function render() {
    tbody.innerHTML = rows.map(rowHtml).join('')
    refreshAll()
  }

  const preview = debounce(async () => {
    if (kind !== 'OUT') return
    const filled = rows.filter((r) => r.code.trim())
    if (!filled.length) return refreshTotals()
    try {
      const res = await api('docs.preview', { date: dateEl.value, lines: filled.map((r) => ({ code: r.code, qty: r.qty })) })
      filled.forEach((r, i) => {
        r.preview = res[i]
      })
    } catch {
      /* göstəriş üçündür */
    }
    refreshAll()
  }, 200)

  function refreshRow(r) {
    const tr = $(`tr[data-key="${r.key}"]`, tbody)
    if (!tr) return
    const amt = $('[data-amount]', tr)
    const qty = parse(r.qty)
    if (kind === 'IN') {
      const price = parse(r.price)
      amt.textContent = qty != null && price != null ? fmtMoney(Math.round(qty * price * 100)) : ''
      amt.style.color = ''
    } else {
      const pv = r.preview
      const fifo = $('[data-fifo]', tr)
      const st = $('[data-stock]', tr)
      const it = itemOf(r)
      if (st) st.textContent = it ? fmtQty(pv?.found ? pv.stock : it.stock) : ''
      if (pv?.found && qty) {
        if (pv.enough) {
          amt.textContent = fmtMoney(pv.amount)
          amt.style.color = ''
          fifo.textContent = fmtPrice(Math.round((pv.amount * 100) / qty))
        } else {
          amt.textContent = 'Çatmır'
          amt.style.color = 'var(--red)'
          fifo.textContent = ''
        }
      } else {
        amt.textContent = ''
        if (fifo) fifo.textContent = ''
      }
    }
  }
  function refreshTotals() {
    const filled = rows.filter((r) => r.code.trim())
    $('#cnt').textContent = filled.length
    let sum = 0
    for (const r of filled) {
      const qty = parse(r.qty)
      if (kind === 'IN') {
        const price = parse(r.price)
        if (qty != null && price != null) sum += Math.round(qty * price * 100)
      } else if (r.preview?.enough && r.preview.amount != null) sum += r.preview.amount
    }
    $('#sum').textContent = `${fmtMoney(sum)} ₼`
  }
  function refreshAll() {
    rows.forEach(refreshRow)
    refreshTotals()
  }

  // ── Daxil etmə ─────────────────────────────────────
  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr')
    const r = rows.find((x) => x.key === Number(tr?.dataset.key))
    const f = e.target.dataset.f
    if (!r || !f) return
    r[f] = e.target.value
    if (f === 'code') {
      // mal adı: kod tanınırsa avtomatik çıxır
      r.preview = null
      $('[data-namecell]', tr).innerHTML = nameCell(r)
      tr.classList.toggle('bad', stateOf(r).missing)
    }
    $('#err').innerHTML = ''
    refreshRow(r)
    refreshTotals()
    if (kind === 'OUT') preview()
  })
  tbody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]')
    if (!b) return
    const key = Number(b.closest('tr').dataset.key)
    rows = rows.filter((r) => r.key !== key)
    if (!rows.length) rows.push(newRow())
    render()
  })
  // Enter → növbəti xana; sonuncu sətirdə — yeni sətir
  tbody.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const inp = e.target
    if (inp.tagName !== 'INPUT') return
    const tr = inp.closest('tr')
    if (e.key !== 'Enter') {
      if (inp.list && e.key === 'ArrowDown') return // kod siyahısında aşağı
      const sib = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling
      const target = sib && $(`[data-f="${inp.dataset.f}"]`, sib)
      if (target) {
        e.preventDefault()
        target.focus()
        target.select()
      }
      return
    }
    e.preventDefault()
    const cells = $$('input:not([readonly])', tr)
    const i = cells.indexOf(inp)
    if (i < cells.length - 1) {
      cells[i + 1].focus()
      cells[i + 1].select()
      return
    }
    let next = tr.nextElementSibling
    if (!next) {
      rows.push(newRow())
      render()
      next = $(`tr[data-key="${rows[rows.length - 1].key}"]`, tbody)
    }
    $('[data-f="code"]', next).focus()
  })
  $('#addRow').addEventListener('click', () => {
    for (let i = 0; i < 5; i++) rows.push(newRow())
    render()
  })
  $('#kind').addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (b && b.dataset.k !== kind) setKind(b.dataset.k)
  })
  dateEl.addEventListener('change', preview)
  $('#voen').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10)
  })

  function clearForm(keepDate = true) {
    rows = Array.from({ length: ROWS }, newRow)
    $('#voen').value = ''
    if (!keepDate) dateEl.value = todayIso()
    $('#err').innerHTML = ''
    render()
  }
  $('#clear').addEventListener('click', async () => {
    if (rows.some((r) => r.code || r.qty || r.price) && !(await confirmBox({ title: 'Vərəqi təmizlə', text: 'Yazılan bütün sətirlər silinsin?', okText: 'Təmizlə' }))) return
    clearForm()
    $('#voen').focus()
  })

  async function save() {
    const btn = $('#save')
    if (btn.disabled) return
    $('#err').innerHTML = ''
    btn.disabled = true
    try {
      const r = await api('docs.save', { kind, date: dateEl.value, voen: $('#voen').value, lines: rows.map((x) => ({ code: x.code, name: x.name, qty: x.qty, price: x.price })) })
      toast(`${kind === 'IN' ? 'Alış' : 'Məxaric'} №${r.no} yadda saxlandı — ${fmtMoney(r.total)} ₼`)
      clearForm()
      await Promise.all([loadItems(), loadNo()])
      $('#voen').focus()
    } catch (err) {
      $('#err').innerHTML = `<div class="alert red" style="margin:12px 0 0">${icon('alert', 17)}<div>${esc(err.message)}</div></div>`
    } finally {
      btn.disabled = false
    }
  }
  $('#save').addEventListener('click', save)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    }
  })
  enterAsTab($('.card-body'))
  $('#voen').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      $('[data-f="code"]', tbody)?.focus()
    }
  })

  rows = Array.from({ length: ROWS }, newRow)
  setKind('IN')
  loadItems()
  onDataChanged(() => {
    loadItems()
    loadNo()
  })
  setTimeout(() => $('#voen').focus(), 50)
}
