"use client";

export default function PrintActions() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
      <p className="text-xs text-slate-600">
        Untuk simpan PDF, klik cetak lalu pilih printer `Save as PDF`.
      </p>
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
