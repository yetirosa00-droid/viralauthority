import "./globals.css";
import { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://viralauthoritypro.com"),
  title: "ViralAuthority PRO PREMIUM - Multimedia, AI, Transcription and Digital Archive Tools",
  description: "Professional platform for multimedia management, AI transcription, image editing, audio workflows and responsible digital archive for personal or educational reference.",
  keywords: ["multimedia management", "digital archive", "ai transcription", "image editor online", "video to text", "creator tools", "offline reference", "ViralAuthority PRO PREMIUM"],
  authors: [{ name: "ViralAuthority PRO PREMIUM Team" }],
  openGraph: {
    title: "ViralAuthority PRO PREMIUM - AI Multimedia Suite",
    description: "Manage multimedia references, edit images, and transcribe audio with AI in a responsible creator workflow.",
    url: "https://viralauthoritypro.com",
    siteName: "ViralAuthority PRO PREMIUM",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "ViralAuthority PRO PREMIUM Platform Preview",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ViralAuthority PRO PREMIUM - AI Multimedia Suite",
    description: "Multimedia management, AI editing and transcription for responsible creator workflows.",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://viralauthoritypro.com",
    languages: {
      "en-US": "https://viralauthoritypro.com",
      "es-ES": "https://viralauthoritypro.com",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png" }
    ],
    apple: [
      { url: "/favicon.png", sizes: "180x180", type: "image/png" }
    ],
  },
};

import { CookieBanner } from "@/components/CookieBanner";
import { AdPopunder } from "@/components/AdPopunder";
import { LanguageProvider } from "@/context/LanguageContext";
import { UserProvider } from "@/context/UserContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        <LanguageProvider>
          <UserProvider>
            {children}
            <CookieBanner />
            <AdPopunder />
          </UserProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
