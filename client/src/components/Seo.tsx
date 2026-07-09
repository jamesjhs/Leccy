import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'Leccy';
const DEFAULT_TITLE = 'Leccy - EV Charging Cost Tracker';
const DEFAULT_DESCRIPTION =
  'Leccy helps EV drivers track charging sessions, home and away charging costs, smart tariffs, measured and estimated kWh, EV savings, maintenance, and cost per mile.';
const DEFAULT_KEYWORDS = [
  'EV cost tracker',
  'electric vehicle charging costs',
  'EV charging log',
  'cost per mile calculator',
  'smart tariff tracker',
  'EV savings calculator',
  'EV battery efficiency analytics',
  'electric car maintenance log',
];
const DEFAULT_IMAGE_PATH = '/icons/icon-512x512.png';

interface SeoConfig {
  title: string;
  description: string;
  keywords?: string[];
  robots?: string;
}

const privateRobots = 'noindex,nofollow';

const routeSeo: Record<string, SeoConfig> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    keywords: DEFAULT_KEYWORDS,
  },
  '/login': {
    title: 'Sign In - Leccy',
    description: 'Sign in to Leccy to log EV charging sessions, view charging analytics, and manage your vehicles and tariffs.',
    keywords: ['Leccy login', 'EV cost tracker sign in', 'electric vehicle charging log'],
    robots: 'noindex,follow',
  },
  '/register': {
    title: 'Create a Free Leccy Account',
    description: 'Create a free Leccy account to start tracking EV charging costs, smart tariffs, maintenance, and real-world cost per mile.',
    keywords: ['free EV cost tracker', 'EV charging cost app', 'electric car cost tracking'],
  },
  '/quick-data-entry': {
    title: 'Quick Charging Session Entry - Leccy',
    description: 'Save the start of an EV charge, return later, and submit home or public charging cost details from one quick workflow.',
    keywords: ['EV charging session entry', 'charging log app', 'home charging tracker'],
    robots: privateRobots,
  },
  '/dashboard': {
    title: 'EV Cost Dashboard - Leccy',
    description: 'Review EV charging totals, tariff rates, vehicle filters, and petrol or diesel cost comparisons in your private Leccy dashboard.',
    robots: privateRobots,
  },
  '/data-entry': {
    title: 'Charging Session Log - Leccy',
    description: 'Paste and validate EV charging session CSV data, then add measured charger kWh, cost, and home or away charge type details.',
    robots: privateRobots,
  },
  '/analytics': {
    title: 'EV Charging Analytics - Leccy',
    description: 'Analyse EV savings, home versus away charging economics, odometer-based efficiency, temperature-normalised performance, measured-kWh capacity proxy, GOM accuracy, and data quality.',
    robots: privateRobots,
  },
  '/tariff': {
    title: 'Smart Tariff Tracker - Leccy',
    description: 'Store peak, off-peak, standing charge, and effective-date electricity tariff details for more accurate home charging estimates.',
    robots: privateRobots,
  },
  '/vehicles': {
    title: 'EV Vehicle Manager - Leccy',
    description: 'Manage multiple electric vehicles, licence plates, nicknames, vehicle types, and battery capacities for per-vehicle charging analytics.',
    robots: privateRobots,
  },
  '/maintenance': {
    title: 'EV Maintenance Log - Leccy',
    description: 'Track servicing, tyres, MOTs, repairs, and other maintenance costs alongside your EV charging history.',
    robots: privateRobots,
  },
  '/account': {
    title: 'Account Settings - Leccy',
    description: 'Manage your Leccy account, password, two-factor authentication, privacy controls, and account deletion options.',
    robots: privateRobots,
  },
  '/admin': {
    title: 'Admin - Leccy',
    description: 'Administrative tools for managing a Leccy deployment.',
    robots: privateRobots,
  },
};

function getSiteUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return 'https://leccy.app';
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export default function Seo() {
  const location = useLocation();

  useEffect(() => {
    const config = routeSeo[location.pathname] ?? {
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      keywords: DEFAULT_KEYWORDS,
      robots: 'noindex,follow',
    };
    const siteUrl = getSiteUrl();
    const canonicalPath = config.robots?.startsWith('noindex') ? '/' : location.pathname;
    const canonicalUrl = `${siteUrl}${canonicalPath === '/' ? '/' : canonicalPath}`;
    const imageUrl = `${siteUrl}${DEFAULT_IMAGE_PATH}`;
    const keywords = (config.keywords ?? DEFAULT_KEYWORDS).join(', ');

    document.title = config.title;
    setMeta('meta[name="description"]', 'name', 'description', config.description);
    setMeta('meta[name="keywords"]', 'name', 'keywords', keywords);
    setMeta('meta[name="robots"]', 'name', 'robots', config.robots ?? 'index,follow');
    setMeta('meta[property="og:title"]', 'property', 'og:title', config.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', config.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[property="og:image"]', 'property', 'og:image', imageUrl);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', config.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', config.description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', imageUrl);
    setCanonical(canonicalUrl);
  }, [location.pathname]);

  return null;
}
