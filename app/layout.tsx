import type { Metadata } from 'next';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://matheklar-kopfrechen.monique-titze.chatgpt.site';
const title = 'MatheKlar | Kopfrechenteil Klasse 10';
const description =
  'Interaktiver 15-Minuten-Trainer für den Kopfrechenteil der Mathematik-Abschlussprüfung in Klasse 10.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    type: 'website',
    url: siteUrl,
    title,
    description,
    images: [{ url: `${siteUrl}/og.png`, width: 1200, height: 630, alt: 'MatheKlar – Kopfrechenteil Klasse 10' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
