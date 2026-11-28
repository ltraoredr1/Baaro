// Bibliothèque audio gratuite : Coran, Bible, chants (Internet Archive, CORS ouvert)
// + générateur de mélodies infinies (Web Audio, rendu local en WAV).

const IA = "https://archive.org";

export const AUDIO_COLLECTIONS = [
  { key: "coran-alafasy", group: "Coran", label: "Coran · Mishary Alafasy", ids: ["TvQuran.com__Alafasi"] },
  { key: "coran-maher", group: "Coran", label: "Coran · Maher Al-Muaiqly", ids: ["TvQuran.com__Maher"] },
  { key: "coran-ajmy", group: "Coran", label: "Coran · Ahmad Al-Ajmy", ids: ["TvQuran.com__Al-Ajmy"] },
  { key: "coran-mulla", group: "Coran", label: "Coran · Ammar Al-Mulla", ids: ["Ammar-Almulla"] },
  { key: "coran-sudais", group: "Coran", label: "Coran · Abdul-Rahman As-Sudais", ids: ["Abdul-Rahman-Al-Sudais-128Kbps"] },
  { key: "coran-basit", group: "Coran", label: "Coran · Abdul Basit (mujawwad)", ids: ["TvQuran.com__basit_mjwd"] },
  { key: "coran-shatri", group: "Coran", label: "Coran · Abu Bakr Al-Shatri", ids: ["TvQuran.com__Shatri"] },
  { key: "coran-abbad", group: "Coran", label: "Coran · Fares Abbad", ids: ["TvQuran.com__Fares.Abbad"] },
  { key: "coran-huthaifi", group: "Coran", label: "Coran · Ali Al-Huthaifi", ids: ["TvQuran.com__Ali-Alhuthaifi"] },
  { key: "coran-shuraim", group: "Coran", label: "Coran · Saud Al-Shuraim", ids: ["TvQuran.com__Al-Shuraimm"] },
  { key: "bible-lsg", group: "Bible", label: "Bible · Louis Segond (FR)", ids: ["LSG_201807"] },
  { key: "bible-jean", group: "Bible", label: "Évangile de Jean (FR)", ids: ["jean_lsg_librivox"] },
  { key: "bible-kjv", group: "Bible", label: "Bible · KJV (EN)", ids: ["bible_kjv_01_02_03_0908_librivox"] },
  { key: "bible-web", group: "Bible", label: "Nouveau Testament (EN)", ids: ["web_new_testament_0811_librivox1"] },
];

export const AUDIO_SEARCHES = [
  ["Coran", "quran recitation"],
  ["Nasheed", "nasheed"],
  ["Bible FR", "bible louis segond"],
  ["Bible EN", "bible librivox"],
  ["Gospel", "gospel hymns"],
  ["Chants", "hymns choir"],
  ["Afrique", "african traditional music"],
  ["Kora", "kora"],
  ["Méditation", "meditation music"],
];

const metaCache = new Map();

