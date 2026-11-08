/* =========================================================
   script.js : logika aplikasi Pustaka Kampus
   Bagian:
   1. Utilitas        2. Penyimpanan & data   3. Sesi
   4. UI umum (modal, alert, toast)           5. Validasi form
   6. Halaman: login, dashboard, stok, checkout, tracking, laporan, riwayat
   7. Inisialisasi (memilih fungsi sesuai atribut data-halaman pada <body>)
   Data sumber ada di js/data.js (dataPengguna, dataKatalogBuku, dataTracking).
   ========================================================= */
'use strict';

/* ---------- 1. Utilitas ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Membuat elemen lewat DOM: el('td', {class:'x', text:'isi'}, anak1, anak2)
function el(tag, props = {}, ...anak) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  anak.flat().forEach(a => { if (a !== null && a !== undefined && a !== false) e.append(a); });
  return e;
}

const rupiah = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const angkaDariRupiah = s => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
const inisial = teks => teks.split(/\s+/).slice(0, 2).map(k => k[0]).join('').toUpperCase();
const pad = n => String(n).padStart(2, '0');

function tanggalLokal(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function waktuLokal(d = new Date()) {
  return `${tanggalLokal(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function formatTanggal(str) {
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
function formatWaktu(str) {
  const [t, j] = str.split(' ');
  return j ? `${formatTanggal(t)}, ${j.slice(0, 5)}` : formatTanggal(t);
}

/* ---------- 2. Penyimpanan & data ---------- */
const KUNCI = {
  sesi: 'pk_sesi',            // sessionStorage: pengguna yang sedang login
  pengguna: 'pk_pengguna',    // pengguna hasil pendaftaran
  katalog: 'pk_katalog',      // buku tambahan dari halaman Stok
  terjual: 'pk_terjual',      // {kodeBarang: jumlah} pengurang stok
  keranjang: 'pk_keranjang',  // [{kode, qty}]
  pesanan: 'pk_pesanan'       // pesanan baru dari checkout
};
function baca(kunci, awal) {
  try {
    const v = localStorage.getItem(kunci);
    return v ? JSON.parse(v) : awal;
  } catch (e) { return awal; }
}
function simpan(kunci, nilai) { localStorage.setItem(kunci, JSON.stringify(nilai)); }

function semuaPengguna() { return dataPengguna.concat(baca(KUNCI.pengguna, [])); }

// Katalog = data.js + buku tambahan, stok sudah dikurangi pesanan
function semuaKatalog() {
  const terjual = baca(KUNCI.terjual, {});
  return dataKatalogBuku.concat(baca(KUNCI.katalog, [])).map(b => ({
    ...b,
    stok: Math.max(0, Number(b.stok) - (terjual[b.kodeBarang] || 0)),
    hargaAngka: angkaDariRupiah(b.harga)
  }));
}
const cariBuku = kode => semuaKatalog().find(b => b.kodeBarang === kode);

/* Keranjang */
const ambilKeranjang = () => baca(KUNCI.keranjang, []);
function tambahKeKeranjang(kode, qty = 1) {
  const buku = cariBuku(kode);
  if (!buku) return { ok: false, pesan: 'Buku tidak ditemukan.' };
  const k = ambilKeranjang();
  const baris = k.find(x => x.kode === kode);
  const baru = (baris ? baris.qty : 0) + qty;
  if (baru > buku.stok) return { ok: false, pesan: `Stok "${buku.namaBarang}" hanya ${buku.stok}.` };
  if (baris) baris.qty = baru; else k.push({ kode, qty });
  simpan(KUNCI.keranjang, k);
  perbaruiBadge();
  return { ok: true };
}
function perbaruiBadge() {
  const b = $('#badgeKeranjang');
  if (!b) return;
  const total = ambilKeranjang().reduce((j, x) => j + x.qty, 0);
  b.textContent = total;
  b.hidden = total === 0;
}

/* Pelacakan: status dihitung dari data perjalanan */
const TAHAP = ['Diproses', 'Dikirim', 'Dalam Perjalanan', 'Diterima'];
function indeksTahap(d) {
  const akhir = d.perjalanan[d.perjalanan.length - 1];
  if (akhir && /^selesai/i.test(akhir.keterangan)) return 3;
  const i = TAHAP.indexOf(d.status);
  return i < 0 ? 0 : i;
}
const statusTampil = d => TAHAP[indeksTahap(d)];
function kelasStatus(status) {
  return { 'Diproses': 'badge-proses', 'Dikirim': 'badge-kirim', 'Dalam Perjalanan': 'badge-jalan', 'Diterima': 'badge-selesai' }[status] || 'badge-proses';
}
function cariTracking(no) {
  if (dataTracking[no]) return dataTracking[no];
  const p = baca(KUNCI.pesanan, []).find(x => x.nomorDO === no);
  if (!p) return null;
  return { nomorDO: p.nomorDO, nama: p.nama, status: p.status, ekspedisi: p.ekspedisi, tanggalKirim: p.tanggal,
           paket: p.paket, total: rupiah(p.total), perjalanan: p.perjalanan };
}

