import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import AutoPrintTrigger from "./AutoPrintTrigger";

type DocumentItem = {
  nama: string;
  qty: number;
  harga: number;
};
type DocumentRow = {
  document_no: string;
  document_type: string;
  invoice_date: string;
  valid_until: string | null;
  buyer: string;
  phone: string;
  address: string;
  courier: string;
  sales_pic: string;
  notes: string;
  items: unknown;
  subtotal: number | string;
};

function rupiah(num: number) {
  return `Rp ${Math.round(num || 0).toLocaleString("id-ID")}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function normalizeItems(value: unknown): DocumentItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const rec = entry as Record<string, unknown>;
      const nama = String(rec.nama || "").trim();
      const qty = Math.max(0, Number(rec.qty) || 0);
      const harga = Math.max(0, Number(rec.harga) || 0);
      if (!nama || qty <= 0) return null;
      return { nama, qty, harga };
    })
    .filter((item): item is DocumentItem => Boolean(item));
}

export const dynamic = "force-dynamic";

export default async function DokumenPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ autoprint?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const publicToken = String(token || "").trim();
  const shouldAutoPrint = String(query?.autoprint || "").trim() === "1";
  if (!publicToken) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl bg-white px-4 py-8 text-slate-900">
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <h1 className="text-lg font-bold text-rose-700">Token dokumen tidak valid</h1>
        </section>
      </main>
    );
  }

  let data: DocumentRow | null = null;
  let queryError = "";

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const result = await supabaseAdmin
      .from("sales_documents")
      .select(
        "document_no, document_type, invoice_date, valid_until, buyer, phone, address, courier, sales_pic, notes, items, subtotal"
      )
      .eq("public_token", publicToken)
      .maybeSingle();
    if (result.error) {
      queryError = result.error.message || "Gagal membaca data dokumen.";
    } else {
      data = result.data as DocumentRow | null;
    }
  } catch (error) {
    queryError = error instanceof Error ? error.message : "Terjadi error saat membuka dokumen.";
  }

  if (queryError) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl bg-white px-4 py-8 text-slate-900">
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <h1 className="text-lg font-bold text-rose-700">Dokumen belum bisa dibuka</h1>
          <p className="mt-2 text-sm text-rose-700">{queryError}</p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto min-h-screen max-w-4xl bg-white px-4 py-8 text-slate-900">
        <section className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
          <h1 className="text-lg font-bold text-slate-800">Dokumen tidak ditemukan</h1>
          <p className="mt-2 text-sm text-slate-600">
            Link valid, tetapi token dokumen belum ada di database.
          </p>
        </section>
      </main>
    );
  }

  const items = normalizeItems(data.items);
  const isPenawaran = data.document_type === "penawaran";
  const docTitle = isPenawaran ? "SURAT PENAWARAN BARANG" : "FAKTUR PENJUALAN";
  const total = Number(data.subtotal) || items.reduce((acc, item) => acc + item.qty * item.harga, 0);

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-white px-4 py-8 text-slate-900">
      <AutoPrintTrigger enabled={shouldAutoPrint} />
      <section className="rounded-2xl border border-stone-200 p-4">
        <div className="mb-4 border-b border-stone-200 pb-3">
          <h1 className="text-xl font-bold">{docTitle}</h1>
          <p className="text-sm text-slate-600">STARCOMP SOLO</p>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-stone-200 p-3 text-sm">
            <p><strong>No Dokumen:</strong> {data.document_no}</p>
            <p><strong>Tanggal:</strong> {formatDate(data.invoice_date)}</p>
            {isPenawaran ? <p><strong>Berlaku Sampai:</strong> {formatDate(data.valid_until)}</p> : null}
            <p><strong>Kurir:</strong> {data.courier || "-"}</p>
          </div>
          <div className="rounded-xl border border-stone-200 p-3 text-sm">
            <p><strong>Pembeli:</strong> {data.buyer || "-"}</p>
            <p><strong>Telepon:</strong> {data.phone || "-"}</p>
            <p><strong>Alamat:</strong> {data.address || "-"}</p>
            {isPenawaran ? <p><strong>PIC Sales:</strong> {data.sales_pic || "-"}</p> : null}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-stone-50">
                <th className="border border-stone-200 px-2 py-2 text-left">No</th>
                <th className="border border-stone-200 px-2 py-2 text-left">Nama Barang</th>
                <th className="border border-stone-200 px-2 py-2 text-right">Qty</th>
                <th className="border border-stone-200 px-2 py-2 text-right">Harga</th>
                <th className="border border-stone-200 px-2 py-2 text-right">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item, index) => {
                  const lineTotal = item.qty * item.harga;
                  return (
                    <tr key={`${item.nama}-${index}`}>
                      <td className="border border-stone-200 px-2 py-2">{index + 1}</td>
                      <td className="border border-stone-200 px-2 py-2">{item.nama}</td>
                      <td className="border border-stone-200 px-2 py-2 text-right">{item.qty}</td>
                      <td className="border border-stone-200 px-2 py-2 text-right">{rupiah(item.harga)}</td>
                      <td className="border border-stone-200 px-2 py-2 text-right">{rupiah(lineTotal)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="border border-stone-200 px-2 py-4 text-center text-slate-500">
                    Tidak ada item.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-right text-base font-bold">
          {isPenawaran ? "TOTAL PENAWARAN" : "TOTAL"}: {rupiah(total)}
        </div>
        <div className="mt-3 rounded-xl border border-stone-200 p-3 text-sm">
          <strong>Catatan:</strong> {data.notes || "-"}
        </div>
      </section>
    </main>
  );
}
