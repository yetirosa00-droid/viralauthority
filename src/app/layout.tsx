import "./globals.css";
import { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://viralauthoritypro.com"),
  title: "ViralAuthority PRO PREMIUM - AI Multimedia Suite",
  description: "The ultimate professional platform for multimedia processing, AI transcription, and digital archiving. Secure, fast, and optimized for creators.",
  keywords: ["multimedia engine", "ai transcription", "video downloader pro", "digital archive", "ViralAuthority PRO"],
  authors: [{ name: "ViralAuthority PRO Team" }],
  openGraph: {
    title: "ViralAuthority PRO PREMIUM - AI Multimedia Suite",
    description: "Professional multimedia processing and AI transcription engine.",
    url: "https://viralauthoritypro.com",
    siteName: "ViralAuthority PRO PREMIUM",
    images: [
      {
        url: "/logo.png",
        width: 1024,
        height: 1024,
        alt: "ViralAuthority PRO PREMIUM Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ViralAuthority PRO PREMIUM",
    description: "Professional AI Multimedia Suite for modern creators.",
    images: ["/logo.png"],
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
      { url: "/favicon.png", type: "image/png" },
      { url: "/logo.png", type: "image/png" }
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
