import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MatheKlar | Kopfrechenteil Klasse 10',
  description:
    'Interaktiver 15-Minuten-Trainer für den Kopfrechenteil der Mathematik-Abschlussprüfung in Klasse 10.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
