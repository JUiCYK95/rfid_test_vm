"use client";

import { useEffect, useRef, useState } from "react";
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
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unavailable">("loading");

  useEffect(() => {
    const element = embedRef.current;
    if (!element || !option.calLink) return;

    let frame: HTMLIFrameElement | null = null;
    const markReadyIfVisible = () => {
      if (frame && getComputedStyle(frame).visibility !== "hidden") setLoadState("ready");
    };
    const onLoad = () => window.requestAnimationFrame(markReadyIfVisible);
    const watchFrame = () => {
      const nextFrame = element.querySelector("iframe");
      if (nextFrame && nextFrame !== frame) {
        frame?.removeEventListener("load", onLoad);
        frame = nextFrame;
        frame.addEventListener("load", onLoad);
      }
      markReadyIfVisible();
    };
    const observer = new MutationObserver(watchFrame);
    observer.observe(element, { attributes: true, attributeFilter: ["style", "class"], childList: true, subtree: true });
    const timeout = window.setTimeout(() => setLoadState((current) => current === "ready" ? current : "unavailable"), 20_000);
    watchFrame();
    return () => {
      observer.disconnect();
      frame?.removeEventListener("load", onLoad);
      window.clearTimeout(timeout);
    };
  }, [option.calLink]);

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
      <div className="cal-booking-body" data-state={loadState}>
        <div ref={embedRef} className="cal-booking-embed" />
        {loadState !== "ready" && (
          <div className="cal-booking-status" role="status">
            {loadState === "loading" ? (
              <><span className="cal-booking-pulse" aria-hidden="true" /><span>Kalender wird geladen …</span></>
            ) : (
              <><strong>Der Kalender ist gerade nicht erreichbar.</strong><span>Du kannst das Erstgespräch auf der Buchungsseite auswählen.</span><a href={option.url} target="_blank" rel="noreferrer">Buchungsseite öffnen ↗</a></>
            )}
          </div>
        )}
      </div>
      <footer className="cal-booking-footer">
        <span>Die Anfrage läuft über Cal.com und wird von mummentum persönlich bestätigt.</span>
        <span>
          <a href={option.url} target="_blank" rel="noreferrer">Buchungsseite separat öffnen ↗</a>
          {option.privacyUrl && <> · <a href={option.privacyUrl} target="_blank" rel="noreferrer">Datenschutz</a></>}
        </span>
      </footer>
    </section>
  );
}
