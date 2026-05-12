"use client";

export default function PrintActions() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <div className="space-y-2">
        <p className="text-xs text-slate-600">
          Untuk simpan PDF, klik cetak lalu pilih printer `Save as PDF`.
        </p>
        <p className="text-xs text-slate-500">
          Rekomendasi: pakai mode `Normal` untuk hasil paling rapi meski lebih dari 1 halaman.
        </p>
      </div>

      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-xl border border-stone-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Cetak / Simpan PDF
      </button>
    </div>
  );
}
