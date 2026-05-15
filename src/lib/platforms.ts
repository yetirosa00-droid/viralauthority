export const UNSUPPORTED_LINK_ERROR =
  "Este enlace todavía no está soportado. Prueba con YouTube, TikTok, Instagram, Facebook, Pinterest, X, Reddit, Twitch o SoundCloud.";

export type SupportedPlatform =
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "pinterest"
  | "twitter-x"
  | "reddit"
  | "twitch"
  | "soundcloud"
  | "unknown";

interface PlatformMatch {
  id: SupportedPlatform;
  label: string;
  route: string;
  regex: RegExp;
}

export const SUPPORTED_PLATFORMS: PlatformMatch[] = [
  {
    id: "youtube",
    label: "YouTube",
    route: "/download-youtube-video",
    regex: /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=|shorts\/|embed\/|v\/|.+?v=)?([^"&?\/\s]{11})/i,
  },
  {
    id: "tiktok",
    label: "TikTok",
    route: "/download-tiktok-video",
    regex: /(?:https?:\/\/)?(?:www\.|vm\.|vt\.)?tiktok\.com\/.*?(?:video\/(\d+)|(@[\w.-]+\/video\/\d+)|(\w+))/i,
  },
  {
    id: "instagram",
    label: "Instagram",
    route: "/download-instagram-video",
    regex: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv|stories)\/([\w-]+)/i,
  },
  {
    id: "facebook",
    label: "Facebook",
    route: "/download-facebook-video",
    regex: /(?:https?:\/\/)?(?:www\.|m\.|web\.|fb\.)?(?:facebook\.com|fb\.watch)\/(?:watch\/\?v=|video\.php\?v=|story\.php\?story_fbid=|reel\/|.*\/videos\/|.*\/posts\/|groups\/.*?\/permalink\/|)([^"&?\/\s]+)/i,
  },
  {
    id: "pinterest",
    label: "Pinterest",
    route: "/download-pinterest-video",
    regex: /(?:https?:\/\/)?(?:[\w-]+\.)?pinterest\.com\/(?:pin\/(\d+)|([\w-]+))|(?:https?:\/\/)?pin\.it\/([\w-]+)/i,
  },
  {
    id: "twitter-x",
    label: "Twitter/X",
    route: "/download-twitter-video",
    regex: /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i,
  },
  {
    id: "reddit",
    label: "Reddit",
    route: "/download-reddit-video",
    regex: /(?:https?:\/\/)?(?:www\.|old\.|v\.|)reddit\.com\/(?:r\/\w+\/comments\/|v\/|)([\w-]+)/i,
  },
  {
    id: "twitch",
    label: "Twitch",
    route: "/download-twitch-video",
    regex: /(?:https?:\/\/)?(?:www\.|m\.|clips\.)?(?:twitch\.tv)\/(?:videos\/|[\w-]+\/v\/|[\w-]+\/clip\/|)?([\w-]+)/i,
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    route: "/download-soundcloud-audio",
    regex: /(?:https?:\/\/)?(?:www\.|m\.)?soundcloud\.com\/([\w-]+\/[\w-]+)/i,
  },
];

/**
 * Robustly detects the platform from a given URL.
 */
export function detectPlatform(url: string): SupportedPlatform {
  const cleanUrl = url.trim();
  if (!cleanUrl) return "unknown";

  for (const platform of SUPPORTED_PLATFORMS) {
    if (platform.regex.test(cleanUrl)) {
      return platform.id;
    }
  }

  return "unknown";
}

/**
 * Comprehensive detection for both platform ID and route.
 */
export function detectSupportedPlatform(rawUrl: string) {
  const url = rawUrl.trim();
  if (!url) {
    return { platform: null, route: null, label: null, reason: "empty URL" };
  }

  for (const platform of SUPPORTED_PLATFORMS) {
    if (platform.regex.test(url)) {
      return {
        platform: platform.id,
        route: platform.route,
        label: platform.label,
        reason: "regex match",
      };
    }
  }

  return {
    platform: null,
    route: null,
    label: null,
    reason: "no regex match",
  };
}

