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
  | "soundcloud";

type PlatformDefinition = {
  id: SupportedPlatform;
  label: string;
  route: string;
  hosts: string[];
};

export const SUPPORTED_PLATFORMS: PlatformDefinition[] = [
  {
    id: "youtube",
    label: "YouTube",
    route: "/download-youtube-video",
    hosts: ["youtube.com", "m.youtube.com", "www.youtube.com", "youtu.be"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    route: "/download-tiktok-video",
    hosts: ["tiktok.com", "www.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  },
  {
    id: "instagram",
    label: "Instagram",
    route: "/download-instagram-video",
    hosts: ["instagram.com", "www.instagram.com", "threads.net", "www.threads.net"],
  },
  {
    id: "facebook",
    label: "Facebook",
    route: "/download-facebook-video",
    hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.watch"],
  },
  {
    id: "pinterest",
    label: "Pinterest",
    route: "/download-pinterest-video",
    hosts: ["pinterest.com", "www.pinterest.com", "pin.it"],
  },
  {
    id: "twitter-x",
    label: "Twitter/X",
    route: "/download-twitter-video",
    hosts: ["twitter.com", "www.twitter.com", "mobile.twitter.com", "x.com", "www.x.com"],
  },
  {
    id: "reddit",
    label: "Reddit",
    route: "/download-reddit-video",
    hosts: ["reddit.com", "www.reddit.com", "old.reddit.com", "v.redd.it", "redd.it"],
  },
  {
    id: "twitch",
    label: "Twitch",
    route: "/download-twitch-clip",
    hosts: ["twitch.tv", "www.twitch.tv", "clips.twitch.tv"],
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    route: "/download-soundcloud-audio",
    hosts: ["soundcloud.com", "www.soundcloud.com", "on.soundcloud.com"],
  },
];

function normalizeHost(hostname: string) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

function hostMatches(hostname: string, supportedHost: string) {
  const host = normalizeHost(hostname);
  const target = normalizeHost(supportedHost);
  return host === target || host.endsWith(`.${target}`);
}

export function detectSupportedPlatform(rawUrl: string) {
  try {
    let urlToParse = rawUrl.trim();
    if (!/^https?:\/\//i.test(urlToParse)) {
      urlToParse = `https://${urlToParse}`;
    }
    const parsed = new URL(urlToParse);
    const protocol = parsed.protocol.toLowerCase();

    if (protocol !== "http:" && protocol !== "https:") {
      return {
        platform: null,
        route: null,
        label: null,
        reason: `unsupported protocol: ${protocol || "empty"}`,
      };
    }

    const matched = SUPPORTED_PLATFORMS.find((platform) =>
      platform.hosts.some((host) => hostMatches(parsed.hostname, host))
    );

    if (!matched) {
      return {
        platform: null,
        route: null,
        label: null,
        reason: `unsupported host: ${parsed.hostname || "empty"}`,
      };
    }

    return {
      platform: matched.id,
      route: matched.route,
      label: matched.label,
      reason: "matched supported host",
    };
  } catch {
    return {
      platform: null,
      route: null,
      label: null,
      reason: "invalid URL",
    };
  }
}
