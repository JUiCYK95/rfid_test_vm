import type { Metadata, Viewport } from "next";
import { ChatAssistant } from "@/components/chat-assistant";
import { getActiveOffers, getBookingOptions, getProfileByCardToken, getPublicWebsite } from "@/lib/profile";

type PageProps = { params: Promise<{ cardToken: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { cardToken } = await params;
  const profile = getProfileByCardToken(cardToken);
  if (!profile) return { title: "Karte nicht verfügbar" };

  const metadata: Metadata = {
    title: `${profile.displayName} · ${profile.company}`,
    description: profile.bio,
  };

  if (profile.slug === "vincent") {
    metadata.applicationName = "mummentum";
    metadata.manifest = "/mummentum.webmanifest";
    metadata.icons = {
      icon: [
        { url: "/mummentum-icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/mummentum-icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/mummentum-apple-icon.png", sizes: "180x180", type: "image/png" }],
    };
    metadata.appleWebApp = { capable: true, title: "mummentum", statusBarStyle: "black" };
    metadata.other = { "apple-mobile-web-app-capable": "yes" };
  }

  return metadata;
}

export async function generateViewport({ params }: PageProps): Promise<Viewport> {
  const { cardToken } = await params;
  const profile = getProfileByCardToken(cardToken);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: profile?.slug === "vincent" ? "#101010" : "#f4f3ef",
  };
}

export default async function CardPage({ params }: PageProps) {
  const { cardToken } = await params;
  const profile = getProfileByCardToken(cardToken);

  if (!profile) {
    return (
      <main className="chat-page">
        <section className="chat-app chat-unavailable" aria-label="Chat nicht verfügbar">
          <header className="chat-header"><div className="assistant-avatar" aria-hidden="true">✳</div><div className="assistant-title"><h1>Chat nicht verfügbar</h1><p>Digitale Visitenkarte</p></div></header>
          <div className="message-list"><div className="message-row"><div className="message-avatar" aria-hidden="true">✳</div><div className="message-bubble"><p>Diese Karte ist momentan nicht verfügbar. Bitte prüfe den Link.</p></div></div></div>
        </section>
      </main>
    );
  }

  return (
    <ChatAssistant
      key={profile.slug}
      profile={{
        slug: profile.slug,
        chatTheme: profile.chatTheme,
        displayName: profile.displayName,
        company: profile.company,
        isDemo: profile.isDemo,
        email: profile.email,
        phone: profile.phone,
        website: getPublicWebsite(profile),
        socialMedia: profile.socialMedia ?? [],
        suggestedQuestions: profile.suggestedQuestions,
      }}
      bookingOptions={getBookingOptions(profile)}
      offers={getActiveOffers(profile)}
    />
  );
}
