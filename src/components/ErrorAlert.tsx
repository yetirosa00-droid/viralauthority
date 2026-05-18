"use client";

import { AlertCircle, X, ShieldAlert, RefreshCw, Link2, Upload, FileText } from "lucide-react";
import { motion } from "framer-motion";
import { useLanguage } from "@/context/LanguageContext";
import { UNSUPPORTED_LINK_ERROR } from "@/lib/platforms";
import { useRouter } from "next/navigation";

interface ErrorAlertProps {
  message: string;
  onClear: () => void;
  onRetry?: () => void;
  onResetUrl?: () => void;
}

export function ErrorAlert({ message, onClear, onRetry, onResetUrl }: ErrorAlertProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const isUnsupportedLink = message === UNSUPPORTED_LINK_ERROR;
  const isRateLimited = message.includes("YOUTUBE_RATE_LIMITED") || message.includes("YouTube limitó") || message.includes("SERVER_BUSY") || message.includes("servidor de descargas está ocupado");

  const displayMessage = isRateLimited 
    ? "YouTube limitó temporalmente esta solicitud. Puedes intentar de nuevo en unos minutos, usar otro enlace o subir el archivo directamente." 
    : message;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="container mx-auto px-4 mt-8 max-w-2xl"
    >
      <div className="flex flex-col gap-6 rounded-3xl bg-red-500/5 p-6 border border-red-500/20 backdrop-blur-3xl shadow-2xl shadow-red-500/5">
        <div className="flex items-center gap-5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 border border-red-500/20">
            <ShieldAlert size={24} />
          </div>
          <div className="flex-1">
            <h4 className="text-[11px] font-black text-red-500 uppercase tracking-[0.2em] mb-1">
              {isUnsupportedLink ? "Enlace no soportado" : (isRateLimited ? "Límite Excedido" : t("error_system_exception"))}
            </h4>
            <p className="text-sm font-bold text-white leading-relaxed">{displayMessage}</p>
          </div>
          <button 
            onClick={onClear}
            className="h-10 w-10 flex items-center justify-center rounded-xl bg-white/5 text-gray-500 hover:bg-white hover:text-black transition-all active:scale-90"
          >
            <X size={18} />
          </button>
        </div>

        {isRateLimited && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 pt-4 border-t border-white/5">
            {onRetry && (
              <button 
                onClick={onRetry}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/10 text-white hover:bg-white hover:text-black transition-all font-bold text-xs active:scale-95 border border-white/10"
              >
                <RefreshCw size={14} />
                Intentar de nuevo
              </button>
            )}
            {onResetUrl && (
              <button 
                onClick={onResetUrl}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white/5 text-gray-300 hover:bg-white/10 transition-all font-bold text-xs active:scale-95 border border-white/5"
              >
                <Link2 size={14} />
                Probar otro enlace
              </button>
            )}
            <button 
              onClick={() => router.push("/video-to-text?action=upload")}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-all font-bold text-xs active:scale-95 border border-blue-500/20"
            >
              <Upload size={14} />
              Subir archivo para transcribir
            </button>
            <button 
              onClick={() => router.push("/video-to-text")}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-all font-bold text-xs active:scale-95 border border-purple-500/20"
            >
              <FileText size={14} />
              Ir al transcriptor
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
