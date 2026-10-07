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

interface RbacPermissionItem {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface RbacCategoryItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  permissions: RbacPermissionItem[];
}

interface RbacData {
  roles: Array<"ADMIN" | "MANAGER" | "CASHIER" | "USER">;
  roleInfo: Record<string, { name: string; title: string; badge: string; description: string }>;
  categories: RbacCategoryItem[];
  permissions: Record<string, Record<string, boolean>>;
}

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"system" | "users" | "branches" | "rbac">("system");
  const [system, setSystem] = useState<SystemData | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // RBAC State
  const [rbacData, setRbacData] = useState<RbacData | null>(null);
  const [rbacSelectedRole, setRbacSelectedRole] = useState<"ADMIN" | "MANAGER" | "CASHIER" | "USER">("MANAGER");
  const [rbacPermissions, setRbacPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [rbacSearch, setRbacSearch] = useState("");
  const [rbacSaving, setRbacSaving] = useState(false);
  const [rbacHasChanges, setRbacHasChanges] = useState(false);

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

  // Fetch RBAC Matrix
  const fetchRbac = useCallback(async () => {
    try {
      const res = await fetch("/api/rbac", { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setRbacData(data);
        setRbacPermissions(data.permissions);
        setRbacHasChanges(false);
      }
    } catch (e) {
      console.error("RBAC verileri alınamadı:", e);
    }
  }, []);

  useEffect(() => {
    fetchSystem();
    fetchUsers();
    fetchBranches();
    fetchRbac();
  }, [fetchSystem, fetchUsers, fetchBranches, fetchRbac]);

  // Periodic refresh for system hardware
  useEffect(() => {
    if (activeTab !== "system") return;
    const interval = setInterval(fetchSystem, 3000);
    return () => clearInterval(interval);
  }, [activeTab, fetchSystem]);

  // RBAC: Switch İzin Değiştirici
  const handleTogglePermission = (role: string, permId: string) => {
    if (role === "ADMIN") {
      showMsg("Sistem Yöneticisi (ADMIN) rolü güvenlik nedeniyle tüm yetkilere tam ve sınırsız sahiptir.", "error");
      return;
    }
    setRbacPermissions((prev) => {
      const currentRolePerms = prev[role] || {};
      const currentVal = !!currentRolePerms[permId];
      return {
        ...prev,
        [role]: {
          ...currentRolePerms,
          [permId]: !currentVal,
        },
      };
    });
    setRbacHasChanges(true);
  };

  // RBAC: Toplu İzin Açma / Kapatma
  const handleBatchPermissions = (role: string, allowAll: boolean) => {
    if (role === "ADMIN") {
      showMsg("ADMIN rolü zaten tüm izinlere sahiptir.", "error");
      return;
    }
    if (!rbacData) return;
    const allIds = rbacData.categories.flatMap((c) => c.permissions.map((p) => p.id));
    setRbacPermissions((prev) => {
      const updatedRoleMap: Record<string, boolean> = {};
      allIds.forEach((id) => {
        updatedRoleMap[id] = allowAll;
      });
      return {
        ...prev,
        [role]: updatedRoleMap,
      };
    });
    setRbacHasChanges(true);
  };

  // RBAC: İzinleri Kaydet
  const handleSaveRbac = async () => {
    setRbacSaving(true);
    try {
      const res = await fetch("/api/rbac", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: rbacSelectedRole,
          permissions: rbacPermissions[rbacSelectedRole],
        }),
      });
      const data = await res.json();
      if (data.success) {
        showMsg(`${rbacSelectedRole} rolünün yetkileri başarıyla güncellendi ve kaydedildi.`);
        setRbacPermissions(data.permissions);
        setRbacHasChanges(false);
      } else {
        showMsg(data.message || "Yetkiler kaydedilemedi.", "error");
      }
    } catch (e: any) {
      showMsg("Hata: " + e.message, "error");
    } finally {
      setRbacSaving(false);
    }
  };

  // RBAC: Fabrika Ayarlarına Sıfırla
  const handleResetRbac = async () => {
    if (!confirm("Tüm rollerin izinleri varsayılan fabrika ayarlarına sıfırlansın mı?")) return;
    setRbacSaving(true);
    try {
      const res = await fetch("/api/rbac", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showMsg("Tüm rollerin izinleri varsayılan ayarlara sıfırlandı.");
        setRbacPermissions(data.permissions);
        setRbacHasChanges(false);
      } else {
        showMsg(data.message || "Sıfırlanamadı.", "error");
      }
    } catch (e: any) {
      showMsg("Hata: " + e.message, "error");
    } finally {
      setRbacSaving(false);
    }
  };

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
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    if (typeof window !== "undefined") {
      localStorage.removeItem("limon_user");
      localStorage.removeItem("limon_token");
      document.cookie = "auth-token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      window.location.href = "/login";
    }
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

          <button
            onClick={() => setActiveTab("rbac")}
            className={`px-4 py-2 rounded text-xs font-medium transition flex items-center gap-2 ${
              activeTab === "rbac"
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <span>🛡️</span>
            <span>Rol Yetkileri & İzinler (RBAC)</span>
            {rbacHasChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Kaydedilmemiş değişiklikler var"></span>
            )}
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

        {/* TAB 4: RBAC & ROLE PERMISSION MANAGEMENT */}
        {activeTab === "rbac" && (
          <div className="space-y-6">
            
            {/* Top Roles Cards / Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(["ADMIN", "MANAGER", "CASHIER", "USER"] as const).map((r) => {
                const isSelected = rbacSelectedRole === r;
                const info = rbacData?.roleInfo?.[r] || {
                  name: r,
                  title: r,
                  badge: "bg-gray-100 text-gray-700",
                  description: "",
                };
                const assignedUsersCount = users.filter((u) => u.role === r).length;
                const rolePerms = rbacPermissions[r] || {};
                const allPermCount = rbacData?.categories.flatMap((c) => c.permissions).length || 0;
                const activePermCount = r === "ADMIN" 
                  ? allPermCount 
                  : Object.values(rolePerms).filter(Boolean).length;

                return (
                  <div
                    key={r}
                    onClick={() => setRbacSelectedRole(r)}
                    className={`p-4 rounded border cursor-pointer transition select-none ${
                      isSelected
                        ? "border-emerald-600 bg-emerald-50/30 shadow-xs ring-1 ring-emerald-600/30"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${info.badge}`}>
                        {r}
                      </span>
                      <span className="text-[11px] text-gray-500 font-mono">
                        {assignedUsersCount} Kullanıcı
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-gray-900 mb-1">
                      {info.title}
                    </h3>
                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed mb-3">
                      {info.description}
                    </p>

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                      <span className="text-gray-500">Yetki Kapsamı:</span>
                      <span className={`font-semibold ${r === "ADMIN" ? "text-purple-700" : activePermCount > 0 ? "text-emerald-700" : "text-gray-400"}`}>
                        {activePermCount} / {allPermCount} Açık
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected Role Alert & Notice */}
            <div className="p-3.5 rounded border border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {rbacSelectedRole === "ADMIN" ? "👑" : rbacSelectedRole === "MANAGER" ? "👔" : rbacSelectedRole === "CASHIER" ? "💳" : "👤"}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {rbacData?.roleInfo?.[rbacSelectedRole]?.title || rbacSelectedRole} Rolü İzinleri
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 font-mono">
                      {rbacSelectedRole}
                    </span>
                  </div>
                  <p className="text-gray-500 text-[11px] mt-0.5">
                    {rbacSelectedRole === "ADMIN"
                      ? "Sistem Yöneticisi (ADMIN) rolü, çekirdek altyapı ve güvenlik kuralları gereği daima tüm özelliklere tam yetkilidir."
                      : `${rbacSelectedRole} rolüne atanmış personellerin panelde görebileceği ve tetikleyebileceği yetkileri switch'lerle yapılandırın.`}
                  </p>
                </div>
              </div>

              {rbacHasChanges && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium animate-pulse">
                  <span>⚠️</span>
                  <span>Kaydedilmemiş değişiklikler var!</span>
                </div>
              )}
            </div>

            {/* Action Bar & Search Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 border border-gray-200 rounded">
              {/* Search Bar */}
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-gray-400 text-xs">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="İzinlerde ara (örn: fiyat, sipariş, stok, log, silme)..."
                  value={rbacSearch}
                  onChange={(e) => setRbacSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded border border-gray-300 text-xs text-gray-900 focus:outline-none focus:border-emerald-600 bg-white"
                />
              </div>

              {/* Quick Actions */}
              <div className="flex items-center gap-2">
                {rbacSelectedRole !== "ADMIN" && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleBatchPermissions(rbacSelectedRole, true)}
                      className="px-2.5 py-1.5 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-medium transition cursor-pointer"
                    >
                      Tümünü Aç
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBatchPermissions(rbacSelectedRole, false)}
                      className="px-2.5 py-1.5 rounded border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-medium transition cursor-pointer"
                    >
                      Tümünü Kapat
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleResetRbac}
                  disabled={rbacSaving}
                  className="px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-medium transition cursor-pointer disabled:opacity-50"
                >
                  Fabrika Ayarlarına Sıfırla
                </button>

                <button
                  type="button"
                  onClick={handleSaveRbac}
                  disabled={rbacSaving || (!rbacHasChanges && rbacSelectedRole === "ADMIN")}
                  className={`px-4 py-1.5 rounded text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    rbacHasChanges ? "bg-emerald-600 hover:bg-emerald-700 shadow-sm" : "bg-gray-900 hover:bg-black"
                  }`}
                >
                  {rbacSaving && (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  )}
                  <span>{rbacSaving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}</span>
                </button>
              </div>
            </div>

            {/* Categorized Permissions Grid */}
            <div className="space-y-5">
              {(rbacData?.categories || [])
                .filter((cat) => {
                  if (!rbacSearch.trim()) return true;
                  const q = rbacSearch.toLowerCase();
                  if (cat.name.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q)) return true;
                  return cat.permissions.some(
                    (p) =>
                      p.name.toLowerCase().includes(q) ||
                      p.description.toLowerCase().includes(q) ||
                      p.id.toLowerCase().includes(q)
                  );
                })
                .map((cat) => {
                  const filteredPerms = cat.permissions.filter((p) => {
                    if (!rbacSearch.trim()) return true;
                    const q = rbacSearch.toLowerCase();
                    return (
                      cat.name.toLowerCase().includes(q) ||
                      p.name.toLowerCase().includes(q) ||
                      p.description.toLowerCase().includes(q) ||
                      p.id.toLowerCase().includes(q)
                    );
                  });

                  if (filteredPerms.length === 0) return null;

                  const rolePerms = rbacPermissions[rbacSelectedRole] || {};
                  const allowedInCategory = filteredPerms.filter((p) =>
                    rbacSelectedRole === "ADMIN" ? true : !!rolePerms[p.id]
                  ).length;

                  return (
                    <div
                      key={cat.id}
                      className="bg-white border border-gray-200 rounded p-4 sm:p-5 space-y-4"
                    >
                      {/* Category Header */}
                      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-gray-100 gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">{cat.icon}</span>
                          <div>
                            <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide">
                              {cat.name}
                            </h4>
                            <p className="text-[11px] text-gray-500">
                              {cat.description}
                            </p>
                          </div>
                        </div>

                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          {allowedInCategory} / {filteredPerms.length} İzin Açık
                        </span>
                      </div>

                      {/* Permissions List / Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {filteredPerms.map((perm) => {
                          const isAllowed =
                            rbacSelectedRole === "ADMIN" ? true : !!rolePerms[perm.id];

                          return (
                            <div
                              key={perm.id}
                              className={`p-3 rounded border transition flex items-start justify-between gap-3 ${
                                isAllowed
                                  ? "border-emerald-200 bg-emerald-50/20"
                                  : "border-gray-200 bg-gray-50/40"
                              }`}
                            >
                              <div className="space-y-1 pr-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-gray-900">
                                    {perm.name}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-500 leading-relaxed">
                                  {perm.description}
                                </p>
                                <code className="text-[10px] font-mono text-gray-400 inline-block bg-gray-100/80 px-1 py-0.2 rounded">
                                  {perm.id}
                                </code>
                              </div>

                              {/* Toggle Switch Input */}
                              <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={isAllowed}
                                  disabled={rbacSelectedRole === "ADMIN" || rbacSaving}
                                  onClick={() => handleTogglePermission(rbacSelectedRole, perm.id)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    isAllowed ? "bg-emerald-600" : "bg-gray-300"
                                  } ${
                                    rbacSelectedRole === "ADMIN"
                                      ? "opacity-60 cursor-not-allowed"
                                      : "cursor-pointer"
                                  }`}
                                  title={
                                    rbacSelectedRole === "ADMIN"
                                      ? "ADMIN rolü yetkileri kısıtlanamaz"
                                      : isAllowed
                                      ? "İzni kapatmak için tıklayın"
                                      : "İzni açmak için tıklayın"
                                  }
                                >
                                  <span className="sr-only">{perm.name}</span>
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                                      isAllowed ? "translate-x-4" : "translate-x-0"
                                    }`}
                                  />
                                </button>
                                <span
                                  className={`text-[10px] font-semibold ${
                                    isAllowed ? "text-emerald-700" : "text-gray-400"
                                  }`}
                                >
                                  {isAllowed ? "Açık" : "Kapalı"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
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
