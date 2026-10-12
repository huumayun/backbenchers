"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/AuthContext";
import { ChevronLeft, Eye, EyeOff, LogIn } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn(email, password);
    setLoading(false);
    if (res.success) {
      router.push(redirectUrl);
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs font-medium opacity-60 hover:opacity-100 transition"
        >
          <ChevronLeft size={16} /> হোমপেজে ফিরুন
        </Link>
      </div>

      <div className="bg-white rounded-3xl shadow-xl p-7 border border-black/8">
        <div className="w-16 h-16 rounded-full border-2 border-white shadow-md bg-white overflow-hidden mx-auto mb-3">
          <img
            src="/avatar.png"
            alt="Backbencher Reader"
            className="w-full h-full object-cover"
          />
        </div>
        <h1 className="text-xl font-extrabold text-center mb-1">লগইন করুন</h1>
        <p className="text-xs opacity-55 text-center mb-6">
          বই আনলক করতে আপনার অ্যাকাউন্টে লগইন করুন
        </p>

        {error && (
          <div className="bg-red-500/10 text-red-700 text-xs font-medium px-4 py-2.5 rounded-xl mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold opacity-75 mb-1">
              ইমেইল
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="আপনার ইমেইল"
              required
              className="w-full bg-[#FAF9F6] border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold opacity-75 mb-1">
              পাসওয়ার্ড
            </label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="পাসওয়ার্ড"
                required
                className="w-full bg-[#FAF9F6] border border-black/15 focus:border-black rounded-xl px-4 py-2.5 pr-10 text-xs focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-45 hover:opacity-80 cursor-pointer"
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#111111] hover:bg-black text-white font-bold py-3 rounded-full text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-lg mt-2"
          >
            <LogIn size={14} />
            {loading ? "লগইন হচ্ছে..." : "লগইন করুন"}
          </button>
        </form>

        <p className="text-center text-xs opacity-65 mt-5">
          অ্যাকাউন্ট নেই?{" "}
          <Link
            href={
              redirectUrl && redirectUrl !== "/"
                ? `/register?redirect=${encodeURIComponent(redirectUrl)}`
                : "/register"
            }
            className="text-black font-bold underline"
          >
            রেজিস্ট্রেশন করুন
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#141413] flex flex-col justify-center px-4 py-8">
      <Suspense fallback={<div className="text-center text-xs opacity-50">লোড হচ্ছে...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
