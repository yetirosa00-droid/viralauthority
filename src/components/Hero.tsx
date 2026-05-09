"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Archive, Globe, Link2, Shield, Zap } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { ProBannerVIP } from "./ProBannerVIP";

interface HeroProps {
  onSearch: (url: string) => void;
  isLoading: boolean;
  externalUrl?: string;
}

export function Hero({ onSearch, isLoading, externalUrl }: HeroProps) {
  const [url, setUrl] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    if (externalUrl) {
      setUrl(externalUrl);
    }
  }, [externalUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSearch(url.trim());
    }
  };

  return (
    <section className="relative overflow-hidden pt-16 pb-32 lg:pt-24 lg:pb-48">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none z-0">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03]" />
      </div>

      <div className="container relative mx-auto px-4 z-10">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-5xl mx-auto"
          >
            <div className="mb-12 flex justify-center">
              <motion.img 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                src="/logo.png" 
                alt="ViralAuthority PRO Logo" 
                className="w-24 h-24 sm:w-32 sm:h-32 object-contain drop-shadow-[0_0_30px_rgba(59,130,246,0.5)]"
              />
            </div>

            <div className="mb-8 inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-6 py-2 text-xs font-black text-blue-400 uppercase tracking-widest shadow-2xl backdrop-blur-md">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              ViralAuthority PRO PREMIUM v1.0
            </div>

            <h1 className="text-5xl font-black tracking-tighter text-white sm:text-7xl lg:text-8xl leading-tight mb-8">
              {t("hero_title_1")}{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 animate-gradient-x">
                {t("hero_title_2")}
              </span>
            </h1>

            <p
              className="mt-8 max-w-2xl mx-auto text-lg font-medium text-gray-400 sm:text-xl leading-relaxed tracking-tight"
              dangerouslySetInnerHTML={{
                __html: t("hero_subtitle")
                  .replace("multimedia suite", "<span class='text-white font-bold'>multimedia suite</span>")
                  .replace("suite multimedia", "<span class='text-white font-bold'>suite multimedia</span>"),
              }}
            />
          </motion.div>

          <motion.form
            id="download-form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            onSubmit={handleSubmit}
            className="mt-16 w-full max-w-5xl px-4"
            suppressHydrationWarning
          >
            <div className="group relative flex flex-col sm:flex-row items-stretch rounded-[40px] bg-[#1a1a1a]/80 p-3 shadow-3xl border border-white/10 backdrop-blur-3xl transition-all focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/10">
              <div className="hidden sm:flex items-center pl-6 pr-2 text-gray-500">
                <Link2 size={28} />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t("hero_placeholder")}
                className="flex-1 bg-transparent px-6 py-6 sm:py-5 text-xl text-white outline-none placeholder:text-gray-600 font-bold tracking-tight"
                required
                suppressHydrationWarning
              />
              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center justify-center gap-3 rounded-[32px] bg-white px-12 py-5 sm:py-4 text-xl font-black text-black transition-all hover:scale-[1.03] active:scale-95 shadow-2xl disabled:opacity-50"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                    <span>{t("hero_button_process")}</span>
                  </div>
                ) : (
                  <>
                    <span>{t("hero_button_download")}</span>
                    <Archive size={24} />
                  </>
                )}
              </button>
            </div>

            <div className="mt-12 flex flex-wrap justify-center gap-8 text-gray-500 font-bold uppercase tracking-widest text-[10px]">
              <div className="flex items-center gap-2"><Globe size={14} className="text-blue-500" /> {t("hero_feature_1")}</div>
              <div className="flex items-center gap-2"><Zap size={14} className="text-yellow-500" /> {t("hero_feature_2")}</div>
              <div className="flex items-center gap-2"><Shield size={14} className="text-green-500" /> {t("hero_feature_3")}</div>
            </div>
          </motion.form>

          <ProBannerVIP />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-24 grid grid-cols-2 md:grid-cols-4 gap-12 border-t border-white/5 pt-16 w-full max-w-5xl"
          >
            {[
              { label: t("stat_downloads"), value: "2.4M+", color: "text-blue-500" },
              { label: t("stat_retention"), value: "99.9%", color: "text-purple-500" },
              { label: t("stat_platforms"), value: "40+", color: "text-pink-500" },
              { label: t("stat_speed"), value: "0.8s", color: "text-green-500" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col gap-1">
                <span className={`text-4xl font-black tracking-tighter ${stat.color}`}>{stat.value}</span>
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{stat.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
