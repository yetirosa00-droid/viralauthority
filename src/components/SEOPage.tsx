"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { ResultCard } from "@/components/ResultCard";
import { AdsterraAds } from "@/components/AdsterraAds";
import { AdNative } from "@/components/AdNative";
import { LoadingState } from "@/components/LoadingState";
import { ErrorAlert } from "@/components/ErrorAlert";
import { VideoInfo, getVideoInfo } from "@/lib/video";
import { ADS_SCRIPTS } from "@/lib/adsConfig";
import { useUser } from "@/context/UserContext";
import { ProBannerVIP } from "@/components/ProBannerVIP";
import { ResponsibleUseNotice } from "@/components/ResponsibleUseNotice";

interface SEOPageProps {
  platform: string;
  title: string;
  subtitle: string;
  content: React.ReactNode;
  faqData?: { question: string; answer: string }[];
}

const ALL_PLATFORMS = [
  { name: "Editor IA", path: "/image-editor" },
  { name: "Transcriptor IA", path: "/video-to-text" },
  { name: "YouTube", path: "/download-youtube-video" },
  { name: "TikTok", path: "/download-tiktok-video" },
  { name: "Instagram", path: "/download-instagram-video" },
  { name: "Facebook", path: "/download-facebook-video" },
  { name: "Pinterest", path: "/download-pinterest-video" },
  { name: "Twitter/X", path: "/download-twitter-video" },
  { name: "Reddit", path: "/download-reddit-video" },
  { name: "Twitch", path: "/download-twitch-clip" },
  { name: "SoundCloud", path: "/download-soundcloud-audio" },
  { name: "Audio", path: "/audio" },
];

export function SEOPage(props: SEOPageProps) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <SEOPageContent {...props} />
    </Suspense>
  );
}

function SEOPageContent({ platform, title, subtitle, content, faqData }: SEOPageProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isPremium } = useUser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [videoUrl, setVideoUrl] = useState("");

  // Auto-process if URL is in query params
  React.useEffect(() => {
    const urlParam = searchParams.get("url");
    if (urlParam && !videoInfo && !loading && !error) {
      handleSearch(urlParam);
    }
  }, [searchParams]);

  const handleSearch = async (url: string) => {
    setVideoUrl(url);
    setLoading(true);
    setError(null);
    setVideoInfo(null);

    try {
      const info = await getVideoInfo(url);

      if (info.error) {
        setError(info.error);
        setLoading(false);
        return;
      }

      setVideoInfo(info);
      setLoading(false);
    } catch (err: any) {
      const msg = err.response?.data?.error || "Error al obtener información del video";
      setError(msg);
      setLoading(false);
    }
  };

  // Generate Schema.org JSON-LD for FAQ
  const jsonLd = faqData ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqData.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer
      }
    }))
  } : null;

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <Navbar />
      
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      
      <main className="flex-1">
        {!videoInfo && !loading && <Hero onSearch={handleSearch} isLoading={loading} externalUrl={videoUrl} />}
        {!videoInfo && !loading && <ResponsibleUseNotice />}
        {videoInfo && !loading && (
          <ResultCard 
            info={videoInfo} 
            videoUrl={videoUrl}
            onReset={() => {
              setVideoInfo(null);
              setVideoUrl("");
            }} 
          />
        )}
        
        {loading && <LoadingState />}
        
        {error && <ErrorAlert message={error} onClear={() => setError(null)} />}

        {!isPremium && (
          <>
            <AdsterraAds 
              zoneId={ADS_SCRIPTS.BANNER_MID.key} 
              format={ADS_SCRIPTS.BANNER_MID.format}
              minHeight={ADS_SCRIPTS.BANNER_MID.minHeight}
              className="my-12"
            />
            <ProBannerVIP />
            <AdNative />
          </>
        )}

        <div className="container mx-auto px-4 py-20 max-w-4xl prose lg:prose-lg prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300">
          <div className="not-prose mb-12 rounded-3xl border border-white/10 bg-white/5 p-8">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">{platform}</p>
            <h1 className="mt-3 text-3xl font-black text-white">{title}</h1>
            <p className="mt-3 text-sm font-medium leading-relaxed text-gray-400">{subtitle}</p>
          </div>
          {content}
        </div>

        {/* Internal Linking Section */}
        <section className="bg-white/5 py-20 border-t border-white/10 backdrop-blur-sm">
          <div className="container mx-auto px-4 max-w-6xl text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Explora mas herramientas</h2>
            <p className="text-gray-400 mb-12 max-w-2xl mx-auto italic">Procesamiento de contenido, gestion multimedia, archivo digital y herramientas IA para creadores.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {ALL_PLATFORMS.filter(p => p.path !== pathname).map((p) => (
                <Link
                  key={p.name}
                  href={p.path}
                  className="px-4 py-4 rounded-2xl bg-[#111111] border border-white/10 text-gray-300 font-semibold hover:border-blue-500 hover:text-white transition-all shadow-sm hover:shadow-blue-500/20 text-sm text-center"
                >
                  {p.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
