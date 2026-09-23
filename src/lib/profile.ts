import profileData from "../../data/profile.json";

export type KnowledgeEntry = {
  id: string;
  source: string;
  version: string;
  published: boolean;
  question: string;
  answer: string;
  updatedAt: string;
};

export type BookingOption = {
  id: string;
  label: string;
  description: string;
  durationMinutes: number;
  url: string;
  provider?: "schunera";
  privacyUrl?: string;
  active: boolean;
};

export type Offer = {
  id: string;
  title: string;
  description: string;
  active: boolean;
};

export type SocialMediaLink = {
  platform: string;
  url: string;
};

export type Profile = {
  slug: string;
  cardTokens: string[];
  status: "draft" | "published" | "inactive";
  isDemo: boolean;
  displayName: string;
  givenName: string;
  familyName: string;
  role: string;
  company: string;
  city: string;
  bio: string;
  email: string;
  phone: string;
  website: string;
  socialMedia?: SocialMediaLink[];
  address: {
    street: string;
    postalCode: string;
    locality: string;
    country: string;
  };
  bookingOptions: BookingOption[];
  offers: Offer[];
  knowledge: KnowledgeEntry[];
  suggestedQuestions: string[];
};

const profiles = profileData.profiles as Profile[];

export function getProfileBySlug(slug: string): Profile | undefined {
  return profiles.find((profile) => profile.slug === slug && profile.status === "published");
}

export function getProfileByCardToken(token: string): Profile | undefined {
  return profiles.find((profile) => profile.cardTokens.includes(token) && profile.status === "published");
}

export function getDefaultCardToken(): string {
  return profiles.find((profile) => profile.status === "published")?.cardTokens[0] ?? "";
}

export function getPublishedKnowledge(profile: Profile): KnowledgeEntry[] {
  return profile.knowledge.filter((entry) => entry.published);
}

export function getActiveOffers(profile: Profile): Offer[] {
  return profile.offers.filter((offer) => offer.active);
}

export function getBookingOptions(profile: Profile): BookingOption[] {
  return profile.bookingOptions.filter((option) => option.active && isApprovedHttpsUrl(option.url));
}

export function isApprovedHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function getPublicWebsite(profile: Profile): string | undefined {
  return isApprovedHttpsUrl(profile.website) ? profile.website : undefined;
}
