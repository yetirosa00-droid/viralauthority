"use client";

import React from "react";
import { motion } from "framer-motion";
import { Crown, BadgeCheck, ArrowRight, Zap, Sparkles } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useRouter } from "next/navigation";

export function ProBannerVIP() {
  const { isPremium } = useUser();
  const router = useRouter();

  if (isPremium) return null;

  return (
    <div className="container mx-auto px-4 py-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        onClick={() => router.push("/premium")}
        className="group relative cursor-pointer overflow-hidden rounded-[3rem] bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 p-1 border border-white/20 shadow-2xl shadow-blue-500/20 transition-all hover:scale-[1.01] active:scale-95"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.2),transparent)] pointer-events-none" />
        
        <div className="relative bg-black/20 backdrop-blur-md rounded-[2.8rem] px-8 py-10 md:py-8 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-white border border-white/20 shadow-xl group-hover:rotate-12 transition-transform duration-500">
              <Crown size={32} className="animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center md:justify-start gap-3">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-300">ViralAuthority PRO PREMIUM Access</span>
                <span className="px-2 py-0.5 rounded-md bg-white text-blue-600 text-[8px] font-black uppercase animate-pulse">SAVE $40</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black italic tracking-tighter text-white leading-tight">
                OFERTA ESPECIAL: <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">AHORRA 40$ EN EL PLAN ANUAL</span>
              </h2>
              <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-2">
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-200">
                  <Zap size={12} className="text-yellow-400" /> Sin Anuncios
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-200">
                  <BadgeCheck size={12} className="text-emerald-400" /> Resolución 4K
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-gray-200">
                  <Sparkles size={12} className="text-purple-400" /> Herramientas IA
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 shrink-0">
             <div className="hidden lg:block text-right">
                <p className="text-xs font-black text-white uppercase tracking-widest leading-none">Limited Time Offer</p>
                <p className="text-[10px] font-bold text-blue-300 uppercase tracking-widest mt-1 italic">$14.99 / Month</p>
             </div>
             <div className="relative">
                <div className="absolute inset-0 bg-white blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                <button className="relative px-8 py-4 bg-white text-blue-600 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-3 transition-all group-hover:px-10">
                  Upgrade Now <ArrowRight size={16} />
                </button>
             </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
