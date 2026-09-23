"use client";

import { useEffect, useRef, useState } from "react";
import { ChatBooking } from "@/components/chat-booking";
import type { BookingOption, Offer, Profile } from "@/lib/profile";

type Action =
  | { type: "show_contact" }
  | { type: "show_social_links" }
  | { type: "show_booking_options" }
  | { type: "show_offers" }
  | { type: "show_offer"; id: string };

type Message = {
  role: "user" | "assistant";
  content: string;
  action?: Action;
  citations?: Citation[];
};

type Citation = { title: string; url: string };

type ChatProfile = Pick<Profile, "slug" | "displayName" | "company" | "isDemo" | "email" | "phone" | "suggestedQuestions"> & {
  website?: string;
  socialMedia: NonNullable<Profile["socialMedia"]>;
};

function validAction(value: unknown, bookingIds: string[], offerIds: string[], socialLinkCount: number): Action | undefined {
  if (!value || typeof value !== "object" || !("type" in value)) return undefined;
  const action = value as { type?: unknown; id?: unknown };
  if (action.type === "show_contact") return { type: "show_contact" };
  if (action.type === "show_social_links" && socialLinkCount > 0) return { type: "show_social_links" };
  if (action.type === "show_booking_options" && bookingIds.length > 0) return { type: "show_booking_options" };
  if (action.type === "show_offers" && offerIds.length > 0) return { type: "show_offers" };
  if (action.type === "show_offer" && typeof action.id === "string" && offerIds.includes(action.id)) {
    return { type: "show_offer", id: action.id };
  }
  return undefined;
}

function validCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const citation = item as { title?: unknown; url?: unknown };
    if (typeof citation.url !== "string") continue;
    try {
      const url = new URL(citation.url);
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || (host !== "schunera.de" && !host.endsWith(".schunera.de")) || seen.has(url.href)) continue;
      seen.add(url.href);
      citations.push({
        title: typeof citation.title === "string" && citation.title.trim() ? citation.title.trim() : host,
        url: url.href,
      });
    } catch {
      continue;
    }
    if (citations.length === 5) break;
  }
  return citations;
}

function OfferResult({ action, offers }: { action: Action; offers: Offer[] }) {
  if (action.type !== "show_offer") return null;
  const offer = offers.find(({ id }) => id === action.id);
  if (!offer) return null;
  return <article className="result-offer"><strong>{offer.title}</strong><span>{offer.description}</span></article>;
}

