"use client";

import Link from "next/link";
import { useAuth } from "@/lib/context/AuthContext";
import { logoutUser } from "@/lib/firebase/auth";
import { BOOK_INFO } from "@/lib/book/chapters";
import UnlockModal from "@/components/ui/UnlockModal";
import {
  BookOpen,
  LogIn,
  LogOut,
  User,
  Settings,
  Menu,
  X,
  Key,
  CheckCircle2,
  Download,
  BookMarked,
} from "lucide-react";
import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function Navbar() {
  const {
    user,
    profile,
    hasAccess,
    setShowUnlockModal,
    deviceId,
    accessToken,
  } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logoutUser();
    setMenuOpen(false);
    router.push("/");
  };

  const handleDownloadClick = () => {
    if (!hasAccess) {
      setShowUnlockModal(true);
      return;
    }
    const url = `/api/download-pdf?deviceId=${encodeURIComponent(
      deviceId
    )}&token=${encodeURIComponent(accessToken || "")}`;
    window.open(url, "_blank");
  };

  return (
    <>
      <nav className="sticky top-0 z-40 bg-[#004d40] text-white shadow-lg border-b border-emerald-800">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-base sm:text-lg shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#d4af37] text-[#00332c] flex items-center justify-center font-black shadow">
              <BookOpen size={18} />
            </div>
            <div className="leading-tight">
              <span className="block font-extrabold text-sm sm:text-base text-white">
                {BOOK_INFO.title}
              </span>
              <span className="block text-[10px] text-emerald-200 font-normal">
                বোটানি অনার্স ৩য় বর্ষ
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-2 lg:gap-3 text-xs lg:text-sm">
            <Link
              href="/read"
              className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                pathname === "/read"
                  ? "bg-white/20 text-[#d4af37]"
                  : "hover:bg-white/10 text-emerald-50"
              }`}
            >
              📖 সাধারণ রিডার
            </Link>
            <Link
              href="/flipbook"
              className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                pathname === "/flipbook"
                  ? "bg-white/20 text-[#d4af37]"
                  : "hover:bg-white/10 text-emerald-50"
              }`}
            >
              📚 Flipbook রিডার
            </Link>

            <button
              onClick={handleDownloadClick}
              className="px-3 py-1.5 rounded-lg font-semibold hover:bg-white/10 text-emerald-50 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={14} className="text-[#d4af37]" /> PDF ডাউনলোড
            </button>

            <Link
              href="/dashboard"
              className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
                pathname === "/dashboard"
                  ? "bg-white/20 text-[#d4af37]"
                  : "hover:bg-white/10 text-emerald-50"
              }`}
            >
              <BookMarked size={14} /> ড্যাশবোর্ড
            </Link>

            {/* Unlock Status Button */}
            {hasAccess ? (
              <span className="bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                <CheckCircle2 size={13} className="text-emerald-300" /> আনলকড
              </span>
            ) : (
              <button
                onClick={() => setShowUnlockModal(true)}
                className="bg-[#d4af37] hover:bg-yellow-400 text-[#00332c] font-extrabold px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Key size={14} /> কোড দিন / আনলক
              </button>
            )}

            <div className="h-4 w-px bg-emerald-700 mx-1" />

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className="text-xs text-emerald-100 hover:text-white flex items-center gap-1 max-w-[110px] truncate"
                >
                  <User size={14} /> {profile?.displayName || "পাঠক"}
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 bg-red-600/90 hover:bg-red-700 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  <LogOut size={13} /> লগআউট
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1"
              >
                <LogIn size={13} /> লগইন
              </Link>
            )}

            <Link
              href="/admin"
              className="text-emerald-300/70 hover:text-yellow-300 p-1.5 rounded-lg transition"
              title="Admin Panel"
            >
              <Settings size={15} />
            </Link>
          </div>

          {/* Mobile Right Controls */}
          <div className="flex md:hidden items-center gap-2">
            {!hasAccess && (
              <button
                onClick={() => setShowUnlockModal(true)}
                className="bg-[#d4af37] text-[#00332c] text-xs font-extrabold px-2.5 py-1.5 rounded-lg flex items-center gap-1 shadow"
              >
                <Key size={12} /> আনলক
              </button>
            )}
            <button
              className="p-1.5 rounded-lg bg-white/10"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle Menu"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden bg-[#003329] border-t border-emerald-800 px-4 py-3 flex flex-col gap-2.5 text-sm">
            <Link
              href="/read"
              onClick={() => setMenuOpen(false)}
              className="py-1.5 px-2 rounded-lg hover:bg-white/10 flex items-center gap-2 font-semibold"
            >
              📖 সাধারণ রিডার (অধ্যায়ভিত্তিক)
            </Link>
            <Link
              href="/flipbook"
              onClick={() => setMenuOpen(false)}
              className="py-1.5 px-2 rounded-lg hover:bg-white/10 flex items-center gap-2 font-semibold"
            >
              📚 Flipbook রিডার (পৃষ্ঠা উল্টিয়ে পড়ুন)
            </Link>
            <button
              onClick={() => {
                setMenuOpen(false);
                handleDownloadClick();
              }}
              className="py-1.5 px-2 rounded-lg hover:bg-white/10 flex items-center gap-2 font-semibold text-left"
            >
              <Download size={16} className="text-[#d4af37]" /> সম্পূর্ণ PDF ডাউনলোড
            </button>
            <Link
              href="/dashboard"
              onClick={() => setMenuOpen(false)}
              className="py-1.5 px-2 rounded-lg hover:bg-white/10 flex items-center gap-2 font-semibold"
            >
              <BookMarked size={16} /> পাঠকের ড্যাশবোর্ড ও বুকমার্ক
            </Link>
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              className="py-1.5 px-2 rounded-lg hover:bg-white/10 flex items-center gap-2 text-emerald-200"
            >
              <Settings size={16} /> Admin Panel (কোড জেনারেটর)
            </Link>
            <div className="border-t border-emerald-800 pt-2 flex items-center justify-between">
              {user ? (
                <>
                  <span className="text-xs text-emerald-200">
                    👤 {profile?.displayName || user.email}
                  </span>
                  <button
                    onClick={handleLogout}
                    className="text-xs bg-red-600 px-3 py-1 rounded-lg font-bold"
                  >
                    লগআউট
                  </button>
                </>
              ) : (
                <div className="flex gap-2 w-full">
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 text-center bg-white/10 py-1.5 rounded-lg text-xs font-bold"
                  >
                    🔑 লগইন
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMenuOpen(false)}
                    className="flex-1 text-center bg-[#d4af37] text-[#00332c] py-1.5 rounded-lg text-xs font-bold"
                  >
                    📝 রেজিস্ট্রেশন
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>
      <UnlockModal />
    </>
  );
}
