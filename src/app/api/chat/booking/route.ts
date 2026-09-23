import { NextRequest, NextResponse } from "next/server";
import { getBookingOptions, getProfileBySlug, type BookingOption } from "@/lib/profile";

export const runtime = "nodejs";

const COOKIE_NAME = "nfc_chat_session";
const BOOKING_ORIGIN = "https://schunera.de";
const TIME_ZONE = "Europe/Berlin";
const MAX_BODY_BYTES = 12_000;
const rateWindows = new Map<string, { startedAt: number; count: number }>();

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validSession(request: NextRequest): string | undefined {
  const sessionId = request.cookies.get(COOKIE_NAME)?.value;
  return sessionId && /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : undefined;
}

function registerRequest(sessionId: string, kind: "slots" | "book"): boolean {
  const now = Date.now();
  const key = `${sessionId}:${kind}`;
  if (rateWindows.size > 5_000) {
    for (const [entryKey, value] of rateWindows) {
      if (now - value.startedAt >= 60_000) rateWindows.delete(entryKey);
    }
    if (rateWindows.size > 5_000) {
      const oldest = rateWindows.keys().next().value;
      if (oldest) rateWindows.delete(oldest);
    }
  }
  const current = rateWindows.get(key);
  const limit = kind === "slots" ? 40 : 3;
  if (!current || now - current.startedAt >= 60_000) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function validDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateDistance(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

function isSchuneraBooking(option: BookingOption | undefined): option is BookingOption {
  if (!option || option.provider !== "schunera") return false;
  try {
    const url = new URL(option.url);
    return url.protocol === "https:" && url.hostname === "schunera.de";
  } catch {
    return false;
  }
}

function getBookingOption(profileSlug: string, bookingId: string): BookingOption | undefined {
  const profile = getProfileBySlug(profileSlug);
  if (!profile) return undefined;
  return getBookingOptions(profile).find((option) => option.id === bookingId && isSchuneraBooking(option));
}

async function fetchSlots(start: string, end: string): Promise<Record<string, { start: string }[]> | undefined> {
  const url = new URL("/api/cal/slots", BOOKING_ORIGIN);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  url.searchParams.set("timeZone", TIME_ZONE);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return undefined;
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("data" in payload)) return undefined;

    const data = (payload as { data?: unknown }).data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;

    const slots: Record<string, { start: string }[]> = {};
    for (const [date, entries] of Object.entries(data)) {
      if (!validDate(date) || !Array.isArray(entries)) continue;
      slots[date] = entries.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || !("start" in entry)) return [];
        const slotStart = (entry as { start?: unknown }).start;
        return typeof slotStart === "string" && !Number.isNaN(Date.parse(slotStart)) ? [{ start: slotStart }] : [];
      });
    }
    return slots;
  } catch {
    return undefined;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = validSession(request);
  if (!sessionId) return json({ error: "Deine Chatsitzung ist abgelaufen. Lade die Seite neu und versuche es erneut." }, 401);

  const profileSlug = request.nextUrl.searchParams.get("profileSlug") ?? "";
  const bookingId = request.nextUrl.searchParams.get("bookingId") ?? "";
  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");
  if (!getBookingOption(profileSlug, bookingId)) return json({ error: "Diese Terminbuchung ist nicht verfügbar." }, 404);
  if (!validDate(start) || !validDate(end) || dateDistance(start, end) < 0 || dateDistance(start, end) > 62) {
    return json({ error: "Der angefragte Zeitraum ist ungültig." }, 400);
  }
  if (!registerRequest(sessionId, "slots")) return json({ error: "Bitte warte kurz, bevor du erneut nach freien Zeiten suchst." }, 429);

  const slots = await fetchSlots(start, end);
  if (!slots) return json({ error: "Die verfügbaren Zeiten sind gerade nicht erreichbar." }, 502);
  return json({ data: slots });
}

type BookingBody = {
  profileSlug?: unknown;
  bookingId?: unknown;
  start?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  company?: unknown;
  topics?: unknown;
  leadSource?: unknown;
  leadSourceDetail?: unknown;
  notes?: unknown;
};

