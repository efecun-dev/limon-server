"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const usernameInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Sayfa yüklendiğinde en son giriş yapılan kullanıcı adını getir
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("limon_remembered_username");
      if (savedUser) {
        setUsername(savedUser);
        // Kullanıcı adı hazır olduğundan imleci doğrudan şifre alanına odaklar
        setTimeout(() => {
          passwordInputRef.current?.focus();
        }, 60);
      } else {
        usernameInputRef.current?.focus();
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const trimmedUser = username.trim();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUser, password }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccessMsg("Giriş başarılı! Yönlendiriliyorsunuz...");

        if (typeof window !== "undefined") {
          // Kullanıcı adını hatırla / güncelle (şifre asla saklanmaz)
          if (rememberMe) {
            localStorage.setItem("limon_remembered_username", trimmedUser);
          } else {
            localStorage.removeItem("limon_remembered_username");
          }

          // Token ve kullanıcıyı localStorage'a kaydet
          localStorage.setItem("limon_user", JSON.stringify(data.user));
          if (data.token) {
            localStorage.setItem("limon_token", data.token);
            // HTTP ortamlarında tarayıcı çerezi garantisi için fallback
            document.cookie = `auth-token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
          }

          // Kısa bir animasyon ardından tam sayfa yenileme ile ana panele yönlendir
          setTimeout(() => {
            window.location.href = "/";
          }, 350);
        }
      } else {
        setError(data.message || "Giriş başarısız. Kullanıcı adı veya şifre hatalı.");
        setLoading(false);
      }
    } catch (err: any) {
      setError("Sunucuya bağlanırken bir hata oluştu: " + (err.message || "Bilinmeyen hata"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-100 flex items-center justify-center p-4 font-sans text-gray-900 antialiased">
      <div className="w-full max-w-sm bg-white border border-gray-300 rounded p-6 shadow-xs space-y-5">
        
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded bg-emerald-600 text-white font-bold text-base mb-1">
            L
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            Limon Central Server
          </h1>
          <p className="text-xs text-gray-500">
            Sunucu Yönetim Paneli Girişi
          </p>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-gray-700 font-medium mb-1">
              Kullanıcı Adı
            </label>
            <input
              ref={usernameInputRef}
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-3 py-2 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:border-emerald-600 bg-white"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-1">
              Şifre
            </label>
            <input
              ref={passwordInputRef}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:border-emerald-600 bg-white"
            />
          </div>

          <div className="flex items-center justify-between pt-0.5">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none text-gray-600 hover:text-gray-900">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600"
              />
              <span className="text-[11px]">Kullanıcı adını hatırla</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded bg-gray-900 hover:bg-black text-white font-medium text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {loading && (
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
            )}
            <span>{successMsg ? "Yönlendiriliyor..." : loading ? "Doğrulanıyor..." : "Giriş Yap"}</span>
          </button>
        </form>

        {/* Footer */}
        <div className="text-center text-[11px] text-gray-400 pt-2 border-t border-gray-100">
          Limon Enterprise Gateway • Yetkili Personel Erişimi
        </div>

      </div>
    </div>
  );
}
