// Default copy for each Landing section. Used as fallback when no override row
// exists in the `landing_sections` table.

export type LandingSectionKey =
  | "hero"
  | "popular_events"
  | "features"
  | "testimonials"
  | "cta";

export interface HeroContent {
  badge: string;
  headline_prefix: string;
  rotating_words: string[];
  subhead: string;
  cta: string;
}

export interface PopularEventsContent {
  title_line_1: string;
  title_line_2: string;
  subhead: string;
  cta_label: string;
}

export interface FeaturesContent {
  eyebrow: string;
  title_line_1: string;
  title_line_2: string;
  subhead: string;
  items: { tag: string; title: string; description: string }[];
}

export interface TestimonialsContent {
  title: string;
  items: { quote: string; name: string; role: string }[];
}

export interface CtaContent {
  title_line_1: string;
  title_line_2: string;
  subhead: string;
  cta_label: string;
}

export const LANDING_DEFAULTS = {
  hero: {
    badge: "For organizers everywhere",
    headline_prefix: "The event platform where ideas become",
    rotating_words: ["events.", "experiences.", "communities.", "connections."],
    subhead:
      "Whatever your event — from workshops to conferences — build branded registration pages, track attendees, and grow your community. No code required.",
    cta: "Get started",
  } as HeroContent,
  popular_events: {
    title_line_1: "Popular events",
    title_line_2: "on eventspark",
    subhead: "A glimpse at the experiences our community is hosting right now.",
    cta_label: "Browse all events",
  } as PopularEventsContent,
  features: {
    eyebrow: "Built for organizers",
    title_line_1: "Everything you need to",
    title_line_2: "run amazing events.",
    subhead: "From page creation to post-event analytics, eventspark has you covered.",
    items: [
      { tag: "Pages", title: "Pages in minutes", description: "Beautiful registration pages that make your event shine — no design skills needed." },
      { tag: "Insights", title: "Understand everything", description: "Live dashboards that show where attendees come from, drop off, and convert." },
      { tag: "Integrations", title: "Integrate with everything", description: "Connect Zoom, HubSpot, Mailchimp, and 20+ tools in a few clicks." },
      { tag: "Audience", title: "One hub for everyone", description: "Manage, message, and track every attendee from a single beautiful dashboard." },
    ],
  } as FeaturesContent,
  testimonials: {
    title: "Loved by organizers",
    items: [
      { quote: "eventspark cut our setup time by 80%. We went from spending hours on registration to minutes.", name: "Sarah Chen", role: "Community manager" },
      { quote: "The analytics alone are worth it. We finally know where our attendees are coming from.", name: "Marcus Williams", role: "Event coordinator" },
      { quote: "Clean, professional, and easy to use. Our attendees always compliment the registration experience.", name: "Priya Patel", role: "Startup founder" },
      { quote: "We switched from three different tools to just eventspark. Everything in one place is a game changer.", name: "James Liu", role: "Tech meetup organizer" },
      { quote: "Our registrations doubled after switching. The pages just look so much more professional.", name: "Amara Osei", role: "Conference director" },
    ],
  } as TestimonialsContent,
  cta: {
    title_line_1: "Ready to spark",
    title_line_2: "your next event?",
    subhead: "Join thousands of organizers who use eventspark to build better events.",
    cta_label: "Get started for free",
  } as CtaContent,
};

export type LandingContentMap = {
  hero: HeroContent;
  popular_events: PopularEventsContent;
  features: FeaturesContent;
  testimonials: TestimonialsContent;
  cta: CtaContent;
};

export const LANDING_SECTION_LABELS: Record<LandingSectionKey, string> = {
  hero: "Hero",
  popular_events: "Popular events heading",
  features: "Features grid",
  testimonials: "Testimonials",
  cta: "Final call to action",
};
