import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

export type Role = "ADMIN" | "MANAGER" | "CASHIER" | "USER";

export const ROLES: Role[] = ["ADMIN", "MANAGER", "CASHIER", "USER"];

export const ROLE_INFO: Record<Role, { name: string; title: string; badge: string; description: string }> = {
  ADMIN: {
    name: "ADMIN",
    title: "Sistem Yöneticisi",
    badge: "bg-purple-100 text-purple-800 border-purple-200",
    description: "Tüm sistem, yapılandırma, telemetri ve yönetim özelliklerine tam ve sınırsız erişim hakkı.",
  },
  MANAGER: {
    name: "MANAGER",
    title: "Şube / Mağaza Müdürü",
    badge: "bg-blue-100 text-blue-800 border-blue-200",
    description: "Sipariş yönetimi, fiyat güncelleme, stok inceleme ve şube bazlı operasyon yetkileri.",
  },
  CASHIER: {
    name: "CASHIER",
    title: "Kasa & Operasyon Görevlisi",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    description: "Sipariş karşılama, anlık teslimat, barkod arama ve temel operasyonel yetkiler.",
  },
  USER: {
    name: "USER",
    title: "Standart Personel",
    badge: "bg-gray-100 text-gray-700 border-gray-200",
    description: "Yalnızca izin verilen temel stok sorgulama ve katalog arama özellikleri.",
  },
};

export interface PermissionDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultRoles: Role[];
}

