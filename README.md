# 🍋 Limon Central API Server

Bu proje; **Limon Panel (Masaüstü/Electron)** ve **Limon Mobile** uygulamaları için geliştirilmiş **Merkezi API, Güvenlik ve Entegrasyon Sunucusudur**.

---

## 🎯 Mimari Amaç ve Avantajlar

1. **Güvenlik (Zero-Secrets on Client):**
   - Masaüstü uygulaması veya mobil uygulama hiçbir Trendyol API şifresi, Redis bağlantısı veya GitHub tokenı barındırmaz.
   - Tüm hassas anahtarlar yalnızca bu sunucunun `.env.local` dosyasında saklanır.
2. **Merkezi Oturum & Yetkilendirme:**
   - İstemciler `X-Server-Key` veya `Bearer JWT` token ile sunucuya bağlanır.
   - Oturumlar ve kullanıcı rolleri tek bir noktadan yönetilir.
3. **Canlı Webhook Alıcısı:**
   - Trendyol canlı sipariş webhook'ları doğrudan bu sunucuya gelir. Masaüstü bilgisayarınız kapalı olsa bile siparişler sunucuda kaydedilir.
4. **GitHub Auto-Update Proxy:**
   - Masaüstü uygulaması doğrudan GitHub API ile konuşmak zorunda kalmaz. Sunucu üzerindeki `/api/updates/check` ve `/api/updates/download` uç noktaları üzerinden güncellemeleri güvenle dağıtır.

---

## 🚀 Başlatma

Geliştirme modu (Varsayılan Port: **3001**):
```bash
npm run dev
```

Prodüksiyon modu:
```bash
npm run build
npm run start
```

---

## 📡 API Uç Noktaları

| Metot | Uç Nokta | Yetki | Açıklama |
|---|---|---|---|
| `GET` | `/api/health` | Açık | Sunucu sağlık ve entegrasyon durumu |
| `POST` | `/api/auth/login` | Açık | Admin/Kullanıcı giriş ve JWT üretimi |
| `GET` | `/api/siparisler` | `X-Server-Key` / JWT | Trendyol Go siparişleri listesi ve filtreleme |
| `GET` | `/api/siparisler/all` | `X-Server-Key` / JWT | Tüm şube siparişlerinin toplu çekimi |
| `GET` | `/api/stoklar` | `X-Server-Key` / JWT | Şube bazlı stok ve ürün sorgulama |
| `POST` | `/api/fiyat-guncelle` | `X-Server-Key` / JWT | Trendyol ürün fiyat güncelleme |
| `GET` | `/api/iadeler` | `X-Server-Key` / JWT | İade talepleri ve durumları |
| `GET` | `/api/barkod-bul` | `X-Server-Key` / JWT | Barkod ve ürün arama |
| `POST` | `/api/urun-ekle` | `X-Server-Key` / JWT | Yeni ürün ekleme ve barkod üretimi |
| `GET` | `/api/subeler` | `X-Server-Key` / JWT | Aktif şube bilgileri ve durumları |
| `GET` | `/api/reviews` | `X-Server-Key` / JWT | Müşteri yorumları |
| `GET` | `/api/seviyeler` | `X-Server-Key` / JWT | Trendyol Go seviye ve komisyon metrikleri |
| `POST` | `/api/trendyol-webhook` | Basic Auth | Trendyol canlı sipariş webhook alıcısı |
| `POST` | `/api/telegram` | `X-Server-Key` / JWT | Telegram bildirim gönderme servisi |
| `GET` | `/api/updates/check` | Açık | GitHub son sürüm denetleyicisi |
| `GET` | `/api/updates/download` | Açık | Yeni sürüm kurulum dosyası indirme köprüsü |

---

## 🔗 İstemci (Panel & Mobil) Bağlantısı

İstemcilerinizin `.env.local` dosyasında sadece şu iki değişken yeterlidir:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
X_SERVER_KEY=limon_sec_k98f234_main_server_key_2026
```