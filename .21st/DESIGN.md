# Project Design Context

## Project

- Product: multi-profile business-card chat
- Stack: Next.js and React
- Theme model: profile-scoped

## Existing profiles

Profiles without a chatTheme keep the existing chat presentation. The mummentum FUSION treatment applies to Vincent Mumme's /c/vincent card.

## mummentum FUSION

- Palette: Canvas #101010, Obsidian #0b0b0b, Panel #141414, Graphite Soft #191919, Graphite #212121, Smoke #9c9c9c, Chalk #f3f3f3.
- Typography: Geist and Geist Mono, weight 400 only.
- Structure: one continuous 40px grid and 1px Graphite separators.
- Components: square or subtly rounded surfaces, outlined secondary actions, and at most one filled Chalk action.
- Avoid color accents, bold text, shadows, glow, decorative gradients, and photography.
- Wordmark: mummentum, always lowercase.

## Decision

Vincent's chat uses the supplied mummentum FUSION system. Other profiles retain their existing appearance. The design values come from the user-supplied fusion-tokens.css and MUMMENTUM-FUSION-GUIDE.md.

## Main component

- src/components/chat-assistant.tsx renders the profile-aware chat.
- src/app/globals.css contains the profile-scoped FUSION styles.
- public/mummentum-mark.svg contains the supplied mummentum brand mark.
