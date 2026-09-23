"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChatBooking } from "@/components/chat-booking";
import { ChatCalBooking } from "@/components/chat-cal-booking";
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

type ChatProfile = Pick<Profile, "slug" | "chatTheme" | "displayName" | "company" | "isDemo" | "email" | "phone" | "suggestedQuestions"> & {
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

function renderInlineMarkdown(value: string): ReactNode[] {
  return value.split(/(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`)/g).map((part, index) => {
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    return part;
  });
}

function AssistantMessageContent({ content }: { content: string }) {
  const normalized = content
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])[\t ]+-[\t ]+(?=(?:\*\*|__)[^*\n]+?:(?:\*\*|__))/g, "$1\n- ")
    .trim();
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let currentList: { type: "ul" | "ol"; items: string[] } | undefined;

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push(<p key={blocks.length}>{renderInlineMarkdown(paragraph.join(" "))}</p>);
    paragraph = [];
  }

  function flushList() {
    if (!currentList) return;
    const list = currentList;
    const items = list.items.map((item, index) => <li key={index}>{renderInlineMarkdown(item)}</li>);
    blocks.push(list.type === "ul"
      ? <ul key={blocks.length}>{items}</ul>
      : <ol key={blocks.length}>{items}</ol>);
    currentList = undefined;
  }

  for (const line of normalized.split("\n")) {
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const Heading = `h${heading[1].length}` as "h1" | "h2" | "h3";
      blocks.push(<Heading key={blocks.length}>{renderInlineMarkdown(heading[2])}</Heading>);
      continue;
    }

    const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/);
    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const item = unorderedItem ?? orderedItem;
    const listType = unorderedItem ? "ul" : orderedItem ? "ol" : undefined;
    if (item && listType) {
      flushParagraph();
      if (currentList && currentList.type !== listType) flushList();
      currentList ??= { type: listType, items: [] };
      currentList.items.push(item[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return <div className="assistant-message-content">{blocks}</div>;
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
  const isFusion = profile.chatTheme === "mummentum-fusion";
  const initialMessage = `Hallo! Ich bin der digitale Assistent von ${profile.company}. Wir helfen dir gern bei Fragen zu ${profile.displayName}, unseren Leistungen und einem Erstgespräch. Wenn du einen Termin vereinbaren möchtest, schreib einfach „Termin buchen“.${profile.isDemo ? " Dieses Beispielprofil enthält Demonstrationsdaten." : ""}`;
  const [messages, setMessages] = useState<Message[]>(isFusion ? [] : [{ role: "assistant", content: initialMessage }]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [retryText, setRetryText] = useState<string | null>(null);
  const sessionReady = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottom = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (!list || !shouldStickToBottom.current) return;
    const latest = messages.at(-1);
    if (!pending && latest?.action?.type === "show_booking_options") {
      const rows = list.querySelectorAll<HTMLElement>(".message-row");
      rows.item(rows.length - 1)?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    if (!isFusion || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const updateHeight = () => document.documentElement.style.setProperty("--fusion-viewport-height", `${Math.round(viewport.height)}px`);
    updateHeight();
    viewport.addEventListener("resize", updateHeight);
    return () => {
      viewport.removeEventListener("resize", updateHeight);
      document.documentElement.style.removeProperty("--fusion-viewport-height");
    };
  }, [isFusion]);

  function updateScrollPreference() {
    const list = listRef.current;
    if (!list) return;
    shouldStickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 96;
  }

  async function sendMessage(textValue?: string, retry = false) {
    const text = (textValue ?? input).trim();
    if (!text || pending) return;

    const updatedMessages = retry ? messages : [...messages, { role: "user" as const, content: text }];
    if (!retry) {
      setMessages(updatedMessages);
      setInput("");
    }
    setNotice("");
    setRetryText(null);
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
        if (response.status === 401) sessionReady.current = false;
        const errorText = typeof payload.error === "string"
          ? payload.error
          : "Ich konnte die Nachricht gerade nicht beantworten. Versuch es bitte noch einmal.";
        setNotice(errorText);
        setRetryText(text);
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
      setNotice("Die Verbindung ist gerade unterbrochen. Deine Nachricht ist noch im Chat.");
      setRetryText(text);
    } finally {
      setPending(false);
    }
  }

  const shortcuts = [
    { label: profile.suggestedQuestions[0] ?? "Was wird angeboten?", message: profile.suggestedQuestions[0] ?? "Was wird angeboten?" },
    { label: "Kontakt senden", message: "Bitte sende mir den Kontakt." },
    { label: "Termin buchen", message: "Ich möchte einen Termin buchen." },
  ];
  const renderShortcuts = (className: string) => (
    <div className={className} aria-label="Nachrichtenvorschläge">
      {shortcuts.map(({ label, message }) => (
        <button key={label} type="button" disabled={pending} onClick={() => void sendMessage(message)}>{label}<span aria-hidden="true">↗</span></button>
      ))}
    </div>
  );
  const showShortcuts = !isFusion && messages.length === 1;
  const lastMessage = messages.at(-1);
  const followUps = isFusion && !pending && !retryText && lastMessage?.role === "assistant" && lastMessage.action?.type !== "show_booking_options"
    ? profile.suggestedQuestions.filter((question) => !messages.some((message) => message.role === "user" && message.content === question)).slice(0, 2)
    : [];

  return (
    <main className="chat-page" data-theme={profile.chatTheme ?? "default"}>
      <section className="chat-app" aria-label={`Chat mit ${profile.company}`}>
        <header className="chat-header">
          <div className="assistant-avatar" aria-hidden="true">
            {profile.chatTheme === "mummentum-fusion" ? <span className="mummentum-mark" /> : "✳"}
          </div>
          <div className="assistant-title">
            <div><h1>{isFusion ? "mummentum" : `Chat mit ${profile.company}`}</h1><span className="ai-tag">KI</span></div>
            <p>{isFusion ? "VINCENT MUMME · KI-READINESS" : `Fragen zu ${profile.displayName}, unseren Leistungen und Terminen`}</p>
          </div>
          {profile.isDemo && <span className="demo-tag">DEMO</span>}
        </header>

        <div
          className={`message-list${isFusion && messages.length === 0 ? " message-list-welcome" : ""}`}
          ref={listRef}
          onScroll={updateScrollPreference}
          aria-live="polite"
          aria-relevant="additions text"
        >
          {isFusion && messages.length === 0 ? (
            <section className="fusion-welcome" aria-label="Einstieg bei mummentum">
              <div className="fusion-welcome-topline">
                <span>01 / KI-READINESS</span>
                <span aria-hidden="true" className="fusion-welcome-mark mummentum-mark" />
              </div>
              <h2>KI, die im Alltag funktioniert.</h2>
              <p className="fusion-welcome-intro">Wir klären, welche Anwendungen sich für euer Unternehmen lohnen und welche Grundlage dafür nötig ist. Frag mich nach unserem Vorgehen oder starte mit einem Erstgespräch.</p>
              <div className="fusion-welcome-actions" aria-label="Gespräch beginnen">
                <button type="button" className="fusion-welcome-primary" disabled={pending} onClick={() => void sendMessage("Ich möchte ein kostenloses Erstgespräch buchen.")}>
                  <span>Kostenloses Erstgespräch</span><span aria-hidden="true">↗</span>
                </button>
                <button type="button" className="fusion-welcome-secondary" disabled={pending} onClick={() => void sendMessage("Was ist ein KI-Readiness Audit?")}>
                  <span>KI-Readiness Audit</span><span aria-hidden="true">↗</span>
                </button>
                <button type="button" className="fusion-welcome-secondary" disabled={pending} onClick={() => void sendMessage("Wie läuft eine Zusammenarbeit mit mummentum ab?")}>
                  <span>Unser Vorgehen</span><span aria-hidden="true">↗</span>
                </button>
              </div>
              <p className="fusion-welcome-note">ERSTGESPRÄCH / 30 MINUTEN / KEINE UNTERLAGEN NÖTIG</p>
            </section>
          ) : <div className="date-divider"><span>CHAT</span></div>}
          {messages.map((message, index) => (
            <div className={`message-row ${message.role === "user" ? "message-row-user" : ""}${isFusion && message.action?.type === "show_booking_options" ? " message-row-booking" : ""}`} key={`${index}-${message.role}`}>
              {message.role === "assistant" && (
                <div className="message-avatar" aria-hidden="true">
                  {profile.chatTheme === "mummentum-fusion" ? <span className="mummentum-mark" /> : "✳"}
                </div>
              )}
              <div className={`message-bubble ${message.role === "user" ? "message-bubble-user" : ""}${message.action?.type === "show_booking_options" ? " message-bubble-booking" : ""}${message.action?.type === "show_booking_options" && bookingOptions.some((option) => option.provider === "calcom") ? " message-bubble-cal-booking" : ""}`}>
                {message.role === "assistant"
                  ? <AssistantMessageContent content={message.content} />
                  : <p className="user-message-content">{message.content}</p>}
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
                        ) : option.provider === "calcom" && option.calLink ? (
                          <ChatCalBooking key={option.id} option={option} />
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
            <div className="message-row" role="status" aria-label="Antwort wird erstellt">
              <div className="message-avatar" aria-hidden="true">
                {profile.chatTheme === "mummentum-fusion" ? <span className="mummentum-mark" /> : "✳"}
              </div>
              <div className="message-bubble typing-bubble"><i /><i /><i /><span className="sr-only">Antwort wird erstellt</span></div>
            </div>
          )}
          {followUps.length > 0 && (
            <div className="chat-followups" aria-label="Weitere Fragen">
              <span>WEITERFRAGEN</span>
              {followUps.map((question) => <button type="button" key={question} onClick={() => void sendMessage(question)}>{question}<span aria-hidden="true">↗</span></button>)}
            </div>
          )}
        </div>

        {showShortcuts && renderShortcuts("chat-shortcuts")}

        {notice && (
          <div className="chat-notice" role="alert">
            <span>{notice}</span>
            {retryText && <button type="button" disabled={pending} onClick={() => void sendMessage(retryText, true)}>Erneut versuchen ↗</button>}
          </div>
        )}
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
            enterKeyHint="send"
            disabled={pending}
          />
          <button className="send-button" type="submit" disabled={pending || !input.trim()} aria-label="Nachricht senden">
            <span aria-hidden="true">↑</span>
          </button>
        </form>
        <footer className="chat-disclaimer">
          <span>KI-Assistent von {profile.company} · Antworten aus freigegebenen Informationen</span>
          {isFusion && (
            <nav aria-label="Rechtliche Informationen">
              <a href="https://www.mummentum.de/datenschutz" target="_blank" rel="noreferrer">Datenschutz</a>
              <a href="https://www.mummentum.de/impressum" target="_blank" rel="noreferrer">Impressum</a>
            </nav>
          )}
        </footer>
      </section>
    </main>
  );
}
