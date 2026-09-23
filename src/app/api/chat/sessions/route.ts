import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const COOKIE_NAME = "nfc_chat_session";
const SESSION_TTL_SECONDS = 30 * 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const existing = request.cookies.get(COOKIE_NAME)?.value;
  const sessionId = existing && /^[0-9a-f-]{36}$/i.test(existing) ? existing : randomUUID();
  const response = NextResponse.json({ ready: true }, {
    headers: { "Cache-Control": "no-store" },
  });
  response.cookies.set({
    name: COOKIE_NAME,
    value: sessionId,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/chat",
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}
