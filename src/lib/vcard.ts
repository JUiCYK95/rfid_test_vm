import type { Profile } from "@/lib/profile";
import { getPublicWebsite, isApprovedHttpsUrl } from "@/lib/profile";

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function escapeStructuredText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  const codePoints = Array.from(line);
  const chunks: string[] = [];
  let chunk = "";
  let bytes = 0;
  const encoder = new TextEncoder();

  for (const point of codePoints) {
    const pointBytes = encoder.encode(point).length;
    if (bytes + pointBytes > 75) {
      chunks.push(chunk);
      chunk = ` ${point}`;
      bytes = 1 + pointBytes;
    } else {
      chunk += point;
      bytes += pointBytes;
    }
  }
  chunks.push(chunk);
  return chunks.join("\r\n");
}

function add(lines: string[], name: string, value: string | undefined): void {
  if (value?.trim()) lines.push(foldLine(`${name}:${escapeValue(value.trim())}`));
}

export function createVCard(profile: Profile): string {
  const lines = ["BEGIN:VCARD", "VERSION:4.0"];
  add(lines, "FN", profile.displayName);
  lines.push(foldLine(`N:${[profile.familyName, profile.givenName, "", "", ""].map(escapeStructuredText).join(";")}`));
  add(lines, "ORG", profile.company);
  add(lines, "TITLE", profile.role);
  if (profile.email.trim()) add(lines, "EMAIL;TYPE=work", profile.email);
  const phone = profile.phone.replace(/[\s()./-]/g, "");
  if (/^\+[1-9]\d{1,14}$|^0\d{3,}$/.test(phone)) {
    add(lines, "TEL;VALUE=uri;TYPE=work", `tel:${phone}`);
  }
  const website = getPublicWebsite(profile);
  if (website) add(lines, "URL", website);

  const { street, locality, postalCode, country } = profile.address;
  if (street || locality || postalCode || country) {
    const address = ["", "", street, locality, "", postalCode, country];
    lines.push(foldLine(`ADR;TYPE=work:${address.map(escapeStructuredText).join(";")}`));
  }

  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

export function createVCardFilename(profile: Profile): string {
  const slug = profile.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
  return `${slug || "kontakt"}.vcf`;
}
