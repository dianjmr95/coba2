import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starcomp Solo",
  description:
    "Hitung estimasi potongan, pendapatan bersih, margin keuntungan, dan harga jual rekomendasi."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
