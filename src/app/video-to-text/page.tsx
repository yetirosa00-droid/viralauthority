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
  Activity,
  Upload,
  RefreshCw
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
    setProgress(activeMode === "file" ? 0 : 5);
    setStatusMessage(activeMode === "file" ? "Iniciando subida..." : "Inicializando cola de trabajo...");

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

      // 1. Create Job in Asynchronous Queue (with upload progress tracking)
      const createResponse = await axios.post("/api/transcribe", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (activeMode === "file" && progressEvent.total) {
            const uploadPercentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            // Represent upload stage as 0% to 20% of final progress
            const scaledProgress = Math.round(uploadPercentage * 0.2);
            setProgress(scaledProgress);
            setStatusMessage(`Subiendo archivo... (${uploadPercentage}%)`);
          }
        }
      });

      const { jobId, status } = createResponse.data;

      if (status === "completed" && createResponse.data.text) {
        // Fast path for completed cache hits
        setProgress(100);
        const rawText = createResponse.data.text || "";
        setTranscription(rawText);
        setImprovedTranscription(createResponse.data.improved || rawText);
        setSegments(createResponse.data.segments || []);
        setVideoUrl(url);
        if (file) setLocalFileUrl(URL.createObjectURL(file));
        setActiveTab("segments");
        setStatusMessage("Listo");
        setLoading(false);
        return;
      }

      // 2. Start polling the job status endpoint
      const pollInterval = setInterval(async () => {
        try {
          const pollResponse = await axios.get(`/api/jobs/${jobId}`);
          const { job } = pollResponse.data;

          if (!job) {
            clearInterval(pollInterval);
            setError("Error: El trabajo solicitado no pudo ser rastreado.");
            setLoading(false);
            return;
          }

          // Map job state dynamically to progress percentages and status messages
          if (job.status === "pending") {
            setProgress(25);
            setStatusMessage("Procesando archivo...");
          } else if (job.status === "processing") {
            setProgress(35);
            setStatusMessage("Preparando audio...");
          } else if (job.status === "downloading") {
            setProgress(25);
            setStatusMessage("Subiendo archivo...");
          } else if (job.status === "extracting_audio") {
            setProgress(50);
            setStatusMessage("Extrayendo audio...");
          } else if (job.status === "transcribing") {
            if (job.progress >= 85) {
              setProgress(85);
              setStatusMessage("Mejorando texto...");
            } else {
              setProgress(75);
              setStatusMessage("Transcribiendo...");
            }
          } else if (job.status === "completed") {
            clearInterval(pollInterval);
            setProgress(100);
            setStatusMessage("Listo");

            setTimeout(() => {
              const rawText = job.resultText || "";
              setTranscription(rawText);
              setImprovedTranscription(job.improvedText || rawText);
              setSegments(job.segments || []);
              setVideoUrl(url);
              if (file) setLocalFileUrl(URL.createObjectURL(file));
              setActiveTab("segments");
              setLoading(false);
            }, 500);
          } else if (job.status === "blocked_by_platform") {
            clearInterval(pollInterval);
            setError("Esta plataforma bloqueó temporalmente el procesamiento del enlace. Puedes intentar más tarde, usar otro enlace o subir el archivo directamente para transcribirlo.");
            setStatusMessage("Fallo: Bloqueo de plataforma");
            setLoading(false);
          } else if (job.status === "failed") {
            clearInterval(pollInterval);
            setError(job.errorMessage || "Fallo en el procesamiento de audio.");
            setStatusMessage("Fallo en el procesamiento");
            setLoading(false);
          }
        } catch (pollErr: any) {
          clearInterval(pollInterval);
          console.error("Polling error:", pollErr);
          setError("Error de comunicación durante el rastreo del progreso.");
          setLoading(false);
        }
      }, 2500);

    } catch (err: any) {
      console.error("Transcription error:", err);
      let serverError = err.response?.data?.error || "Error al conectar con la cola.";
      const details = err.response?.data?.details;
      
      if (serverError === "YOUTUBE_RATE_LIMITED" || (err.response?.data?.message && err.response.data.message.includes("YouTube bloqueó"))) {
        serverError = "Esta plataforma bloqueó temporalmente el procesamiento del enlace. Puedes intentar más tarde, usar otro enlace o subir el archivo directamente para transcribirlo.";
      }
      
      setError(details ? `${serverError}: ${details.substring(0, 100)}` : serverError);
      setStatusMessage("Fallo al iniciar cola");
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

  const getFormattedTimelineText = (): string => {
    if (!segments || segments.length === 0) return "";
    return segments.map(seg => `[${formatTime(seg.start)}] ${seg.text}`).join('\n');
  };

  const copyToClipboard = () => {
    let textToCopy = "";
    if (activeTab === "improved") {
      textToCopy = improvedTranscription || "";
    } else if (activeTab === "segments") {
      textToCopy = getFormattedTimelineText();
    } else {
      textToCopy = transcription || "";
    }

    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadTextFile = () => {
    let textToDownload = "";
    if (activeTab === "improved") {
      textToDownload = improvedTranscription || "";
    } else if (activeTab === "segments") {
      textToDownload = getFormattedTimelineText();
    } else {
      textToDownload = transcription || "";
    }

    if (!textToDownload) return;
    const element = document.createElement("a");
    const fileBlob = new Blob([textToDownload], { type: 'text/plain' });
    element.href = URL.createObjectURL(fileBlob);
    element.download = `ViralAuthority_Transcription_${activeTab}_${Date.now()}.txt`;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    document.body.removeChild(element);
  };

  const downloadDocFile = () => {
    let textToDownload = "";
    if (activeTab === "improved") {
      textToDownload = improvedTranscription || "";
    } else if (activeTab === "segments") {
      textToDownload = getFormattedTimelineText();
    } else {
      textToDownload = transcription || "";
    }

    if (!textToDownload) return;
    
    // Create simple HTML that Word can read natively
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>Transcripción ViralAuthority</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; }
        p { margin-bottom: 12px; }
        .timestamp { color: #9333ea; font-weight: bold; margin-right: 8px; }
      </style>
      </head>
      <body>
        <h2>Transcripción - ${activeTab === 'improved' ? 'Texto Mejorado por IA' : activeTab === 'segments' ? 'Timeline con Códigos de Tiempo' : 'Texto Original'}</h2>
        <hr/>
        ${activeTab === 'segments'
          ? segments.map(seg => `<p><span class="timestamp">[${formatTime(seg.start)}]</span>${seg.text}</p>`).join('')
          : textToDownload.split('\n').map(p => `<p>${p}</p>`).join('')
        }
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], {
      type: 'application/msword'
    });
    
    const element = document.createElement("a");
    element.href = URL.createObjectURL(blob);
    element.download = `ViralAuthority_Transcription_${activeTab}_${Date.now()}.docx`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleReset = () => {
    setFile(null);
    setUrl("");
    setTranscription(null);
    setImprovedTranscription(null);
    setSegments([]);
    setError(null);
    setLocalFileUrl(null);
    setVideoUrl(null);
    setProgress(0);
    setStatusMessage("");
  };

  const handleVolverASubir = () => {
    handleReset();
    setActiveMode("file");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    if (!selectedFile) return;

    // Validate format security (MP4, MOV, MP3, WAV, M4A)
    const allowedExtensions = ['.mp4', '.mov', '.mp3', '.wav', '.m4a'];
    const lastDotIndex = selectedFile.name.lastIndexOf('.');
    const fileExt = lastDotIndex !== -1 ? selectedFile.name.substring(lastDotIndex).toLowerCase() : '';
    if (!allowedExtensions.includes(fileExt)) {
      setError("Formato no compatible. Sube MP4, MOV, MP3, WAV o M4A.");
      setFile(null);
      return;
    }

    // Validate size (Free: 50MB, Premium: 500MB)
    const maxSize = isPremium ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      const sizeLabel = isPremium ? "500 MB" : "50 MB";
      setError(`El archivo excede el límite de tamaño de ${sizeLabel} para tu nivel de cuenta.`);
      setFile(null);
      return;
    }

    setError(null);
    setFile(selectedFile);
  };

  const getYouTubeId = (url: string) => {
    const regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[1].length === 11) ? match[1] : null;
  };

  const getStepState = (stepKey: string) => {
    if (stepKey === "upload") {
      if (activeMode === "url") return "completed";
      if (progress > 20) return "completed";
      return "active";
    }
    if (stepKey === "prepare") {
      if (activeMode === "file" && progress <= 20) return "pending";
      if (progress > 35) return "completed";
      return "active";
    }
    if (stepKey === "extract") {
      if (progress <= 35) return "pending";
      if (progress > 50) return "completed";
      return "active";
    }
    if (stepKey === "transcribe") {
      if (progress <= 50) return "pending";
      if (progress > 75) return "completed";
      return "active";
    }
    if (stepKey === "improve") {
      if (progress <= 75) return "pending";
      if (progress > 90) return "completed";
      return "active";
    }
    if (stepKey === "ready") {
      if (progress < 100) return "pending";
      return "completed";
    }
    return "pending";
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

          {/* Limit / Guide Card for Upload File */}
          <AnimatePresence mode="wait">
            {activeMode === "file" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="max-w-4xl mx-auto overflow-hidden"
              >
                <div className="bg-gradient-to-r from-purple-900/10 to-blue-900/10 border border-purple-500/10 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">Especificaciones de Carga</h4>
                    </div>
                    <p className="text-sm font-medium text-gray-300">
                      Formatos compatibles: <strong className="text-white">MP4, MOV, MP3, WAV, M4A</strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <div className="px-3.5 py-2 bg-white/5 rounded-xl border border-white/5 text-xs">
                      <span className="text-gray-400 block text-[9px] uppercase tracking-widest font-black">Plan Actual</span>
                      <span className="text-white font-bold">{isPremium ? "Premium ✨" : "Gratuito 🎁"}</span>
                    </div>
                    <div className="px-3.5 py-2 bg-white/5 rounded-xl border border-white/5 text-xs">
                      <span className="text-gray-400 block text-[9px] uppercase tracking-widest font-black">Límite de Tamaño</span>
                      <span className="text-white font-bold">{isPremium ? "500 MB" : "50 MB"}</span>
                    </div>
                    <div className="px-3.5 py-2 bg-white/5 rounded-xl border border-white/5 text-xs">
                      <span className="text-gray-400 block text-[9px] uppercase tracking-widest font-black">Límite de Tiempo</span>
                      <span className="text-white font-bold">{isPremium ? "60 minutos" : "10 minutos"}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                  <div className="flex-1 flex items-center gap-3 px-6 h-16 bg-white/[0.03] rounded-2xl border border-white/10 group-focus-within:border-purple-500/50 transition-colors relative overflow-hidden cursor-pointer hover:bg-white/[0.06]">
                    <Upload className="text-purple-500 shrink-0 animate-pulse" size={24} />
                    <div className="flex-1 min-w-0 text-left">
                      <span className="text-sm font-bold text-white block truncate">
                        {file ? file.name : "Seleccionar o arrastrar archivo de audio/video..."}
                      </span>
                      <span className="text-[10px] text-gray-500 block">
                        {file ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : "Haz clic para buscar en tu dispositivo"}
                      </span>
                    </div>
                    <input 
                      type="file"
                      accept=".mp4,.mov,.mp3,.wav,.m4a"
                      onChange={handleFileChange}
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

              {/* Size limits and Privacy Info */}
              <div className="px-6 py-3 flex flex-col sm:flex-row justify-between items-center gap-2 border-t border-white/5 mt-1 text-[11px] text-gray-500 font-medium">
                <div>
                  <span className="text-purple-400 font-bold uppercase mr-1">Límites de archivo:</span>
                  {isPremium ? (
                    <span>Premium: hasta <strong className="text-white">500 MB</strong> / <strong className="text-white">60 minutos</strong></span>
                  ) : (
                    <span>Gratis: hasta <strong className="text-white">50 MB</strong> / <strong className="text-white">10 minutos</strong>. <a href="#pricing" className="text-purple-400 underline hover:text-purple-300">Sube a Premium</a> para 500MB/60min.</span>
                  )}
                </div>
                <div className="text-gray-600">
                  🛡️ Tus archivos se procesan temporalmente y no se almacenan de forma permanente.
                </div>
              </div>
            </form>
          </div>

          {/* Progress Checklist Area */}
          <AnimatePresence>
            {loading && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="max-w-3xl mx-auto space-y-6"
              >
                <div className="bg-black/40 border border-white/10 p-6 sm:p-8 rounded-[2rem] space-y-6">
                  {/* Progress Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Activity className="text-purple-500 animate-pulse" size={20} />
                      <span className="text-sm font-bold uppercase tracking-widest text-purple-400">
                        {statusMessage}
                      </span>
                    </div>
                    <span className="text-lg font-black text-white">{Math.floor(progress)}%</span>
                  </div>
                  
                  {/* Glowing Progress Bar */}
                  <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                      className="h-full bg-gradient-to-r from-purple-600 via-blue-500 to-purple-600 bg-[length:200%_100%] animate-gradient-x rounded-full shadow-[0_0_20px_rgba(147,51,234,0.5)]"
                    />
                  </div>

                  {/* Steps Checklist */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-white/5">
                    {[
                      { key: "upload", label: "Subiendo archivo", percent: "0-20%" },
                      { key: "prepare", label: "Preparando audio", percent: "25%" },
                      { key: "extract", label: "Extrayendo audio", percent: "50%" },
                      { key: "transcribe", label: "Transcribiendo", percent: "75%" },
                      { key: "improve", label: "Mejorando texto", percent: "90%" },
                      { key: "ready", label: "Listo", percent: "100%" }
                    ].map((step, idx) => {
                      const state = getStepState(step.key);
                      return (
                        <div 
                          key={step.key}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            state === "completed" 
                              ? "bg-green-500/5 border-green-500/10 text-gray-300"
                              : state === "active"
                              ? "bg-purple-500/5 border-purple-500/30 text-white font-semibold shadow-[0_0_15px_rgba(147,51,234,0.1)]"
                              : "bg-white/[0.01] border-white/5 text-gray-600"
                          }`}
                        >
                          <div className="shrink-0">
                            {state === "completed" && (
                              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            )}
                            {state === "active" && (
                              <Loader2 className="animate-spin text-purple-400" size={18} />
                            )}
                            {state === "pending" && (
                              <div className="w-5 h-5 rounded-full border-2 border-white/10 flex items-center justify-center text-[9px] font-black text-gray-600">
                                {idx + 1}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs truncate">{step.label}</p>
                            <span className="text-[9px] font-black tracking-widest text-gray-500 block uppercase">{step.percent}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          {error && (
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-500 shrink-0">
                  <ShieldCheck size={20} />
                </div>
                <div className="space-y-3 flex-1">
                  <p className="text-red-200 font-medium pt-2">{error}</p>
                  {(error.includes("plataforma bloqueó") || error.includes("YouTube bloqueó") || error.includes("límite")) && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMode("file");
                        setError(null);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-purple-500/20 mt-2"
                    >
                      <Upload size={14} className="mr-1 animate-bounce" /> Subir archivo directamente
                    </button>
                  )}
                </div>
              </div>
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
                  <div className="px-8 py-6 border-b border-white/5 bg-white/[0.02] flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/10 relative w-full md:w-auto md:min-w-[300px]">
                      {[
                        { id: 'segments', label: 'TIMELINE' },
                        { id: 'improved', label: 'MEJORADO' },
                        { id: 'raw', label: 'ORIGINAL' }
                      ].map(tab => (
                        <button 
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id as any)}
                          className={`flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 relative ${activeTab === tab.id ? "bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]" : "text-gray-500 hover:text-gray-300"}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Action buttons (Copy, TXT, DOC, Reset) */}
                    <div className="flex flex-wrap gap-2 justify-end w-full md:w-auto">
                      <button 
                        onClick={copyToClipboard}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all font-bold text-[10px] uppercase tracking-tighter text-gray-300 hover:text-white"
                        title="Copiar texto al portapapeles"
                      >
                        {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                        {copied ? "Copiado" : "Copiar Texto"}
                      </button>
                      <button 
                        onClick={downloadTextFile}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all font-bold text-[10px] uppercase tracking-tighter text-gray-300 hover:text-white"
                        title="Descargar como archivo de texto plano TXT"
                      >
                        <Download size={12} />
                        Descargar TXT
                      </button>
                      <button 
                        onClick={downloadDocFile}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all font-bold text-[10px] uppercase tracking-tighter text-gray-300 hover:text-white"
                        title="Descargar como documento de Word DOC"
                      >
                        <FileText size={12} className="text-blue-400" />
                        Descargar DOCX
                      </button>
                      <button 
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 rounded-xl transition-all font-bold text-[10px] uppercase tracking-tighter text-purple-300 hover:text-white"
                        title="Iniciar una nueva transcripción"
                      >
                        <RefreshCw size={12} />
                        Nueva Transcripción
                      </button>
                      <button 
                        onClick={handleVolverASubir}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 rounded-xl transition-all font-bold text-[10px] uppercase tracking-tighter text-blue-300 hover:text-white"
                        title="Volver a subir un archivo de audio o video"
                      >
                        <Upload size={12} />
                        Volver a Subir
                      </button>
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
