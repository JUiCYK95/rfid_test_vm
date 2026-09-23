import { NextRequest, NextResponse } from "next/server";
import {
  answerFromProfileData,
  answerWithAssistant,
  fallbackAnswer,
  hasConfiguredAssistant,
  isWithinProfileScope,
  outOfScopeAnswer,
} from "@/lib/assistant";
import { getProfileBySlug } from "@/lib/profile";

export const runtime = "nodejs";

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();
const WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 8;
const MAX_BODY_BYTES = 16_000;
const COOKIE_NAME = "nfc_chat_session";

function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function registerMessage(sessionId: string): boolean {
  const now = Date.now();
  if (rateWindows.size > 5_000) {
    for (const [key, value] of rateWindows) {
      if (now - value.startedAt >= WINDOW_MS) rateWindows.delete(key);
    }
    if (rateWindows.size > 5_000) {
      const oldest = rateWindows.keys().next().value;
      if (oldest) rateWindows.delete(oldest);
    }
  }

  const current = rateWindows.get(sessionId);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    rateWindows.set(sessionId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_MESSAGES_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const statedLength = Number(request.headers.get("content-length") ?? 0);
  if (statedLength > MAX_BODY_BYTES) return json({ error: "Die Nachricht ist zu lang." }, 413);
  const sessionId = request.cookies.get(COOKIE_NAME)?.value;
  if (!sessionId || !/^[0-9a-f-]{36}$/i.test(sessionId)) {
    return json({ error: "Deine Chatsitzung ist abgelaufen. Lade die Seite neu und versuche es erneut." }, 401);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: "Die Anfrage konnte nicht gelesen werden." }, 400);
  }
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return json({ error: "Die Nachricht ist zu lang." }, 413);
  }

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return json({ error: "Die Anfrage enthält kein gültiges JSON." }, 400);
  }
  if (!input || typeof input !== "object") return json({ error: "Die Anfrage ist unvollständig." }, 400);

  const body = input as {
    profileSlug?: unknown;
    messages?: unknown;
  };
  if (typeof body.profileSlug !== "string") {
    return json({ error: "Die Anfrage ist unvollständig." }, 400);
  }
  if (!/^[a-z0-9-]{1,48}$/.test(body.profileSlug)) {
    return json({ error: "Die Anfrage ist ungültig." }, 400);
  }

  const profile = getProfileBySlug(body.profileSlug);
  if (!profile) return json({ error: "Dieses Profil ist nicht verfügbar." }, 404);

  if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 8) {
    return json({ error: "Es konnten höchstens acht Nachrichten übertragen werden." }, 400);
  }
  const messages = body.messages.map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const message = entry as { role?: unknown; content?: unknown };
    if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") return null;
    if (!message.content.trim() || message.content.length > 1_400) return null;
    return { role: message.role, content: message.content.trim() };
  });
  if (messages.some((message) => message === null) || messages[messages.length - 1]?.role !== "user") {
    return json({ error: "Die Nachrichten haben ein ungültiges Format." }, 400);
  }

  if (!registerMessage(sessionId)) {
    return json({ error: "Bitte warte kurz, bevor du eine weitere Frage stellst." }, 429);
  }

  const question = messages[messages.length - 1]?.content;
  const chatMessages = messages as Array<{ role: "user" | "assistant"; content: string }>;
  // Approved prompts already belong to this profile and have published answers.
  // Serve them directly so the primary paths stay responsive during AI outages.
  if (question && (profile.suggestedQuestions.includes(question) || [
    "Ich möchte ein kostenloses Erstgespräch buchen.",
    "Ich möchte einen Termin buchen.",
    "Bitte sende mir den Kontakt.",
    ...(profile.chatTheme === "mummentum-fusion" ? ["Wie läuft eine Zusammenarbeit mit mummentum ab?"] : []),
  ].includes(question))) {
    const profileAnswer = answerFromProfileData(profile, question);
    if (profileAnswer) return json(profileAnswer);
  }
  if (!hasConfiguredAssistant()) {
    if (question) {
      const profileAnswer = answerFromProfileData(profile, question);
      if (profileAnswer && !profileAnswer.action) return json(profileAnswer);
    }
    return json(fallbackAnswer(profile));
  }

  try {
    if (!(await isWithinProfileScope(profile, chatMessages))) return json(outOfScopeAnswer(profile));
    if (question) {
      const profileAnswer = answerFromProfileData(profile, question);
      if (profileAnswer) return json(profileAnswer);
    }
    const answer = await answerWithAssistant(profile, chatMessages);
    return json(answer);
  } catch {
    return json({
      error: "Der Assistent ist gerade nicht erreichbar. Bitte versuche es später noch einmal.",
      code: "AI_UNAVAILABLE",
    }, 502);
  }
}