async function loadItem(id) {
  if (metaCache.has(id)) return metaCache.get(id);
  const promise = fetch(`${IA}/metadata/${encodeURIComponent(id)}`)
    .then((r) => { if (!r.ok) throw new Error("meta"); return r.json(); })
    .then((data) => {
      const m = data?.metadata || {};
      const files = (data?.files || [])
        .filter((f) => /\.mp3$/i.test(f.name) && !/_sample|_spectrogram/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const artist = [].concat(m.creator || m.title || "Internet Archive")[0];
      const license = m.licenseurl ? licenseLabel(m.licenseurl) : "Domaine public / Archive";
      // Une seule version par piste (64 kb de préférence), titre le plus propre.
      const byBase = new Map();
      for (const f of files) {
        const base = f.name.replace(/_(64|128|32|48|96)kb(?=\.mp3$)/i, "");
        const prev = byBase.get(base);
        const title = cleanTitle(f.title);
        if (!prev) { byBase.set(base, { ...f, title }); continue; }
        const better = /_64kb\.mp3$/i.test(f.name) ? f : prev;
        const bestTitle = [prev.title, title].filter(Boolean).sort((a, b) => a.length - b.length)[0];
        byBase.set(base, { ...better, title: bestTitle });
      }
      return [...byBase.values()].map((f) => ({
        id: `ia-${id}-${f.name}`,
        title: f.title || f.name.replace(/\.mp3$/i, "").replace(/[_/]/g, " "),
        artist: String(artist).slice(0, 80),
        number: Number((f.name.match(/(\d+)\.mp3$/i) || [])[1]) || null,
        audio_url: `${IA}/download/${encodeURIComponent(id)}/${f.name.split("/").map(encodeURIComponent).join("/")}`,
        duration: Number(f.length) || null,
        license,
        source_url: `${IA}/details/${encodeURIComponent(id)}`,
      }));
    });
  metaCache.set(id, promise);
  promise.catch(() => metaCache.delete(id));
  return promise;
}

// Répare les titres mal encodés (ex. « ÃÂÃÂvangile » → « Évangile »).
function cleanTitle(t) {
  const v = String(t || "").replace(/(?:[ÃÂ][\u0080-\u00ff])+(?=vangile)/g, "É").replace(/(?:[ÃÂ][\u0080-\u00ff])+/g, "").trim();
  return v.length > 120 ? v.slice(0, 120) : v;
}

// Plage de chapitres d'un titre biblique : « Genèse 3 », « Genesis 1-6 », « Matthew, Chapters 01-07 ».
function chapterRange(title) {
  const t = String(title || "");
  const range = t.match(/(\d+)\s*[-–à]\s*(\d+)\s*$/);
  if (range) return { from: Number(range[1]), to: Number(range[2]), book: t.slice(0, range.index) };
  const one = t.match(/(\d+)\s*$/);
  if (one && one.index > 0) return { from: Number(one[1]), to: Number(one[1]), book: t.slice(0, one.index) };
  return { from: 1, to: 1, book: t };
}

// Filtre Bible : « 23 » (chapitre 23 de tous les livres), « Psaumes 23 », « 1 Jean 3 », « Jean ».
function bibleMatch(track, filter) {
  const f = String(filter || "").trim();
  const m = f.match(/^(.*?)\s*(\d+)$/);
  if (!m || (m[1] && !/\p{L}/u.test(m[1]))) return matchText(track.title, f);
  const chapter = Number(m[2]);
  const { from, to, book } = chapterRange(track.title.replace(/^\d+[a-z]?\s*-\s*/i, ""));
  return chapter >= from && chapter <= to
    && (!m[1] || (matchText(book, m[1]) && (/^\d/.test(m[1].trim()) || !/^\d/.test(book.trim()))));
}

function licenseLabel(url) {
  const m = String(url).match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  if (/publicdomain/i.test(url)) return "Domaine public";
  return "Licence à consulter";
}

const norm = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
export const matchText = (text, filter) => !norm(filter) || norm(text).includes(norm(filter));

// Pistes d'une collection, page par page (pagination infinie), filtre optionnel sur le titre.
export async function loadCollection(collection, page = 0, size = 15, filter = "") {
  const lists = await Promise.all(collection.ids.map(loadItem));
  const all = lists.flat().filter((t) => {
    if (!filter.trim()) return true;
    if (collection.group === "Bible") return bibleMatch(t, filter);
    return /^\d+$/.test(filter.trim()) ? t.number === Number(filter) : matchText(t.title, filter);
  });
  return { items: all.slice(page * size, (page + 1) * size), hasMore: all.length > (page + 1) * size };
}

// Recherche de récitateurs du Coran par nom (Internet Archive), paginée.
export async function searchReciters(name, page = 0) {
  const n = String(name).trim().replace(/[^\p{L}\p{N} .-]/gu, " ").trim();
  if (!n) return { items: [], hasMore: false };
  const words = n.split(/\s+/).map((w) => `${w}*`).join(" AND ");
  const params = new URLSearchParams({
    q: `mediatype:audio AND (identifier:tvquran* OR subject:quran OR subject:coran OR title:quran OR title:coran OR title:قرآن) AND (title:(${words}) OR creator:(${words}) OR identifier:*${n.split(/\s+/)[0]}*)`,
    "fl[]": "identifier",
    rows: "12",
    page: String(page + 1),
    "sort[]": "downloads desc",
    output: "json",
  });
  params.append("fl[]", "title");
  const r = await fetch(`${IA}/advancedsearch.php?${params}`);
  if (!r.ok) throw new Error("reciters");
  const data = await r.json();
  const items = (data?.response?.docs || [])
    .filter((d) => !/zip$/i.test(d.identifier))
    .map((d) => ({
      key: `ia-${d.identifier}`,
      group: "Coran",
      label: String([].concat(d.title || d.identifier)[0]).replace(/^tvquran\.com\s*_*/i, "").replace(/[_-]{2,}/g, " ").slice(0, 60),
      ids: [d.identifier],
    }));
  return { items, hasMore: (page + 1) * 12 < (data?.response?.numFound || 0) };
}

// Recherche libre dans les audios Internet Archive (pagination infinie).
export async function searchArchive(query, page = 0) {
  const params = new URLSearchParams({
    q: `(${query}) AND mediatype:audio`,
    "fl[]": "identifier",
    rows: "4",
    page: String(page + 1),
    "sort[]": "downloads desc",
    output: "json",
  });
  const r = await fetch(`${IA}/advancedsearch.php?${params}`);
  if (!r.ok) throw new Error("search");
  const data = await r.json();
  const docs = data?.response?.docs || [];
  const lists = await Promise.all(docs.map((d) => loadItem(d.identifier).catch(() => [])));
  const items = lists.flatMap((l) => l.filter((t) => !t.duration || t.duration < 1800).slice(0, 6));
  return { items, hasMore: (page + 1) * 4 < (data?.response?.numFound || 0) };
}

// ---------- Mélodies infinies ----------

export const MELODY_MOODS = [
  { key: "calme", label: "Calme", bpm: 70, scale: [0, 2, 4, 7, 9], wave: "sine", root: 57 },
  { key: "piano", label: "Piano", bpm: 80, scale: [0, 2, 3, 5, 7, 8, 10], wave: "triangle", root: 60 },
  { key: "kora", label: "Kora", bpm: 96, scale: [0, 2, 4, 5, 7, 9, 11], wave: "pluck", root: 62 },
  { key: "afro", label: "Afro", bpm: 108, scale: [0, 3, 5, 7, 10], wave: "pluck", root: 55, drums: true },
  { key: "spirituel", label: "Spirituel", bpm: 60, scale: [0, 1, 4, 5, 7, 8, 11], wave: "sine", root: 57, pad: true },
  { key: "emotion", label: "Émotion", bpm: 72, scale: [0, 2, 3, 5, 7, 8, 10], wave: "triangle", root: 57, pad: true },
  { key: "joie", label: "Joie", bpm: 120, scale: [0, 2, 4, 7, 9], wave: "square", root: 64, drums: true },
  { key: "lofi", label: "Lo-fi", bpm: 84, scale: [0, 3, 5, 7, 10], wave: "triangle", root: 52, drums: true, pad: true },
];

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function note(ctx, out, { t, f, d, wave, vol }) {
  const g = ctx.createGain();
  const o = ctx.createOscillator();
  o.type = wave === "pluck" ? "triangle" : wave;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (wave === "pluck" ? 0.005 : 0.03));
  g.gain.exponentialRampToValueAtTime(0.0001, t + (wave === "pluck" ? Math.min(d, 0.9) : d));
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + d + 0.05);
}

