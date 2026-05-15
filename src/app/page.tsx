"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Camera,
  Clapperboard,
  FileText,
  Globe2,
  Headphones,
  Image,
  MessageCircle,
  Music2,
  Play,
  Radio,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { ResultCard } from "@/components/ResultCard";
import { LoadingState } from "@/components/LoadingState";
import { ErrorAlert } from "@/components/ErrorAlert";
import { TrendingGrid } from "@/components/TrendingGrid";
import { HowItWorks } from "@/components/HowItWorks";
import { TrustSection } from "@/components/TrustSection";
import { JsonLd } from "@/components/JsonLd";
import type { VideoInfo } from "@/lib/video";
import { detectSupportedPlatform, UNSUPPORTED_LINK_ERROR } from "@/lib/platforms";
import { AdsterraAds } from "@/components/AdsterraAds";
import { ADS_SCRIPTS } from "@/lib/adsConfig";
import { PremiumBanner } from "@/components/PremiumBanner";
import { ResponsibleUseNotice } from "@/components/ResponsibleUseNotice";

const QUICK_TOOLS = [
  {
    name: "Editor",
    href: "/image-editor",
    icon: AudioLines,
    accent: "from-amber-400/25 to-pink-500/10",
  },
  {
    name: "Transcriptor",
    href: "/video-to-text",
    icon: FileText,
    accent: "from-violet-500/25 to-white/5",
  },
  {
    name: "YouTube",
    href: "/download-youtube-video",
    icon: Play,
    accent: "from-red-500/25 to-white/5",
  },
  {
    name: "TikTok",
    href: "/download-tiktok-video",
    icon: Clapperboard,
    accent: "from-cyan-400/25 to-pink-500/10",
  },
  {
    name: "Instagram",
    href: "/download-instagram-video",
    icon: Camera,
    accent: "from-pink-500/25 to-orange-400/10",
  },
  {
    name: "Facebook",
    href: "/download-facebook-video",
    icon: Globe2,
    accent: "from-blue-500/25 to-white/5",
  },
  {
    name: "Pinterest",
    href: "/download-pinterest-video",
    icon: Image,
    accent: "from-rose-500/25 to-white/5",
  },
  {
    name: "Twitter (X)",
    href: "/download-twitter-video",
    icon: MessageCircle,
    accent: "from-sky-400/25 to-white/5",
  },
  {
    name: "Reddit",
    href: "/download-reddit-video",
    icon: Globe2,
    accent: "from-orange-500/25 to-white/5",
  },
  {
    name: "Twitch",
    href: "/download-twitch-clip",
    icon: Radio,
    accent: "from-purple-500/25 to-white/5",
  },
  {
    name: "SoundCloud",
    href: "/download-soundcloud-audio",
    icon: Headphones,
    accent: "from-orange-400/25 to-amber-500/10",
  },
  {
    name: "Audio",
    href: "/audio",
    icon: Music2,
    accent: "from-emerald-400/25 to-blue-500/10",
  },
];

function QuickTools() {
  return (
    <section className="mx-auto -mt-2 max-w-6xl px-4 pb-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
        {QUICK_TOOLS.map((tool) => {
          const Icon = tool.icon;

          return (
            <Link
              key={tool.name}
              href={tool.href}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center shadow-2xl shadow-black/30 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.08] focus:outline-none focus:ring-2 focus:ring-blue-400/60"
            >
              <span className={`absolute inset-0 bg-gradient-to-br ${tool.accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
              <span className="relative mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-black/40 text-white shadow-lg shadow-black/30 transition-transform duration-300 group-hover:scale-105">
                <Icon size={20} strokeWidth={2.4} />
              </span>
              <span className="relative block text-xs font-black uppercase tracking-widest text-gray-300 transition-colors group-hover:text-white">
                {tool.name}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [videoUrl, setVideoUrl] = useState("");

  const schemaData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "ViralAuthority PRO PREMIUM",
    "operatingSystem": "All",
    "applicationCategory": "MultimediaApplication",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "ratingCount": "12500"
    },
    "offers": {
      "@type": "Offer",
      "price": "0.00",
      "priceCurrency": "USD"
    }
  };

  const handleSearch = async (url: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    
    setVideoUrl(cleanUrl);
    const detection = detectSupportedPlatform(cleanUrl);

    console.info("[ViralAuthority PRO PREMIUM] Platform Detector", {
      url: cleanUrl,
      platform: detection.platform,
      reason: detection.reason,
      route: detection.route
    });

    if (!detection.route || !detection.platform) {
      console.warn("[ViralAuthority PRO PREMIUM] No route found for URL:", cleanUrl);
      setError(UNSUPPORTED_LINK_ERROR);
      return;
    }

    setError(null);
    setVideoInfo(null);
    setLoading(true);
    
    // Redirect to the dedicated platform page
    router.push(detection.route + "?url=" + encodeURIComponent(cleanUrl));
  };


  const reset = () => {
    setVideoInfo(null);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <JsonLd data={schemaData} />
      <Navbar />
      
      <main className="flex-1">
        {!videoInfo && !loading && (
          <>
            <Hero onSearch={handleSearch} isLoading={loading} externalUrl={videoUrl} />
            <QuickTools />
            <ResponsibleUseNotice />
            <div className="max-w-6xl mx-auto px-4 py-8">
              <AdsterraAds 
                zoneId={ADS_SCRIPTS.BANNER_TOP.key}
                format={ADS_SCRIPTS.BANNER_TOP.format}
                minHeight="90px"
                className="rounded-3xl border border-white/5 shadow-2xl"
              />
            </div>
          </>
        )}
        
        {loading && (
          <div className="py-24">
            <LoadingState />
          </div>
        )}
        
        {error && (
          <div className="max-w-3xl mx-auto px-4 py-8">
            <ErrorAlert message={error} onClear={() => setError(null)} />
          </div>
        )}
        
        {videoInfo && !loading && (
          <div className="max-w-5xl mx-auto py-12">
            <ResultCard info={videoInfo} videoUrl={videoUrl} onReset={reset} />
          </div>
        )}

        {/* Global Features Section */}
        {!videoInfo && !loading && (
          <>
            <HowItWorks />
            <TrustSection />
            <TrendingGrid onSelect={(url) => {
              setVideoUrl(url);
              window.scrollTo({ top: 0, behavior: "smooth" });
              handleSearch(url);
            }} />
            <PremiumBanner />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}


