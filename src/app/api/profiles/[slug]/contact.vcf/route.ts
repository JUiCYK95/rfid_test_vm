import { NextResponse } from "next/server";
import { getProfileBySlug } from "@/lib/profile";
import { createVCard, createVCardFilename } from "@/lib/vcard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;
  const profile = getProfileBySlug(slug);
  if (!profile) {
    return NextResponse.json({ error: "Dieses Profil ist nicht verfügbar." }, { status: 404 });
  }

  return new NextResponse(createVCard(profile), {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": `attachment; filename="${createVCardFilename(profile)}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