function drum(ctx, out, t, kind) {
  const g = ctx.createGain();
  if (kind === "kick") {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(out); o.start(t); o.stop(t + 0.22);
  } else {
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    g.gain.value = kind === "hat" ? 0.12 : 0.3;
    s.connect(g).connect(out); s.start(t);
  }
}

function toWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, n = buffer.length;
  const view = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); view.setUint32(4, 36 + n * ch * 2, true); w(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, ch, true);
  view.setUint32(24, sr, true); view.setUint32(28, sr * ch * 2, true);
  view.setUint16(32, ch * 2, true); view.setUint16(34, 16, true); w(36, "data");
  view.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, data[c][i]));
    view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

// Génère une mélodie unique (seed) et renvoie un son prêt pour le créateur.
export async function generateMelody(moodKey = "calme", seed = Date.now(), seconds = 30) {
  const mood = MELODY_MOODS.find((m) => m.key === moodKey) || MELODY_MOODS[0];
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OAC) throw new Error("Web Audio indisponible");
  const sr = 22050;
  const ctx = new OAC(2, sr * seconds, sr);
  const rand = rng(seed);
  const master = ctx.createGain();
  master.gain.value = 0.5;
  const delay = ctx.createDelay(); delay.delayTime.value = 60 / mood.bpm * 0.75;
  const fb = ctx.createGain(); fb.gain.value = 0.3;
  delay.connect(fb).connect(delay); delay.connect(master);
  master.connect(ctx.destination);
  const bus = ctx.createGain(); bus.connect(master); bus.connect(delay);

  const beat = 60 / mood.bpm;
  const sc = mood.scale;
  const progression = [0, 3, 4, 0, 5, 3, 4, 4].map((i) => sc[i % sc.length]);
  const motif = Array.from({ length: 8 }, () => Math.floor(rand() * sc.length));
  let step = 0, deg = motif[0];
  for (let t = 0; t < seconds - 1; t += beat / 2, step++) {
    const bar = Math.floor(step / 8);
    const chord = progression[bar % progression.length];
    if (step % 8 === 0) {
      note(ctx, bus, { t, f: hz(mood.root - 12 + chord), d: beat * 4, wave: "sine", vol: 0.25 });
      if (mood.pad) [0, 4, 7].forEach((iv) =>
        note(ctx, bus, { t, f: hz(mood.root + chord + iv), d: beat * 4, wave: "sine", vol: 0.05 }));
    }
    if (rand() < 0.72) {
      deg = bar % 2 === 0 ? motif[step % 8] : Math.max(0, Math.min(sc.length * 2 - 1, deg + Math.round(rand() * 4 - 2)));
      const midi = mood.root + sc[deg % sc.length] + 12 * Math.floor(deg / sc.length);
      note(ctx, bus, { t, f: hz(midi), d: beat * (rand() < 0.3 ? 1 : 0.5), wave: mood.wave, vol: 0.18 });
    }
    if (mood.drums) {
      if (step % 4 === 0) drum(ctx, master, t, "kick");
      if (step % 4 === 2) drum(ctx, master, t, "snare");
      drum(ctx, master, t, "hat");
    }
  }
  master.gain.setValueAtTime(0.5, seconds - 2);
  master.gain.linearRampToValueAtTime(0, seconds);

  const rendered = await ctx.startRendering();
  const blob = toWav(rendered);
  const name = `Mélodie ${mood.label} #${String(seed).slice(-5)}`;
  const file = new File([blob], `${name}.wav`, { type: "audio/wav" });
  return {
    id: `melody-${mood.key}-${seed}`,
    title: name,
    artist: "BAARO · mélodie générée (libre de droits)",
    audio_url: URL.createObjectURL(file),
    file,
    license: "Libre de droits",
  };
}
