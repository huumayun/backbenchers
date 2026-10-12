"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/AuthContext";
import { ChevronLeft, Eye, EyeOff, UserPlus } from "lucide-react";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.password.length < 6) {
      setError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }

    setLoading(true);
    const res = await signUp(form.name, form.email, form.password);
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
        <h1 className="text-xl font-extrabold text-center mb-1">
          রেজিস্ট্রেশন করুন
        </h1>
        <p className="text-xs opacity-55 text-center mb-6">
          নতুন অ্যাকাউন্ট তৈরি করে আনলক কোড ব্যবহার করুন
        </p>

        {error && (
          <div className="bg-red-500/10 text-red-700 text-xs font-medium px-4 py-2.5 rounded-xl mb-4 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold opacity-75 mb-1">
              আপনার নাম
            </label>
            <input
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="আপনার পুরো নাম"
              required
              className="w-full bg-[#FAF9F6] border border-black/15 focus:border-black rounded-xl px-4 py-2.5 text-xs focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold opacity-75 mb-1">
              ইমেইল
            </label>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
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
                name="password"
                type={showPass ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                placeholder="কমপক্ষে ৬ অক্ষর"
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
            <UserPlus size={14} />
            {loading ? "তৈরি হচ্ছে..." : "রেজিস্ট্রেশন করুন"}
          </button>
        </form>

        <p className="text-center text-xs opacity-65 mt-5">
          আগেই অ্যাকাউন্ট আছে?{" "}
          <Link
            href={
              redirectUrl && redirectUrl !== "/"
                ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
                : "/login"
            }
            className="text-black font-bold underline"
          >
            লগইন করুন
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#141413] flex flex-col justify-center px-4 py-8">
      <Suspense fallback={<div className="text-center text-xs opacity-50">লোড হচ্ছে...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
