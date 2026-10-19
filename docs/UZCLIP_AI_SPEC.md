# UzClip AI

## Tizim arxitekturasi, texnik topshiriq va Codex promptlari

**Versiya:** 0.1  
**Sana:** 2026-10-18  
**Holat:** 0.1 versiya implementatsiyasi mavjud; release va uch platformadagi tekshiruvlar hali kerak

## 1. Mahsulot maqsadi

UzClip AI — Windows, macOS va Linux uchun mahalliy ishlaydigan desktop dastur. U foydalanuvchiga tegishli uzun videodan mazmunli qisqa kliplarni topadi, vertikal formatga moslaydi, o‘zbekcha yoki inglizcha subtitr qo‘shadi va eksport qiladi.

“Viral” balli ko‘rishlar sonini kafolatlamaydi. U klipning kirish qismi, mazmuni va mustaqil tushunarliligini tahrirchi ko‘rib chiqishi uchun taxminiy reytinglaydi.

### Asosiy tamoyillar

- **Mahalliy va maxfiy:** video, audio, transkript va loyiha metama’lumotlari foydalanuvchi qurilmasida qoladi.
- **Bepul:** obuna, majburiy API kaliti, server hisobi yoki watermark yo‘q.
- **Internet ixtiyoriy:** model yuklash faqat foydalanuvchi boshlaganda ishlaydi; model va dastur o‘rnatilgach asosiy ish jarayoni tarmoqsiz bajariladi.
- **Tahrirchi nazorati:** avtomatik takliflar eksportdan oldin ko‘riladi, kesiladi, rad qilinadi yoki tasdiqlanadi.
- **O‘zbekcha va inglizcha:** interfeys va transkripsiya tillari alohida sozlanadi; dastur asl nutqni o‘z-o‘zidan tarjima qilmaydi.
- **Izohlanadigan natija:** har bir taklifga vaqt oralig‘i, ball va qisqa sabab biriktiriladi.
- **Portativ:** loyihalar standart OS ma’lumot papkasida saqlanadi; foydalanuvchi ularni eksport va o‘chira oladi.

“Bepul” dastur litsenziyasini va majburiy cloud to‘lovi yo‘qligini anglatadi. Transkripsiya tezligi kompyuter, xotira va tanlangan modelga bog‘liq. Katta modelni yuklab olish uchun internet va disk joyi kerak bo‘lishi mumkin.

## 2. Manbalardan olingan yo‘nalishlar

Quyidagi jadval repolarning main branchidagi ko‘rib chiqilgan README va LICENSE fayllariga asoslangan. Bu manba kodining to‘liq auditi yoki README da’volarining amaliy tekshiruvi emas.

