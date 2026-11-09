# ENA Anbar

Avtobus şirkəti üçün Windows proqramı: **anbar (FIFO ilə alış/məxaric)**, **avtobuslar** (xətlərə görə, müvəqqəti yerdəyişmə), **gündəlik qeydlər** (hər gecə köhnə qeydlərə köçür), **ilk çıxış cədvəli**.
Sahibi: Nihat Damirov. XYpos ilə əlaqəsi yoxdur.

## Quruluş
- **Proqram (exe)** — Electron. Hər bölmə ayrı pəncərədə açılır. Məlumat kompüterdə saxlanmır, **serverə** yazılır.
- **Server** — `server.js` (Node, `http`). Baza SQLite (`sql.js`, bir fayl). Serverdə `ena-anbar.service`, `127.0.0.1:3130`, Caddy **:8082** arxasında.
  - `GET /` — exe yükləmə səhifəsi (`site/index.html`), `GET /download` — ən son `ENA-Anbar-Setup-x.y.z.exe`
  - `POST /api` `{method, args}` + `x-ena-token`; `GET /api/export` (Excel); `GET /events` (canlı yenilənmə, SSE)
- Bir kompüterdə yazılan dərhal başqa kompüterlərdə görünür (SSE).

## Giriş
1. **Ümumi parol** — hamı onunla girir.
2. Ekran: **Anbardar** (öz parolu ilə — hər şeyi yazır/dəyişir) və ya **Mühasib** (yalnız baxır).
- Parollar serverdə təyin olunur (kənardan «ilk quraşdırma» bağlıdır): `scripts/set-passwords.js` (stdin JSON, server dayanmış halda, `--force` ilə dəyişir). Proqramda: Parametrlər → Parolları dəyiş.
- 5 səhv parol → həmin IP 1 dəqiqə kilidlənir. Sessiya 12 saat (proqram açıqdırsa yaşayır).
- Real parollar: `.local-credentials.txt` (git-də deyil). 2026-11-09: sahibin istəyi ilə hər iki parol müvəqqəti eynidir (`set-passwords.js --force` eyni parola xəbərdarlıqla icazə verir).

## Qaydalar
- **Heç nə silinmir.** Sənəd «ləğv edilir» (səbəb ilə), arxivdə qalır. Məxaric olunmuş alışı ləğv etmək olmaz — əvvəl məxaric ləğv edilir.
- **FIFO:** məxaric ən köhnə alışdan götürülür; qalıqdan çox çıxmaz; qəpik itmir (qat bitəndə qalan məbləğ tam keçir). Say 3, qiymət 4, məbləğ 2 onluq.
- Ana səhifə: VÖEN (rəqəm və ya kod, məs. PRVDR0003 — kontragent adı özü çıxır; yeni VÖEN-ə ad bir dəfə yazılır), tarix, mal kodu → mal adı avtomatik. Yeni kod alışda bir dəfə adı ilə yazılır → Anbara həmin tarixlə özü əlavə olunur.
- **Yerdəyişmə:** avtobus N gün başqa xətdə; müddət bitəndə özü öz xəttinə qayıdır. Keçid və qayıdış qeydlərə avtomatik yazılır («öz xəttinə qayıtdı — 09.11–10.11 12 xəttində idi»).
- **Qeydlər** tarixə bağlıdır: yeni gündə «Bugünkü qeydlər» boşdur, dünənkilər «Köhnə qeydlər»də. Server saat qurşağı `Asia/Baku` (systemd `TZ`).

