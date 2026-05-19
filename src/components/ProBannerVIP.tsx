"use client";

import React from "react";
import { motion } from "framer-motion";
import { Crown, BadgeCheck, ArrowRight, Zap, Sparkles, X } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";

export function ProBannerVIP() {
  const { isPremium } = useUser();
  const router = useRouter();
  const [isVisible, setIsVisible] = React.useState(true);

  React.useEffect(() => {
    const dismissed = localStorage.getItem("dismiss_vip_banner");
    if (dismissed === "true") {
      setIsVisible(false);
    }
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent routing to /premium when clicking close button
    setIsVisible(false);
    localStorage.setItem("dismiss_vip_banner", "true");
  };

  if (!isVisible || isPremium) return null;

  return (
    <div className="container mx-auto px-4 py-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        onClick={() => router.push("/premium")}
        className="group relative cursor-pointer overflow-hidden rounded-[2rem] bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 p-0.5 border border-white/20 shadow-2xl shadow-blue-500/20 transition-all hover:scale-[1.005] active:scale-95"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent)] pointer-events-none" />
        
        {/* Dismiss Button */}
        <button 
          onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-black/40 hover:bg-black/60 border border-white/15 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          title="Ocultar oferta"
        >
          <X size={12} />
        </button>

        <div className="relative bg-black/25 backdrop-blur-md rounded-[1.9rem] px-6 py-5 md:py-4 flex flex-col md:flex-row items-center justify-between gap-6 pr-12">
          <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-white border border-white/25 shadow-lg group-hover:rotate-12 transition-transform duration-500 shrink-0">
              <Crown size={24} className="animate-pulse" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center justify-center md:justify-start gap-2.5">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-300">ViralAuthority PRO PREMIUM Access</span>
                <span className="px-1.5 py-0.5 rounded bg-white text-blue-600 text-[8px] font-black uppercase animate-pulse">SAVE $40</span>
              </div>
              <h2 className="text-xl md:text-2xl font-black italic tracking-tighter text-white leading-tight">
                OFERTA ESPECIAL: <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">AHORRA 40$ EN EL PLAN ANUAL</span>
              </h2>
              <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-1">
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-200">
                  <Zap size={10} className="text-yellow-400" /> Sin Anuncios
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-200">
                  <BadgeCheck size={10} className="text-emerald-400" /> Resolución 4K
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-bold text-gray-200">
                  <Sparkles size={10} className="text-purple-400" /> Herramientas IA
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
             <div className="hidden lg:block text-right">
                <p className="text-[10px] font-black text-white uppercase tracking-widest leading-none">Limited Time Offer</p>
                <p className="text-[9px] font-bold text-blue-300 uppercase tracking-widest mt-1 italic">$14.99 / Month</p>
             </div>
             <div className="relative">
                <div className="absolute inset-0 bg-white blur-xl opacity-15 group-hover:opacity-30 transition-opacity" />
                <button className="relative px-6 py-3 bg-white text-blue-600 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 transition-all group-hover:px-7">
                  Upgrade Now <ArrowRight size={14} />
                </button>
             </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
