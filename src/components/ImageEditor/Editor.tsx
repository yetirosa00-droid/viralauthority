"use client";

import React, { useEffect, useState, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { CanvasView } from "./CanvasView";
import { DropZone } from "./DropZone";
import { motion, AnimatePresence } from "framer-motion";
import { useEditorStore } from "@/store/editorStore";
import { useLanguage } from "@/context/LanguageContext";
import { Loader2, X, CheckCircle2, AlertCircle, Undo2, Redo2 } from "lucide-react";
import { removeImageBackground, upscaleImage } from "@/lib/ai";
import { getVideoInfo } from "@/lib/video";
import { detectPlatform } from "@/lib/platforms";

interface EditorProps {
  imageSrc?: string;
  onClose: () => void;
}

export default function Editor({ imageSrc, onClose }: EditorProps) {
  const { 
    setImage, setVideo, fileType, reset, saveToHistory, 
    imageSrc: currentImage, undo, redo, historyIndex, history,
    activeTab
  } = useEditorStore();
  
  const canvasRef = useRef<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("Archivo listo 🚀");
  const [error, setError] = useState<string | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    if (imageSrc) {
      setImage(imageSrc);
      saveToHistory();
    }
    const timer = setTimeout(() => setIsInitializing(false), 800);
    return () => clearTimeout(timer);
  }, [imageSrc]);

  const handleFileSelect = (file: File) => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith("image/")) {
      setImage(url);
    } else if (file.type.startsWith("video/")) {
      setVideo(url);
    }
    
    setSuccessMessage(file.name === "clipboard-image.png" ? "Captura pegada correctamente 🚀" : "Archivo listo 🚀");
    saveToHistory();
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
    playSuccessSound();
  };

  const handleLinkSubmit = async (url: string) => {
    setIsProcessing(true);
    setError(null);
    try {
      const info = await getVideoInfo(url);
      if (info.formats && info.formats.length > 0) {
        const directUrl = info.formats[0].url;
        const platform = detectPlatform(url);
        if (platform !== "unknown") {
          setVideo(directUrl);
        } else {
          setImage(directUrl);
        }
        saveToHistory();
        playSuccessSound();
      }
    } catch (err: any) {
      setError("No se pudo importar el enlace. Verifica la URL.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRemoveBG = async () => {
    if (!currentImage) return;
    setIsProcessing(true);
    try {
      const result = await removeImageBackground(currentImage);
      setImage(result);
      saveToHistory();
      playSuccessSound();
    } catch (err) {
      setError("Esta función estará disponible en ViralAuthority PRO PREMIUM");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpscale = async () => {
    if (!currentImage) return;
    setIsProcessing(true);
    try {
      const result = await upscaleImage(currentImage);
      setImage(result);
      saveToHistory();
      playSuccessSound();
    } catch (err) {
      setError("Error al mejorar la imagen.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = (format: string) => {
    const canvas = canvasRef.current?.getCanvas();
    if (canvas) {
      let mimeType = "image/png";
      let quality = 1.0;
      let extension = "png";

      if (format === "jpg") {
        mimeType = "image/jpeg";
        quality = 0.95;
        extension = "jpg";
      } else if (format === "webp") {
        mimeType = "image/webp";
        quality = 0.92;
        extension = "webp";
      }

      // Fabric.js toDataURL with multiplier for High Quality
      const dataUrl = canvas.toDataURL({ 
        format: extension === "jpg" ? "jpeg" : extension, 
        quality: quality,
        multiplier: 2
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `viralauthoritypro-edited-${Date.now()}.${extension}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setSuccessMessage(`Imagen exportada correctamente como ${format.toUpperCase()} 🚀`);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 4000);
      playSuccessSound();
    }
  };

  const handleApplyCrop = async () => {
    if (canvasRef.current) {
      const success = await (canvasRef.current as any).applyCrop();
      if (success) {
        setIsCropping(false);
        setSuccessMessage("Imagen recortada correctamente 🚀");
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
        playSuccessSound();
      }
    }
  };

  const playSuccessSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {}
  };

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] space-y-6">
        <Loader2 className="animate-spin text-blue-500" size={64} />
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Inicializando Studio...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[90vh] w-full max-w-[1600px] mx-auto bg-[#080808] rounded-[2rem] border border-white/5 overflow-hidden shadow-2xl relative">
      
      {/* Top Header */}
      <div className="h-16 border-b border-white/5 bg-black/40 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
             <button onClick={undo} disabled={historyIndex <= 0} className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-20 transition-all text-white">
               <Undo2 size={16} />
             </button>
             <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-20 transition-all text-white">
               <Redo2 size={16} />
             </button>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-white/20">ViralAuthority PRO PREMIUM Studio v2.0</span>
        </div>

        <button onClick={() => { reset(); onClose(); }} className="p-2 hover:bg-red-500/10 text-white/40 hover:text-red-400 rounded-xl transition-all">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row relative min-h-0">
        <AnimatePresence mode="wait">
          {!fileType ? (
            <motion.div key="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex items-center justify-center p-8">
              <DropZone onFileSelect={handleFileSelect} onLinkSubmit={handleLinkSubmit} />
            </motion.div>
          ) : (
            <>
              <div className="flex-1 flex flex-col relative bg-[#050505] min-h-0">
                 {/* Success Toast */}
                 <AnimatePresence>
                   {showSuccess && (
                     <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 20, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="absolute top-0 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-green-500/90 rounded-2xl flex items-center gap-3 border border-green-400/30 shadow-2xl">
                       <CheckCircle2 size={18} className="text-white" />
                       <span className="text-[10px] font-black uppercase tracking-widest text-white">{successMessage}</span>
                     </motion.div>
                   )}
                 </AnimatePresence>

                 <CanvasView ref={canvasRef} isCropping={isCropping} />
              </div>

              <Sidebar 
                onRemoveBG={handleRemoveBG}
                onUpscale={handleUpscale}
                onExport={handleExport}
                onAddText={() => canvasRef.current?.addText()}
                onAddShape={(type) => canvasRef.current?.addShape(type)}
                onApplyFilter={(f) => canvasRef.current?.applyFilter(f)}
                onRotate={(angle) => canvasRef.current?.rotate(angle)}
                onFlip={(axis) => canvasRef.current?.flip(axis)}
                onResize={(w, h) => canvasRef.current?.resize(w, h)}
                onCropMode={() => {
                  if (!currentImage) {
                    setError("Sube una imagen antes de recortar");
                    return;
                  }
                  setIsCropping(true);
                }}
                onApplyCrop={handleApplyCrop}
                onCancelCrop={() => setIsCropping(false)}
                isProcessing={isProcessing}
                isCropping={isCropping}
              />
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: -20, opacity: 1 }} exit={{ y: 50, opacity: 0 }} className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 px-6 py-3 bg-red-500/90 rounded-2xl flex items-center gap-3 border border-red-400/30 shadow-2xl">
            <AlertCircle size={18} className="text-white" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">{error}</span>
            <button onClick={() => setError(null)} className="ml-4"><X size={14} className="text-white/60" /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
