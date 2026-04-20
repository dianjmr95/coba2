import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import AutoPrintTrigger from "./AutoPrintTrigger";
import PrintActions from "./PrintActions";

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
  const docNoLabel = isPenawaran ? "No Penawaran" : "No Faktur";
  const totalLabel = isPenawaran ? "TOTAL PENAWARAN" : "TOTAL";
  const total = Number(data.subtotal) || items.reduce((acc, item) => acc + item.qty * item.harga, 0);

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-white px-4 py-8 text-slate-900">
      <AutoPrintTrigger enabled={shouldAutoPrint} />
      <PrintActions />
      <section className="sheet rounded-md border border-stone-300 p-4 print:border-none print:p-0">
        <style>{`
          @media print {
            @page { size: A4; margin: 12mm; }
          }
          .sheet .header { display: flex; gap: 10px; align-items: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
          .sheet .logo { width: 90px; height: auto; object-fit: contain; }
          .sheet .company h1 { margin: 0; font-size: 26px; letter-spacing: 0.02em; line-height: 1.02; }
          .sheet .company p { margin: 1px 0 0; color: #222; font-size: 10px; }
          .sheet .company .address { margin-top: 3px; font-size: 9px; line-height: 1.35; max-width: 430px; color: #333; }
          .sheet .title { margin: 10px 0 8px; text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 0.11em; }
          .sheet .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
          .sheet .box { border: 1px solid #999; border-radius: 3px; padding: 8px; min-height: 68px; }
          .sheet .box p { margin: 0 0 3px; font-size: 10px; }
          .sheet .doc-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          .sheet .doc-table th, .sheet .doc-table td { border: 1px solid #999; padding: 5px; font-size: 10px; }
          .sheet .doc-table th { background: #f2f2f2; font-weight: 700; }
          .sheet .right { text-align: right; }
          .sheet .total { margin-top: 8px; display: flex; justify-content: flex-end; font-size: 14px; font-weight: 700; }
          .sheet .notes { margin-top: 8px; border: 1px solid #999; border-radius: 3px; padding: 8px; min-height: 42px; font-size: 10px; }
          .sheet .terms { margin-top: 8px; border: 1px solid #999; border-radius: 3px; padding: 8px; font-size: 10px; line-height: 1.5; }
          .sheet .terms-title { font-weight: 700; margin-bottom: 4px; }
          .sheet .terms-list { margin: 0; padding-left: 16px; }
          .sheet .terms-closing { margin-top: 8px; }
          .sheet .sign { margin-top: 30px; display: flex; justify-content: flex-end; }
          .sheet .sign-box { width: 160px; text-align: center; font-size: 10px; }
          .sheet .sign-space { height: 52px; }
        `}</style>

        <div className="header">
          <img src="/starcomp-logo.png" alt="Logo Starcomp" className="logo" />
          <div className="company">
            <h1>STARCOMP SOLO</h1>
            <p>Computer Store</p>
            <p>{isPenawaran ? "Dokumen Penawaran Barang" : "Faktur Penjualan Resmi"}</p>
            <p className="address">Jl. Garuda Mas, Gonilan, Kec. Kartasura, Kabupaten Sukoharjo, Jawa Tengah 57169</p>
          </div>
        </div>

        <h2 className="title">{docTitle}</h2>

        <div className="meta">
          <div className="box">
            <p><strong>{docNoLabel}:</strong> {data.document_no}</p>
            <p><strong>Tanggal Cetak:</strong> {formatDate(data.invoice_date)}</p>
            {isPenawaran ? <p><strong>Berlaku Sampai:</strong> {formatDate(data.valid_until)}</p> : null}
            <p><strong>Kurir:</strong> {data.courier || "-"}</p>
          </div>
          <div className="box">
            <p><strong>Pembeli:</strong> {data.buyer || "-"}</p>
            <p><strong>Telepon:</strong> {data.phone || "-"}</p>
            <p><strong>Alamat:</strong> {data.address || "-"}</p>
            {isPenawaran ? <p><strong>PIC Sales:</strong> {data.sales_pic || "-"}</p> : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="doc-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>No</th>
                <th>Nama Barang</th>
                <th className="right" style={{ width: 56 }}>Qty</th>
                <th className="right" style={{ width: 130 }}>Harga Satuan</th>
                <th className="right" style={{ width: 138 }}>Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {items.length ? (
                items.map((item, index) => {
                  const lineTotal = item.qty * item.harga;
                  return (
                    <tr key={`${item.nama}-${index}`}>
                      <td>{index + 1}</td>
                      <td>{item.nama}</td>
                      <td className="right">{item.qty}</td>
                      <td className="right">{rupiah(item.harga)}</td>
                      <td className="right">{rupiah(lineTotal)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500">
                    Tidak ada item.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="total">
          {totalLabel}: {rupiah(total)}
        </div>
        <div className="notes">
          <strong>Catatan:</strong> {data.notes || "-"}
        </div>
        {!isPenawaran ? (
          <div className="terms">
            <div>Barang yang sudah dibeli tidak bisa dikembalikan.</div>
            <div className="terms-closing">Terima kasih atas kepercayaan Anda.</div>
          </div>
        ) : null}
        {isPenawaran ? (
          <div className="terms">
            <div className="terms-title">Syarat dan Ketentuan:</div>
            <ol className="terms-list">
              <li>Harga di atas sudah termasuk PPN 11%.</li>
              <li>Pembayaran dilakukan secara tunai/transfer sebelum pengiriman.</li>
              <li>Pengiriman barang akan dilakukan setelah pembayaran dikonfirmasi.</li>
              <li>Harga yang tertera tidak mengikat dan bisa berubah sewaktu-waktu.</li>
            </ol>
            <div className="terms-closing">
              Demikian surat penawaran ini kami sampaikan. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.
            </div>
          </div>
        ) : null}
        <div className="sign">
          <div className="sign-box">
            <div>Hormat kami,</div>
            <div className="sign-space" />
            <div><strong>STARCOMP SOLO</strong></div>
          </div>
        </div>
      </section>
    </main>
  );
}