export interface PermissionCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_CATEGORIES: PermissionCategory[] = [
  {
    id: "dashboard",
    name: "Panel & Sistem Görünümleri",
    icon: "🖥️",
    description: "Sunucu izleme, donanım kaynakları ve genel sistem metrikleri erişimi",
    permissions: [
      {
        id: "dashboard.view",
        name: "Ana Panel & Sağlık Durumu",
        description: "Sunucu ana durumu, entegrasyon sağlık göstergeleri ve çalışma süresi (uptime) ekranını görüntüleme",
        category: "dashboard",
        defaultRoles: ["ADMIN", "MANAGER", "CASHIER", "USER"],
      },
      {
        id: "system.telemetry",
        name: "Donanım & Sistem Kaynakları",
        description: "CPU yükü, RAM bellek kullanımı, SSD depolama doluluğu ve işletim sistemi telemetrisini izleme",
        category: "dashboard",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
      {
        id: "logs.view",
        name: "API İstek Günlükleri (Logs)",
        description: "Gelen API isteklerini, istemci IP adreslerini, cevap sürelerini ve log geçmişini inceleme",
        category: "dashboard",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
      {
        id: "logs.clear",
        name: "Log Kayıtlarını Temizleme",
        description: "Kayıtlı tüm sistem API istek günlüklerini kalıcı olarak sıfırlama ve silme yetkisi",
        category: "dashboard",
        defaultRoles: ["ADMIN"],
      },
      {
        id: "settings.view",
        name: "Ayarlar Sayfasına Erişim",
        description: "Sunucu paneli ayarlar bölümüne, kullanıcı ve şube yönetimine giriş yapabilme",
        category: "dashboard",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "security",
    name: "Kullanıcı, Şube & Yetki Yönetimi",
    icon: "👥",
    description: "Personel hesapları, roller, şube atamaları ve RBAC yetki yapılandırması",
    permissions: [
      {
        id: "users.view",
        name: "Kullanıcı Listesini Görüntüleme",
        description: "Sistemde kayıtlı kullanıcıları, rolleri, şubeleri ve aktiflik durumlarını listeleme",
        category: "security",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
      {
        id: "users.manage",
        name: "Kullanıcı Ekleme / Düzenleme / Silme",
        description: "Yeni personel hesabı oluşturma, şifre belirleme, rol değiştirme ve kullanıcı silme",
        category: "security",
        defaultRoles: ["ADMIN"],
      },
      {
        id: "branches.view",
        name: "Şube Listesini Görüntüleme",
        description: "Sisteme kayıtlı Trendyol şubelerini, adres ve telefon bilgilerini görüntüleme",
        category: "security",
        defaultRoles: ["ADMIN", "MANAGER", "CASHIER", "USER"],
      },
      {
        id: "branches.manage",
        name: "Şube Ekleme & Yönetimi",
        description: "Yeni şube tanımlama, şube bilgilerini düzenleme ve şube durumunu (aktif/pasif) değiştirme",
        category: "security",
        defaultRoles: ["ADMIN"],
      },
      {
        id: "rbac.manage",
        name: "Rol Yetkilerini Yapılandırma (RBAC)",
        description: "Rollerin izin anahtarlarını switch'ler ile düzenleme, kaydetme ve sıfırlama",
        category: "security",
        defaultRoles: ["ADMIN"],
      },
    ],
  },
  {
    id: "orders",
    name: "Trendyol Sipariş & Mağaza Operasyonları",
    icon: "🛍️",
    description: "Canlı sipariş takibi, fiyat güncelleme, stok sorgulama ve iade süreçleri",
    permissions: [
      {
        id: "orders.view",
        name: "Siparişleri Görüntüleme & Arama",
        description: "Canlı sipariş akışı, geçmiş siparişler, müşteri detayları ve şube bazlı sipariş filtreleme",
        category: "orders",
        defaultRoles: ["ADMIN", "MANAGER", "CASHIER"],
      },
      {
        id: "orders.export",
        name: "Sipariş Raporu & Dışa Aktarma",
        description: "Sipariş listelerini Excel veya CSV formatında raporlama ve dışa aktarma",
        category: "orders",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
      {
        id: "stocks.view",
        name: "Stok & Envanter Sorgulama",
        description: "Şubelerdeki ürünlerin güncel stok miktarlarını, kritik stokları ve tükenenleri inceleme",
        category: "orders",
        defaultRoles: ["ADMIN", "MANAGER", "CASHIER", "USER"],
      },
      {
        id: "prices.update",
        name: "Satış Fiyatlarını Güncelleme",
        description: "Trendyol mağazasındaki ürünlerin satış fiyatlarını tekli veya toplu olarak değiştirme",
        category: "orders",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
      {
        id: "returns.view",
        name: "İade & İptal Talepleri",
        description: "Müşteri iade süreçlerini, iptal edilen siparişleri ve iptal nedenlerini inceleme",
        category: "orders",
        defaultRoles: ["ADMIN", "MANAGER", "CASHIER"],
      },
      {
        id: "reviews.view",
        name: "Müşteri Değerlendirmeleri & Yorumlar",
        description: "Şube bazlı müşteri yorumlarını, mağaza puanlarını ve değerlendirme istatistiklerini görme",
        category: "orders",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
      {
        id: "levels.view",
        name: "Satıcı Seviyesi & Komisyon Oranları",
        description: "Trendyol Go satıcı performans seviyelerini, komisyon baremlerini ve rozetleri izleme",
        category: "orders",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "catalog",
    name: "Katalog & Ürün Yönetimi",
    icon: "📦",
    description: "Barkod sorgulama, ürün kataloğu ve yeni ürün oluşturma",
    permissions: [
      {
        id: "catalog.search",
        name: "Barkod & Katalog Arama",
        description: "Veritabanından ve Trendyol kataloğundan barkod, model veya ürün adı ile arama yapabilme",
        category: "catalog",
        defaultRoles: ["ADMIN", "MANAGER", "CASHIER", "USER"],
      },
      {
        id: "catalog.create",
        name: "Yeni Ürün Tanımlama & Barkod Üretimi",
        description: "Kataloga yeni ürün ekleme ve sisteme kayıtlı otomatik EAN-13 barkod oluşturma",
        category: "catalog",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
    ],
  },
  {
    id: "integrations",
    name: "Entegrasyonlar & Operasyon Alarmları",
    icon: "🔔",
    description: "Telegram bildirimleri ve sistem API erişim anahtarları",
    permissions: [
      {
        id: "telegram.send",
        name: "Telegram Alarm & Bildirim Gönderme",
        description: "Operasyon gruplarına Telegram botu üzerinden canlı uyarı, stok alarmı ve sipariş mesajı atma",
        category: "integrations",
        defaultRoles: ["ADMIN", "MANAGER"],
      },
      {
        id: "keys.view",
        name: "Sistem API Anahtarlarını Görüntüleme",
        description: "X-Server-Key, Webhook bilgileri ve güvenli entegrasyon anahtarlarını görüntüleme / kopyalama",
        category: "integrations",
        defaultRoles: ["ADMIN"],
      },
    ],
  },
];

// Tüm izinlerin düz listesi
export const ALL_PERMISSIONS: PermissionDefinition[] = PERMISSION_CATEGORIES.flatMap(
  (cat) => cat.permissions
);

export type RolePermissionsMap = Record<Role, Record<string, boolean>>;

// Varsayılan İzin Matrisi Üreticisi
export function getDefaultRolePermissions(): RolePermissionsMap {
  const map: RolePermissionsMap = {
    ADMIN: {},
    MANAGER: {},
    CASHIER: {},
    USER: {},
  };

  for (const perm of ALL_PERMISSIONS) {
    for (const role of ROLES) {
      if (role === "ADMIN") {
        map.ADMIN[perm.id] = true;
      } else {
        map[role][perm.id] = perm.defaultRoles.includes(role);
      }
    }
  }

  return map;
}

// Dosya Fallback Yolu
const FALLBACK_FILE_PATH = path.join(process.cwd(), "lib", "rbac-store.json");

// İzinleri Oku
export async function getRolePermissions(): Promise<RolePermissionsMap> {
  const defaultMap = getDefaultRolePermissions();

  // 1. Prisma Veritabanından Oku
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: "rbac_permissions" },
    });

    if (setting?.value) {
      const parsed = JSON.parse(setting.value);
      return mergeWithDefaults(parsed, defaultMap);
    }
  } catch (dbErr) {
    // Veritabanı henüz hazır değilse sessizce yerel dosyaya geç
  }

  // 2. Yerel JSON Dosyasından Oku (Fallback)
  try {
    if (fs.existsSync(FALLBACK_FILE_PATH)) {
      const fileData = fs.readFileSync(FALLBACK_FILE_PATH, "utf-8");
      const parsed = JSON.parse(fileData);
      return mergeWithDefaults(parsed, defaultMap);
    }
  } catch (fsErr) {
    console.warn("RBAC yerel fallback dosyası okunamadı:", fsErr);
  }

  // 3. Varsayılan Harita
  return defaultMap;
}

// İzinleri Kaydet
export async function saveRolePermissions(newPermissions: Partial<RolePermissionsMap>): Promise<RolePermissionsMap> {
  const current = await getRolePermissions();

  // Birleştir
  const merged: RolePermissionsMap = {
    ADMIN: { ...current.ADMIN, ...(newPermissions.ADMIN || {}) },
    MANAGER: { ...current.MANAGER, ...(newPermissions.MANAGER || {}) },
    CASHIER: { ...current.CASHIER, ...(newPermissions.CASHIER || {}) },
    USER: { ...current.USER, ...(newPermissions.USER || {}) },
  };

  // ADMIN rolü güvenlik açısından her zaman tüm izinlere sahip kalır
  for (const perm of ALL_PERMISSIONS) {
    merged.ADMIN[perm.id] = true;
  }

  const jsonString = JSON.stringify(merged, null, 2);

  // 1. Prisma'ya Kaydet
  try {
    await prisma.appSetting.upsert({
      where: { key: "rbac_permissions" },
      create: {
        key: "rbac_permissions",
        value: jsonString,
        description: "Limon Rol Bazlı Erişim Denetimi (RBAC) Yetki Matrisi",
      },
      update: {
        value: jsonString,
      },
    });
  } catch (dbErr) {
    // DB hatası durumunda yerel dosya güvencesi devam eder
  }

  // 2. Yerel JSON Dosyasına Kaydet (Çift Güvence)
  try {
    fs.writeFileSync(FALLBACK_FILE_PATH, jsonString, "utf-8");
  } catch (fsErr) {
    console.warn("RBAC yerel fallback dosyasına yazılamadı:", fsErr);
  }

  return merged;
}

// Varsayılanlara Sıfırla
export async function resetRolePermissions(): Promise<RolePermissionsMap> {
  const defaultMap = getDefaultRolePermissions();
  const jsonString = JSON.stringify(defaultMap, null, 2);

  try {
    await prisma.appSetting.upsert({
      where: { key: "rbac_permissions" },
      create: {
        key: "rbac_permissions",
        value: jsonString,
        description: "Limon Rol Bazlı Erişim Denetimi (RBAC) Yetki Matrisi",
      },
      update: {
        value: jsonString,
      },
    });
  } catch {}

  try {
    fs.writeFileSync(FALLBACK_FILE_PATH, jsonString, "utf-8");
  } catch {}

  return defaultMap;
}

// Belirli bir rolün aktif izin listesini dizi olarak dön
export async function getUserPermissions(role?: string | null): Promise<string[]> {
  if (!role) return [];
  const validRole = role.toUpperCase() as Role;
  if (!ROLES.includes(validRole)) return [];

  if (validRole === "ADMIN") {
    return ALL_PERMISSIONS.map((p) => p.id);
  }

  const map = await getRolePermissions();
  const rolePerms = map[validRole] || {};

  return Object.entries(rolePerms)
    .filter(([_, allowed]) => allowed === true)
    .map(([id]) => id);
}

// Belirli bir rolün belirli bir izne sahip olup olmadığını kontrol et
export async function hasPermission(role: string | null | undefined, permissionId: string): Promise<boolean> {
  if (!role) return false;
  const validRole = role.toUpperCase() as Role;
  if (validRole === "ADMIN") return true;

  const map = await getRolePermissions();
  return !!(map[validRole] && map[validRole][permissionId]);
}

// Yardımcı: Eksik yeni izinler varsa varsayılanla tamamla
function mergeWithDefaults(saved: any, defaults: RolePermissionsMap): RolePermissionsMap {
  const result = { ...defaults };
  if (!saved || typeof saved !== "object") return result;

  for (const role of ROLES) {
    if (saved[role] && typeof saved[role] === "object") {
      result[role] = {
        ...defaults[role],
        ...saved[role],
      };
    }
  }

  // Admin daima tam yetkili
  for (const perm of ALL_PERMISSIONS) {
    result.ADMIN[perm.id] = true;
  }

  return result;
}