export function ChatAssistant({
  profile,
  bookingOptions,
  offers,
}: {
  profile: ChatProfile;
  bookingOptions: BookingOption[];
  offers: Offer[];
}) {
  const initialMessage = `Hallo! Ich bin der KI-Assistent von ${profile.displayName}${profile.company ? ` bei ${profile.company}` : ""}. Frag mich gern zu meiner Arbeit oder zum Erstgespräch. Für einen Termin schreib einfach „Termin buchen“.${profile.isDemo ? " Dieses Profil enthält noch Beispieldaten." : ""}`;
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: initialMessage },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const sessionReady = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);

  useEffect(() => {
    if (shouldStickToBottom.current && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, pending]);

  function updateScrollPreference() {
    const list = listRef.current;
    if (!list) return;
    shouldStickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 96;
  }

  async function sendMessage(textValue?: string) {
    const text = (textValue ?? input).trim();
    if (!text || pending) return;

    const updatedMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(updatedMessages);
    setInput("");
    setNotice("");
    setPending(true);
    shouldStickToBottom.current = true;

    try {
      if (!sessionReady.current) {
        const sessionResponse = await fetch("/api/chat/sessions", { method: "POST" });
        if (!sessionResponse.ok) throw new Error("SESSION_UNAVAILABLE");
        sessionReady.current = true;
      }
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileSlug: profile.slug,
          messages: updatedMessages.slice(-8).map(({ role, content }) => ({ role, content })),
        }),
      });
      const payload = (await response.json()) as { message?: unknown; action?: unknown; citations?: unknown; error?: unknown };
      if (!response.ok || typeof payload.message !== "string") {
        const errorText = typeof payload.error === "string"
          ? payload.error
          : "Ich konnte die Nachricht gerade nicht beantworten. Versuch es bitte noch einmal.";
        setMessages((current) => [...current, { role: "assistant", content: errorText }]);
        return;
      }

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.message as string,
          action: validAction(
            payload.action,
            bookingOptions.map(({ id }) => id),
            offers.map(({ id }) => id),
            profile.socialMedia.length,
          ),
          citations: validCitations(payload.citations),
        },
      ]);
    } catch {
      setNotice("Die Verbindung ist gerade unterbrochen. Deine Nachricht bleibt in diesem Chat, du kannst es erneut versuchen.");
    } finally {
      setPending(false);
    }
  }

  const shortcuts = [
    { label: profile.suggestedQuestions[0] ?? "Was wird angeboten?", message: profile.suggestedQuestions[0] ?? "Was wird angeboten?" },
    { label: "Kontakt senden", message: "Bitte sende mir den Kontakt." },
    { label: "Termin buchen", message: "Ich möchte einen Termin buchen." },
  ];

  return (
    <main className="chat-page">
      <section className="chat-app" aria-label={`Chat mit dem KI-Assistenten von ${profile.displayName}`}>
        <header className="chat-header">
          <div className="assistant-avatar" aria-hidden="true">✳</div>
          <div className="assistant-title">
            <div><h1>Chat mit {profile.displayName}</h1><span className="ai-tag">KI</span></div>
            <p>Assistent von {profile.company}</p>
          </div>
          {profile.isDemo && <span className="demo-tag">DEMO</span>}
        </header>

        <div
          className="message-list"
          ref={listRef}
          onScroll={updateScrollPreference}
          aria-live="polite"
          aria-relevant="additions text"
        >
          <div className="date-divider"><span>CHAT</span></div>
          {messages.map((message, index) => (
            <div className={`message-row ${message.role === "user" ? "message-row-user" : ""}`} key={`${index}-${message.role}`}>
              {message.role === "assistant" && <div className="message-avatar" aria-hidden="true">✳</div>}
              <div className={`message-bubble ${message.role === "user" ? "message-bubble-user" : ""}${message.action?.type === "show_booking_options" ? " message-bubble-booking" : ""}`}>
                <p>{message.content}</p>
                {message.role === "assistant" && message.citations && message.citations.length > 0 && (
                  <div className="message-citations" aria-label="Quellen zur Antwort">
                    <span>Quellen</span>
                    {message.citations.map((citation) => (
                      <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer">{citation.title}<span aria-hidden="true"> ↗</span></a>
                    ))}
                  </div>
                )}
                {message.role === "assistant" && message.action && (
                  <div className="message-results">
                    {message.action.type === "show_contact" && (
                      <div className="result-contact">
                        {profile.email && <a href={`mailto:${profile.email}`}>{profile.email}</a>}
                        {profile.phone && <a href={`tel:${profile.phone.replace(/[^+\d]/g, "")}`}>{profile.phone}</a>}
                        {profile.website && <a href={profile.website} target="_blank" rel="noreferrer">{new URL(profile.website).hostname} ↗</a>}
                        <a className="result-primary" href={`/api/profiles/${profile.slug}/contact.vcf`}>
                          <span className="result-icon" aria-hidden="true">VCF</span>
                          <span><strong>Kontaktkarte speichern</strong><small>Als vCard herunterladen</small></span>
                          <span aria-hidden="true">↓</span>
                        </a>
                      </div>
                    )}
                    {message.action.type === "show_social_links" && (
                      <div className="result-contact">
                        {profile.socialMedia.map((social) => (
                          <a href={social.url} target="_blank" rel="noreferrer" key={social.platform}>
                            {social.platform} ↗
                          </a>
                        ))}
                      </div>
                    )}
                    {message.action.type === "show_booking_options" && (
                      <div className="result-options">
                        {bookingOptions.map((option) => option.provider === "schunera" ? (
                          <ChatBooking key={option.id} profileSlug={profile.slug} option={option} />
                        ) : (
                          <a className="result-primary" href={option.url} target="_blank" rel="noreferrer" key={option.id}>
                            <span className="result-icon" aria-hidden="true">◷</span>
                            <span><strong>{option.label}</strong><small>{option.durationMinutes} Minuten · Im Kalender auswählen</small></span>
                            <span aria-hidden="true">↗</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {message.action.type === "show_offers" && (
                      <div className="result-options">
                        {offers.map((offer) => (
                          <article className="result-offer" key={offer.id}>
                            <strong>{offer.title}</strong>
                            <span>{offer.description}</span>
                          </article>
                        ))}
                      </div>
                    )}
                    {message.action.type === "show_offer" && <OfferResult action={message.action} offers={offers} />}
                  </div>
                )}
              </div>
            </div>
          ))}
          {pending && (
            <div className="message-row" aria-label="Antwort wird erstellt">
              <div className="message-avatar" aria-hidden="true">✳</div>
              <div className="message-bubble typing-bubble"><i /><i /><i /></div>
            </div>
          )}
        </div>

        {messages.length === 1 && (
          <div className="chat-shortcuts" aria-label="Nachrichtenvorschläge">
            {shortcuts.map(({ label, message }) => (
              <button key={label} type="button" disabled={pending} onClick={() => void sendMessage(message)}>{label}<span aria-hidden="true">↗</span></button>
            ))}
          </div>
        )}

        {notice && <p className="chat-notice" role="status">{notice}</p>}
        <form className="composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
          <label className="sr-only" htmlFor="chat-input">Nachricht</label>
          <input
            id="chat-input"
            type="text"
            maxLength={1400}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Schreib eine Nachricht …"
            autoComplete="off"
            disabled={pending}
          />
          <button className="send-button" type="submit" disabled={pending || !input.trim()} aria-label="Nachricht senden">
            <span aria-hidden="true">↑</span>
          </button>
        </form>
        <p className="chat-disclaimer">KI-Assistent · Antworten basieren auf freigegebenen Informationen.</p>
      </section>
    </main>
  );
}
