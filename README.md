# ai-sesli-ceviri-araci

Fotoğraftaki yazıları okuyup metne çeviren ve metni sesli okuyan web uygulaması.

## Özellikler

- Fotoğraf yükleme veya mobil cihazda kameradan çekme
- Türkçe ve İngilizce ağırlıklı OCR desteği
- OCR öncesi otomatik görüntü iyileştirme
- OCR kalite skoru ve düşük kalite uyarıları
- Metin analizi: satır, kelime ve tahmini okuma süresi
- Dil, görüntü iyileştirme ve ses ayarlarını tarayıcıda hatırlama
- Büyük veya görsel olmayan dosyalar için yükleme kontrolü
- Hazır demo testleri: Türkçe karakter, İngilizce, düşük kontrast ve metin seslendirme
- Çıkarılan metni düzenleme
- Yazıyı tarayıcı sesiyle seslendirme
- Ses, hız ve ton seçimi
- Metni kopyalama veya `.txt` olarak indirme

## Çalıştırma

Bu sürüm derleme adımı gerektirmez. Proje klasöründe yerel bir sunucu açın:

```bash
python3 -m http.server 5173
```

Ardından tarayıcıda şu adresi açın:

```text
http://localhost:5173
```

Alternatif olarak Node.js varsa:

```bash
npm run dev
```

## Test

Playwright smoke testlerini çalıştırmak için:

```bash
npm install
npm run check
npm test
```

Testler sayfanın açıldığını, temel buton durumlarını, ayar kalıcılığını, metin analizini, mobil taşma olmadığını, Türkçe/İngilizce OCR örneklerini ve düşük kontrast iyileştirme akışını kontrol eder.

## Teknoloji

- HTML, CSS ve JavaScript
- OCR için Tesseract.js
- Metinden sese çeviri için Web Speech API
- Smoke test için Playwright

## Notlar

OCR işlemi tarayıcı tarafında çalışır. İlk kullanımda Tesseract.js ve dil dosyaları CDN üzerinden indirilir; bu nedenle internet bağlantısı gerekir. Bu V2 sürümünde harici OCR API kullanılmaz; fotoğraflar üçüncü taraf OCR servisine gönderilmez.