| Loyiha | README’da ta’riflangan kuchli jihat | UzClip AI uchun qaror |
|---|---|---|
| [aionixOS/Openclip](https://github.com/aionixOS/Openclip) | Local-first g‘oya, FFmpeg, transkripsiya, kliplar, SQLite va progress ko‘rsatish | Mahalliy pipeline va loyiha tarixini olish; desktop ilovada server/frontendni alohida deploy qilmaslik |
| [ai-video-clipper](https://github.com/PriyeshPandey2000/ai-video-clipper) | Bitta vazifali pipeline modullari, typed IPC, ko‘rib chiqish va tasdiqlash, SQLite’ga bitta qatlam orqali kirish | UI, orchestration va media worker chegaralarini aniq saqlash; inson tasdig‘ini majburiy qilish |
| [OpenShorts](https://github.com/mutonby/openshorts) | Sahna bo‘yicha crop/layout, gapiruvchilar uchun split, subtitr, local LLM endpoint bilan ishlash | Reframe rejimlarini tanlanadigan qilish; AI xizmatini local-only adapterga cheklash; hosted, publishing va pullik servislarni MVPga kiritmaslik |
| [AI-Youtube-Shorts-Generator](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator) | Virallik rubrikasi, uzun videoni bo‘lib ko‘rish, takror kliplarni birlashtirish, score va sabab qaytarish | Reytingni shaffof qilish, uzun videolarni batch qilish va JSON shaklidagi barqaror worker natijalarini qo‘llash |

Ko‘rilgan repolarning README va LICENSE fayllarida MIT litsenziyasi ko‘rsatilgan. Bu ularning har bir dependency, model og‘irligi yoki media resursi ham MIT degani emas. Ushbu hujjat arxitektura g‘oyalarini jamlaydi; boshqa repo kodini ko‘chirish rejalashtirilmagan. Kod yoki asset qayta ishlatilsa, alohida litsenziya va attribution tekshiruvi kerak.

OpenClip.app foydalanuvchi bergan mahsulot havolasi sifatida qayd etildi, lekin bu texnik ko‘rib chiqishda uning sayti tekshirilmadi.

## 3. Mahsulot doirasi

### MVP ichida

1. Kompyuterdan MP4, MOV, MKV va WebM fayllarini tanlash.
2. Video davomiyligi, o‘lchami va audio treklarini ko‘rsatish.
3. O‘zbekcha yoki inglizcha transkripsiya tilini tanlash yoki avtomatik aniqlash.
4. Mahalliy Whisper backend orqali vaqt belgilangan transkript yaratish.
5. Transkriptni uzun videolar uchun bo‘laklab tahlil qilish.
6. 3–10 ta tahrir qilinadigan klip taklifini chiqarish: nom, boshlanish/tugash, ball va sabab.
7. Kliplarni preview qilish, vaqtini qo‘lda tahrirlash va tasdiqlash.
8. 9:16 eksport, subtitr yoqish/o‘chirish va SRT/VTT faylini eksport qilish.
9. Markaziy crop va qo‘lda crop MVPda; yuzni kuzatish keyingi kichik bosqichda yoki beta sifatida.
10. Loyiha tarixi, to‘xtatish, xato tafsiloti va muvaffaqiyatsiz bosqichdan qayta boshlash.
11. Ilova matnlarini o‘zbekcha va inglizcha ko‘rsatish.

### MVPdan keyin

- Kamera va gapiruvchi soniga qarab avtomatik reframe: **CENTER**, **FACE_TRACK**, **SPLIT**, **BLUR_BACKGROUND**.
- Mahalliy LLM bilan semantik klip tanlash; Ollama yoki boshqa faqat loopback endpointga ulangan adapter.
- O‘zbekcha lotin/kiril transliteratsiyasi; transkriptning original shakli saqlanadi.
- YouTube URL yoki boshqa manbadan import, faqat huquq va xizmat shartlariga mos holatlarda.
- Subtitr shablonlari, batch queue va boshqa nisbatlar.

MVP YouTube’dan URL orqali yuklab olish, cloud AI, login, avtomatik ijtimoiy tarmoqqa joylash, AI avatar yaratish yoki pullik API’ni talab qilmaydi. URL import qo‘shilsa, foydalanuvchiga manba qoidalari va mualliflik huquqini eslatish hamda bu funksiyani o‘chirib qo‘yish imkonini berish kerak.

### 0.1 implementatsiyasining holati

Repo ichidagi ishlaydigan boshlang‘ich ilova asosiy mahalliy jarayonni qoplaydi: fayl importi va metadata, SQLite loyiha tarixi, foydalanuvchi aniq boshlaydigan Faster Whisper model yuklashi, Uzbek/English/Auto transkripsiya, transkript matnini qo‘lda tahrirlash, transcriptga asoslangan klip reytingini qayta hisoblash, vaqt va chap/markaz/o‘ng crop tahriri, tanlangan oraliq preview’i, 9:16 MP4 renderi hamda mavjud segmentlardan SRT/VTT va `.uzclip.json` metadata sidecarlarini yaratish. Transkripsiya va render joblari bekor qilinadi. Ishlayotgan job vaqtida ilova yopilsa, keyingi ishga tushishda job `interrupted` deb belgilanadi va foydalanuvchi amalni qayta boshlashi mumkin. Tafsilotlar va ishga tushirish buyruqlari repo ildizidagi `README.md` da berilgan.

Hozirgi klip reytingi semantik AI emas; u matn uzunligi, tinish belgilari va kichik Uzbek/English iboralar ro‘yxatidan foydalanadi. Uzoq videoni alohida boshqariladigan chunk joblariga bo‘lish, crop uchun yuz kuzatuvi, jobni aynan to‘xtagan joyidan davom ettirish va release imzolash hali implementatsiya qilinmagan. FFmpeg alohida o‘rnatilib PATH’da bo‘lishi kerak. Har bir OS uchun paketni o‘sha OS’da alohida yig‘ib tekshirish lozim.

## 4. Tavsiya etilgan texnik arxitektura

### Stack

- **Desktop shell:** Electron.
- **UI:** React + TypeScript.
- **Mahalliy orchestration va media pipeline:** Python worker.
- **UI/worker aloqa:** Electron main process orqali typed IPC; worker bilan newline-delimited JSON (NDJSON) stdio protokoli. Renderer to‘g‘ridan-to‘g‘ri fayl tizimiga yoki worker portiga ulanmaydi.
- **Ma’lumotlar bazasi:** SQLite. Database bilan faqat worker/storage moduli ishlaydi.
- **Video/audio:** FFmpeg/FFprobe subprocess.
- **Nutqni matnga aylantirish:** Faster Whisper (`faster-whisper`) backend, CPU `int8` rejimi va foydalanuvchi tanlab yuklaydigan Tiny/Base/Small modellar. Yuklashdan tashqari transkripsiya mahalliy bajariladi; model tarqatishdan avval uning litsenziyasi va manbasini tekshirish kerak.
- **Klip tanlash:** avval deterministic lokal scorer; keyin optional local LLM provider. Default holat tashqi hostlarga so‘rov yubormaydi.
- **Yuzni aniqlash:** MediaPipe yoki OpenCV asosidagi alohida Reframer adapteri; litsenziya, model fayli va platforma buildini alohida tekshirish.
- **Paketlash:** Electron Builder; PyInstaller Python worker’ni platformaga mos bundle qiladi. FFmpeg tizimga alohida o‘rnatiladi. Har OS uchun alohida CI runner va imzolangan release kerak.

Electron tanlovi UI/desktop ekotizimi va barcha uch OS uchun bir xil renderer berishi bilan bog‘liq. Uning RAM va installer hajmi Tauri’dan kattaroq. Python media ekotizimi esa prototipni tezlashtiradi; shu sabab worker alohida jarayon sifatida saqlanadi. Birinchi texnik spike ushbu ikki tanlovni haqiqiy Windows, macOS va Linux buildida tasdiqlashi kerak.

### Tizim oqimi

~~~mermaid
flowchart LR
  U[User] --> R[React renderer]
  R -->|typed IPC| E[Electron main]
  E -->|NDJSON stdio| J[Python job worker]
  J --> P[SQLite project store]
  J --> F[FFprobe and FFmpeg]
  J --> W[Local Whisper runtime]
  J -. optional loopback only .-> L[Local LLM]
  J --> M[Local models and media files]
  J -->|progress and result events| E
  E -->|typed IPC| R
~~~

Jarayonlarni HTTP server yoki barcha tarmoq interfeysida ochiq port bilan boshqarish shart emas. Agar keyin loopback API kerak bo‘lsa, u 127.0.0.1 bilan cheklanishi va tasodifiy token bilan himoyalanishi lozim.

### Worker vazifalari

1. **Import:** fayl yo‘lini tekshirish, FFprobe orqali metadata olish, loyiha yaratish.
2. **Audio extraction:** transkripsiya uchun mono PCM audio tayyorlash; asl media faylni o‘zgartirmaslik.
3. **Transcription:** til tanlovi, vaqt belgilari va confidence mavjud bo‘lsa qaytarish.
4. **Candidate generation:** transcriptni overlap bilan bo‘laklash, mazmunli vaqt oynalarini taklif qilish.
5. **Ranking:** clip schema bo‘yicha local scorer yoki loopback LLM’dan JSON olish, schema va vaqt chegaralarini tekshirish.
6. **Review:** UI tahriri workerga project state sifatida saqlanadi.
7. **Render:** FFmpeg argumentlarini shell string emas, argumentlar ro‘yxati sifatida chaqirish; temp faylga render, muvaffaqiyatdan keyin atomik rename.
8. **Export:** MP4, SRT/VTT va loyiha metadata fayli.

Worker xabarlari versiyalangan bo‘lishi kerak:

~~~json
{"version":1,"type":"job.progress","job_id":"...","stage":"transcribe","progress":0.42}
{"version":1,"type":"job.completed","job_id":"...","result":{"project_id":"..."}}
{"version":1,"type":"job.failed","job_id":"...","error":{"code":"MODEL_MISSING","message":"...","recoverable":true}}
~~~

stdout faqat protokol uchun; loglar stderr yoki rotating log fayliga yoziladi. Har bir job queued, running, cancelled, failed, completed holatlaridan birida bo‘ladi; bosqichlar saqlanib, app qayta ochilganda xato tafsiloti yo‘qolmaydi.

## 5. Klip tanlash va til talablari

### Klip taklifining shakli

~~~json
{
  "start_ms": 123000,
  "end_ms": 176000,
  "score": 82,
  "title": "Asosiy fikrga qisqa nom",
  "hook": "Birinchi jumla yoki e'tibor tortuvchi ibora",
  "reason": "Fikr to‘liq, aniq misol bilan yakunlanadi.",
  "language": "uz",
  "transcript_segment_ids": ["..."],
  "warnings": []
}
~~~

Validatsiya: start_ms < end_ms, vaqtlar video davomiyligi ichida, klip davomiyligi sozlangan oraliqda. Transcript gapning o‘rtasidan boshlanmasligi/tugamasligi uchun chegaralarni jumla vaqtiga yaqinlashtirish mumkin; foydalanuvchi ularni baribir tahrirlaydi.

### Ball mezonlari

Ballni “virallik kafolati” emas, saralash uchun taxminiy signal deb ko‘rsatish. Dastlabki rubrika:

- Kuchli kirish/hook: 0–20.
- Fikrning mustaqil va tushunarli bo‘lishi: 0–20.
- Hikoya, ziddiyat, hayrat yoki hissiy nuqta: 0–20.
- Amaliy foyda yoki aniq insight: 0–15.
- Ravonlik va yakunlangan fikr: 0–15.
- Klip uzunligi va kesim sifati: 0–10.

Natijada ballning yonida sabab va ogohlantirish ko‘rsatiladi. Bir xil vaqtlarni qamrab olgan nomzodlar orasida yuqori ball saqlanadi; deduplikatsiya chegarasi sozlanadigan bo‘lsin. Deterministic fallback transcript uzunligi, gap chegarasi, so‘z takrorlari va qo‘lda sozlanadigan signal mezonlaridan foydalanadi; u semantik LLM sifatida ko‘rsatilmaydi.

### O‘zbekcha va inglizcha

- Interfeys tili transkripsiya tilidan mustaqil.
- UI tarjimalari i18n kataloglarida saqlanadi; satrlar komponent ichida qotirib yozilmaydi.
- Tilni Auto, O‘zbekcha, English qilib tanlash mumkin.
- Kod-switching bo‘lgan audio alohida sinovdan o‘tkaziladi; avtomatik aniqlash xato qilsa, tilni qo‘lda tanlash yo‘li ko‘rinib turadi.
- Transkript original matnni saqlaydi. Tarjima alohida, ixtiyoriy amal bo‘ladi.
- O‘zbek lotin/kiril ko‘rinishi transkriptni qayta yozish emas, ko‘rsatish/eksport bosqichidagi alohida variant; matn va timestamp aloqasi saqlanadi.
- Uzbek ASR aniqligi qurilmaga, audio sifatiga va modelga bog‘liq. Release mezoni real o‘zbekcha va inglizcha audio to‘plamida alohida WER va tahrirga ketgan vaqt bilan o‘lchanadi.
- Subtitr fonti lotin, apostrof shakllari va kiril belgilarini ko‘rsatishi kerak; matnni ikki qatorga bo‘lish va chekka safe-area tekshiriladi.

## 6. Mahalliy ma’lumot va maxfiylik

Tavsiya etilgan loyiha modeli:

- **Project:** nom, source path, davomiylik, yaratilgan vaqt, holat.
- **Job:** tur, stage, progress, xato kodi, boshlanish/tugash va cancel flag.
- **TranscriptSegment:** start/end ms, text, language, optional confidence.
- **ClipCandidate:** start/end ms, score, title, reason, crop setting, status.
- **Export:** output path, format, render setting, checksum yoki file size.
- **AppSetting:** UI tili, model yo‘li, default eksport presetlari.

Media fayllar standart OS cache/data ichida emas, foydalanuvchi tanlagan source path va export path’da qolishi mumkin; app source faylni move/delete qilmaydi. Temp fayl va cache uchun platformdirs katalogidan foydalanib, Settings’da hajm va tozalash amalini ko‘rsatish.

Maxfiylik majburiyatlari:

1. Defaultda telemetry, analytics, crash upload va remote LLM yo‘q.
2. Model yuklanishi foydalanuvchi harakati bilan boshlanadi; yuklash sahifasida manba, hajm, litsenziya va checksum ko‘rsatiladi.
3. Yuklangan model checksum’i manifest bilan tekshiriladi; TLS tekshiruvi o‘chirilmaydi.
4. Optional local LLM faqat loopback manzilga ulanadi; tashqi URL defaultda qabul qilinmaydi.
5. FFmpeg va boshqa child processlar shell interpolation’siz ishga tushiriladi.
6. Media importda format/codec tekshiriladi; temporary pathlar xavfsiz yaratiladi; foydalanuvchi tanlamagan fayllar ustidan amallar bajarilmaydi.
7. Loyiha o‘chirilganda database yozuvlari va app yaratgan cache o‘chadi; asl source video faqat foydalanuvchi alohida tanlasa o‘chadi.

## 7. Nofunksional talablar

- **Platforma:** Windows 10/11 x64, macOS 12+ Intel/Apple Silicon, Ubuntu 22.04+ x64 — dastlabki release targetlari; real CI buildi bilan tasdiqlanishi kerak.
- **Responsive UI:** uzoq transkripsiya va render fon jobida ishlaydi; progress, bekor qilish va xatoni ko‘rsatadi.
- **Tiklanish:** jarayon yopilsa, tugagan bosqichlar saqlanadi; yarim tayyor eksport final nom ostida ko‘rinmaydi.
- **Barqaror eksport:** render temp faylda tugaydi; FFmpeg exit code, output mavjudligi va metadata tekshiriladi.
- **Resurs:** CPU-only rejim majburiy; GPU faqat aniqlangan va qo‘llab-quvvatlangan bo‘lsa ishlatiladi. Model tanlashdan oldin taxminiy RAM/disk hajmi ko‘rsatiladi.
- **Litsenziya:** har release uchun dependency, model, FFmpeg build va font litsenziyalari inventarizatsiya qilinadi. Codec va FFmpeg build konfiguratsiyasini tarqatishdan oldin huquqiy tekshiruvdan o‘tkazish.
- **Accessibility:** klaviatura bilan boshqarish, fokus ko‘rinishi, kontrast va screen reader nomlari.

## 8. Qabul mezonlari

1. Ilova uchta target OS buildida ochiladi va projekt oynasini ko‘rsatadi.
2. Foydalanuvchi local video tanlaydi; metadata o‘qiladi; asl video o‘zgarmaydi.
3. Model o‘rnatilganidan keyin internet uzilgan holda transkripsiya, klip taklifi va export ishlaydi.
4. Transkript segmentlari vaqt belgisiga ega; Uzbek va English tanlovi ishlaydi; xato til tanlovi qo‘lda tuzatiladi.
5. Kamida bitta candidate score, sabab va tahrir qilinadigan chegaralar bilan ko‘rsatiladi.
6. Tasdiqlangan klip 9:16 MP4 sifatida ochiladigan holatda eksport qilinadi; subtitr yoqib/o‘chirish va alohida SRT/VTT ishlaydi.
7. Ilova yopilib qayta ochilganda loyiha tarixi saqlanadi; bekor qilish yoki qayta urinish job holatini tushunarli ko‘rsatadi.
8. Network monitor sinovida video, audio va transkript tashqi hostga yuborilmaydi; default rejimda internet so‘rovi yo‘q.
9. Test fixture’lar huquqi aniq, kichik va takror ishlatiladigan bo‘ladi; haqiqiy videolarni test uchun internetdan avtomatik yuklab olish taqiqlanadi.
10. Release arxivida uchinchi tomon litsenziyalari, model manbalari va checksum ro‘yxati mavjud.

Transkripsiya aniqligi bo‘yicha raqamli threshold o‘zbekcha va inglizcha vakillik audio to‘plami tanlangach, baseline o‘lchovidan keyin belgilanadi. Asossiz aniqlik foizi qabul mezoniga yozilmaydi.

## 9. Sinov strategiyasi

- **Unit:** IPC schema, millisekund timestamp validatsiyasi, score normalization, overlap dedupe, til katalogi, subtitle wrap va filename sanitization.
- **Pipeline integration:** huquqi aniq 30–60 soniyali synthetic test media bilan FFprobe → transcription adapter → candidate JSON → FFmpeg export.
- **Offline:** model cache mavjud paytda outbound so‘rovlarni bloklab MVP jarayonini yakunlash.
- **Recovery:** job o‘rtasida worker’ni yopish, appni qayta ochish, xato stage-idan resume/cancel.
- **Cross-platform:** OS runnerlarda install, start, import, render va uninstall/build artifact smoke check.
- **Language quality:** alohida Uzbek, English va code-switch audio; WER/CER hamda foydalanuvchi tuzatgan so‘zlar sonini o‘lchash.
- **Performance:** test videolari va reference hardware qayd etiladi; CPU/RAM/disk sarfi hamda realtime’dan tez/sekin ishlash ko‘rsatiladi.

## 10. Bosqichlar

1. **Texnik spike:** Electron main ↔ Python worker NDJSON, FFmpeg discovery, Whisper modelni offline chaqirish va uch OS build feasibility.
2. **Foundation:** typed IPC, i18n katalogi, SQLite migration, app data path, project/job state.
3. **Ingest/transcribe:** local file import, FFprobe, model manager, Uzbek/English transcript editor.
4. **Clip suggestions:** schema, scorer, overlap dedupe, long-video chunking, sabab/ogohlantirish.
5. **Review/render:** preview, trim, crop, caption style, 9:16 MP4 va SRT/VTT.
6. **Reliability/release:** cancel/resume, offline audit, accessibility, installer, code signing, license inventory.
7. **Post-MVP:** face tracking, split layout, optional local LLM, Uzbek Cyrillic display, qo‘shimcha import manbalari.

Har bosqich kichik PR va ishga tushadigan holatda yakunlanadi; model yoki platforma bo‘yicha taxminlar spike’da tekshiriladi.

## 11. OpenAI Codex uchun promptlar

Promptlar inglizcha yozilgan: Codex uchun texnik topshiriq aniq bo‘lsin. Barcha promptlarda mahsulot interfeysi Uzbek va English tillarini qo‘llashi shart.

### Prompt 1 — arxitektura va skelet

~~~text
Read docs/UZCLIP_AI_SPEC.md first and inspect the entire existing repository before editing.
Build only the initial cross-platform desktop skeleton for UzClip AI using Electron,
React, and TypeScript, with a separate Python worker boundary documented by an ADR.
Use typed Electron IPC and a versioned NDJSON stdio protocol; do not expose a network
port. Add Uzbek and English UI locale files and a minimal project-home screen.
Do not add cloud APIs, telemetry, authentication, subscriptions, or video downloads.
Keep the source tree modular and include the repository's standard lint, typecheck,
and unit-test commands. Preserve existing files and report exact commands/results.
Do not begin media processing until the shell starts successfully on the host OS.
~~~

### Prompt 2 — storage va job orchestration

~~~text
Implement the local project store and restartable job state described in
docs/UZCLIP_AI_SPEC.md. Keep SQLite access behind one storage module. Add schema
migrations for Project, Job, TranscriptSegment, ClipCandidate, and Export. Define
versioned worker messages, progress, cancellation, recoverable errors, and safe
temporary paths. Never delete or move a user's source video. Add unit and integration
tests for persistence, validation, cancellation, and recovery. Do not add networking.
~~~

### Prompt 3 — import va local transkripsiya

~~~text
Implement local video import and the Transcriber interface from
docs/UZCLIP_AI_SPEC.md. Probe media with FFprobe and call subprocesses with argument
arrays, never shell strings. Add a Whisper backend that can run offline from a
user-selected local model; model download must be an explicit UI action with source,
license, expected size, and checksum verification. Support Uzbek and English language
selection plus auto-detect, preserve timestamped source text, and show progress and
cancellation. Do not send media or transcript to any external service. Add tests using
small licensed or generated fixtures only.
~~~

### Prompt 4 — klip tanlash va tahrirlash

~~~text
Implement transcript-based clip candidates using the scoring rubric and candidate
schema in docs/UZCLIP_AI_SPEC.md. Start with a deterministic local scorer; an optional
LLM adapter may connect only to a loopback host and must validate strict JSON output.
Chunk long transcripts with overlap, deduplicate overlapping candidates, and show
score, reason, warning, title, and editable boundaries. Do not describe a score as a
prediction or guarantee of virality. Keep the editor bilingual and preserve the
original transcript when any translation or transliteration is requested.
~~~

### Prompt 5 — render va reliz

~~~text
Implement reviewed clip rendering with FFmpeg, 9:16 output, center/manual crop,
subtitle burn-in, and SRT/VTT export. Write renders to a temporary file, validate the
exit status and output metadata, then atomically finalize. Keep the source video
unchanged. Add a local-only integration test with synthetic media and tests for
subtitle timing and Unicode Uzbek/English text. Then package and smoke-test Windows,
macOS, and Linux on native CI runners. Inventory licenses for FFmpeg, codecs, fonts,
models, and Python/Node dependencies; do not claim cross-platform support until the
corresponding build and smoke check pass.
~~~

## 12. Manba snapshotlari

README va LICENSE matnlari main branchning quyidagi HEAD commitlarida tekshirildi:

- Openclip: **80c3d8b** — [commit](https://github.com/aionixOS/Openclip/tree/80c3d8b0cd994fd996473f2495d93e0f1d9a0494)
- Clipper: **47e261e** — [commit](https://github.com/PriyeshPandey2000/ai-video-clipper/tree/47e261e2fcb120fa35212f239eebd531364b96b5)
- OpenShorts: **97ad88f** — [commit](https://github.com/mutonby/openshorts/tree/97ad88f396431ab4a96a967dc341ca992bcb9d41)
- AI-Youtube-Shorts-Generator: **3d11f2e** — [commit](https://github.com/Anil-matcha/AI-Youtube-Shorts-Generator/tree/3d11f2e6ecbbb9757d788e1bd05695c01f3e6c6c)
