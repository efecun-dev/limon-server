"use client";

import { useState, useEffect, useCallback } from "react";
import ServerNavbar from "@/components/ServerNavbar";
import { ServerFooter } from "@/components/ServerFooter";
import { BuildingComplex, Server, Shield, Users } from "lucide-react";

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
        setUsers(data.users || []);
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
        setBranches(data.branches || []);
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
        setRbacPermissions(data.permissions || {});
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

  // RBAC: Switch Permission Toggle
  const handleTogglePermission = (role: string, permId: string) => {
    if (role === "ADMIN") {
      showMsg("Sistem Yöneticisi (ADMIN) güvenlik gereği tüm yetkilere sınırsız sahiptir.", "error");
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

  // RBAC: Batch enable / disable
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

  // RBAC: Save Permissions
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
        showMsg(`${rbacSelectedRole} rolünün yetkileri başarıyla güncellendi.`);
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

  // RBAC: Reset to factory defaults
  const handleResetRbac = async () => {
    if (!confirm("Tüm rollerin izinleri varsayılan ayarlara sıfırlansın mı?")) return;
    setRbacSaving(true);
    try {
      const res = await fetch("/api/rbac", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        showMsg("Tüm roller varsayılan ayarlara sıfırlandı.");
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

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days} gün, ${hours} saat, ${mins} dk`;
    return `${hours} saat, ${mins} dk`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      <ServerNavbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-lg">⚙️</span>
              Sunucu & Sistem Ayarları
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Donanım telemetrisi, kullanıcı hesapları, şube organizasyonu ve RBAC yetki yönetimi
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Sistem Aktif
            </span>
          </div>
        </div>

        {/* Flash Message Banner */}
        {message && (
          <div
            className={`p-3.5 rounded-xl text-xs font-medium border flex items-center gap-2 transition-all ${message.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm"
              : "bg-rose-50 border-rose-200 text-rose-800 shadow-sm"
              }`}
          >
            <span>{message.type === "success" ? "✓" : "⚠"}</span>
            <span>{message.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            onClick={() => setActiveTab("system")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${activeTab === "system"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-100"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
          >
            <span><Server size={12} /></span>
            <span>Sistem & Donanım</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${activeTab === "users"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-100"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
          >
            <span><Users size={12} /></span>
            <span>Kullanıcı Yönetimi</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono">
              {users.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("branches")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${activeTab === "branches"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-100"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
          >
            <span><BuildingComplex size={12} /></span>
            <span>Şube Yönetimi</span>
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono">
              {branches.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("rbac")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${activeTab === "rbac"
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-100"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
              }`}
          >
            <span><Shield size={12} /></span>
            <span>RBAC Yetki Matrisi</span>
            {rbacHasChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
            )}
          </button>
        </div>

        {/* TAB 1: SYSTEM TELEMETRY */}
        {activeTab === "system" && (
          <div className="space-y-6">
            {!system ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                Sistem donanım telemetrisi okunuyor...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* CPU Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-5  space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">İşlemci (CPU)</span>
                    <span className="text-sm font-bold text-indigo-600">{system.cpu.usagePercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${system.cpu.usagePercent > 80 ? "bg-rose-500" : system.cpu.usagePercent > 50 ? "bg-amber-500" : "bg-indigo-500"
                        }`}
                      style={{ width: `${Math.min(100, system.cpu.usagePercent)}%` }}
                    />
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Çekirdek:</span>
                      <span className="font-medium">{system.cpu.cores} Çekirdek</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Mimari:</span>
                      <span className="font-medium uppercase">{system.cpu.arch}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate pt-1 border-t border-slate-100">
                      {system.cpu.model}
                    </div>
                  </div>
                </div>

                {/* Memory Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-5  space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bellek (RAM)</span>
                    <span className="text-sm font-bold text-emerald-600">{system.memory.usagePercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${system.memory.usagePercent > 85 ? "bg-rose-500" : "bg-emerald-500"
                        }`}
                      style={{ width: `${Math.min(100, system.memory.usagePercent)}%` }}
                    />
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Kullanılan:</span>
                      <span className="font-medium">{system.memory.usedGb} GB / {system.memory.totalGb} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Boş Alan:</span>
                      <span className="font-medium">{system.memory.freeGb} GB</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-100 text-[10px]">
                      <span className="text-slate-400">Node RSS:</span>
                      <span className="font-mono text-slate-500">{system.memory.nodeRssMb} MB</span>
                    </div>
                  </div>
                </div>

                {/* Disk Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-5  space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Disk Depolama</span>
                    <span className="text-sm font-bold text-amber-600">{system.disk.usagePercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${system.disk.usagePercent > 85 ? "bg-rose-500" : "bg-amber-500"
                        }`}
                      style={{ width: `${Math.min(100, system.disk.usagePercent)}%` }}
                    />
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Kullanılan:</span>
                      <span className="font-medium">{system.disk.usedGb} GB / {system.disk.totalGb} GB</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Boş Disk:</span>
                      <span className="font-medium">{system.disk.freeGb} GB</span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate pt-1 border-t border-slate-100 font-mono">
                      {system.disk.path}
                    </div>
                  </div>
                </div>

                {/* OS & Runtime Card */}
                <div className="bg-white border border-slate-200 rounded-xl p-5  space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">İşletim Sistemi</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">PID: {system.os.pid}</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-600 pt-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Host:</span>
                      <span className="font-medium text-slate-800">{system.os.hostname}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Platform:</span>
                      <span className="font-medium">{system.os.platform} ({system.os.type})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Node Sürümü:</span>
                      <span className="font-mono text-indigo-600">{system.os.nodeVersion}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-100">
                      <span className="text-slate-400">Uptime:</span>
                      <span className="font-medium text-emerald-700">{formatUptime(system.os.processUptimeSeconds)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: USERS MANAGEMENT */}
        {activeTab === "users" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create User Form */}
            <div className="bg-white border border-slate-200 rounded-xl p-5  space-y-4 h-fit">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>➕</span> Yeni Kullanıcı Ekle
              </h3>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Kullanıcı Adı</label>
                  <input
                    type="text"
                    required
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="ornek_kullanici"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ad Soyad</label>
                  <input
                    type="text"
                    required
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="Ahmet Yılmaz"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Parola</label>
                  <input
                    type="password"
                    required
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rol</label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="USER">Kullanıcı</option>
                      <option value="CASHIER">Kasiyer</option>
                      <option value="MANAGER">Yönetici</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Şube</label>
                    <select
                      value={newUser.branchId}
                      onChange={(e) => setNewUser({ ...newUser, branchId: e.target.value })}
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Merkez / Yok</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Kaydediliyor..." : "Kullanıcıyı Kaydet"}
                </button>
              </form>
            </div>

            {/* Users List Table */}
            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden ">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  Mevcut Kullanıcılar ({users.length})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">Kullanıcı</th>
                      <th className="py-2.5 px-4">Rol</th>
                      <th className="py-2.5 px-4">Şube</th>
                      <th className="py-2.5 px-4">Durum</th>
                      <th className="py-2.5 px-4 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4">
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">@{u.username}</div>
                        </td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${u.role === "ADMIN"
                            ? "bg-purple-100 text-purple-700"
                            : u.role === "MANAGER"
                              ? "bg-blue-100 text-blue-700"
                              : u.role === "CASHIER"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-700"
                            }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-600">
                          {u.branch ? u.branch.name : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-2.5 px-4">
                          <button
                            onClick={() => handleToggleUserActive(u)}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer ${u.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                              }`}
                          >
                            {u.isActive ? "Aktif" : "Pasif"}
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="text-slate-400 hover:text-rose-600 transition text-xs cursor-pointer p-1"
                            title="Kullanıcıyı Sil"
                          >
                            🗑️
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

        {/* TAB 3: BRANCHES MANAGEMENT */}
        {activeTab === "branches" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create Branch Form */}
            <div className="bg-white border border-slate-200 rounded-xl p-5  space-y-4 h-fit">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>➕</span> Yeni Şube Ekle
              </h3>
              <form onSubmit={handleCreateBranch} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Şube Kodu / ID</label>
                  <input
                    type="text"
                    required
                    value={newBranch.id}
                    onChange={(e) => setNewBranch({ ...newBranch, id: e.target.value.toLowerCase().trim() })}
                    placeholder="ornek-sube"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Şube Adı</label>
                  <input
                    type="text"
                    required
                    value={newBranch.name}
                    onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                    placeholder="Kadıköy Merkez Şube"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Adres (Opsiyonel)</label>
                  <input
                    type="text"
                    value={newBranch.address}
                    onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                    placeholder="Moda Cad. No: 12"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Telefon</label>
                  <input
                    type="text"
                    value={newBranch.phone}
                    onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                    placeholder="0216 000 00 00"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-2 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
                >
                  {loading ? "Kaydediliyor..." : "Şubeyi Kaydet"}
                </button>
              </form>
            </div>

            {/* Branches Grid */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between pb-1">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Kayıtlı Şubeler ({branches.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {branches.map((b) => (
                  <div key={b.id} className="bg-white border border-slate-200 rounded-xl p-4  space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">{b.name}</h4>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                          {b.id}
                        </span>
                      </div>
                      <button
                        onClick={() => handleToggleBranchActive(b)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer ${b.isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}
                      >
                        {b.isActive ? "Aktif" : "Pasif"}
                      </button>
                    </div>

                    <div className="text-[11px] text-slate-500 space-y-1">
                      {b.address && <div>📍 {b.address}</div>}
                      {b.phone && <div>📞 {b.phone}</div>}
                      <div className="text-[10px] text-indigo-600 font-medium pt-1">
                        👥 {b._count?.users || 0} Kullanıcı Bağlı
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={() => handleDeleteBranch(b.id, b.name)}
                        className="text-xs text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                      >
                        Şubeyi Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: RBAC PERMISSIONS */}
        {activeTab === "rbac" && (
          <div className="space-y-6">
            {/* Role Selector & Top Controls */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5  space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {(["ADMIN", "MANAGER", "CASHIER", "USER"] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => setRbacSelectedRole(role)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${rbacSelectedRole === role
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={rbacSearch}
                    onChange={(e) => setRbacSearch(e.target.value)}
                    placeholder="İzinlerde ara..."
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />

                  {rbacSelectedRole !== "ADMIN" && (
                    <>
                      <button
                        onClick={() => handleBatchPermissions(rbacSelectedRole, true)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer"
                      >
                        Tümünü Aç
                      </button>
                      <button
                        onClick={() => handleBatchPermissions(rbacSelectedRole, false)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-700 cursor-pointer"
                      >
                        Tümünü Kapat
                      </button>
                    </>
                  )}

                  <button
                    onClick={handleResetRbac}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-[11px] font-medium text-rose-700 cursor-pointer"
                  >
                    Sıfırla
                  </button>

                  <button
                    onClick={handleSaveRbac}
                    disabled={rbacSaving || !rbacHasChanges}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold text-white transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${rbacHasChanges ? "bg-emerald-600 hover:bg-emerald-700 shadow-sm" : "bg-slate-800 hover:bg-slate-900"
                      }`}
                  >
                    {rbacSaving && (
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    )}
                    <span>{rbacSaving ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}</span>
                  </button>
                </div>
              </div>

              {rbacData?.roleInfo?.[rbacSelectedRole] && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-600 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800">{rbacData.roleInfo[rbacSelectedRole].name} Rolü: </span>
                    {rbacData.roleInfo[rbacSelectedRole].description}
                  </div>
                  {rbacSelectedRole === "ADMIN" && (
                    <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      Süper Yönetici • Tam Yetkili
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Categorized Permissions Grid */}
            <div className="space-y-4">
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
                      className="bg-white border border-slate-200 rounded-xl p-5  space-y-4"
                    >
                      {/* Category Header */}
                      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl p-1.5 rounded-lg bg-slate-50 border border-slate-100">{cat.icon}</span>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                              {cat.name}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {cat.description}
                            </p>
                          </div>
                        </div>

                        <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
                          {allowedInCategory} / {filteredPerms.length} İzin Açık
                        </span>
                      </div>

                      {/* Permissions List */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {filteredPerms.map((perm) => {
                          const isAllowed =
                            rbacSelectedRole === "ADMIN" ? true : !!rolePerms[perm.id];

                          return (
                            <div
                              key={perm.id}
                              className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${isAllowed
                                ? "border-emerald-200 bg-emerald-50/30"
                                : "border-slate-200 bg-slate-50/50"
                                }`}
                            >
                              <div className="space-y-1 pr-2">
                                <div className="text-xs font-semibold text-slate-900">
                                  {perm.name}
                                </div>
                                <p className="text-[11px] text-slate-500 leading-relaxed">
                                  {perm.description}
                                </p>
                                <code className="text-[10px] font-mono text-slate-400 inline-block bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                  {perm.id}
                                </code>
                              </div>

                              {/* Toggle Switch */}
                              <div className="flex flex-col items-end gap-1 shrink-0 pt-0.5">
                                <button
                                  type="button"
                                  role="switch"
                                  aria-checked={isAllowed}
                                  disabled={rbacSelectedRole === "ADMIN" || rbacSaving}
                                  onClick={() => handleTogglePermission(rbacSelectedRole, perm.id)}
                                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${isAllowed ? "bg-emerald-600" : "bg-slate-300"
                                    } ${rbacSelectedRole === "ADMIN"
                                      ? "opacity-60 cursor-not-allowed"
                                      : "cursor-pointer"
                                    }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white  transition duration-200 ease-in-out ${isAllowed ? "translate-x-4" : "translate-x-0"
                                      }`}
                                  />
                                </button>
                                <span
                                  className={`text-[10px] font-semibold ${isAllowed ? "text-emerald-700" : "text-slate-400"
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

      <ServerFooter />
    </div>
  );
}
