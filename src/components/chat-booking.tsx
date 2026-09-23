"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { BookingOption } from "@/lib/profile";

type Slot = { start: string };
type Month = { year: number; month: number };
type Availability = Record<string, Slot[]>;

const TOPICS = ["Beratung", "Automatisierung", "Entwicklung", "Schulung", "Sonstiges"];
const LEAD_SOURCES = ["LinkedIn", "Instagram", "TikTok", "Andere"];
const TIME_ZONE = "Europe/Berlin";

function berlinDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value) - 1,
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function dateKey(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month, day));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function compareMonths(left: Month, right: Month): number {
  return left.year * 12 + left.month - (right.year * 12 + right.month);
}

function formatMonth(month: Month): string {
  return new Date(Date.UTC(month.year, month.month, 1)).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function formatLongDate(value: string): string {
  return new Date(value).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  });
}

export function ChatBooking({ profileSlug, option }: { profileSlug: string; option: BookingOption }) {
  const today = useMemo(() => berlinDateParts(new Date()), []);
  const currentMonth = useMemo(() => ({ year: today.year, month: today.month }), [today]);
  const [month, setMonth] = useState<Month>(currentMonth);
  const [availability, setAvailability] = useState<Availability>({});
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedDay, setSelectedDay] = useState("");
  const [selectedStart, setSelectedStart] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [leadSource, setLeadSource] = useState("");
  const [leadSourceDetail, setLeadSourceDetail] = useState("");
  const [notes, setNotes] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const start = dateKey(month.year, month.month, 1);
    const end = dateKey(month.year, month.month + 2, 0);
    const params = new URLSearchParams({ profileSlug, bookingId: option.id, start, end });
    let cancelled = false;

    setLoadingSlots(true);
    setAvailabilityError("");
    void fetch(`/api/chat/booking?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { data?: Availability; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error || "Zeiten konnten nicht geladen werden.");
        if (!cancelled) setAvailability((current) => ({ ...current, ...payload.data }));
      })
      .catch((error: unknown) => {
        if (!cancelled) setAvailabilityError(error instanceof Error ? error.message : "Zeiten konnten nicht geladen werden.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => { cancelled = true; };
  }, [month, option.id, profileSlug]);

  useEffect(() => {
    if (selectedStart) formRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedStart]);

  const firstWeekday = (new Date(Date.UTC(month.year, month.month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const maxMonth = { year: today.year, month: today.month + 6 };
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const monthHasAvailability = days.some((day) => (availability[dateKey(month.year, month.month, day)]?.length ?? 0) > 0);

  function changeMonth(delta: number) {
    setMonth((current) => ({ year: current.year, month: current.month + delta }));
    setSelectedDay("");
    setSelectedStart("");
  }

  function toggleTopic(topic: string) {
    setTopics((current) => current.includes(topic)
      ? current.filter((value) => value !== topic)
      : [...current, topic]);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStart || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await fetch("/api/chat/booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileSlug,
          bookingId: option.id,
          start: selectedStart,
          firstName,
          lastName,
          email,
          phone,
          company,
          topics,
          leadSource,
          leadSourceDetail: leadSource === "Andere" ? leadSourceDetail : undefined,
          notes,
        }),
      });
      const payload = (await response.json()) as { status?: string; error?: string };
      if (!response.ok || payload.status !== "pending_confirmation") {
        throw new Error(payload.error || "Die Buchungsanfrage konnte nicht gesendet werden.");
      }
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Die Buchungsanfrage konnte nicht gesendet werden.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="booking-card" aria-label={`Buchung: ${option.label}`}>
      <div className="booking-card-heading">
        <div>
          <strong>{option.label}</strong>
          <span>{option.durationMinutes} Minuten · kostenlos · Google Meet</span>
        </div>
        <span className="booking-calendar-icon" aria-hidden="true">◷</span>
      </div>

      {submitted ? (
        <div className="booking-success" role="status">
          <strong>Terminanfrage gesendet</strong>
          <span>Florian muss den Termin noch per E-Mail bestätigen. Prüfe auch deinen Spam-Ordner. Den Google-Meet-Link erhältst du nach der Bestätigung.</span>
        </div>
      ) : (
        <>
          <div className="booking-calendar-header">
            <button type="button" onClick={() => changeMonth(-1)} disabled={compareMonths(month, currentMonth) <= 0} aria-label="Vorheriger Monat">‹</button>
            <strong>{formatMonth(month)}</strong>
            <button type="button" onClick={() => changeMonth(1)} disabled={compareMonths(month, maxMonth) >= 0} aria-label="Nächster Monat">›</button>
          </div>

          <div className="booking-weekdays" aria-hidden="true">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="booking-days" aria-label={formatMonth(month)}>
            {Array.from({ length: firstWeekday }, (_, index) => <span className="booking-day-empty" key={`empty-${index}`} />)}
            {days.map((day) => {
              const key = dateKey(month.year, month.month, day);
              const hasSlots = (availability[key]?.length ?? 0) > 0;
              const isPast = key < dateKey(today.year, today.month, today.day);
              return (
                <button
                  className={`booking-day${selectedDay === key ? " booking-day-selected" : ""}${hasSlots ? " booking-day-available" : ""}`}
                  type="button"
                  key={key}
                  disabled={loadingSlots || isPast || !hasSlots}
                  aria-pressed={selectedDay === key}
                  onClick={() => { setSelectedDay(key); setSelectedStart(""); }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="booking-inline-status" role="status">
            {loadingSlots && <span>Freie Zeiten werden geladen …</span>}
            {!loadingSlots && availabilityError && <span className="booking-error">{availabilityError}</span>}
            {!loadingSlots && !availabilityError && !selectedDay && <span>{monthHasAvailability ? "Wähle einen verfügbaren Tag." : "In diesem Monat sind keine freien Zeiten verfügbar."}</span>}
          </div>

          {selectedDay && (
            <div className="booking-time-section">
              <strong>{new Date(`${selectedDay}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</strong>
              {(availability[selectedDay] ?? []).length > 0 ? (
                <div className="booking-times">
                  {(availability[selectedDay] ?? []).map((slot) => (
                    <button
                      type="button"
                      key={slot.start}
                      className={selectedStart === slot.start ? "booking-time-selected" : ""}
                      aria-pressed={selectedStart === slot.start}
                      onClick={() => setSelectedStart(slot.start)}
                    >
                      {formatTime(slot.start)}
                    </button>
                  ))}
                </div>
              ) : <span>Für diesen Tag gibt es keine freien Zeiten.</span>}
            </div>
          )}

          {selectedStart && (
            <form className="booking-form" ref={formRef} onSubmit={(event) => void submitBooking(event)}>
              <div className="booking-selected-time">
                <strong>{formatLongDate(selectedStart)}</strong>
                <span>{formatTime(selectedStart)}–{formatTime(new Date(new Date(selectedStart).getTime() + option.durationMinutes * 60_000).toISOString())} Uhr · Google Meet</span>
              </div>

              <div className="booking-fields-two">
                <label>Vorname *<input required maxLength={80} autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
                <label>Nachname *<input required maxLength={80} autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
              </div>
              <label>E-Mail-Adresse *<input required type="email" maxLength={200} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <div className="booking-fields-two">
                <label>Telefon (optional)<input type="tel" maxLength={80} autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
                <label>Firma (optional)<input maxLength={160} autoComplete="organization" value={company} onChange={(event) => setCompany(event.target.value)} /></label>
              </div>

              <fieldset className="booking-fieldset">
                <legend>Worum geht es? *<span>Wähle mindestens ein Thema.</span></legend>
                <div className="booking-chips">
                  {TOPICS.map((topic) => (
                    <label className={`booking-chip${topics.includes(topic) ? " booking-chip-selected" : ""}`} key={topic}>
                      <input type="checkbox" checked={topics.includes(topic)} onChange={() => toggleTopic(topic)} />
                      {topic}
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="booking-fieldset">
                <legend>Wie hast du von Florian erfahren? *</legend>
                <div className="booking-chips">
                  {LEAD_SOURCES.map((source) => (
                    <button className={`booking-chip${leadSource === source ? " booking-chip-selected" : ""}`} type="button" key={source} aria-pressed={leadSource === source} onClick={() => setLeadSource(source)}>
                      {source}
                    </button>
                  ))}
                </div>
              </fieldset>
              {leadSource === "Andere" && (
                <label>Wo hast du von Florian erfahren? *<input required maxLength={200} value={leadSourceDetail} onChange={(event) => setLeadSourceDetail(event.target.value)} /></label>
              )}
              <label>Zusätzliche Notizen *<textarea required maxLength={1200} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Worum möchtest du im Gespräch sprechen?" /></label>

              <p className="booking-privacy-note">
                Beim Senden wird deine Anfrage an Schunera übermittelt. Der Termin ist erst nach Bestätigung per E-Mail verbindlich. {option.privacyUrl && <a href={option.privacyUrl} target="_blank" rel="noreferrer">Datenschutz</a>}
              </p>
              {submitError && <p className="booking-error" role="alert">{submitError}</p>}
              <button className="booking-submit" type="submit" disabled={submitting || topics.length === 0 || !leadSource || (leadSource === "Andere" && !leadSourceDetail.trim())}>
                {submitting ? "Anfrage wird gesendet …" : "Termin anfragen"}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
