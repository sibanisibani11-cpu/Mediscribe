import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from "../components/ui/toaster"
import { ThemeProvider } from '../components/theme-provider';

export const metadata: Metadata = {
  title: 'MediScribe',
  description: 'AI-powered medical transcription',
  // Note: No favicon - absolute /favicon.ico path breaks Electron file:// protocol
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Fonts removed: external fetches block rendering in packaged Electron app */}
        {/* System fonts are used instead via globals.css font-family stack */}
      </head>
      <body className="font-body antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