## Köməkçi (chatbot) — `src/assistant.js`, pəncərə «Köməkçi»
- Bazaya baxıb cavab verir, **heç nə yazmır** (8 oxuyan alət: anbar axtarışı, mal tarixçəsi, anbar xülasəsi, sənədlər, avtobusa (DQN) verilənlər, yerdəyişmələr, avtobuslar, qeydlər).
- API OpenAI-uyğun: `ENA_LLM_KEY` (açar), `ENA_LLM_URL` (default `https://api.x.ai/v1` — Grok), `ENA_LLM_MODEL` (boşdursa ucuz/sürətli model özü seçilir), `ENA_LLM_FALLBACK` (əsas modelin limiti dolanda). Serverdə `/etc/ena-anbar.env` (chmod 600, git-də deyil), sonra `sudo systemctl restart ena-anbar`.
- **Hazırda (2026-11-09): Groq pulsuz plan** — `https://api.groq.com/openai/v1`, model `openai/gpt-oss-120b`, ehtiyat `openai/gpt-oss-20b`. Groq pulsuz limiti: modelə görə dəqiqədə 8000 token, gündə 1000 sorğu → 429 gələndə «try again in Xs» qədər gözləyib təkrar, sonra ehtiyat model. Alət nəticəsi ≤5000 simvol, son 6 mesaj. Cavab ~1–3 saniyə.
- grok.com-dakı «Cursor» növlü `grok_...` açarı xAI API-də işləmir (`xai-` açarı console.x.ai-dan, pulludur).
- **Limit:** gündə 150 sual (hamı üçün, `ENA_LLM_DAILY`), hər sessiyaya saatda 20, cavab ≤700 token, son 8 mesaj, sual ≤600 simvol. Sayğac bazada (`meta.llm_*`), gündəlik sıfırlanır.
- Test: `node test/assistant-test.js` (saxta LLM ilə, 22 yoxlama).

## Köhnə bazadan köçürmə (2026-11-09)
- Köhnə proqram (.NET) bazası: `%APPDATA%\ENA Anbar\ena_anbar.db`. Skript: `ENA_DATA=... node scripts/import-old.js <ena_anbar.db> [--yes]` (yalnız boş anbara; `--yes` olmadan yoxlama).
- Köçürüldü: 96 kontragent, 897 mal (ölçü vahidi), 4759 alış / 6266 sətir, 754 məxaric / 22853 sətir; məxaric köhnə proqramdakı kimi öz alışına (alis_uid) bağlı, şərh/DQN/xətt sətirdə. İstifadəçilər/parollar köçürülmədi.
- Fərqlər: köhnə proqram alışa bağlantısı boş 33 məxaric sətrini (66 ədəd, ~5003 ₼) qalıqdan çıxmırdı — yeni sistem FIFO ilə çıxır (qalıq 6151 vs köhnə 6211). 4 məxaric sətrində anbarda mal yox idi (köhnə proqram icazə verirdi) — qatlar mənfiyə düşmür. 117 alışın qiyməti köhnə bazada 0-dır.
- Serverdə köhnə fayl: `/opt/ena-anbar/import/`, köçürmədən əvvəlki nüsxə `data/backup/ena-anbar-before-import-*.db`.

## Əmrlər
```bash
npm test                                   # iş qaydaları (54 yoxlama)
node test/assistant-test.js                # köməkçi (22)
npm run server                             # lokal server (PORT=3130, ENA_DATA=./data)
ENA_SERVER=http://127.0.0.1:3130 npm start # proqram lokal serverlə
npm run dist                               # dist/ENA-Anbar-Setup-<versiya>.exe (versiyanı package.json-da artır)
bash scripts/deploy-server.sh --exe        # serverə: kod + exe (baza toxunulmur)
```
- Server testi: `BASE=... ENA_PW=... ENA_APW=... node test/server-test.js` (25 yoxlama; **canlı bazaya qeyd yazır** — yalnız lokal serverdə işlət).
- Ekran şəkilləri: server `ENA_SEED=1 ENA_PW=.. ENA_APW=..` (nümunə məlumat) + proqram `ENA_SHOTS=<qovluq>` — `src/shots.js`.
- Windows-da imzalama yoxdur (`signAndEditExecutable: false`), ikon `scripts/after-pack.js` (rcedit) ilə yazılır; ikon: `npm run icons`.

## Server
- `/opt/ena-anbar/app` (kod), `/opt/ena-anbar/data/ena-anbar.db` (baza), `data/backup/` (gecəlik, 90 gün), `/opt/ena-anbar/download/` (son 3 exe).
- Caddy bloku `:8082` (əvvəlki nüsxə `/etc/caddy/Caddyfile.bak-before-ena-anbar-20261109-104838`). Serverdəki başqa layihələrə (Arifmetik, XYpos, Mafia) toxunma.
