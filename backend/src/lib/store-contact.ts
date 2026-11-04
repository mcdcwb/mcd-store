// Canonical Brazilian number: country code + DDD + local number, digits only.
export function normalizeWhatsapp(value: string): string | null {
  if (!/^\+?[\d\s().-]+$/.test(value.trim())) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 || digits.length === 13) {
    if (!digits.startsWith("55")) return null;
    digits = digits.slice(2);
  }
  if (!/^[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(digits)) return null;
  return "55" + digits;
}
export function formatWhatsapp(value: string): string {
  const canonical = normalizeWhatsapp(value);
  if (!canonical) return "";
  const local = canonical.slice(2);
  return `(${local.slice(0, 2)}) ${local.slice(2, -4)}-${local.slice(-4)}`;
}
export function whatsappUrl(value: string | null, message?: string): string | null {
  const canonical = value ? normalizeWhatsapp(value) : null;
  if (!canonical) return null;
  const url = new URL(`https://wa.me/${canonical}`);
  if (message !== undefined) url.searchParams.set("text", message);
  return url.toString();
}
