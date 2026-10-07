import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { BRANCHES } from "../lib/branches";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Veritabanı tohumlama (seed) başlatılıyor...");

  // 1. Şubeleri ekle / güncelle (upsert)
  console.log("📍 Şubeler ekleniyor...");
  for (const [id, name] of Object.entries(BRANCHES)) {
    await prisma.branch.upsert({
      where: { id },
      update: { name, isActive: true },
      create: {
        id,
        name,
        isActive: true,
      },
    });
  }
  console.log(`✅ ${Object.keys(BRANCHES).length} şube kaydedildi.`);

  // 2. Varsayılan Admin ve Kullanıcıları Ekle
  const defaultPassword = process.env.ADMIN_PASSWORD || "Trendyolpanel55.";
  const hashedAdminPassword = await bcrypt.hash(defaultPassword, 10);
  const hashedUserPassword = await bcrypt.hash("123456", 10);

  console.log("👤 Kullanıcılar ekleniyor...");

  // Ana Admin
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      name: "Sistem Yöneticisi",
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      username: "admin",
      name: "Sistem Yöneticisi",
      password: hashedAdminPassword,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  // Genel Yönetici
  await prisma.user.upsert({
    where: { username: "yonetici" },
    update: {
      name: "Operasyon Yöneticisi",
      role: Role.MANAGER,
      isActive: true,
    },
    create: {
      username: "yonetici",
      name: "Operasyon Yöneticisi",
      password: hashedAdminPassword,
      role: Role.MANAGER,
      isActive: true,
    },
  });

  // Şube Kasiyerleri / Temsilcileri
  const sampleUsers = [
    { username: "atakum_kasa", name: "Atakum Gross Kasa", branchId: "479045", role: Role.CASHIER },
    { username: "baris_kasa", name: "Barış Şube Kasa", branchId: "479052", role: Role.CASHIER },
    { username: "denizevleri_kasa", name: "Denizevleri Kasa", branchId: "479048", role: Role.CASHIER },
    { username: "durusehir_kasa", name: "Duruşehir Kasa", branchId: "479063", role: Role.CASHIER },
    { username: "limon1_kasa", name: "Limon 1 Kasa", branchId: "157108", role: Role.CASHIER },
  ];

  for (const u of sampleUsers) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {
        name: u.name,
        branchId: u.branchId,
        role: u.role,
        isActive: true,
      },
      create: {
        username: u.username,
        name: u.name,
        password: hashedUserPassword,
        branchId: u.branchId,
        role: u.role,
        isActive: true,
      },
    });
  }

  console.log("✅ Örnek kullanıcılar başarıyla oluşturuldu.");
  console.log("🚀 Tohumlama tamamlandı!");
}

main()
  .catch((e) => {
    console.error("❌ Tohumlama hatası:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
