"use client";

import React, { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
  import { 
    FileText, 
    Video,
    Copy, 
    Check, 
    Download,
    Sparkles, 
    Clock, 
    Languages, 
    ShieldCheck,
    Zap,
    Loader2,
    Activity
  } from "lucide-react";
  import axios from "axios";
  import { useLanguage } from "@/context/LanguageContext";
  import { useUser } from "@/context/UserContext";
  import { motion, AnimatePresence } from "framer-motion";
  
  export default function VideoToTextPage() {
    const [url, setUrl] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [activeMode, setActiveMode] = useState<"url" | "file">("url");
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState("");
    const [transcription, setTranscription] = useState<string | null>(null);
    const [improvedTranscription, setImprovedTranscription] = useState<string | null>(null);
    const [segments, setSegments] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<"raw" | "improved" | "segments">("segments");
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [localFileUrl, setLocalFileUrl] = useState<string | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isRefining, setIsRefining] = useState(false);
    const playerRef = React.useRef<HTMLVideoElement | HTMLIFrameElement | any>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedLang, setSelectedLang] = useState("auto");
    const { t } = useLanguage();
    const { user, isPremium } = useUser();

  const languages = [
    { code: "auto", name: t("trans_lang_auto") },
    { code: "English", name: t("trans_lang_en") },
    { code: "Spanish", name: t("trans_lang_es") },
    { code: "French", name: t("trans_lang_fr") },
    { code: "German", name: t("trans_lang_de") },
    { code: "Italian", name: t("trans_lang_it") },
    { code: "Portuguese", name: t("trans_lang_pt") },
  ];

  const handleTranscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeMode === "url" && !url) return;
    if (activeMode === "file" && !file) return;

    setLoading(true);
    setError(null);
    setTranscription(null);
    setImprovedTranscription(null);
    setSegments([]);
    setProgress(5);
    setStatusMessage("Preparando procesamiento...");

    // Progressive loading simulation
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 30) {
          setStatusMessage("Procesando medios...");
          return prev + 1;
        }
        if (prev < 70) {
          setStatusMessage("Extrayendo capas de audio...");
          return prev + 0.5;
        }
        if (prev < 95) {
          setStatusMessage("Whisper AI Transcribiendo...");
          return prev + 0.2;
        }
        return prev;
      });
    }, 200);

    try {
      const formData = new FormData();
      if (activeMode === "url") {
        formData.append("url", url.trim());
      } else if (file) {
        formData.append("file", file);
      }
      formData.append("targetLanguage", selectedLang);
      
      if (isPremium && user) {
        formData.append("userId", user.id);
      }

      const response = await axios.post("/api/transcribe", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 300_000 // 5 minutes timeout for long videos
      });

      clearInterval(progressInterval);
      setProgress(100);
      
      setTimeout(() => {
        const rawText = response.data.text || "";
        setTranscription(rawText);
        setImprovedTranscription(response.data.improved || rawText);
        setSegments(response.data.segments || []);
        setVideoUrl(url);
        if (file) setLocalFileUrl(URL.createObjectURL(file));
        setActiveTab("segments");
        setStatusMessage("Transcripción completada");
        setLoading(false);
      }, 500);
    } catch (err: any) {
      clearInterval(progressInterval);
      console.error("Transcription error:", err);
      const serverError = err.response?.data?.error || "Error de red";
      const details = err.response?.data?.details;
      
      setError(details ? `${serverError}: ${details.substring(0, 100)}` : serverError);
      setStatusMessage("Fallo en el procesamiento");
      setLoading(false);
    }
  };

  const handleRefine = async (mode: 'improve' | 'fix') => {
    // We always refine from the base transcription to keep it clean
    const textToRefine = transcription;
    if (!textToRefine || textToRefine.length < 10) {
        setStatusMessage("Texto demasiado corto para refinar");
        return;
    }

    setIsRefining(true);
    setStatusMessage("IA trabajando...");
    
    try {
      const response = await axios.post("/api/refine-text", { 
        text: textToRefine.substring(0, 35000), // Safety limit
        mode 
      });
      
      setImprovedTranscription(response.data.refinedText);
      setActiveTab("improved");
      
      setStatusMessage(mode === 'fix' ? "Ortografía corregida" : "Texto mejorado con éxito");
      setTimeout(() => setStatusMessage("Completado"), 3000);
    } catch (err) {
      console.error("REFINE_UI_ERROR:", err);
      setStatusMessage("La IA tuvo un problema, reintentando...");
      setTimeout(() => setStatusMessage("Listo"), 3000);
    } finally {
      setIsRefining(false);
    }
  };

  const copyToClipboard = () => {
    const textToCopy = activeTab === "improved" ? improvedTranscription : transcription;
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTextFile = () => {
    const textToDownload = activeTab === "improved" ? improvedTranscription : transcription;
    if (!textToDownload) return;
    const element = document.createElement("a");
    const file = new Blob([textToDownload], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `ViralAuthority PRO PREMIUM-Transcription-${activeTab}-${Date.now()}.txt`;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    document.body.removeChild(element);
  };

  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const seekTo = (seconds: number) => {
    if (activeMode === "url" && videoUrl) {
      const iframe = document.getElementById('youtube-player') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({
          event: 'command',
          func: 'seekTo',
          args: [seconds, true]
        }), '*');
      }
    } else if (playerRef.current) {
      playerRef.current.currentTime = seconds;
      playerRef.current.play();
    }
  };


  const updateSegmentText = (index: number, newText: string) => {
    const newSegments = [...segments];
    newSegments[index].text = newText;
    setSegments(newSegments);
    
    // Also update raw transcription
    const fullText = newSegments.map(s => s.text).join(" ");
    setTranscription(fullText);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-500/30">
      <Navbar />

      <main className="container mx-auto px-4 py-12 lg:py-24 max-w-5xl">
        <div className="space-y-12">
          
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm font-bold">
              <Sparkles size={16} /> AI POWERED
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-7xl font-black leading-[1.1] uppercase italic px-4">
              {t("trans_title_1")} <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-500 to-blue-600 inline-block pr-2">{t("trans_title_2")}</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto font-medium">
              {t("trans_subtitle")}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex justify-center gap-4 max-w-sm mx-auto">
            <button 
              onClick={() => setActiveMode("url")}
              className={`flex-1 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all ${activeMode === "url" ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-white/5 text-gray-500 border border-white/5'}`}
            >
              URL Link
            </button>
            <button 
              onClick={() => setActiveMode("file")}
              className={`flex-1 py-3 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all ${activeMode === "file" ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'bg-white/5 text-gray-500 border border-white/5'}`}
            >
              Upload File
            </button>
          </div>

          {/* Form Area */}
          <div className="relative group max-w-4xl mx-auto">
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <form 
              onSubmit={handleTranscribe}
              className="relative bg-black border border-white/10 p-2 rounded-[2rem] flex flex-col gap-2"
            >
              <div className="flex flex-col md:flex-row gap-2">
                {activeMode === "url" ? (
                  <div className="flex-1 flex items-center gap-3 px-6 h-16 bg-white/[0.03] rounded-2xl border border-white/10 group-focus-within:border-purple-500/50 transition-colors">
                    <Video className="text-purple-500 shrink-0" size={24} />
                    <input 
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={t("trans_placeholder")}
                      className="w-full bg-transparent border-none outline-none text-lg font-medium placeholder:text-gray-600"
                      required={activeMode === "url"}
                    />
                  </div>
                ) : (
                  <div className="flex-1 flex items-center gap-3 px-4 h-16 bg-white/[0.03] rounded-2xl border border-white/10 group-focus-within:border-purple-500/50 transition-colors relative overflow-hidden">
                    <FileText className="text-purple-500 shrink-0" size={24} />
                    <span className="text-sm font-medium text-gray-400 truncate">
                      {file ? file.name : "Select or drag audio/video file..."}
                    </span>
                    <input 
                      type="file"
                      accept="audio/*,video/*"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      required={activeMode === "file"}
                    />
                  </div>
                )}
                
                <div className="h-16 flex items-center gap-2 px-4 bg-white/[0.03] rounded-2xl border border-white/10">
                  <Languages className="text-purple-500 shrink-0" size={20} />
                  <select 
                    value={selectedLang}
                    onChange={(e) => setSelectedLang(e.target.value)}
                    className="bg-transparent border-none outline-none text-sm font-bold uppercase tracking-widest text-gray-400 cursor-pointer focus:text-white transition-colors h-full pr-4"
                  >
                    {languages.map(lang => (
                      <option key={lang.code} value={lang.code} className="bg-black text-white">{lang.name}</option>
                    ))}
                  </select>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="h-16 md:w-56 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="animate-spin" /> : <Sparkles size={20} />}
                  {loading ? t("trans_loading") : t("trans_btn")}
                </button>
              </div>
            </form>
          </div>

          {/* Progress Bar Area */}
          <AnimatePresence>
            {loading && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-3xl mx-auto space-y-6"
              >
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                    <Activity className="text-purple-500 animate-pulse" size={20} />
                    <span className="text-sm font-bold uppercase tracking-widest text-purple-400">
                      {statusMessage}
                    </span>
                  </div>
                  <span className="text-sm font-black text-white">{Math.floor(progress)}%</span>
                </div>
                
                <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-1">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                    className="h-full bg-gradient-to-r from-purple-600 via-blue-500 to-purple-600 bg-[length:200%_100%] animate-gradient-x rounded-full shadow-[0_0_20px_rgba(147,51,234,0.5)]"
                  />
                </div>
                
                <p className="text-center text-xs text-gray-500 font-medium">
                  {progress < 50 ? "Downloading audio buffers..." : "Whisper AI is processing the semantic timestamps..."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          {error && (
            <div className="max-w-3xl mx-auto bg-red-500/10 border border-red-500/20 p-6 rounded-2xl flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                <ShieldCheck size={20} />
              </div>
              <p className="text-red-200 font-medium pt-2">{error}</p>
            </div>
          )}

          {/* Results Area */}
          {transcription && (
            <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700">
              <div className="flex flex-col lg:flex-row gap-8">
                
                {/* Left Side: Video Player */}
                <div className="lg:w-1/3 lg:sticky lg:top-24 h-fit space-y-6">
                  <div className="aspect-video bg-black rounded-3xl border border-white/10 overflow-hidden shadow-2xl relative group">
                    {activeMode === "url" && videoUrl ? (
                      <iframe 
                        id="youtube-player"
                        src={`https://www.youtube.com/embed/${getYouTubeId(videoUrl)}?enablejsapi=1`}
                        className="w-full h-full"
                        allowFullScreen
                      />
                    ) : localFileUrl ? (
                      <video 
                        ref={playerRef}
                        src={localFileUrl} 
                        controls 
                        className="w-full h-full" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-white/5">
                        <Video size={48} className="text-white/10" />
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Herramientas IA</h4>
                      <Sparkles size={14} className="text-purple-500" />
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      <button 
                        onClick={() => handleRefine('improve')}
                        disabled={isRefining}
                        className="flex items-center justify-center gap-2 py-3 bg-purple-600/20 border border-purple-500/30 hover:bg-purple-600/30 rounded-xl transition-all font-bold text-[10px] uppercase tracking-tighter disabled:opacity-50"
                      >
                        {isRefining ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Mejorar con IA
                      </button>
                      <button 
                        onClick={() => handleRefine('fix')}
                        disabled={isRefining}
                        className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all font-bold text-[10px] uppercase tracking-tighter disabled:opacity-50"
                      >
                        <ShieldCheck size={14} className="text-blue-400" />
                        Corregir Ortografía
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-white/40">Edición</h4>
                      <Activity size={14} className="text-green-500" />
                    </div>
                    <button 
                      onClick={() => setIsEditing(!isEditing)}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-bold text-[10px] uppercase tracking-tighter border ${isEditing ? 'bg-green-600 border-green-500 text-white' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                      {isEditing ? <Check size={14} /> : <FileText size={14} />}
                      {isEditing ? "Guardar Cambios" : "Editar Manualmente"}
                    </button>
                  </div>
                </div>

                {/* Right Side: Transcription */}
                <div className="lg:w-2/3 bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col h-[700px]">
                  <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/10 relative">
                      {[
                        { id: 'segments', label: 'Timeline' },
                        { id: 'improved', label: 'Mejorado' },
                        { id: 'raw', label: 'Original' }
                      ].map(tab => (
                        <button 
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 relative ${activeTab === tab.id ? "bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]" : "text-gray-500 hover:text-gray-300"}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 pt-4">
                    {activeTab === 'segments' ? (
                      <div className="space-y-6">
                        {segments.length > 0 ? segments.map((seg, i) => (
                          <div 
                            key={i} 
                            onClick={() => !isEditing && seekTo(seg.start)}
                            className={`flex gap-6 group rounded-2xl transition-all ${isEditing ? 'bg-white/[0.02] p-4 border border-white/5' : 'cursor-pointer hover:bg-white/5 p-4'}`}
                          >
                            <div className="pt-1">
                              <span className="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg text-[10px] font-black text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-all">
                                {formatTime(seg.start)}
                              </span>
                            </div>
                            {isEditing ? (
                              <textarea
                                value={seg.text}
                                onChange={(e) => updateSegmentText(i, e.target.value)}
                                className="flex-1 bg-transparent border-none outline-none text-gray-300 text-lg leading-relaxed focus:text-white resize-none h-auto"
                                rows={2}
                              />
                            ) : (
                              <p className="flex-1 text-gray-300 text-lg leading-relaxed group-hover:text-white transition-colors">
                                {seg.text}
                              </p>
                            )}
                          </div>
                        )) : (
                          <div className="text-center py-20 opacity-20">
                            <FileText size={48} className="mx-auto mb-4" />
                            <p className="uppercase font-black text-xs">No hay segmentos disponibles</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <textarea 
                        value={activeTab === "improved" ? (improvedTranscription || "") : (transcription || "")}
                        readOnly
                        className="w-full h-full bg-transparent border-none outline-none text-gray-100 text-lg leading-relaxed font-normal resize-none focus:ring-0 custom-scrollbar"
                      />
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Info Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12">
            {[
              { title: t("trans_feat1_title"), desc: t("trans_feat1_desc"), icon: Zap },
              { title: t("trans_feat2_title"), desc: t("trans_feat2_desc"), icon: Languages },
              { title: t("trans_feat3_title"), desc: t("trans_feat3_desc"), icon: Clock }
            ].map((f, i) => (
              <div key={i} className="space-y-4 group">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-purple-500 group-hover:scale-110 transition-transform duration-500 border border-white/5 group-hover:border-purple-500/30">
                  <f.icon size={28} />
                </div>
                <h4 className="text-lg font-black uppercase italic tracking-tighter">{f.title}</h4>
                <p className="text-sm text-gray-500 font-medium leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
