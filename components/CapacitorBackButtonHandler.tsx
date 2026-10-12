"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isCapacitorNativeApp } from "@/lib/capacitor/localApiBridge";

export function syncAndroidSystemBars(hexColor: string, isDarkTheme: boolean) {
  if (typeof window === "undefined") return;
  try {
    const metaTheme = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (metaTheme) {
      metaTheme.setAttribute("content", hexColor);
    }
    document.documentElement.style.backgroundColor = hexColor;
    if (document.body) {
      document.body.style.backgroundColor = hexColor;
    }

    const win = window as unknown as {
      AndroidNative?: {
        setSystemBarTheme?: (hex: string, isDark: boolean) => void;
      };
    };
    if (win.AndroidNative && typeof win.AndroidNative.setSystemBarTheme === "function") {
      win.AndroidNative.setSystemBarTheme(hexColor, isDarkTheme);
    }
  } catch {
    // ignore
  }
}

export function CapacitorBackButtonHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const lastBackPressRef = useRef<number>(0);
  const pathnameRef = useRef<string>(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
    const cleanPath = (pathname || "").replace(/\/+$/, "") || "/";
    if (cleanPath !== "/read" && cleanPath !== "/flipbook") {
      syncAndroidSystemBars("#FAF9F6", false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!isCapacitorNativeApp()) return;

    let cleanupListener: (() => void) | undefined;

    import("@capacitor/app")
      .then(({ App }) => {
        const listenerPromise = App.addListener("backButton", () => {
          // 1. If any modal, sheet, or popover is open, close it first
          const closeBtn = document.querySelector<HTMLElement>(
            "[data-modal-close='true'], .modal-close-trigger, button[aria-label='Close'], button[title='Close']"
          );
          if (closeBtn) {
            closeBtn.click();
            return;
          }

          // 2. If user is in a subpage (e.g. /read, /flipbook, /unlock, /dashboard, /login, /register, /library)
          const currentPath = pathnameRef.current || window.location.pathname;
          if (currentPath && currentPath !== "/") {
            // Return back in history or navigate to Home
            if (window.history.length > 1) {
              router.back();
            } else {
              router.push("/");
            }
            return;
          }

          // 3. If user is on Home page ('/')
          // Double-tap back within 2 seconds to exit the app safely
          const now = Date.now();
          if (now - lastBackPressRef.current < 2000) {
            App.exitApp();
          } else {
            lastBackPressRef.current = now;
            // Show non-intrusive bottom toast
            const existingToast = document.getElementById("cap-exit-toast");
            if (existingToast) existingToast.remove();

            const toast = document.createElement("div");
            toast.id = "cap-exit-toast";
            toast.innerText = "অ্যাপ বন্ধ করতে আবার ব্যাক চাপুন";
            toast.style.cssText =
              "position:fixed;bottom:85px;left:50%;transform:translateX(-50%);background:rgba(20,20,19,0.92);color:#FAF9F6;padding:9px 20px;border-radius:999px;font-size:12px;font-weight:600;z-index:999999;box-shadow:0 10px 30px rgba(0,0,0,0.3);pointer-events:none;letter-spacing:0.02em;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.15);transition:opacity 0.2s;";
            document.body.appendChild(toast);
            setTimeout(() => {
              toast.style.opacity = "0";
              setTimeout(() => toast.remove(), 250);
            }, 1800);
          }
        });

        cleanupListener = () => {
          listenerPromise.then((l) => l.remove()).catch(() => {});
        };
      })
      .catch(() => {
        // Not in capacitor environment
      });

    return () => {
      if (cleanupListener) cleanupListener();
    };
  }, [router]);

  return null;
}