/* Pesanan: contoh dari dataTracking + pesanan baru */
const ITEM_CONTOH = { '20230012': [['ASIP4301', 1]], '20230013': [['EKMA4002', 1]] };
function pesananContoh() {
  return Object.values(dataTracking).map(t => {
    const items = (ITEM_CONTOH[t.nomorDO] || []).map(([kode, qty]) => {
      const b = dataKatalogBuku.find(x => x.kodeBarang === kode);
      return { kode, nama: b.namaBarang, harga: angkaDariRupiah(b.harga), qty };
    });
    const total = angkaDariRupiah(t.total);
    return { nomorDO: t.nomorDO, nama: t.nama, ekspedisi: t.ekspedisi, pembayaran: 'Transfer Bank',
             tanggal: t.tanggalKirim, waktu: t.perjalanan[0].waktu, items, subtotal: total, ongkir: 0,
             total, status: statusTampil(t), contoh: true };
  });
}
function semuaPesanan() {
  return pesananContoh().concat(baca(KUNCI.pesanan, [])).sort((a, b) => b.waktu.localeCompare(a.waktu));
}

/* ---------- 3. Sesi ---------- */
function penggunaAktif() {
  try { return JSON.parse(sessionStorage.getItem(KUNCI.sesi)); } catch (e) { return null; }
}
function keluar() {
  sessionStorage.removeItem(KUNCI.sesi);
  location.href = 'index.html';
}

