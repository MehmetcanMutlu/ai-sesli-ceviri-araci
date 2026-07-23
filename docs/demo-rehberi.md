# Demo Rehberi

Bu rehber, projeyi jüriye veya eğitmene kısa ve etkili şekilde göstermek için hazırlanmıştır.

## 1. Açılış

Projeyi şu komutla çalıştırın:

```bash
python3 -m http.server 5173
```

Tarayıcıda `http://localhost:5173` adresini açın.

## 2. Türkçe OCR Kanıtı

Deneme Merkezi'nden `Türkçe karakter` örneğini çalıştırın.

Beklenen sonuç:

- `TÜRKÇE İÇİN`
- `ÇAĞRI GÜNÜ ŞİMDİ`
- OCR kalite skoru
- Dosya adı ve boyut bilgisi
- Satır, kelime ve tahmini okuma süresi

## 3. Düşük Kontrast Senaryosu

`Düşük kontrast` örneğini çalıştırın. Bu bölüm, görüntü iyileştirme katmanının gerçek ihtiyacını anlatmak için uygundur.

## 4. Seslendirme

Çıkarılan metni düzenleyin ve `Seslendir` butonuna basın. Duraklat, sürdür ve durdur akışını gösterin.

## 5. Raporlama

OCR sonucundan sonra `OCR raporunu kopyala` butonunu kullanın. Bu rapor kalite skoru, dil, dosya bilgisi ve çıkarılan metni tek yerde toplar.

## 6. Test Kanıtı

Teknik değerlendirme için şu komutu gösterin:

```bash
npm test
```

Bu komut statik kontrolleri ve tarayıcı tabanlı smoke testleri çalıştırır.
