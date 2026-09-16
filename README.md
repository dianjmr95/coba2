# Starcomp Sales Toolkit

Dokumentasi teknis dan fungsional aplikasi pada folder ini. Dokumen ini disusun sebagai acuan untuk menjalankan, memindahkan, atau menggabungkan fitur aplikasi ke website Next.js lain.

> Kondisi source yang didokumentasikan: 4 Agustus 2026. Nilai rahasia dari file `.env` tidak dicantumkan.

## 1. Ringkasan aplikasi

Aplikasi ini adalah dashboard internal penjualan Starcomp untuk:

- menghitung potongan dan laba penjualan di Tokopedia, Shopee, dan Tokopedia Mall;
- membandingkan dua price list dan menghitung rekomendasi harga jual;
- membuat faktur atau surat penawaran, menyimpan arsipnya, dan membagikan halaman cetak melalui token publik;
- mengelola data stok beberapa gudang dan rekomendasi restock;
- autentikasi pengguna dan pembagian akses berdasarkan role;
- menyimpan preset kalkulator, dokumen, log harga, dan data restock di Supabase.

Source juga masih memuat kode lama untuk **Rekap Penjualan**, tetapi fitur tersebut saat ini tidak aktif secara normal. Detailnya ada di bagian [Catatan kondisi source](#12-catatan-kondisi-source).

## 2. Teknologi

| Bagian | Teknologi |
| --- | --- |
| Framework | Next.js App Router |
| Bahasa | TypeScript |
| UI | React dan Tailwind CSS |
| Database dan autentikasi | Supabase |
| Baca/tulis spreadsheet | SheetJS (`xlsx`) dan ExcelJS |
| Baca PDF | `pdf-parse` |
| Scraping harga | Axios, Cheerio, Playwright, serta proxy opsional |

Versi yang terpasang ketika dokumentasi dibuat antara lain Next.js `16.2.4`, React `19.2.5`, Supabase JS `2.103.3`, Tailwind CSS `3.4.13`, dan TypeScript `6.0.3`. Beberapa dependency di `package.json` menggunakan label `latest`; sebaiknya pin versi sebelum dipindahkan agar hasil instalasi tetap konsisten.

## 3. Halaman dan fitur

### `/` — dashboard utama

Halaman utama berada di `app/page.tsx` dan menggunakan Supabase Auth. Setelah login, menu yang tersedia ditentukan oleh role pengguna.

#### Kalkulator Potongan

- Input harga jual, modal, dan target margin.
- Menghitung total potongan, pendapatan bersih, laba, dan persentase margin.
- Membandingkan Tokopedia, Shopee, dan Tokopedia Mall secara langsung.
- Menghitung rekomendasi harga jual agar pendapatan bersih mencapai `modal × (1 + target margin)`.
- Mendukung pengaturan fee admin, gratis ongkir, afiliasi, promo, asuransi, dan biaya jasa.
- Preset dapat disimpan bersama di tabel Supabase `potongan_presets`.
- Harga produk dapat diambil dari URL marketplace jika fitur scraping diaktifkan.

##### Istilah dan rumus dasar

Gunakan simbol berikut untuk membaca rumus:

- `H` = harga jual produk;
- `M` = modal produk;
- `persentase(H, p)` = `H × p / 100`;
- `maksimal(x, batas)` pada tabel di bawah berarti `min(x, batas)`.

```text
total potongan = jumlah seluruh komponen biaya yang aktif
pendapatan bersih / net = H - total potongan
laba nominal = net - M
margin terhadap modal = (laba nominal / M) × 100%
target net = M × (1 + target margin / 100)
```

Rekomendasi harga dicari dari harga jual terkecil dalam rupiah yang menghasilkan `net >= target net`. Karena beberapa biaya memiliki batas maksimum, harga rekomendasi tidak hanya dihitung dengan menjumlahkan persentase secara sederhana; source menguji ulang hasil terhadap seluruh komponen biaya aktif.

##### Konfigurasi default aplikasi

Nilai ini adalah preset awal pada source. Pengguna dapat mengubahnya atau memilih preset lain.

| Pengaturan | Tokopedia | Shopee | Tokopedia Mall |
| --- | ---: | ---: | ---: |
| Fee admin | 4,75% | 5,25% | 3% |
| PPh | 0,5% | 0,5% | 0,5% |
| Gratis ongkir | 4%, aktif | 1% kategori di bawah 5 kg, aktif | 4%, aktif |
| Promo ekstra | — | 4,5%, aktif | — |
| Asuransi | — | 0,5%, tidak aktif | — |
| Biaya jasa | — | — | 1,8%, aktif |
| Afiliasi | 2%, tidak aktif | 2%, tidak aktif | 2%, tidak aktif |

##### Ringkasan seluruh persentase potongan

Tabel berikut memisahkan biaya berbentuk persentase dari biaya tetap. Kolom **Default aktif** menunjukkan kondisi saat aplikasi pertama kali dibuka atau saat memakai preset bawaan.

| Marketplace | Jenis potongan | Persentase tersedia | Default aktif | Batas nominal |
| --- | --- | ---: | ---: | ---: |
| Tokopedia | Fee admin | 4,75% / 6,25% / 7,5% / 7,75% / 8% / 9,5% / 10% | 4,75% | Tidak ada batas di source |
| Tokopedia | PPh | 0,5% | 0,5% | Tidak ada batas di source |
| Tokopedia | Gratis ongkir | Nonaktif / 3% / 4% / 6% | 4% | Maksimal Rp650.000 |
| Tokopedia | Afiliasi | Dapat diubah | Nonaktif; nilai awal 2% | Tidak ada batas di source |
| Shopee | Fee admin | 5,25% / 6,50% / 6,75% / 9% / 9,50% / 10% | 5,25% | Tidak ada batas di source |
| Shopee | PPh | 0,5% | 0,5% | Tidak ada batas di source |
| Shopee | Gratis ongkir di bawah 5 kg | Nonaktif / 1% / 2% / 3,5% / 5,5% | 1% | Maksimal Rp40.000 |
| Shopee | Gratis ongkir di atas 5 kg | Nonaktif / 2,5% / 3,5% / 5% / 7% | Tidak aktif | Maksimal Rp60.000 |
| Shopee | Promo ekstra | 4,5% | 4,5% | Maksimal Rp60.000 |
| Shopee | Asuransi | 0,5% | Tidak aktif | Tidak ada batas di source |
| Shopee | Afiliasi | Dapat diubah | Nonaktif; nilai awal 2% | Tidak ada batas di source |
| Tokopedia Mall | Fee admin | 3% / 3,7% / 5,95% / 6,95% / 7,2% / 7,75% / 8,2% / 9,2% / 11,7% / 12,2% | 3% | Tidak ada batas di source |
| Tokopedia Mall | PPh | 0,5% | 0,5% | Tidak ada batas di source |
| Tokopedia Mall | Biaya jasa | 1,8% | 1,8% | Maksimal Rp50.000 |
| Tokopedia Mall | Gratis ongkir | Nonaktif / 3% / 4% / 6% | 4% | Maksimal Rp650.000 |
| Tokopedia Mall | Afiliasi | Dapat diubah | Nonaktif; nilai awal 2% | Tidak ada batas di source |

Daftar dropdown pada source, sesuai tampilan aplikasi:

| Field UI | Seluruh pilihan |
| --- | --- |
| **Fee Tokopedia (%)** | 4,75%; 6,25%; 7,5%; 7,75%; 8%; 9,5%; 10% |
| **Fee Shopee (%)** | 5,25%; 6,50%; 6,75%; 9%; 9,50%; 10% |
| **Fee Tokopedia Mall (%)** | 3%; 3,7%; 5,95%; 6,95%; 7,2%; 7,75%; 8,2%; 9,2%; 11,7%; 12,2% |
| **Gratis Ongkir Tokopedia** | Tidak aktif; 3%; 4%; 6%—seluruh pilihan aktif dibatasi maksimal Rp650.000 |
| **Gratis Ongkir Shopee—di bawah 5 kg** | 1%; 2%; 3,5%; 5,5%—dibatasi maksimal Rp40.000 |
| **Gratis Ongkir Shopee—di atas 5 kg** | 2,5%; 3,5%; 5%; 7%—dibatasi maksimal Rp60.000 |
| **Gratis Ongkir Tokopedia Mall** | Tidak aktif; 3%; 4%; 6%—seluruh pilihan aktif dibatasi maksimal Rp650.000 |

Komisi afiliasi tidak berupa dropdown. Nilainya dimasukkan melalui input angka dengan minimum 0 dan kenaikan `0,1%`, kemudian diaktifkan menggunakan checkbox. Nilai awalnya adalah 2% untuk ketiga marketplace.

Pilihan yang terlihat terpilih pada gambar adalah **Fee Tokopedia 10%**, **Fee Shopee 9,50%**, **Fee Tokopedia Mall 9,2%**, **Gratis Ongkir Tokopedia 3%**, **Gratis Ongkir Shopee 5,5% kategori di bawah 5 kg**, dan **Gratis Ongkir Tokopedia Mall 3%**. Ini adalah pilihan aktif pada contoh gambar, bukan nilai default awal aplikasi.

##### Total persentase pada preset default

Total di bawah hanya menjumlahkan komponen persentase yang aktif pada preset bawaan. Biaya tetap ditampilkan terpisah.

| Marketplace | Penjumlahan persentase aktif | Total persentase dasar | Biaya tetap tambahan |
| --- | --- | ---: | ---: |
| Tokopedia | 4,75% admin + 0,5% PPh + 4% gratis ongkir | **9,25%** | Rp1.250 + Rp5.060 = **Rp6.310** |
| Shopee | 5,25% admin + 0,5% PPh + 1% gratis ongkir + 4,5% promo | **11,25%** | Rp1.250 + Rp350 = **Rp1.600** |
| Tokopedia Mall | 3% admin + 0,5% PPh + 1,8% biaya jasa + 4% gratis ongkir | **9,30%** | Rp1.250 + Rp5.060 = **Rp6.310** |

Selama belum ada komponen yang mencapai batas nominalnya, rumus ringkas preset default adalah:

```text
Tokopedia       = (H × 9,25%) + Rp6.310
Shopee          = (H × 11,25%) + Rp1.600
Tokopedia Mall  = (H × 9,30%) + Rp6.310
```

Rumus ringkas tersebut tidak boleh dipakai setelah gratis ongkir, promo, atau biaya jasa mencapai batas nominal. Dalam kondisi itu, gunakan nilai batasnya dan hitung setiap komponen secara terpisah.

##### Rentang persentase berdasarkan fitur aktif

Perbandingan berikut memakai fee admin default dan nilai afiliasi awal 2%. Biaya tetap belum dimasukkan.

| Marketplace | Kondisi minimum | Persentase minimum | Kondisi maksimum yang tersedia | Persentase maksimum teoretis |
| --- | --- | ---: | --- | ---: |
| Tokopedia | Admin + PPh; gratis ongkir dan afiliasi nonaktif | **5,25%** | Admin + PPh + gratis ongkir 6% + afiliasi 2% | **13,25%** |
| Shopee | Admin + PPh; semua fitur opsional nonaktif | **5,75%** | Admin + PPh + gratis ongkir 7% + promo 4,5% + asuransi 0,5% + afiliasi 2% | **19,75%** |
| Tokopedia Mall | Admin + PPh; jasa, gratis ongkir, dan afiliasi nonaktif | **3,50%** | Admin + PPh + jasa 1,8% + gratis ongkir 6% + afiliasi 2% | **13,30%** |

Persentase maksimum tersebut bersifat teoretis. Total efektif dapat lebih rendah ketika komponen yang memiliki batas nominal sudah mencapai batasnya.

##### Harga saat batas maksimum mulai tercapai

| Komponen | Tarif | Batas nominal | Batas tercapai sekitar harga jual |
| --- | ---: | ---: | ---: |
| Tokopedia/Mall gratis ongkir | 3% | Rp650.000 | Rp21.666.667 |
| Tokopedia/Mall gratis ongkir | 4% | Rp650.000 | Rp16.250.000 |
| Tokopedia/Mall gratis ongkir | 6% | Rp650.000 | Rp10.833.334 |
| Shopee gratis ongkir di bawah 5 kg | 1% | Rp40.000 | Rp4.000.000 |
| Shopee gratis ongkir di bawah 5 kg | 2% | Rp40.000 | Rp2.000.000 |
| Shopee gratis ongkir di bawah 5 kg | 3,5% | Rp40.000 | Rp1.142.858 |
| Shopee gratis ongkir di bawah 5 kg | 5,5% | Rp40.000 | Rp727.273 |
| Shopee gratis ongkir di atas 5 kg | 2,5% | Rp60.000 | Rp2.400.000 |
| Shopee gratis ongkir di atas 5 kg | 3,5% | Rp60.000 | Rp1.714.286 |
| Shopee gratis ongkir di atas 5 kg | 5% | Rp60.000 | Rp1.200.000 |
| Shopee gratis ongkir di atas 5 kg | 7% | Rp60.000 | Rp857.143 |
| Shopee promo ekstra | 4,5% | Rp60.000 | Rp1.333.334 |
| Tokopedia Mall biaya jasa | 1,8% | Rp50.000 | Rp2.777.778 |

Contoh: pada harga Shopee Rp2.000.000 dengan gratis ongkir 1%, biaya gratis ongkir masih Rp20.000. Pada harga Rp5.000.000, hasil 1% seharusnya Rp50.000 tetapi source membatasinya menjadi Rp40.000.

##### Detail potongan Tokopedia

| Komponen | Perhitungan | Kondisi/batas |
| --- | --- | --- |
| Fee admin marketplace | `H × fee admin / 100` | Default 4,75%; persentase dapat diubah |
| PPh | `H × 0,5%` | Selalu dihitung |
| Biaya proses | Rp1.250 | Biaya tetap per perhitungan/transaksi |
| Biaya tetap | Rp5.060 | Biaya tetap per perhitungan/transaksi |
| Program gratis ongkir | `H × tarif gratis ongkir` | Pilihan tidak aktif, 3%, 4%, atau 6%; maksimal Rp650.000 |
| Komisi afiliasi | `H × tarif afiliasi` | Opsional; default tarif 2% ketika diaktifkan |

```text
total Tokopedia = fee admin + PPh + Rp1.250 + Rp5.060
                  + gratis ongkir aktif + afiliasi aktif
net Tokopedia = H - total Tokopedia
```

##### Detail potongan Shopee

| Komponen | Perhitungan | Kondisi/batas |
| --- | --- | --- |
| Fee admin marketplace | `H × fee admin / 100` | Default 5,25%; persentase dapat diubah |
| PPh | `H × 0,5%` | Selalu dihitung |
| Biaya proses | Rp1.250 | Biaya tetap per perhitungan/transaksi |
| Biaya tambahan tetap | Rp350 | Biaya tetap per perhitungan/transaksi |
| Gratis ongkir di bawah 5 kg | `H × tarif` | Pilihan 1%, 2%, 3,5%, atau 5,5%; maksimal Rp40.000 |
| Gratis ongkir di atas 5 kg | `H × tarif` | Pilihan 2,5%, 3,5%, 5%, atau 7%; maksimal Rp60.000 |
| Promo ekstra | `min(H × 4,5%, Rp60.000)` | Opsional; aktif pada preset default |
| Asuransi | `H × 0,5%` | Opsional; tidak aktif pada preset default |
| Komisi afiliasi | `H × tarif afiliasi` | Opsional; default tarif 2% ketika diaktifkan |

Hanya satu mode gratis ongkir Shopee yang dipilih pada satu perhitungan. Mode tersebut juga dapat dinonaktifkan.

```text
total Shopee = fee admin + PPh + Rp1.250 + Rp350
               + gratis ongkir aktif + promo aktif
               + asuransi aktif + afiliasi aktif
net Shopee = H - total Shopee
```

##### Detail potongan Tokopedia Mall

| Komponen | Perhitungan | Kondisi/batas |
| --- | --- | --- |
| Fee admin marketplace | `H × fee admin / 100` | Default 3%; persentase dapat diubah |
| PPh | `H × 0,5%` | Selalu dihitung |
| Biaya proses | Rp1.250 | Biaya tetap per perhitungan/transaksi |
| Biaya tetap | Rp5.060 | Biaya tetap per perhitungan/transaksi |
| Biaya jasa | `min(H × 1,8%, Rp50.000)` | Opsional; aktif pada preset default |
| Program gratis ongkir | `H × tarif gratis ongkir` | Pilihan tidak aktif, 3%, 4%, atau 6%; maksimal Rp650.000 |
| Komisi afiliasi | `H × tarif afiliasi` | Opsional; default tarif 2% ketika diaktifkan |

```text
total Tokopedia Mall = fee admin + PPh + Rp1.250 + Rp5.060
                        + biaya jasa aktif + gratis ongkir aktif
                        + afiliasi aktif
net Tokopedia Mall = H - total Tokopedia Mall
```

##### Contoh perhitungan preset default

Contoh berikut memakai harga jual `H = Rp1.000.000`, tanpa afiliasi, dan konfigurasi default aplikasi.

| Komponen | Tokopedia | Shopee | Tokopedia Mall |
| --- | ---: | ---: | ---: |
| Fee admin | Rp47.500 | Rp52.500 | Rp30.000 |
| PPh 0,5% | Rp5.000 | Rp5.000 | Rp5.000 |
| Biaya proses | Rp1.250 | Rp1.250 | Rp1.250 |
| Biaya tetap/tambahan | Rp5.060 | Rp350 | Rp5.060 |
| Gratis ongkir | Rp40.000 | Rp10.000 | Rp40.000 |
| Promo ekstra | — | Rp45.000 | — |
| Biaya jasa | — | — | Rp18.000 |
| **Total potongan** | **Rp98.810** | **Rp114.100** | **Rp99.310** |
| **Pendapatan bersih** | **Rp901.190** | **Rp885.900** | **Rp900.690** |
| **Potongan efektif dari harga jual** | **9,881%** | **11,410%** | **9,931%** |

Contoh tersebut belum memasukkan modal. Jika modal diisi, aplikasi mengurangi pendapatan bersih dengan modal untuk memperoleh laba dan margin.

> Angka di atas menjelaskan **rumus yang tertanam pada source aplikasi**, bukan pernyataan tarif resmi marketplace yang pasti masih berlaku. Fee marketplace dapat berbeda menurut kategori, level toko, program, pajak, berat, kampanye, dan perubahan kebijakan. Verifikasi tarif operasional terbaru sebelum dipakai pada website baru.

#### Compare Harga Pricelist

- Membandingkan file price list hari ini dengan file sebelumnya.
- Format input: `.xlsx`, `.csv`, atau `.pdf`.
- File XLSX/CSV diproses di browser terlebih dahulu; PDF diproses melalui API server.
- Pencocokan memakai SKU persis, keluarga/alias SKU, nama persis, atau fuzzy matching.
- Tersedia mode normal/strict dan strategi SKU saja atau SKU dengan fallback nama.
- Sumber kolom harga dapat dipilih: otomatis, dealer, online, retail, atau kolom paling bawah.
- Mendukung toleransi nominal, filter kasus risiko, persetujuan per baris, dan preset berbeda per produk.
- Hasil dapat dikirim kembali ke kalkulator dan diekspor sebagai XLSX: semua hasil, baris approved, atau kasus risiko.

Header yang dikenali bersifat fleksibel. Contoh alias penting adalah `SKU`, `Kode Barang`, `Item Code`, `Model`, `Description`, `Item Name`, `Product`, dan `Nama Produk`.

#### Pembuatan Faktur/Penawaran

- Pilihan dokumen `faktur` atau `penawaran`.
- Data pembeli, telepon, WhatsApp dengan kode negara, alamat, kurir, PIC sales, catatan, dan daftar item.
- Diskon, PPN include/exclude, DP untuk faktur, dan grand total.
- Pilihan profil kop surat untuk cabang Rajawali, Jakal, dan Solo.
- Logo kop serta tanda tangan/stempel manual dapat diunggah.
- Arsip dokumen disimpan di tabel `sales_documents`.
- Dokumen dapat dibuka melalui `/dokumen/[token]`, dicetak, dan dibagikan.
- Halaman cetak dapat menyertakan rekening, surat jalan, BAST, tanda tangan, serta mode dot-matrix.
- Source melakukan pembersihan dokumen yang berumur lebih dari 365 hari saat penyimpanan dokumen dipanggil.

### `/dokumen/[token]` — dokumen publik dan cetak

Halaman ini mengambil arsip berdasarkan token publik. Tampilan mendukung faktur, penawaran, surat jalan, dan BAST. Query string yang dipakai UI mencakup `includeSign`, `includeBank`, `includeDot`, `includeTax`, `includeTaxMode`, `includeTaxRate`, `includeTaxAmount`, `includeDiscountAmount`, `includeDpPercent`, `includeDpAmount`, `includeSJ`, dan `includeBAST`.

Token harus panjang dan sulit ditebak karena halaman ini memang dapat dibuka tanpa login untuk kebutuhan berbagi dokumen.

### `/restock` — kontrol stok dan restock

- Menambah gudang.
- Upload stok per gudang dari XLSX.
- Upload data penjualan per periode dari XLSX.
- Menentukan gudang basis, periode, dan ambang stok minimum.
- Menampilkan produk kosong/stok rendah, jumlah terjual, prioritas, stok gudang lain, modal, dan harga jual.
- Mengekspor dashboard ke XLSX atau CSV.
- Mengecek file barang datang dan menghitung rekomendasi tambahan berdasarkan buffer penjualan.

Format XLSX stok wajib memiliki header berikut:

| SKU | Nama Produk | Harga Modal | Harga Jual | Qty |
| --- | --- | --- | --- | --- |

Format XLSX penjualan wajib memiliki header berikut:

| Nama Produk | Qty Terjual | Omzet |
| --- | --- | --- |

Rumus rekomendasi barang datang:

```text
target stok = ceil(qty terjual × buffer penjualan)
tambahan = max(0, target stok - (stok sekarang + qty barang datang))
```

## 4. Role dan autentikasi

Login menggunakan Supabase email/password. Role disimpan di tabel `user_roles` dan disinkronkan berkala oleh halaman utama.

| Role | Akses dari dashboard saat ini |
| --- | --- |
| `admin` | Kalkulator, compare harga, pembuatan dokumen, manajemen role, dan penghapusan dokumen |
| `staff` | Kalkulator, compare harga, dan pembuatan dokumen |
| `staff_offline` | Kalkulator, compare harga, dan pembuatan dokumen |
| `viewer` | Kalkulator dan compare harga |

Semua pengguna yang berhasil login dan belum memiliki record role memakai `NEXT_PUBLIC_DEFAULT_AUTH_ROLE`, dengan fallback `viewer`.

Catatan: tautan `/restock` saat ini tampil di header untuk semua pengguna yang sudah login, dan route `/restock` sendiri belum melakukan penjagaan sesi. Jangan menganggap penyembunyian menu sebagai pengamanan akses.

## 5. Struktur folder penting

```text
app/
├── page.tsx                         # dashboard utama dan sebagian besar logika UI
├── layout.tsx                       # metadata dan root layout
├── globals.css                      # Tailwind serta style global
├── supabaseClient.ts                # Supabase client untuk browser
├── restock/page.tsx                 # halaman restock
├── dokumen/[token]/                 # halaman publik/cetak dokumen
└── api/
    ├── my-role/route.ts             # membaca role user aktif
    ├── price-compare/route.ts        # parsing server dan perbandingan price list
    ├── price-scrape/route.ts         # scraping dan pencatatan harga
    ├── scrape/route.ts               # alias endpoint price-scrape
    ├── restock/route.ts              # baca/tulis data restock
    └── sales-documents/              # simpan, baca, dan hapus dokumen
lib/
├── supabaseAdmin.ts                 # Supabase service-role client, hanya untuk server
├── price-compare.ts                 # utilitas normalisasi dan similarity
├── price-scraper.ts                 # scraper HTTP
├── price-scraper-playwright.ts      # fallback browser Playwright
└── price-scraper-proxy.ts           # fallback ScraperAPI/ZenRows
public/
├── starcomp-logo.png
└── signature-starcomp.png
supabase/migrations/                  # skema, perubahan tabel, index, trigger, dan RLS
types/price-tracking.ts               # tipe tabel produk dan log harga
index.legacy.html                     # versi HTML lama; tidak dipakai route Next.js
```

`app/page.tsx` saat ini sangat besar dan mencampur UI, state, kalkulasi, autentikasi, impor/ekspor, serta akses database. Untuk integrasi jangka panjang, pecah per fitur menjadi komponen, hook, dan service terpisah sebelum banyak modifikasi dilakukan.

## 6. Environment variables

Buat `.env.local` di root aplikasi baru. Jangan commit service-role key atau file environment ke Git.

```dotenv
# Wajib untuk browser dan server
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY

# Wajib untuk API server; jangan pernah memakai prefix NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=YOUR_PRIVATE_SERVICE_ROLE_KEY

# URL publik untuk link dokumen
APP_BASE_URL=https://domain-web-baru.example

# Opsional: nama tabel dan default role
NEXT_PUBLIC_SUPABASE_PRESET_TABLE=potongan_presets
NEXT_PUBLIC_SUPABASE_ROLE_TABLE=user_roles
NEXT_PUBLIC_DEFAULT_AUTH_ROLE=viewer

# Opsional: scraping harga
NEXT_PUBLIC_ENABLE_AUTO_PRICE_FETCH=false
ENABLE_PRICE_SCRAPE=false
SCRAPERAPI_KEY=
ZENROWS_API_KEY=

# Opsional: alternatif konfigurasi URL publik
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SITE_URL=

# Opsional: pindahkan email admin dari nilai hardcoded
FIXED_ADMIN_EMAIL=admin@example.com
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` juga didukung sebagai pengganti `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

`NEXT_PUBLIC_*` akan masuk ke bundle browser. Jangan pernah meletakkan `SUPABASE_SERVICE_ROLE_KEY`, API key proxy, password, atau rahasia lain di variabel dengan prefix tersebut.

## 7. Menjalankan secara lokal

Persyaratan yang disarankan:

- Node.js versi yang kompatibel dengan Next.js 16;
- npm;
- project Supabase;
- browser Chromium Playwright hanya jika fallback scraping dipakai.

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

Validasi build produksi:

```bash
npm run build
npm run start
```

Jika scraping Playwright diperlukan:

```bash
npx playwright install chromium
```

## 8. Database Supabase

Tabel yang dipakai aplikasi:

| Tabel | Fungsi |
| --- | --- |
| `user_roles` | pemetaan email ke role |
| `potongan_presets` | preset kalkulator bersama |
| `sales_documents` | arsip faktur dan penawaran |
| `products` | produk yang URL-nya dilacak oleh scraper |
| `price_logs` | riwayat harga hasil scraping |
| `restock_warehouses` | daftar gudang |
| `restock_products` | master produk restock |
| `restock_warehouse_stock` | stok per gudang dan produk |
| `restock_sales_records` | agregat penjualan per periode dan produk |

File SQL ada di `supabase/migrations`. Untuk project Supabase baru, audit seluruh file dan jalankan lewat Supabase CLI atau SQL editor dalam urutan nama file.

Perhatian khusus:

- repo tidak berisi migration awal yang membuat `user_roles`;
- migration rekap lama mengasumsikan `sales_recap` sudah ada, sedangkan migration `20260709_drop_sales_recap.sql` kemudian menghapusnya;
- migration restock mengaktifkan RLS tetapi tidak menambahkan policy client karena akses dilakukan melalui API service role;
- email admin masih tertulis langsung pada beberapa migration dan source;
- policy dan akses endpoint harus disesuaikan dengan model keamanan web baru.

Contoh minimal tabel `user_roles` yang perlu disiapkan bila project baru belum memilikinya:

```sql
create table if not exists public.user_roles (
  email text primary key,
  role text not null default 'viewer'
    check (lower(role) in ('admin', 'staff', 'staff_offline', 'staff offline', 'viewer'))
);
```

Jangan memakai contoh tersebut sebagai satu-satunya pengamanan. Tambahkan RLS/policy yang sesuai, lalu buat akun pengguna melalui Supabase Auth.

## 9. API internal

| Method dan endpoint | Fungsi | Kondisi akses pada source saat ini |
| --- | --- | --- |
| `GET /api/my-role` | membaca role user aktif | wajib Bearer token valid |
| `POST /api/price-compare` | membandingkan dua file atau dua kumpulan baris | belum memeriksa login |
| `POST /api/price-scrape` | scrape URL dan menyimpan log harga | dikontrol flag, belum memeriksa login |
| `POST /api/scrape` | alias untuk price-scrape | sama seperti price-scrape |
| `GET /api/restock` | membaca seluruh data restock | belum memeriksa login |
| `POST /api/restock` | menambah gudang/upload stok/upload penjualan | belum memeriksa login |
| `POST /api/sales-documents` | membuat atau memperbarui dokumen | Bearer token opsional pada source saat ini |
| `GET /api/sales-documents/[token]` | membaca dokumen berdasarkan token | publik berdasarkan token |
| `DELETE /api/sales-documents/[token]` | menghapus dokumen | wajib admin utama |

Semua endpoint yang memakai `getSupabaseAdmin()` berjalan dengan service-role key dan melewati RLS. Sebelum aplikasi dipublikasikan di domain lain, tambahkan validasi sesi/role di server, pembatasan ukuran request/file, rate limit, dan validasi origin sesuai kebutuhan.

## 10. Cara menambahkan ke website berbeda

### Opsi A — pindahkan sebagai modul Next.js

Pilihan ini paling sesuai bila web tujuan juga memakai Next.js App Router.

1. Salin halaman yang dibutuhkan dari `app/` ke route tujuan, misalnya `/tools/marketplace` dan `/tools/restock`.
2. Salin endpoint terkait dari `app/api/`.
3. Salin utilitas dari `lib/`, aset dari `public/`, dan tipe yang dipakai.
4. Gabungkan dependency dari `package.json` dengan project tujuan dan pertahankan versi yang kompatibel.
5. Gabungkan konfigurasi Tailwind/PostCSS dan style yang diperlukan dari `app/globals.css`.
6. Buat environment variables pada hosting web tujuan.
7. Terapkan schema database yang benar ke project Supabase tujuan.
8. Ganti semua nama perusahaan, cabang, alamat, nomor telepon, rekening, logo, tanda tangan default, metadata, dan email admin.
9. Pasang penjagaan sesi/role pada halaman dan API server.
10. Uji login, kalkulasi, upload file, ekspor, cetak, share link, dan hak akses setiap role.

Dependensi per fitur:

| Fitur | File/dependency utama |
| --- | --- |
| Kalkulator | `app/page.tsx`, Supabase JS, Tailwind |
| Compare XLSX/CSV | `xlsx`, `exceljs`, `app/api/price-compare`, `lib/price-compare` |
| Compare PDF | `pdf-parse` dan runtime Node.js |
| Dokumen | route `sales-documents`, `/dokumen/[token]`, aset logo/tanda tangan, Supabase Admin |
| Scraping | Axios, Cheerio, Playwright, proxy opsional, tabel `products`/`price_logs` |
| Restock | `/restock`, `/api/restock`, `xlsx`, dan empat tabel `restock_*` |

### Opsi B — jalankan terpisah dan tautkan

Deploy aplikasi ini sebagai subdomain, misalnya `tools.example.com`, lalu tambahkan tautan dari web utama. Cara ini lebih cepat dan mengurangi konflik dependency atau CSS. Konfigurasikan `APP_BASE_URL` ke origin aplikasi tools agar share link dokumen benar.

### Opsi C — embed dengan iframe

Iframe dapat digunakan untuk tampilan cepat, tetapi perlu pengaturan header keamanan, cookie/auth lintas domain, tinggi responsif, dan izin print/download. Untuk aplikasi yang memerlukan login dan upload file, subdomain dengan tautan langsung biasanya lebih sederhana daripada iframe.

## 11. Checklist sebelum produksi

- [ ] Ganti identitas Starcomp dan data setiap cabang.
- [ ] Ganti email admin hardcoded di client, API, dan migration.
- [ ] Ganti data rekening dan aset tanda tangan.
- [ ] Putuskan apakah kode Rekap Penjualan akan dipulihkan atau dihapus total.
- [ ] Tambahkan autentikasi dan otorisasi server pada endpoint restock, scraping, compare, dan simpan dokumen.
- [ ] Pastikan service-role key hanya tersedia di server.
- [ ] Tinjau RLS dan policy seluruh tabel.
- [ ] Batasi ukuran/jenis file upload dan tambahkan rate limit.
- [ ] Validasi formula fee marketplace terbaru.
- [ ] Pin versi dependency dan commit lockfile.
- [ ] Uji tampilan mobile, desktop, print, surat jalan, dan BAST.
- [ ] Uji file XLSX/CSV/PDF nyata dari operasional.
- [ ] Konfigurasikan domain publik, HTTPS, dan `APP_BASE_URL`.
- [ ] Siapkan backup serta kebijakan retensi dokumen.

## 12. Catatan kondisi source

1. **Rekap Penjualan tidak konsisten dengan kondisi database terbaru.** Kode UI dan logikanya masih berada di `app/page.tsx`, tetapi tidak ada role pada `ROLE_SECTION_ACCESS` yang diberi menu rekap. Migration terbaru juga menghapus `sales_recap`. Tentukan apakah fitur ini ingin dipulihkan atau kode lamanya dibersihkan sebelum integrasi.
2. **Endpoint restock belum memiliki verifikasi autentikasi.** Endpoint memakai Supabase service role sehingga aksesnya harus dijaga di server sebelum deployment publik.
3. **Penyimpanan dokumen belum mewajibkan login.** Bearer token pada `POST /api/sales-documents` masih opsional; endpoint perlu diperketat jika dokumen hanya boleh dibuat staf.
4. **Konfigurasi bisnis masih hardcoded.** Profil cabang, rekening bank, identitas Starcomp, logo, tanda tangan default, formula fee, dan email admin muncul langsung di source atau migration.
5. **Halaman utama monolitik.** `app/page.tsx` berukuran lebih dari 9.000 baris. Pemecahan modul sangat disarankan agar aman dirawat dan mudah ditanam ke website lain.
6. **`index.legacy.html` adalah artefak lama.** File tersebut tidak menjadi halaman utama selama aplikasi dijalankan melalui Next.js.

## 13. Titik kustomisasi merek

Cari dan ganti setidaknya istilah berikut sebelum reuse:

- `Starcomp`, `STARCOMP`, `Starcomp Solo`, dan `Starcomp Sales Toolkit`;
- profil `Rajawali`, `JAKAL`, dan `Solo` pada `app/page.tsx` serta `app/dokumen/[token]/page.tsx`;
- `DEFAULT_BANK_ACCOUNT_INFO`;
- `FIXED_ADMIN_EMAIL` dan email yang tertulis di SQL policy;
- `/starcomp-logo.png` dan `/signature-starcomp.png`;
- metadata pada `app/layout.tsx` dan `app/dokumen/[token]/page.tsx`.

## 14. Verifikasi setelah pemindahan

Lakukan pengujian minimum berikut:

1. Login sebagai admin, staff, staff offline, dan viewer.
2. Bandingkan hasil kalkulator dengan perhitungan manual untuk ketiga marketplace.
3. Simpan, ubah, dan hapus preset sesuai role.
4. Compare contoh XLSX, CSV, dan PDF; periksa SKU duplikat serta produk tanpa harga.
5. Buat faktur dan penawaran dengan diskon, pajak include/exclude, serta DP.
6. Buka share link tanpa login, lalu cek mode cetak, surat jalan, BAST, dan tanda tangan.
7. Upload stok dua gudang serta data penjualan, lalu cocokkan hasil restock dan ekspornya.
8. Pastikan endpoint yang sensitif menolak pengguna tanpa token atau role yang sesuai.
9. Jalankan `npm run build` dan periksa log server pada environment produksi.

---

Dokumen ini menjelaskan perilaku source saat ini, bukan jaminan bahwa konfigurasi bisnis, keamanan, dan formula marketplace sudah sesuai kebutuhan website tujuan. Lakukan audit sebelum deployment produksi.