/* ---------- 4. UI umum ---------- */
function bukaDialog(dlg) {
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
}
// Klik di area gelap (backdrop) menutup dialog
function tutupSaatKlikLuar(dlg) {
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
}
function buatDialog(kelas, ...isi) {
  const dlg = el('dialog', { class: 'modal ' + kelas }, el('div', { class: 'modal-isi' }, ...isi));
  document.body.append(dlg);
  tutupSaatKlikLuar(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  return dlg;
}
// Alert berbentuk pop-up: tipe = 'info' | 'ok' | 'galat'
function tampilAlert(judul, pesan, tipe = 'info') {
  const dlg = buatDialog('modal-kecil modal-' + tipe,
    el('h2', { text: judul }),
    el('p', { text: pesan }),
    el('div', { class: 'modal-aksi' }, el('button', { type: 'button', class: 'btn btn-primer', text: 'Mengerti', onclick: () => dlg.close() }))
  );
  bukaDialog(dlg);
}
function tampilKonfirmasi(judul, pesan, labelYa = 'Ya, lanjutkan') {
  return new Promise(selesai => {
    let ya = false;
    const dlg = buatDialog('modal-kecil modal-info',
      el('h2', { text: judul }),
      el('p', { text: pesan }),
      el('div', { class: 'modal-aksi' },
        el('button', { type: 'button', class: 'btn btn-garis', text: 'Batal', onclick: () => dlg.close() }),
        el('button', { type: 'button', class: 'btn btn-primer', text: labelYa, onclick: () => { ya = true; dlg.close(); } }))
    );
    dlg.addEventListener('close', () => selesai(ya));
    bukaDialog(dlg);
  });
}
function toast(pesan, tipe = 'ok') {
  let wadah = $('#toastWadah');
  if (!wadah) {
    wadah = el('div', { id: 'toastWadah', class: 'toast-wadah', 'aria-live': 'polite' });
    document.body.append(wadah);
  }
  const t = el('div', { class: 'toast toast-' + tipe, text: pesan });
  wadah.append(t);
  setTimeout(() => t.remove(), 3200);
}

/* ---------- 5. Validasi form ---------- */
const validEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
function setError(input, pesan) {
  const f = input.closest('.field');
  f.classList.add('invalid');
  f.querySelector('.pesan-error').textContent = pesan;
  input.setAttribute('aria-invalid', 'true');
}
function bersihError(form) {
  $$('.field.invalid', form).forEach(f => { f.classList.remove('invalid'); f.querySelector('.pesan-error').textContent = ''; });
  $$('[aria-invalid]', form).forEach(i => i.removeAttribute('aria-invalid'));
}
// Fokus ke kolom error pertama agar pengguna langsung tahu apa yang harus diperbaiki
function fokusError(form) {
  const pertama = $('.field.invalid input, .field.invalid select, .field.invalid textarea', form);
  if (pertama) pertama.focus();
}

/* ---------- 6a. Halaman Login ---------- */
function initLogin() {
  const form = $('#formLogin');
  form.addEventListener('submit', e => {
    e.preventDefault();
    bersihError(form);
    const email = form.elements.email.value.trim().toLowerCase();
    const sandi = form.elements.password.value;
    let ok = true;
    if (!email) { setError(form.elements.email, 'Email wajib diisi.'); ok = false; }
    else if (!validEmail(email)) { setError(form.elements.email, 'Format email belum benar, contoh: nama@gmail.com.'); ok = false; }
    if (!sandi) { setError(form.elements.password, 'Password wajib diisi.'); ok = false; }
    if (!ok) { fokusError(form); return; }

    const user = semuaPengguna().find(u => u.email.toLowerCase() === email && u.password === sandi);
    if (!user) {
      alert('Email/password yang Anda masukkan salah.');
      setError(form.elements.password, 'Email atau password tidak cocok.');
      form.elements.password.value = '';
      form.elements.password.focus();
      return;
    }
    sessionStorage.setItem(KUNCI.sesi, JSON.stringify({ id: user.id, nama: user.nama, email: user.email, role: user.role }));
    location.href = 'dashboard.html';
  });

  $('#lihatPassword').addEventListener('change', e => {
    form.elements.password.type = e.target.checked ? 'text' : 'password';
  });

  /* Modal Lupa Password */
  const dlgLupa = $('#dlgLupa'), formLupa = $('#formLupa');
  $('#btnLupa').addEventListener('click', () => {
    formLupa.reset(); bersihError(formLupa); $('#hasilLupa').hidden = true;
    bukaDialog(dlgLupa); formLupa.elements.email.focus();
  });
  formLupa.addEventListener('submit', e => {
    e.preventDefault();
    bersihError(formLupa);
    const email = formLupa.elements.email.value.trim().toLowerCase();
    if (!validEmail(email)) { setError(formLupa.elements.email, 'Masukkan email yang valid.'); return; }
    const user = semuaPengguna().find(u => u.email.toLowerCase() === email);
    if (!user) { setError(formLupa.elements.email, 'Email ini belum terdaftar.'); return; }
    const hasil = $('#hasilLupa');
    hasil.textContent = `Tautan reset password sudah dikirim ke ${user.email} (simulasi).`;
    hasil.hidden = false;
  });

  /* Modal Daftar */
  const dlgDaftar = $('#dlgDaftar'), formDaftar = $('#formDaftar');
  $('#btnDaftar').addEventListener('click', () => {
    formDaftar.reset(); bersihError(formDaftar);
    bukaDialog(dlgDaftar); formDaftar.elements.nama.focus();
  });
  formDaftar.addEventListener('submit', e => {
    e.preventDefault();
    bersihError(formDaftar);
    const f = formDaftar.elements;
    const nama = f.nama.value.trim(), email = f.email.value.trim().toLowerCase();
    const sandi = f.password.value, ulang = f.konfirmasi.value;
    let ok = true;
    if (nama.length < 3) { setError(f.nama, 'Nama minimal 3 karakter.'); ok = false; }
    if (!validEmail(email)) { setError(f.email, 'Format email belum benar.'); ok = false; }
    else if (semuaPengguna().some(u => u.email.toLowerCase() === email)) { setError(f.email, 'Email ini sudah terdaftar.'); ok = false; }
    if (sandi.length < 6 || !/[A-Za-z]/.test(sandi) || !/\d/.test(sandi)) { setError(f.password, 'Minimal 6 karakter dan berisi huruf serta angka.'); ok = false; }
    if (ulang !== sandi) { setError(f.konfirmasi, 'Konfirmasi password tidak sama.'); ok = false; }
    if (!ok) { fokusError(formDaftar); return; }

    const baru = baca(KUNCI.pengguna, []);
    baru.push({ id: semuaPengguna().length + 1, nama, email, password: sandi, role: 'User' });
    simpan(KUNCI.pengguna, baru);
    dlgDaftar.close();
    form.elements.email.value = email;
    form.elements.password.value = '';
    tampilAlert('Pendaftaran berhasil', 'Akun sudah dibuat. Silakan masukkan password untuk login.', 'ok');
  });

  // Tombol tutup & batal pada semua modal
  $$('[data-tutup]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  $$('dialog.modal').forEach(tutupSaatKlikLuar);
}

/* ---------- Header (semua halaman setelah login) ---------- */
function initHeader() {
  const user = penggunaAktif();
  const nama = $('#namaPengguna');
  if (nama && user) {
    nama.textContent = user.nama;
    if (user.role === 'Admin') nama.after(el('span', { class: 'badge badge-admin', text: 'Admin' }));
  }
  const btn = $('#btnLogout');
  if (btn) btn.addEventListener('click', async () => {
    if (await tampilKonfirmasi('Keluar dari akun?', 'Sesi Anda akan diakhiri.', 'Keluar')) keluar();
  });
  perbaruiBadge();
}

/* ---------- 6b. Dashboard ---------- */
function salam(jam) {
  if (jam >= 4 && jam < 11) return 'Selamat pagi';
  if (jam >= 11 && jam < 15) return 'Selamat siang';
  if (jam >= 15 && jam < 18) return 'Selamat sore';
  return 'Selamat malam';
}
function initDashboard() {
  const user = penggunaAktif();
  const sapa = $('#salam'), jam = $('#jam'), tgl = $('#tanggal');
  function tick() {
    const now = new Date();
    sapa.textContent = `${salam(now.getHours())}, ${user.nama.split(' ')[0]}`;
    jam.textContent = `${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
    tgl.textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  tick();
  setInterval(tick, 1000);

  const katalog = semuaKatalog(), pesanan = semuaPesanan();
  $('#statJudul').textContent = katalog.length;
  $('#statStok').textContent = katalog.reduce((j, b) => j + b.stok, 0).toLocaleString('id-ID');
  $('#statPesanan').textContent = pesanan.length;
  $('#statOmzet').textContent = rupiah(pesanan.reduce((j, p) => j + p.total, 0));
}

/* ---------- 6c. Stok / Katalog ---------- */
function statusStok(stok) {
  if (stok === 0) return ['Habis', 'badge-habis'];
  if (stok < 100) return ['Menipis', 'badge-tipis'];
  return ['Tersedia', 'badge-aman'];
}
function buatBarisBuku(b) {
  const [labelStok, kelasStok] = statusStok(b.stok);
  const sampul = b.cover
    ? el('img', { class: 'cover-kecil', src: b.cover, alt: 'Sampul ' + b.namaBarang, width: 44, height: 64, loading: 'lazy' })
    : el('span', { class: 'cover-ph', 'aria-hidden': 'true', text: inisial(b.namaBarang) });
  if (b.cover) sampul.addEventListener('error', () => sampul.replaceWith(el('span', { class: 'cover-ph', 'aria-hidden': 'true', text: inisial(b.namaBarang) })));

  const aksi = el('td', { class: 'aksi' },
    el('button', { type: 'button', class: 'btn btn-primer btn-kecil', text: 'Pesan', 'data-aksi': 'pesan', 'data-kode': b.kodeBarang, disabled: b.stok === 0 ? '' : null }),
    b.tambahan ? el('button', { type: 'button', class: 'btn btn-bahaya btn-kecil', text: 'Hapus', 'data-aksi': 'hapus', 'data-kode': b.kodeBarang }) : null
  );
  const tr = el('tr', { 'data-kode': b.kodeBarang },
    el('td', {}, sampul),
    el('td', { text: b.kodeBarang }),
    el('td', {}, b.namaBarang, el('small', { text: b.jenisBarang + ', edisi ' + b.edisi })),
    el('td', { class: 'angka', text: b.stok.toLocaleString('id-ID') }),
    el('td', {}, el('span', { class: 'badge ' + kelasStok, text: labelStok })),
    el('td', { class: 'angka', text: b.harga }),
    aksi
  );
  tr.dataset.cari = `${b.kodeBarang} ${b.namaBarang} ${b.jenisBarang}`.toLowerCase();
  return tr;
}
function initStok() {
  const isi = $('#isiKatalog'), form = $('#formStok'), cari = $('#cariBuku'), ringkas = $('#ringkasStok');

  function gambarUlang() {
    isi.replaceChildren();
    const data = semuaKatalog();
    data.forEach(b => isi.append(buatBarisBuku(b)));
    perbaruiRingkas();
    terapkanCari();
  }
  function perbaruiRingkas() {
    const data = semuaKatalog();
    ringkas.textContent = `${data.length} judul, total stok ${data.reduce((j, b) => j + b.stok, 0).toLocaleString('id-ID')} eksemplar`;
  }
  function terapkanCari() {
    const kata = cari.value.trim().toLowerCase();
    let tampil = 0;
    $$('tr[data-kode]', isi).forEach(tr => {
      const cocok = !kata || tr.dataset.cari.includes(kata);
      tr.hidden = !cocok;
      if (cocok) tampil++;
    });
    $('#barisKosong').hidden = tampil > 0;
  }
  cari.addEventListener('input', terapkanCari);

  // Pesan / hapus lewat event delegation pada tbody
  isi.addEventListener('click', async e => {
    const btn = e.target.closest('button[data-aksi]');
    if (!btn) return;
    const kode = btn.dataset.kode;
    if (btn.dataset.aksi === 'pesan') {
      const hasil = tambahKeKeranjang(kode, 1);
      if (hasil.ok) toast(`"${cariBuku(kode).namaBarang}" masuk ke pemesanan.`);
      else tampilAlert('Stok tidak cukup', hasil.pesan, 'galat');
    } else {
      const buku = cariBuku(kode);
      if (!(await tampilKonfirmasi('Hapus baris stok?', `"${buku.namaBarang}" akan dihapus dari katalog.`, 'Hapus'))) return;
      simpan(KUNCI.katalog, baca(KUNCI.katalog, []).filter(x => x.kodeBarang !== kode));
      simpan(KUNCI.keranjang, ambilKeranjang().filter(x => x.kode !== kode));
      perbaruiBadge();
      btn.closest('tr').remove();
      perbaruiRingkas();
      terapkanCari();
      toast('Baris stok dihapus.');
    }
  });

  // Tambah baris stok baru: validasi, simpan, lalu tambahkan <tr> lewat DOM
  form.addEventListener('submit', e => {
    e.preventDefault();
    bersihError(form);
    const f = form.elements;
    const kode = f.kode.value.trim().toUpperCase(), nama = f.nama.value.trim();
    const edisi = Number(f.edisi.value), stok = Number(f.stok.value), harga = Number(f.harga.value);
    const cover = f.cover.value.trim();
    let ok = true;
    if (!/^[A-Z]{4}\d{4}$/.test(kode)) { setError(f.kode, 'Kode terdiri dari 4 huruf dan 4 angka, contoh: EKMA4115.'); ok = false; }
    else if (semuaKatalog().some(b => b.kodeBarang === kode)) { setError(f.kode, 'Kode ini sudah dipakai buku lain.'); ok = false; }
    if (nama.length < 3) { setError(f.nama, 'Nama buku minimal 3 karakter.'); ok = false; }
    if (!f.jenis.value) { setError(f.jenis, 'Pilih jenis buku.'); ok = false; }
    if (!Number.isInteger(edisi) || edisi < 1 || edisi > 20) { setError(f.edisi, 'Edisi berupa bilangan bulat 1 sampai 20.'); ok = false; }
    if (f.stok.value === '' || !Number.isInteger(stok) || stok < 0) { setError(f.stok, 'Stok berupa bilangan bulat, minimal 0.'); ok = false; }
    if (!Number.isInteger(harga) || harga < 1000) { setError(f.harga, 'Harga minimal Rp 1.000, tanpa titik atau koma.'); ok = false; }
    if (cover && !/^[\w\-./]+\.(jpe?g|png|webp)$/i.test(cover)) { setError(f.cover, 'Gunakan nama berkas gambar, contoh: img/buku_baru.jpg.'); ok = false; }
    if (!ok) { fokusError(form); return; }

    const buku = { kodeBarang: kode, namaBarang: nama, jenisBarang: f.jenis.value, edisi: String(edisi), stok, harga: rupiah(harga), cover: cover || '', tambahan: true };
    const tersimpan = baca(KUNCI.katalog, []);
    tersimpan.push(buku);
    simpan(KUNCI.katalog, tersimpan);

    const tr = buatBarisBuku({ ...buku, stok });
    tr.classList.add('baris-baru');
    isi.append(tr);
    perbaruiRingkas();
    cari.value = '';
    terapkanCari();
    form.reset();
    f.kode.focus();
    toast(`"${nama}" ditambahkan ke katalog.`);
  });

  gambarUlang();
}

/* ---------- 6d. Checkout / Pemesanan ---------- */
const ONGKIR = { 'JNE': 15000, 'Pos Indonesia': 12000, 'J&T Express': 14000, 'SiCepat': 13000 };

function initCheckout() {
  const user = penggunaAktif();
  const form = $('#formPesan'), isi = $('#isiKeranjang'), pilih = $('#pilihBuku'), formTambah = $('#formTambah');
  form.elements.nama.value = user.nama;
  form.elements.email.value = user.email;

  function hitung() {
    const subtotal = ambilKeranjang().reduce((j, x) => { const b = cariBuku(x.kode); return j + (b ? b.hargaAngka * x.qty : 0); }, 0);
    const ongkir = subtotal > 0 ? (ONGKIR[form.elements.ekspedisi.value] || 0) : 0;
    return { subtotal, ongkir, total: subtotal + ongkir };
  }
  function renderRingkasan() {
    const h = hitung();
    $('#rSubtotal').textContent = rupiah(h.subtotal);
    $('#rOngkir').textContent = h.ongkir ? rupiah(h.ongkir) : '-';
    $('#rTotal').textContent = rupiah(h.total);
  }
  function renderKeranjang() {
    // buang item yang bukunya sudah tidak ada
    const k = ambilKeranjang().filter(x => cariBuku(x.kode));
    simpan(KUNCI.keranjang, k);
    isi.replaceChildren();
    if (k.length === 0) {
      isi.append(el('tr', {}, el('td', { class: 'kosong', colspan: 5 }, 'Belum ada buku. Pilih dari form di bawah atau dari halaman ',
        el('a', { href: 'stok.html', text: 'Stok' }), '.')));
    }
    k.forEach(x => {
      const b = cariBuku(x.kode);
      const input = el('input', { type: 'number', min: 1, max: b.stok, value: x.qty, 'aria-label': 'Jumlah ' + b.namaBarang });
      const ubah = jumlah => {
        let j = Math.round(Number(jumlah));
        if (!j || j < 1) j = 1;
        if (j > b.stok) { j = b.stok; toast(`Stok "${b.namaBarang}" hanya ${b.stok}.`, 'galat'); }
        const daftar = ambilKeranjang();
        daftar.find(r => r.kode === x.kode).qty = j;
        simpan(KUNCI.keranjang, daftar);
        perbaruiBadge();
        renderKeranjang();
      };
      input.addEventListener('change', () => ubah(input.value));
      const qty = el('div', { class: 'qty' },
        el('button', { type: 'button', 'aria-label': 'Kurangi', text: '-', onclick: () => ubah(x.qty - 1) }), input,
        el('button', { type: 'button', 'aria-label': 'Tambah', text: '+', onclick: () => ubah(x.qty + 1) }));
      isi.append(el('tr', {},
        el('td', {}, b.namaBarang, el('small', { text: b.kodeBarang + ', stok ' + b.stok })),
        el('td', { class: 'angka', text: b.harga }),
        el('td', {}, qty),
        el('td', { class: 'angka', text: rupiah(b.hargaAngka * x.qty) }),
        el('td', { class: 'aksi' }, el('button', { type: 'button', class: 'btn btn-bahaya btn-kecil', text: 'Hapus', onclick: () => {
          simpan(KUNCI.keranjang, ambilKeranjang().filter(r => r.kode !== x.kode));
          perbaruiBadge(); renderKeranjang();
        } }))
      ));
    });
    renderRingkasan();
  }
  function isiPilihan() {
    pilih.replaceChildren(el('option', { value: '', text: 'Pilih buku...' }));
    semuaKatalog().filter(b => b.stok > 0).forEach(b =>
      pilih.append(el('option', { value: b.kodeBarang, text: `${b.namaBarang} (${b.harga}, stok ${b.stok})` })));
  }

  formTambah.addEventListener('submit', e => {
    e.preventDefault();
    bersihError(formTambah);
    const kode = pilih.value, qty = Number(formTambah.elements.qty.value);
    let ok = true;
    if (!kode) { setError(pilih, 'Pilih buku terlebih dahulu.'); ok = false; }
    if (!Number.isInteger(qty) || qty < 1) { setError(formTambah.elements.qty, 'Jumlah minimal 1.'); ok = false; }
    if (!ok) { fokusError(formTambah); return; }
    const hasil = tambahKeKeranjang(kode, qty);
    if (!hasil.ok) { tampilAlert('Stok tidak cukup', hasil.pesan, 'galat'); return; }
    formTambah.reset();
    renderKeranjang();
  });

  form.elements.ekspedisi.addEventListener('change', renderRingkasan);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    bersihError(form);
    const f = form.elements;
    const nama = f.nama.value.trim(), email = f.email.value.trim();
    const telp = f.telepon.value.replace(/[\s-]/g, ''), alamat = f.alamat.value.trim();
    const pos = f.kodepos.value.trim(), pembayaran = f.pembayaran.value;
    let ok = true;
    if (nama.length < 3) { setError(f.nama, 'Nama pemesan minimal 3 karakter.'); ok = false; }
    if (!validEmail(email)) { setError(f.email, 'Format email belum benar.'); ok = false; }
    if (!/^(\+62|62|0)8\d{8,11}$/.test(telp)) { setError(f.telepon, 'Nomor HP tidak valid, contoh: 081234567890.'); ok = false; }
    if (alamat.length < 10) { setError(f.alamat, 'Alamat minimal 10 karakter agar kurir mudah menemukan.'); ok = false; }
    if (!/^\d{5}$/.test(pos)) { setError(f.kodepos, 'Kode pos terdiri dari 5 angka.'); ok = false; }
    if (!f.ekspedisi.value) { setError(f.ekspedisi, 'Pilih ekspedisi pengiriman.'); ok = false; }
    if (!pembayaran) { setError($('input[name="pembayaran"]', form), 'Pilih metode pembayaran.'); ok = false; }
    if (!ok) { fokusError(form); return; }

    const keranjang = ambilKeranjang();
    if (keranjang.length === 0) { tampilAlert('Keranjang masih kosong', 'Tambahkan minimal satu buku sebelum memesan.', 'galat'); return; }
    const kurang = keranjang.find(x => x.qty > cariBuku(x.kode).stok);
    if (kurang) { tampilAlert('Stok berubah', `Stok "${cariBuku(kurang.kode).namaBarang}" tidak cukup untuk jumlah yang dipesan.`, 'galat'); renderKeranjang(); return; }

    const h = hitung();
    if (!(await tampilKonfirmasi('Konfirmasi pesanan', `Total ${rupiah(h.total)} dengan pembayaran ${pembayaran}. Pesanan tidak bisa diubah setelah dikirim.`, 'Pesan sekarang'))) return;

    // Buat nomor DO yang belum dipakai
    const dipakai = new Set(semuaPesanan().map(p => p.nomorDO));
    let nomorDO;
    do { nomorDO = '2026' + String(Math.floor(Math.random() * 10000)).padStart(4, '0'); } while (dipakai.has(nomorDO));

    const sekarang = new Date();
    const pesanan = {
      nomorDO, nama, email, telepon: telp, alamat: `${alamat}, ${pos}`,
      ekspedisi: f.ekspedisi.value, pembayaran,
      paket: '0' + f.ekspedisi.value.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() + pad(Math.floor(Math.random() * 100)),
      tanggal: tanggalLokal(sekarang), waktu: waktuLokal(sekarang),
      items: keranjang.map(x => { const b = cariBuku(x.kode); return { kode: b.kodeBarang, nama: b.namaBarang, harga: b.hargaAngka, qty: x.qty }; }),
      subtotal: h.subtotal, ongkir: h.ongkir, total: h.total, status: 'Diproses',
      perjalanan: [{ waktu: waktuLokal(sekarang), keterangan: 'Pesanan diterima dan sedang disiapkan oleh Pustaka Kampus' }]
    };
    const semua = baca(KUNCI.pesanan, []);
    semua.push(pesanan);
    simpan(KUNCI.pesanan, semua);

    const terjual = baca(KUNCI.terjual, {});
    pesanan.items.forEach(i => { terjual[i.kode] = (terjual[i.kode] || 0) + i.qty; });
    simpan(KUNCI.terjual, terjual);
    simpan(KUNCI.keranjang, []);
    perbaruiBadge();

    form.reset();
    f.nama.value = user.nama; f.email.value = user.email;
    renderKeranjang(); isiPilihan();

    const dlg = buatDialog('modal-kecil modal-ok',
      el('h2', { text: 'Pesanan berhasil dibuat' }),
      el('p', {}, 'Nomor Delivery Order Anda ', el('strong', { text: nomorDO }), '. Simpan nomor ini untuk melacak pengiriman.'),
      el('div', { class: 'modal-aksi' },
        el('button', { type: 'button', class: 'btn btn-garis', text: 'Tutup', onclick: () => dlg.close() }),
        el('a', { class: 'btn btn-primer', href: 'tracking.html?do=' + nomorDO, text: 'Lacak pesanan' })));
    bukaDialog(dlg);
  });

  isiPilihan();
  renderKeranjang();
}

/* ---------- 6e. Tracking ---------- */
function initTracking() {
  const form = $('#formTracking'), hasil = $('#hasilTracking');

  function tampilkan(d) {
    const idx = indeksTahap(d), persen = ((idx + 1) / TAHAP.length) * 100, status = TAHAP[idx];
    const detail = (label, nilai) => el('div', {}, el('dt', { text: label }), el('dd', { text: nilai }));
    hasil.replaceChildren(el('article', { class: 'panel' },
      el('div', { class: 'hasil-kepala' },
        el('div', {}, el('p', { class: 'muted', text: 'Nama pemesan', style: 'margin:0' }), el('h2', { text: d.nama })),
        el('span', { class: 'badge ' + kelasStatus(status), text: status })),
      el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': persen, 'aria-label': 'Progres pengiriman' },
        el('div', { class: 'progress-isi', style: 'width:0%' })),
      el('ol', { class: 'tahap' }, TAHAP.map((t, i) => el('li', { class: i <= idx ? 'capai' : '', text: t }))),
      el('dl', { class: 'detail-grid' },
        detail('Nomor DO', d.nomorDO), detail('Ekspedisi', d.ekspedisi), detail('Tanggal kirim', formatTanggal(d.tanggalKirim)),
        detail('Jenis paket', d.paket), detail('Total pembayaran', d.total)),
      el('h3', { text: 'Riwayat perjalanan' }),
      el('ol', { class: 'timeline' }, d.perjalanan.slice().reverse().map(p =>
        el('li', {}, el('time', { text: formatWaktu(p.waktu) }), p.keterangan)))
    ));
    // animasi bar progres setelah elemen masuk ke DOM
    requestAnimationFrame(() => requestAnimationFrame(() => { $('.progress-isi', hasil).style.width = persen + '%'; }));
  }
  function tampilkanGalat(no) {
    hasil.replaceChildren(el('div', { class: 'panel galat-panel' },
      el('h2', { text: 'Nomor DO tidak ditemukan' }),
      el('p', { text: `Tidak ada pengiriman dengan nomor ${no}. Periksa kembali nomornya, atau coba contoh 20230012.` })));
  }
  function cari(no) {
    const input = form.elements.nomorDO;
    bersihError(form);
    no = no.trim();
    if (!no) { setError(input, 'Nomor Delivery Order wajib diisi.'); input.focus(); hasil.replaceChildren(); return; }
    if (!/^\d{6,12}$/.test(no)) { setError(input, 'Nomor DO hanya berisi angka (6 sampai 12 digit).'); input.focus(); hasil.replaceChildren(); return; }
    const d = cariTracking(no);
    if (!d) { tampilAlert('Nomor DO tidak ditemukan', `Pengiriman dengan nomor ${no} tidak ada di sistem.`, 'galat'); tampilkanGalat(no); return; }
    tampilkan(d);
  }

  form.addEventListener('submit', e => { e.preventDefault(); cari(form.elements.nomorDO.value); });
  $$('[data-do]').forEach(b => b.addEventListener('click', () => { form.elements.nomorDO.value = b.dataset.do; cari(b.dataset.do); }));

  const awal = new URLSearchParams(location.search).get('do');
  if (awal) { form.elements.nomorDO.value = awal; cari(awal); }
}

/* ---------- 6f. Laporan Pemesanan ---------- */
function initLaporan() {
  const pesanan = semuaPesanan();
  const totalBuku = pesanan.reduce((j, p) => j + p.items.reduce((s, i) => s + i.qty, 0), 0);
  const omzet = pesanan.reduce((j, p) => j + p.total, 0);
  $('#lPesanan').textContent = pesanan.length;
  $('#lBuku').textContent = totalBuku;
  $('#lOmzet').textContent = rupiah(omzet);
  $('#lRata').textContent = pesanan.length ? rupiah(Math.round(omzet / pesanan.length)) : 'Rp 0';

  // Penjualan per judul
  const per = {};
  pesanan.forEach(p => p.items.forEach(i => {
    per[i.kode] = per[i.kode] || { nama: i.nama, qty: 0, nilai: 0 };
    per[i.kode].qty += i.qty; per[i.kode].nilai += i.qty * i.harga;
  }));
  const baris = Object.entries(per).sort((a, b) => b[1].nilai - a[1].nilai);
  const maks = baris.length ? baris[0][1].nilai : 1;
  const tbody = $('#isiLaporan');
  tbody.replaceChildren();
  if (!baris.length) tbody.append(el('tr', {}, el('td', { class: 'kosong', colspan: 4, text: 'Belum ada penjualan.' })));
  baris.forEach(([kode, d]) => tbody.append(el('tr', {},
    el('td', {}, d.nama, el('small', { text: kode })),
    el('td', { class: 'angka', text: d.qty }),
    el('td', { class: 'angka', text: rupiah(d.nilai) }),
    el('td', {}, el('span', { class: 'batang', 'aria-hidden': 'true' }, el('i', { style: `width:${(d.nilai / maks) * 100}%` }))))));

  // Per metode pembayaran & ekspedisi
  const hitungPer = (kunci) => {
    const m = {};
    pesanan.forEach(p => { m[p[kunci]] = (m[p[kunci]] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  [['#daftarBayar', 'pembayaran'], ['#daftarEkspedisi', 'ekspedisi']].forEach(([sel, kunci]) => {
    const ul = $(sel); ul.replaceChildren();
    hitungPer(kunci).forEach(([nama, n]) => ul.append(el('li', {}, el('span', { text: nama }), el('strong', { text: n + ' pesanan' }))));
  });
  $('#btnCetak').addEventListener('click', () => window.print());
}

/* ---------- 6g. Riwayat Transaksi ---------- */
function initRiwayat() {
  const isi = $('#isiRiwayat'), cari = $('#cariRiwayat');

  function render() {
    const kata = cari.value.trim().toLowerCase();
    const data = semuaPesanan().filter(p => !kata || `${p.nomorDO} ${p.nama} ${p.status}`.toLowerCase().includes(kata));
    isi.replaceChildren();
    if (!data.length) isi.append(el('tr', {}, el('td', { class: 'kosong', colspan: 7 }, 'Belum ada transaksi yang cocok. ', el('a', { href: 'checkout.html', text: 'Buat pesanan' }), '.')));
    data.forEach(p => {
      const aksi = el('td', { class: 'aksi' },
        el('button', { type: 'button', class: 'btn btn-garis btn-kecil', text: 'Detail', onclick: () => detail(p) }),
        el('a', { class: 'btn btn-garis btn-kecil', href: 'tracking.html?do=' + p.nomorDO, text: 'Lacak' }),
        p.contoh ? null : el('button', { type: 'button', class: 'btn btn-bahaya btn-kecil', text: 'Hapus', onclick: () => hapus(p) }));
      isi.append(el('tr', {},
        el('td', { text: formatTanggal(p.tanggal) }),
        el('td', { text: p.nomorDO }),
        el('td', {}, p.nama, p.contoh ? el('small', { text: 'data contoh dari data.js' }) : null),
        el('td', { text: p.items.map(i => `${i.nama} x${i.qty}`).join(', ') || '-' }),
        el('td', { class: 'angka', text: rupiah(p.total) }),
        el('td', {}, el('span', { class: 'badge ' + kelasStatus(p.status), text: p.status })),
        aksi));
    });
  }
  function detail(p) {
    const tabel = el('div', { class: 'tabel-wrap' }, el('table', { class: 'tabel' },
      el('thead', {}, el('tr', {}, el('th', { text: 'Buku' }), el('th', { text: 'Harga' }), el('th', { text: 'Jumlah' }), el('th', { text: 'Subtotal' }))),
      el('tbody', {}, p.items.map(i => el('tr', {}, el('td', { text: i.nama }), el('td', { class: 'angka', text: rupiah(i.harga) }),
        el('td', { class: 'angka', text: i.qty }), el('td', { class: 'angka', text: rupiah(i.harga * i.qty) }))))));
    const dlg = buatDialog('modal-lebar modal-info',
      el('h2', { text: 'Pesanan ' + p.nomorDO }),
      el('p', { class: 'muted', text: `${p.nama}, ${p.ekspedisi}, bayar via ${p.pembayaran}` + (p.alamat ? `. Dikirim ke ${p.alamat}` : '') }),
      tabel,
      el('dl', { class: 'ringkasan', style: 'margin-top:1rem' },
        el('div', {}, el('dt', { text: 'Subtotal' }), el('dd', { text: rupiah(p.subtotal) })),
        el('div', {}, el('dt', { text: 'Ongkos kirim' }), el('dd', { text: p.ongkir ? rupiah(p.ongkir) : '-' })),
        el('div', { class: 'total' }, el('dt', { text: 'Total' }), el('dd', { text: rupiah(p.total) }))),
      el('div', { class: 'modal-aksi' }, el('button', { type: 'button', class: 'btn btn-primer', text: 'Tutup', onclick: () => dlg.close() })));
    bukaDialog(dlg);
  }
  async function hapus(p) {
    if (!(await tampilKonfirmasi('Hapus transaksi?', `Pesanan ${p.nomorDO} akan dihapus dari riwayat.`, 'Hapus'))) return;
    simpan(KUNCI.pesanan, baca(KUNCI.pesanan, []).filter(x => x.nomorDO !== p.nomorDO));
    render();
    toast('Transaksi dihapus.');
  }
  cari.addEventListener('input', render);
  render();
}

/* ---------- 7. Inisialisasi ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const halaman = document.body.dataset.halaman;
  if (halaman === 'login') {
    if (penggunaAktif()) { location.replace('dashboard.html'); return; }
    initLogin();
    return;
  }
  if (!penggunaAktif()) { location.replace('index.html'); return; }
  initHeader();
  const peta = { dashboard: initDashboard, stok: initStok, checkout: initCheckout, tracking: initTracking, laporan: initLaporan, riwayat: initRiwayat };
  if (peta[halaman]) peta[halaman]();
});