const TOPICS = new Set(["Beratung", "Automatisierung", "Entwicklung", "Schulung", "Sonstiges"]);
const LEAD_SOURCES = new Set(["LinkedIn", "Instagram", "TikTok", "Andere"]);
const BOOKING_START = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean && clean.length <= maxLength ? clean : undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const sessionId = validSession(request);
  if (!sessionId) return json({ error: "Deine Chatsitzung ist abgelaufen. Lade die Seite neu und versuche es erneut." }, 401);
  if (request.headers.get("origin") !== request.nextUrl.origin) return json({ error: "Die Anfrage ist ungültig." }, 403);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return json({ error: "Die Buchungsdaten sind zu lang." }, 413);
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Die Buchungsdaten konnten nicht gelesen werden." }, 400);
  }
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return json({ error: "Die Buchungsdaten sind zu lang." }, 413);

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return json({ error: "Die Buchungsdaten enthalten kein gültiges JSON." }, 400);
  }
  if (!input || typeof input !== "object") return json({ error: "Die Buchungsdaten sind unvollständig." }, 400);
  const body = input as BookingBody;
  if (typeof body.profileSlug !== "string" || typeof body.bookingId !== "string" || !getBookingOption(body.profileSlug, body.bookingId)) {
    return json({ error: "Diese Terminbuchung ist nicht verfügbar." }, 404);
  }
  if (!registerRequest(sessionId, "book")) return json({ error: "Bitte warte kurz, bevor du eine weitere Buchung sendest." }, 429);

  const start = typeof body.start === "string" ? body.start : "";
  const firstName = cleanText(body.firstName, 80);
  const lastName = cleanText(body.lastName, 80);
  const email = cleanText(body.email, 200);
  const phone = body.phone === undefined || body.phone === "" ? undefined : cleanText(body.phone, 80);
  const company = body.company === undefined || body.company === "" ? undefined : cleanText(body.company, 160);
  const notes = cleanText(body.notes, 1_200);
  const topics = Array.isArray(body.topics) && body.topics.length <= TOPICS.size
    ? [...new Set(body.topics.filter((topic): topic is string => typeof topic === "string" && TOPICS.has(topic)))]
    : [];
  const leadSource = typeof body.leadSource === "string" && LEAD_SOURCES.has(body.leadSource) ? body.leadSource : "";
  const leadSourceDetail = body.leadSourceDetail === undefined || body.leadSourceDetail === ""
    ? undefined
    : cleanText(body.leadSourceDetail, 200);

  if (!BOOKING_START.test(start) || Number.isNaN(Date.parse(start))) return json({ error: "Bitte wähle einen verfügbaren Termin aus." }, 400);
  if (!firstName || !lastName) return json({ error: "Bitte gib Vor- und Nachnamen an." }, 400);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Bitte gib eine gültige E-Mail-Adresse an." }, 400);
  if (body.phone !== undefined && body.phone !== "" && !phone) return json({ error: "Die Telefonnummer ist zu lang." }, 400);
  if (body.company !== undefined && body.company !== "" && !company) return json({ error: "Der Firmenname ist zu lang." }, 400);
  if (!notes) return json({ error: "Bitte beschreibe kurz, worum es im Termin geht." }, 400);
  if (!Array.isArray(body.topics) || topics.length === 0 || topics.length !== new Set(body.topics).size) {
    return json({ error: "Bitte wähle mindestens ein Thema aus." }, 400);
  }
  if (!leadSource || (leadSource === "Andere" && !leadSourceDetail)) {
    return json({ error: "Bitte gib an, wie du von Florian erfahren hast." }, 400);
  }

  const day = start.slice(0, 10);
  const availableSlots = await fetchSlots(day, day);
  if (!availableSlots) return json({ error: "Die Verfügbarkeit kann gerade nicht geprüft werden." }, 502);
  if (!availableSlots[day]?.some((slot) => slot.start === start)) {
    return json({ error: "Dieser Termin ist inzwischen vergeben. Bitte wähle eine andere Zeit." }, 409);
  }

  try {
    const response = await fetch(new URL("/api/cal/book", BOOKING_ORIGIN), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        start,
        name: `${firstName} ${lastName}`,
        vorname: firstName,
        nachname: lastName,
        email,
        timeZone: TIME_ZONE,
        telefon: phone,
        firmenname: company,
        interesse: topics,
        leadSource,
        leadSourceDetail: leadSource === "Andere" ? leadSourceDetail : undefined,
        nachricht: notes,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      return response.status === 409
        ? json({ error: "Dieser Termin ist inzwischen vergeben. Bitte wähle eine andere Zeit." }, 409)
        : json({ error: "Die Buchungsanfrage konnte gerade nicht gesendet werden. Bitte versuche es später erneut." }, 502);
    }
    return json({ status: "pending_confirmation" });
  } catch {
    return json({ error: "Die Buchungsanfrage konnte gerade nicht gesendet werden. Bitte versuche es später erneut." }, 502);
  }
}
