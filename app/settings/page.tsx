"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SystemData {
  cpu: {
    model: string;
    cores: number;
    usagePercent: number;
    loadAverage: number[];
    arch: string;
  };
  memory: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    usagePercent: number;
    nodeHeapUsedMb: number;
    nodeHeapTotalMb: number;
    nodeRssMb: number;
  };
  disk: {
    totalGb: number;
    usedGb: number;
    freeGb: number;
    usagePercent: number;
    path: string;
  };
  os: {
    platform: string;
    type: string;
    release: string;
    hostname: string;
    systemUptimeSeconds: number;
    processUptimeSeconds: number;
    nodeVersion: string;
    pid: number;
  };
}

interface UserItem {
  id: string;
  username: string;
  name: string;
  role: string;
  branchId: string | null;
  branch: { id: string; name: string } | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface BranchItem {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  isActive: boolean;
  _count?: { users: number };
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"system" | "users" | "branches">("system");
  const [system, setSystem] = useState<SystemData | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // New User Form State
  const [newUser, setNewUser] = useState({
    username: "",
    name: "",
    password: "",
    role: "USER",
    branchId: "",
  });

  // New Branch Form State
  const [newBranch, setNewBranch] = useState({
    id: "",
    name: "",
    address: "",
    phone: "",
  });

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  // Fetch Hardware / System Info
  const fetchSystem = useCallback(async () => {
    try {
      const res = await fetch("/api/system", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setSystem(data);
      }
    } catch (e) {
      console.error("Sistem bilgileri alınamadı:", e);
    }
  }, []);

  // Fetch Users
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/users", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (e) {
      console.error("Kullanıcılar alınamadı:", e);
    }
  }, []);

  // Fetch Branches
  const fetchBranches = useCallback(async () => {
    try {
      const res = await fetch("/api/branches", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setBranches(data.branches);
      }
    } catch (e) {
      console.error("Şubeler alınamadı:", e);
    }
  }, []);

  useEffect(() => {
    fetchSystem();
    fetchUsers();
    fetchBranches();
  }, [fetchSystem, fetchUsers, fetchBranches]);

  // Periodic refresh for system hardware
  useEffect(() => {
    if (activeTab !== "system") return;
    const interval = setInterval(fetchSystem, 3000);
    return () => clearInterval(interval);
  }, [activeTab, fetchSystem]);

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.success) {
        showMsg("Kullanıcı başarıyla oluşturuldu.");
        setNewUser({ username: "", name: "", password: "", role: "USER", branchId: "" });
        fetchUsers();
      } else {
        showMsg(data.message || "Hata oluştu.", "error");
      }
    } catch (e: any) {
      showMsg("Kullanıcı oluşturulamadı: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Toggle User Active
  const handleToggleUserActive = async (user: UserItem) => {
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, isActive: !user.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg(`Kullanıcı durumu ${!user.isActive ? "Aktif" : "Pasif"} yapıldı.`);
        fetchUsers();
      }
    } catch (e: any) {
      showMsg("Hata: " + e.message, "error");
    }
  };

  // Delete User
  const handleDeleteUser = async (id: string, username: string) => {
    if (!confirm(`"${username}" kullanıcısını silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showMsg("Kullanıcı silindi.");
        fetchUsers();
      } else {
        showMsg(data.message || "Silinemedi.", "error");
      }
    } catch (e: any) {
      showMsg("Hata: " + e.message, "error");
    }
  };

  // Create Branch
  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newBranch),
      });
      const data = await res.json();
      if (data.success) {
        showMsg("Şube başarıyla kaydedildi.");
        setNewBranch({ id: "", name: "", address: "", phone: "" });
        fetchBranches();
      } else {
        showMsg(data.message || "Hata oluştu.", "error");
      }
    } catch (e: any) {
      showMsg("Şube kaydedilemedi: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // Toggle Branch Active
  const handleToggleBranchActive = async (branch: BranchItem) => {
    try {
      const res = await fetch("/api/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: branch.id, isActive: !branch.isActive }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg(`Şube ${!branch.isActive ? "Aktif" : "Pasif"} yapıldı.`);
        fetchBranches();
      }
    } catch (e: any) {
      showMsg("Hata: " + e.message, "error");
    }
  };

  // Delete Branch
  const handleDeleteBranch = async (id: string, name: string) => {
    if (!confirm(`"${name}" (${id}) şubesini silmek istediğinize emin misiniz?`)) return;
    try {
      const res = await fetch(`/api/branches?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showMsg("Şube silindi.");
        fetchBranches();
      } else {
        showMsg(data.message || "Silinemedi.", "error");
      }
    } catch (e: any) {
      showMsg("Hata: " + e.message, "error");
    }
  };

  // Logout
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    if (typeof window !== "undefined") {
      localStorage.removeItem("limon_user");
      localStorage.removeItem("limon_token");
    }
    router.push("/login");
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days} gün, ${hours} saat, ${mins} dk`;
    return `${hours} saat, ${mins} dk`;
  };

  return (
    <div className="w-full min-h-screen bg-white text-gray-900 font-sans antialiased">
      {/* Header */}
      <header className="w-full border-b border-gray-200 bg-white">
        <div className="w-full px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold px-2.5 py-1.5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 transition"
            >
              ← Durum Paneli
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 leading-tight">
                Sunucu Yönetimi & Ayarlar
              </h1>
              <p className="text-xs text-gray-500">
                Donanım telemetrisi, kullanıcı rolleri ve şube veritabanı yönetimi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Link
              href="/logs"
              className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition"
            >
              İstek Logları
            </Link>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-medium transition"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-8 py-6 space-y-6">
        
        {/* Flash Message Banner */}
        {message && (
          <div
            className={`p-3 rounded text-xs border ${
              message.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="w-full flex items-center gap-2 border-b border-gray-200 pb-3">
          <button
            onClick={() => setActiveTab("system")}
            className={`px-4 py-2 rounded text-xs font-medium transition flex items-center gap-2 ${
              activeTab === "system"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span>🖥️</span>
            <span>Sistem & Donanım Kaynakları</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded text-xs font-medium transition flex items-center gap-2 ${
              activeTab === "users"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span>👥</span>
            <span>Kullanıcı Yönetimi ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("branches")}
            className={`px-4 py-2 rounded text-xs font-medium transition flex items-center gap-2 ${
              activeTab === "branches"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span>📍</span>
            <span>Şube Yönetimi ({branches.length})</span>
          </button>
        </div>

        {/* TAB 1: HARDWARE & SYSTEM TELEMETRY */}
        {activeTab === "system" && (
          <div className="space-y-6">
            
            {/* System Resource Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* CPU Tile */}
              <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase">İşlemci (CPU)</span>
                  <span className="text-xs font-bold text-indigo-600">
                    %{system?.cpu?.usagePercent || 0} Yük
                  </span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {system?.cpu?.cores || 1} Çekirdek
                </div>
                {/* Meter */}
                <div className="w-full bg-gray-100 h-2 rounded overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded transition-all duration-300"
                    style={{ width: `${system?.cpu?.usagePercent || 5}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 space-y-1 pt-1 border-t border-gray-100">
                  <div className="truncate" title={system?.cpu?.model}>
                    {system?.cpu?.model || "İşlemci yükleniyor..."}
                  </div>
                  <div>Load Avg: {system?.cpu?.loadAverage?.join(" • ") || "0"}</div>
                </div>
              </div>

              {/* RAM Tile */}
              <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Bellek (RAM)</span>
                  <span className="text-xs font-bold text-emerald-600">
                    %{system?.memory?.usagePercent || 0} Dolu
                  </span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {system?.memory?.usedGb || 0} GB <span className="text-xs text-gray-500 font-normal">/ {system?.memory?.totalGb || 0} GB</span>
                </div>
                {/* Meter */}
                <div className="w-full bg-gray-100 h-2 rounded overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full rounded transition-all duration-300"
                    style={{ width: `${system?.memory?.usagePercent || 10}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 space-y-1 pt-1 border-t border-gray-100">
                  <div>Boş RAM: {system?.memory?.freeGb || 0} GB</div>
                  <div>Node Heap: {system?.memory?.nodeHeapUsedMb || 0} MB ({system?.memory?.nodeRssMb || 0} MB RSS)</div>
                </div>
              </div>

              {/* SSD / Disk Tile */}
              <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase">SSD / Disk Alanı</span>
                  <span className="text-xs font-bold text-amber-600">
                    %{system?.disk?.usagePercent || 0} Dolu
                  </span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {system?.disk?.usedGb || 0} GB <span className="text-xs text-gray-500 font-normal">/ {system?.disk?.totalGb || 0} GB</span>
                </div>
                {/* Meter */}
                <div className="w-full bg-gray-100 h-2 rounded overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded transition-all duration-300"
                    style={{ width: `${system?.disk?.usagePercent || 15}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 space-y-1 pt-1 border-t border-gray-100">
                  <div>Kullanılabilir Boş: {system?.disk?.freeGb || 0} GB</div>
                  <div className="truncate text-[11px]" title={system?.disk?.path}>
                    {system?.disk?.path}
                  </div>
                </div>
              </div>

              {/* OS & Runtime Tile */}
              <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500 uppercase">Sunucu & Çalışma</span>
                  <span className="text-xs font-bold text-gray-700">
                    PID #{system?.os?.pid || "-"}
                  </span>
                </div>
                <div className="text-lg font-bold text-gray-900">
                  {system?.os?.platform === "win32" ? "Windows" : system?.os?.platform === "linux" ? "Linux (Ubuntu)" : system?.os?.platform}
                </div>
                <div className="text-xs text-gray-600 space-y-1 pt-2 border-t border-gray-100">
                  <div>Node.js {system?.os?.nodeVersion}</div>
                  <div>Sistem Uptime: {formatUptime(system?.os?.systemUptimeSeconds || 0)}</div>
                  <div>Süreç Uptime: {formatUptime(system?.os?.processUptimeSeconds || 0)}</div>
                </div>
              </div>

            </div>

            {/* Detailed System Specifications Table */}
            <div className="bg-white border border-gray-200 rounded p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">
                Ayrıntılı Sunucu Donanım Bilgileri
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-1">
                  <span className="text-gray-500">İşletim Sistemi Hostname</span>
                  <p className="font-semibold text-gray-900">{system?.os?.hostname || "-"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-1">
                  <span className="text-gray-500">Çekirdek (Kernel) Release</span>
                  <p className="font-semibold text-gray-900">{system?.os?.release || "-"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-1">
                  <span className="text-gray-500">İşlemci Mimarisi</span>
                  <p className="font-semibold text-gray-900">{system?.cpu?.arch || "-"}</p>
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-1">
                  <span className="text-gray-500">Node.js Heap Toplamı</span>
                  <p className="font-semibold text-gray-900">{system?.memory?.nodeHeapTotalMb} MB</p>
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-1">
                  <span className="text-gray-500">Node.js RSS Bellek</span>
                  <p className="font-semibold text-gray-900">{system?.memory?.nodeRssMb} MB</p>
                </div>
                <div className="p-3 bg-gray-50 rounded border border-gray-200 space-y-1">
                  <span className="text-gray-500">Sunucu Durumu</span>
                  <p className="font-semibold text-emerald-600">● 7/24 Aktif & Çalışıyor</p>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: USER MANAGEMENT */}
        {activeTab === "users" && (
          <div className="space-y-6">
            
            {/* New User Form Card */}
            <div className="bg-white border border-gray-200 rounded p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">
                Yeni Kullanıcı Ekle
              </h3>
              <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block text-gray-600 mb-1">Kullanıcı Adı *</label>
                  <input
                    type="text"
                    required
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="ornek_kasa"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 mb-1">Ad Soyad *</label>
                  <input
                    type="text"
                    required
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="Ahmet Yılmaz"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 mb-1">Şifre *</label>
                  <input
                    type="password"
                    required
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 mb-1">Rol</label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600 bg-white"
                  >
                    <option value="USER">USER (Standart)</option>
                    <option value="CASHIER">CASHIER (Kasa Personeli)</option>
                    <option value="MANAGER">MANAGER (Şube Yöneticisi)</option>
                    <option value="ADMIN">ADMIN (Tam Yetkili)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-600 mb-1">Bağlı Şube</label>
                  <select
                    value={newUser.branchId}
                    onChange={(e) => setNewUser({ ...newUser, branchId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600 bg-white"
                  >
                    <option value="">Merkez / Şubesiz</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-5 flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-gray-900 hover:bg-black text-white font-medium rounded transition disabled:opacity-50"
                  >
                    {loading ? "Kaydediliyor..." : "+ Kullanıcıyı Kaydet"}
                  </button>
                </div>
              </form>
            </div>

            {/* Users Table */}
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  Kayıtlı Kullanıcılar Listesi ({users.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 text-gray-600 uppercase font-semibold text-[11px] border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3">Kullanıcı Adı</th>
                      <th className="px-4 py-3">İsim</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Bağlı Şube</th>
                      <th className="px-4 py-3">Son Giriş</th>
                      <th className="px-4 py-3">Durum</th>
                      <th className="px-4 py-3 text-right">Eylemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-gray-900">
                          {u.username}
                        </td>
                        <td className="px-4 py-3 text-gray-800">
                          {u.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === "ADMIN"
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : u.role === "MANAGER"
                                ? "bg-blue-50 text-blue-700 border border-blue-200"
                                : u.role === "CASHIER"
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-gray-100 text-gray-700 border border-gray-200"
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {u.branch ? `${u.branch.name} (${u.branch.id})` : <span className="text-gray-400">Merkez</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-[11px]">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("tr-TR") : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              u.isActive
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {u.isActive ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleToggleUserActive(u)}
                            className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 text-[11px]"
                          >
                            {u.isActive ? "Pasif Yap" : "Aktif Yap"}
                          </button>
                          {u.username !== "admin" && (
                            <button
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[11px]"
                            >
                              Sil
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: BRANCH MANAGEMENT */}
        {activeTab === "branches" && (
          <div className="space-y-6">
            
            {/* New Branch Form Card */}
            <div className="bg-white border border-gray-200 rounded p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">
                Yeni Şube Ekle / Tanımla
              </h3>
              <form onSubmit={handleCreateBranch} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-gray-600 mb-1">Şube Kodu (Trendyol Store ID) *</label>
                  <input
                    type="text"
                    required
                    value={newBranch.id}
                    onChange={(e) => setNewBranch({ ...newBranch, id: e.target.value })}
                    placeholder="479045"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 mb-1">Şube Adı *</label>
                  <input
                    type="text"
                    required
                    value={newBranch.name}
                    onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                    placeholder="Atakum Gross"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 mb-1">Adres</label>
                  <input
                    type="text"
                    value={newBranch.address}
                    onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                    placeholder="Atakum, Samsun"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-gray-600 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={newBranch.phone}
                    onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                    placeholder="0362..."
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-4 flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-gray-900 hover:bg-black text-white font-medium rounded transition disabled:opacity-50"
                  >
                    {loading ? "Kaydediliyor..." : "+ Şubeyi Kaydet"}
                  </button>
                </div>
              </form>
            </div>

            {/* Branches Table */}
            <div className="bg-white border border-gray-200 rounded overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  Kayıtlı Şubeler Listesi ({branches.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-gray-50 text-gray-600 uppercase font-semibold text-[11px] border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 w-32">Şube Kodu (ID)</th>
                      <th className="px-4 py-3">Şube Adı</th>
                      <th className="px-4 py-3">Adres</th>
                      <th className="px-4 py-3">Telefon</th>
                      <th className="px-4 py-3 w-28">Kullanıcı Sayısı</th>
                      <th className="px-4 py-3 w-24">Durum</th>
                      <th className="px-4 py-3 text-right">Eylemler</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {branches.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-gray-900">
                          {b.id}
                        </td>
                        <td className="px-4 py-3 text-gray-800 font-medium">
                          {b.name}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {b.address || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono">
                          {b.phone || "-"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {b._count?.users || 0} Kullanıcı
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              b.isActive
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}
                          >
                            {b.isActive ? "Aktif" : "Pasif"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <button
                            onClick={() => handleToggleBranchActive(b)}
                            className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 text-[11px]"
                          >
                            {b.isActive ? "Pasif Yap" : "Aktif Yap"}
                          </button>
                          <button
                            onClick={() => handleDeleteBranch(b.id, b.name)}
                            className="px-2 py-1 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[11px]"
                          >
                            Sil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="w-full border-t border-gray-200 bg-white py-4 mt-8 text-xs text-gray-500">
        <div className="w-full px-4 sm:px-8 flex items-center justify-between">
          <div>
            <strong>Limon Central Server</strong> • Sistem Kaynakları & Veritabanı Yönetimi
          </div>
          <div>
            Limon Systems Admin Console
          </div>
        </div>
      </footer>
    </div>
  );
}
