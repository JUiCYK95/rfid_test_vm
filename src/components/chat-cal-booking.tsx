"use client";

import { useEffect, useRef } from "react";
import type { BookingOption } from "@/lib/profile";

type CalNamespace = ((...args: unknown[]) => void) & { q?: unknown[][] };
type CalApi = CalNamespace & {
  loaded?: boolean;
  ns?: Record<string, CalNamespace>;
};

declare global {
  interface Window {
    Cal?: CalApi;
  }
}

const EMBED_SCRIPT = "https://app.cal.com/embed/embed.js";
const CAL_ORIGIN = "https://app.cal.com";
const NAMESPACE = "mummentum30min";

const CAL_UI = {
  theme: "dark",
  layout: "month_view",
  hideEventTypeDetails: true,
  showTimezoneWhenEventDetailsHidden: true,
  cssVarsPerTheme: {
    dark: {
      "--cal-bg": "#0b0b0b",
      "--cal-bg-muted": "#101010",
      "--cal-bg-subtle": "#171717",
      "--cal-bg-emphasis": "#292929",
      "--cal-brand": "#f3f3f3",
      "--cal-brand-emphasis": "#ffffff",
      "--cal-brand-text": "#0b0b0b",
    },
    light: {
      "--cal-bg": "#f3f3f3",
      "--cal-bg-muted": "#e7e7e7",
      "--cal-bg-subtle": "#dddddd",
      "--cal-bg-emphasis": "#c8c8c8",
      "--cal-brand": "#0b0b0b",
      "--cal-brand-emphasis": "#171717",
      "--cal-brand-text": "#f3f3f3",
    },
  },
};

function getCalApi(): CalApi {
  if (window.Cal) return window.Cal;

  const cal = ((...args: unknown[]) => {
    const api = window.Cal!;
    if (!api.loaded) {
      api.ns = {};
      api.q = api.q ?? [];
      const script = document.createElement("script");
      script.src = EMBED_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
      api.loaded = true;
    }

    if (args[0] === "init") {
      const namespace = args[1];
      if (typeof namespace === "string") {
        const namespaceCal = api.ns![namespace] ?? Object.assign(
          (...namespaceArgs: unknown[]) => namespaceCal.q?.push(namespaceArgs),
          { q: [] as unknown[][] },
        );
        api.ns![namespace] = namespaceCal;
        namespaceCal.q = namespaceCal.q ?? [];
        namespaceCal.q.push(args);
        api.q!.push(["initNamespace", namespace]);
      } else {
        api.q!.push(args);
      }
      return;
    }

    api.q!.push(args);
  }) as CalApi;

  window.Cal = cal;
  return cal;
}

export function ChatCalBooking({ option }: { option: BookingOption }) {
  const embedRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const element = embedRef.current;
    if (!element || !option.calLink || initialized.current) return;
    initialized.current = true;

    const cal = getCalApi();
    cal("init", NAMESPACE, { origin: CAL_ORIGIN });
    const namespaceCal = cal.ns?.[NAMESPACE];
    namespaceCal?.("ui", CAL_UI);
    namespaceCal?.("inline", {
      elementOrSelector: element,
      calLink: option.calLink,
      config: {
        layout: "month_view",
        theme: "dark",
        iframeAttrs: { title: `${option.label} bei mummentum buchen` },
      },
    });
  }, [option.calLink, option.label]);

  return (
    <section className="cal-booking-card" aria-label={`Buchung: ${option.label}`}>
      <header className="cal-booking-heading">
        <div>
          <span>TERMINBUCHUNG · {option.durationMinutes} MINUTEN</span>
          <strong>{option.label}</strong>
        </div>
        <span aria-hidden="true">CAL.COM</span>
      </header>
      <div ref={embedRef} className="cal-booking-embed" />
      <footer className="cal-booking-footer">
        <span>Die Terminbuchung wird über Cal.com abgewickelt.</span>
        <span>
          <a href={option.url} target="_blank" rel="noreferrer">Buchungsseite separat öffnen ↗</a>
          {option.privacyUrl && <> · <a href={option.privacyUrl} target="_blank" rel="noreferrer">Datenschutz</a></>}
        </span>
      </footer>
    </section>
  );
}
