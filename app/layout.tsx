import type { Metadata } from "next";
import { AuthProvider } from "@/lib/context/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Backbencher — বোটানি অনার্স ৩য় বর্ষ",
  applicationName: "Backbencher",
  manifest: "/manifest.json",
  description:
    "বোটানি অনার্স ৩য় বর্ষের সম্পূর্ণ সাজেশন — জিম্নোস্পার্ম, উদ্ভিদ শারীরবিদ্যা, বায়োকেমিস্ট্রি, বাস্তুবিদ্যা ও আরও অনেক কিছু।",
  keywords: ["botany", "suggestion", "honours", "3rd year", "backbenchers"],
  openGraph: {
    title: "Backbencher",
    description: "বোটানি অনার্স ৩য় বর্ষ সম্পূর্ণ সাজেশন",
    type: "website",
  },
};

import { CapacitorBackButtonHandler } from "@/components/CapacitorBackButtonHandler";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#FAF9F6" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Backbencher" />
        <link rel="icon" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link
          href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var h = window.location.hostname;
                  var isDev = h === "localhost" || h === "127.0.0.1" || h.indexOf("192.168.") === 0;
                  if (isDev && "serviceWorker" in navigator) {
                    Promise.all([
                      navigator.serviceWorker.getRegistrations().then(function(regs) {
                        var hadSw = regs.length > 0;
                        return Promise.all(regs.map(function(r) { return r.unregister(); })).then(function() { return hadSw; });
                      }),
                      "caches" in window
                        ? caches.keys().then(function(keys) {
                            var oldKeys = keys.filter(function(k) { return k.indexOf("ebook-app-shell") === 0; });
                            var hadCache = oldKeys.length > 0;
                            return Promise.all(oldKeys.map(function(k) { return caches.delete(k); })).then(function() { return hadCache; });
                          })
                        : Promise.resolve(false)
                    ]).then(function(res) {
                      if ((res[0] || res[1]) && !sessionStorage.getItem("ebook_sw_dev_purged")) {
                        sessionStorage.setItem("ebook_sw_dev_purged", "1");
                        window.location.reload();
                      }
                    });
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-hind antialiased bg-[#FAF9F6]">
        <AuthProvider>
          <CapacitorBackButtonHandler />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
