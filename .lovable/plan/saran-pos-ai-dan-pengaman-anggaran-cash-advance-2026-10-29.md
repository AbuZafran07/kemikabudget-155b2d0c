# Saran Pos AI dan Pengaman Anggaran Cash Advance

## Hasil yang ditambahkan

### 1. Saran pos berdasarkan uraian kebutuhan
- Gunakan kolom Keperluan CA yang sudah ada; tidak perlu memasukkan uraian dua kali.
- Tambahkan tombol **Sarankan Pos dengan AI**. Lovable AI menyarankan kategori/pos untuk rincian kebutuhan berdasarkan daftar pos pada divisi dan periode anggaran yang tersedia.
- Tampilkan nama pos, alasan singkat, dan saldo tersedia. Pemohon memilih apakah akan menerapkan saran; saran tidak mengubah rincian atau mengirim pengajuan secara otomatis.
- AI tidak membuat pos baru dan tidak memindahkan pembebanan otomatis ke pos yang tidak sesuai hanya karena saldonya lebih besar.
- Tampilkan proses, hasil, dan kegagalan dengan jelas; input pemohon tetap tersimpan di formulir. Penggunaan Lovable AI memakai kredit workspace.

### 2. Kunci pengajuan sejak nominal diisi
- Hitung saldo tersedia per pos: alokasi dikurangi pemakaian tercatat dan komitmen CA yang masih aktif, tanpa menghitung pemakaian yang sama dua kali.
- Jumlahkan semua baris yang memakai pos sama, termasuk nominal pada baris yang uraiannya belum lengkap.
- Tampilkan nilai kebutuhan, saldo tersedia, dan kekurangan per pos langsung saat angka berubah.
- Kunci **Ajukan** apabila ada pos kurang, pos tidak tersedia, atau saldo belum berhasil dimuat. **Simpan Draft** tetap tersedia untuk rincian yang valid meskipun anggarannya kurang.
- Muat ulang saldo berkala dan saat hendak mengajukan. Pemeriksaan saat realisasi tetap ada jika nilai realisasi bertambah.

### 3. Aman ketika dikirim bersamaan
- Periksa ulang saldo dan cadangkan anggaran dalam satu transaksi saat pengiriman CA.
- Kunci pos terkait dalam urutan konsisten agar dua pengajuan bersamaan tidak memakai sisa anggaran yang sama.
- Tolak seluruh pengajuan jika salah satu pos tidak cukup; jangan mencatat komitmen sebagian, memotong kas, atau meninggalkan status diajukan yang gagal.
- Pengajuan dari halaman detail juga harus mengikuti pengaman yang sama.

## Detail teknis
- Lanjutkan komitmen CA melalui `budget_ledger`; telusuri aturan yang sudah berjalan sebelum mengubah `submit_cash_advance` untuk menghindari pencadangan ganda.
- Gunakan pembacaan saldo bersama untuk formulir dan daftar pos AI, dengan pemeriksaan sesi, divisi, dan periode di server.
- Panggilan AI berada pada Edge Function terautentikasi melalui AI Gateway, AI SDK Responses streaming, dan model default `openai/gpt-6-astra`.
- Ambil pilihan pos dari database menggunakan hak akses pemohon; validasi semua ID hasil AI terhadap pilihan tersebut. Jangan mengirim data bank, identitas pribadi, atau dokumen lampiran ke model.
- Pertahankan aturan akses, persetujuan, pembayaran, revisi, dan histori yang sudah ada. Tangani kegagalan AI tanpa pengulangan otomatis untuk kegagalan permanen.

## Pengujian
- Nominal di bawah saldo, tepat sama dengan saldo, dan melebihi saldo.
- Dua baris dalam pos sama; CA multi-pos dengan satu pos tidak cukup; komitmen CA lain mengurangi saldo tersedia.
- Simpan draft saat kekurangan dan larangan mengajukan saat saldo gagal dimuat.
- Dua pengiriman bersamaan yang bersama-sama melebihi saldo: hanya pengajuan yang masih cukup yang berhasil.
- Saran AI melalui panggilan nyata: pilihan hanya dari pos yang diizinkan dan penerapan memerlukan pilihan pemohon.
- Uji formulir dengan sesi pengguna dan pastikan perubahan terbaca kembali melalui aplikasi; laporkan bagian yang tidak dapat diverifikasi.
