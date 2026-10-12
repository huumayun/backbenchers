/**
 * Smart formatting, validation, and launching for WhatsApp and Telegram contact links
 */

export function normalizeBdPhoneNumber(digits: string): string {
  const cleanDigits = digits.replace(/\D/g, "");
  // If already starts with 8801... (13 digits), return as-is
  if (cleanDigits.startsWith("880") && cleanDigits.length >= 13) {
    return cleanDigits;
  }
  // If starts with 01... (11 digits BD mobile), prefix with 88
  if (cleanDigits.startsWith("01") && cleanDigits.length === 11) {
    return `88${cleanDigits}`;
  }
  // If starts with 1... (10 digits BD mobile without 0), prefix with 880
  if (cleanDigits.startsWith("1") && cleanDigits.length === 10) {
    return `880${cleanDigits}`;
  }
  return cleanDigits;
}

export function buildSmartWhatsAppUrl(rawInput: string, message: string = ""): string {
  const trimmed = (rawInput || "").trim();
  if (!trimmed) return "";

  const encodedMsg = message ? encodeURIComponent(message) : "";

  // 1. If it's already a full URL:
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    // WhatsApp Business short link (e.g. https://wa.me/message/XXXXX or https://wa.me/qr/XXXXX)
    if (trimmed.includes("wa.me/message/") || trimmed.includes("wa.me/qr/")) {
      if (!encodedMsg) return trimmed;
      const sep = trimmed.includes("?") ? "&" : "?";
      return `${trimmed}${sep}text=${encodedMsg}`;
    }

    // Standard wa.me/NUMBER or api.whatsapp.com/send?phone=NUMBER
    if (trimmed.includes("wa.me/") || trimmed.includes("api.whatsapp.com")) {
      const match = trimmed.match(/(?:phone=|wa\.me\/)(\+?[0-9]+)/);
      if (match && match[1]) {
        const num = normalizeBdPhoneNumber(match[1]);
        return `https://wa.me/${num}${encodedMsg ? `?text=${encodedMsg}` : ""}`;
      }
      if (!encodedMsg) return trimmed;
      const sep = trimmed.includes("?") ? "&" : "?";
      return `${trimmed}${sep}text=${encodedMsg}`;
    }

    return trimmed;
  }

  // 2. If it's wa.me without protocol (e.g. wa.me/message/XYZ or wa.me/017...):
  if (trimmed.startsWith("wa.me/")) {
    return buildSmartWhatsAppUrl(`https://${trimmed}`, message);
  }

  // 3. Raw phone number entered (e.g. 01768802953, +8801768802953, 8801768802953)
  const num = normalizeBdPhoneNumber(trimmed);
  return `https://wa.me/${num}${encodedMsg ? `?text=${encodedMsg}` : ""}`;
}

export function buildSmartTelegramUrl(rawInput: string, message: string = ""): string {
  let trimmed = (rawInput || "").trim();
  if (!trimmed) return "";

  const encodedMsg = message ? encodeURIComponent(message) : "";

  if (trimmed.startsWith("@")) {
    trimmed = trimmed.slice(1);
  }

  let finalUrl = trimmed;
  if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
    if (finalUrl.startsWith("t.me/")) {
      finalUrl = `https://${finalUrl}`;
    } else {
      finalUrl = `https://t.me/${finalUrl}`;
    }
  }

  if (encodedMsg) {
    const sep = finalUrl.includes("?") ? "&" : "?";
    finalUrl = `${finalUrl}${sep}text=${encodedMsg}`;
  }
  return finalUrl;
}

export function openExternalUrl(url: string) {
  if (!url || typeof window === "undefined") return;

  const isNative = Boolean(
    (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
      .Capacitor?.isNativePlatform?.() ||
      (window.location.protocol === "https:" &&
        window.location.hostname === "localhost")
  );

  if (isNative) {
    try {
      window.location.href = url;
    } catch {
      window.open(url, "_system");
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
