import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import AutoPrintTrigger from "./AutoPrintTrigger";
import PrintActions from "./PrintActions";

const DEFAULT_BANK_ACCOUNT_INFO = "BCA : 861-0995960\nA/n : CV STAR MEDIA COMPUTAMA";

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
  whatsapp: string;
  address: string;
  courier: string;
  sales_pic: string;
  notes: string;
  items: unknown;
  subtotal: number | string;
  tax_enabled?: boolean;
  tax_mode?: string;
  tax_rate?: number | string;
  tax_amount?: number | string;
  grand_total?: number | string;
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

function isMissingTaxColumnError(message: string) {
  const text = message.toLowerCase();
  return (
    (text.includes("schema cache") || text.includes("column")) &&
    (
      text.includes("grand_total") ||
      text.includes("tax_enabled") ||
      text.includes("tax_rate") ||
      text.includes("tax_amount") ||
      text.includes("tax_mode")
    )
  );
}

export const dynamic = "force-dynamic";

export default async function DokumenPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    autoprint?: string;
    includeSign?: string;
    includeBank?: string;
    includeTax?: string;
    includeTaxMode?: string;
    includeTaxAmount?: string;
    includeTaxRate?: string;
    includeSJ?: string;
  }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const publicToken = String(token || "").trim();
  const shouldAutoPrint = String(query?.autoprint || "").trim() === "1";
  const includeSignAndStamp = String(query?.includeSign || "1").trim() !== "0";
  const includeBankAccount = String(query?.includeBank || "").trim() === "1";
  const includeSuratJalan = String(query?.includeSJ || "1").trim() !== "0";
  const includeTaxParamRaw = String(query?.includeTax || "").trim();
  const hasTaxOverride = includeTaxParamRaw === "1" || includeTaxParamRaw === "0";
  const includeTaxOverride = includeTaxParamRaw === "1";
  const includeTaxModeParamRaw = String(query?.includeTaxMode || "").trim().toLowerCase();
  const hasTaxModeOverride = includeTaxModeParamRaw === "include" || includeTaxModeParamRaw === "exclude";
  const includeTaxModeOverride = includeTaxModeParamRaw === "include" ? "include" : "exclude";
  const includeTaxAmountParamRaw = String(query?.includeTaxAmount || "").trim();
  const includeTaxAmountParsed = Number(includeTaxAmountParamRaw);
  const hasTaxAmountOverride = Number.isFinite(includeTaxAmountParsed) && includeTaxAmountParsed >= 0;
  const includeTaxRateParamRaw = String(query?.includeTaxRate || "").trim();
  const includeTaxRateParsed = Number(includeTaxRateParamRaw);
  const hasTaxRateOverride = Number.isFinite(includeTaxRateParsed) && includeTaxRateParsed > 0;
  const bankInfoValue = DEFAULT_BANK_ACCOUNT_INFO.trim();
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
    let result = await supabaseAdmin
      .from("sales_documents")
      .select(
        "document_no, document_type, invoice_date, valid_until, buyer, phone, whatsapp, address, courier, sales_pic, notes, items, subtotal, tax_enabled, tax_mode, tax_rate, tax_amount, grand_total"
      )
      .eq("public_token", publicToken)
      .maybeSingle();
    if (result.error && isMissingTaxColumnError(result.error.message || "")) {
      result = await supabaseAdmin
        .from("sales_documents")
        .select(
          "document_no, document_type, invoice_date, valid_until, buyer, phone, whatsapp, address, courier, sales_pic, notes, items, subtotal, tax_enabled, tax_rate, tax_amount, grand_total"
        )
        .eq("public_token", publicToken)
        .maybeSingle();
    }
    if (result.error && isMissingTaxColumnError(result.error.message || "")) {
      result = await supabaseAdmin
        .from("sales_documents")
        .select(
          "document_no, document_type, invoice_date, valid_until, buyer, phone, whatsapp, address, courier, sales_pic, notes, items, subtotal"
        )
        .eq("public_token", publicToken)
        .maybeSingle();
    }
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
  const subtotal = Number(data.subtotal) || items.reduce((acc, item) => acc + item.qty * item.harga, 0);
  const taxRate = hasTaxRateOverride ? includeTaxRateParsed : Math.max(0, Number(data.tax_rate) || 11);
  const grandTotalRaw = Math.max(0, Number(data.grand_total) || 0);
  const taxAmountRaw = Math.max(0, Number(data.tax_amount) || 0);
  const inferredTaxFromTotals = taxAmountRaw > 0 || grandTotalRaw > subtotal + 1;
  const taxEnabledFromData = Boolean(data.tax_enabled) || inferredTaxFromTotals;
  const taxEnabled = hasTaxOverride ? includeTaxOverride : taxEnabledFromData;
  const taxModeFromData = String(data.tax_mode || "").toLowerCase();
  const inferredTaxMode =
    taxModeFromData === "include" || taxModeFromData === "exclude"
      ? taxModeFromData
      : taxEnabledFromData && Math.abs(grandTotalRaw - subtotal) <= 1 && (taxAmountRaw > 0 || inferredTaxFromTotals)
        ? "include"
        : "exclude";
  const taxMode = hasTaxModeOverride ? includeTaxModeOverride : inferredTaxMode;
  const dppSubtotal = taxEnabled && taxMode === "include" ? Math.round((subtotal * 100) / (100 + taxRate)) : subtotal;
  const computedTaxAmount = taxEnabled
    ? taxMode === "include"
      ? Math.max(0, taxAmountRaw || subtotal - dppSubtotal)
      : Math.max(0, taxAmountRaw || grandTotalRaw - subtotal || Math.round((subtotal * taxRate) / 100))
    : 0;
  const taxAmount = taxEnabled ? (hasTaxAmountOverride ? Math.max(0, includeTaxAmountParsed) : computedTaxAmount) : 0;
  const displaySubtotal = taxEnabled && taxMode === "include" ? dppSubtotal : subtotal;
  const subtotalLabel = taxEnabled && taxMode === "include" ? "Subtotal (DPP)" : "Subtotal";
  const total = hasTaxOverride
    ? taxEnabled
      ? taxMode === "include"
        ? subtotal
        : subtotal + taxAmount
      : subtotal
    : taxEnabled
      ? taxMode === "include"
        ? Math.max(0, grandTotalRaw || subtotal)
        : Math.max(0, grandTotalRaw || subtotal + taxAmount)
      : subtotal;
  const taxTermsLine =
    taxMode === "include"
      ? "Harga diatas sudah termasuk Faktur Pajak."
      : "Harga diatas belum termasuk Faktur Pajak (PPN ditambahkan terpisah).";
  const buyerValue = String(data.buyer || "").trim();
  const phoneValue = String(data.phone || "").trim();
  const whatsappValue = String(data.whatsapp || "").trim();
  const addressValue = String(data.address || "").trim();
  const courierValue = String(data.courier || "").trim();
  const salesPicValue = String(data.sales_pic || "").trim();
  const hasBuyerBox = Boolean(buyerValue || phoneValue || whatsappValue || addressValue || (isPenawaran && salesPicValue));
  const suratJalanNo = `${data.document_no}/SJ`;

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-white px-4 py-8 text-slate-900">
      <AutoPrintTrigger enabled={shouldAutoPrint} />
      <PrintActions />
      <section className="sheet rounded-md border border-stone-300 p-4 print:border-none print:p-0">
        <style>{`
          @media print {
            @page { size: A4; margin: 12mm; }
          }
          .sheet .header { display: flex; align-items: center; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 10px; }
          .sheet .company { width: 50%; padding-right: 8px; }
          .sheet .logo-wrap { width: 50%; display: flex; justify-content: flex-end; }
          .sheet .logo { width: 220px; max-width: 100%; height: auto; object-fit: contain; }
          .sheet .company h1 { margin: 0; font-size: 28px; letter-spacing: 0.015em; line-height: 1.02; }
          .sheet .company p { margin: 1px 0 0; color: #222; font-size: 10px; line-height: 1.25; }
          .sheet .company .address { margin-top: 2px; font-size: 9px; line-height: 1.3; max-width: 500px; color: #333; }
          .sheet .title { margin: 10px 0 8px; text-align: center; font-size: 20px; font-weight: 700; letter-spacing: 0.11em; }
          .sheet .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
          .sheet .meta.single { grid-template-columns: 1fr; }
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
          .sheet .bank-section { margin-top: 8px; border: 1px solid #999; border-radius: 3px; padding: 8px; font-size: 10px; line-height: 1.45; }
          .sheet .bank-box { margin-top: 8px; border-top: 1px dashed #bbb; padding-top: 6px; line-height: 1.45; }
          .sheet .bank-label { font-weight: 700; }
          .sheet .sign { margin-top: 30px; display: flex; justify-content: flex-end; }
          .sheet .sign-box { width: 180px; text-align: center; font-size: 10px; position: relative; }
          .sheet .sign-space { height: 74px; position: relative; }
          .sheet .sign-space.no-visual { height: 74px; }
          .sheet .stamp { position: absolute; left: 50%; top: 2px; width: 132px; transform: translateX(-50%) rotate(-14deg); opacity: 0.24; z-index: 2; }
          .sheet .signature { position: absolute; left: 50%; top: 17px; width: 106px; transform: translateX(-50%); z-index: 1; }
          .sheet .page-break { break-before: page; page-break-before: always; margin-top: 20px; }
          .sheet .delivery-sign { margin-top: 26px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
          .sheet .delivery-sign-box { text-align: center; font-size: 10px; }
          .sheet .delivery-sign-space { height: 82px; position: relative; }
          .sheet .delivery-sign-space.no-visual { height: 82px; }
          .sheet .delivery-stamp { position: absolute; left: 50%; top: 6px; width: 126px; transform: translateX(-50%) rotate(-14deg); opacity: 0.24; z-index: 2; }
          .sheet .delivery-signature { position: absolute; left: 50%; top: 22px; width: 102px; transform: translateX(-50%); z-index: 1; }
        `}</style>

        <div className="header">
          <div className="company">
            <h1>STARCOMP SOLO</h1>
            <p>Computer Store</p>
            <p>{isPenawaran ? "Dokumen Penawaran Barang" : "Faktur Penjualan Resmi"}</p>
            <p className="address">Jl. Garuda Mas, Gonilan, Kec. Kartasura, Kabupaten Sukoharjo, Jawa Tengah 57169</p>
            <p>No. Telp/WA: 08112642352</p>
          </div>
          <div className="logo-wrap">
            <img src="/starcomp-logo.png" alt="Logo Starcomp" className="logo" />
          </div>
        </div>

        <h2 className="title">{docTitle}</h2>

        <div className={`meta${hasBuyerBox ? "" : " single"}`}>
          <div className="box">
            <p><strong>{docNoLabel}:</strong> {data.document_no}</p>
            <p><strong>Tanggal Cetak:</strong> {formatDate(data.invoice_date)}</p>
            {isPenawaran ? <p><strong>Berlaku Sampai:</strong> {formatDate(data.valid_until)}</p> : null}
            {courierValue ? <p><strong>Kurir:</strong> {courierValue}</p> : null}
          </div>
          {hasBuyerBox ? (
            <div className="box">
              {buyerValue ? <p><strong>Pembeli:</strong> {buyerValue}</p> : null}
              {phoneValue ? <p><strong>Telepon:</strong> {phoneValue}</p> : null}
              {whatsappValue ? <p><strong>WhatsApp:</strong> {whatsappValue}</p> : null}
              {addressValue ? <p><strong>Alamat:</strong> {addressValue}</p> : null}
              {isPenawaran && salesPicValue ? <p><strong>PIC Sales:</strong> {salesPicValue}</p> : null}
            </div>
          ) : null}
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

        {taxEnabled ? (
          <div className="mt-2 grid gap-1 text-xs text-slate-700">
            <div className="flex justify-end gap-2">
              <span>{subtotalLabel}</span>
              <strong>{rupiah(displaySubtotal)}</strong>
            </div>
            <div className="flex justify-end gap-2">
              <span>PPN ({taxRate.toFixed(2).replace(".", ",")}%)</span>
              <strong>{rupiah(taxAmount)}</strong>
            </div>
          </div>
        ) : null}
        <div className="total">
          {totalLabel}: {rupiah(total)}
        </div>
        <div className="notes">
          <strong>Catatan:</strong> {data.notes || "-"}
        </div>
        {!isPenawaran && includeBankAccount && bankInfoValue ? (
          <div className="bank-section">
            <div className="bank-label">Rekening Pembayaran:</div>
            {bankInfoValue.split("\n").map((line, index) => (
              <div key={`bank-section-${index}`}>{line}</div>
            ))}
          </div>
        ) : null}
        {!isPenawaran ? (
          <div className="terms">
            <div className="terms-title">KETERANGAN :</div>
            <div>* Barang yang sudah dibeli tidak bisa dikembalikan.</div>
            <div>* Pihak Starcomp bertanggung jawab atas garansi barang tersebut.</div>
            {taxEnabled ? <div>* {taxTermsLine}</div> : null}
            <div>* Pihak Starcomp tidak bertanggung jawab atas software yang ada di PC/Laptop.</div>
            <div className="terms-closing">Terima kasih atas kepercayaan Anda.</div>
          </div>
        ) : null}
        {isPenawaran ? (
          <div className="terms">
            <div className="terms-title">Syarat dan Ketentuan:</div>
            <ol className="terms-list">
              {taxEnabled ? <li>{taxTermsLine}</li> : null}
              <li>Harga yang tertera tidak mengikat dan bisa berubah sewaktu-waktu.</li>
              <li>Pembayaran dilakukan secara tunai/transfer sebelum pengiriman.</li>
              <li>Pengiriman barang akan dilakukan setelah pembayaran dikonfirmasi.</li>
              <li>Pihak Starcomp bertanggung jawab atas garansi barang tersebut.</li>
              <li>Pihak Starcomp tidak bertanggung jawab atas software yang ada di PC/Laptop.</li>
            </ol>
            {includeBankAccount && bankInfoValue ? (
              <div className="bank-box">
                <span className="bank-label">Rekening Pembayaran:</span>
                {bankInfoValue.split("\n").map((line, index) => (
                  <div key={`bank-info-${index}`}>{line}</div>
                ))}
              </div>
            ) : null}
            <div className="terms-closing">
              Demikian surat penawaran ini kami sampaikan. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.
            </div>
          </div>
        ) : null}
        <div className="sign">
          <div className="sign-box">
            <div>Hormat kami,</div>
            <div className={`sign-space ${includeSignAndStamp ? "" : "no-visual"}`}>
              {includeSignAndStamp ? <img src="/starcomp-logo.png" alt="Cap Starcomp" className="stamp" /> : null}
              {includeSignAndStamp ? <img src="/signature-starcomp.png" alt="Tanda tangan" className="signature" /> : null}
            </div>
            <div><strong>STARCOMP SOLO</strong></div>
          </div>
        </div>

        {!isPenawaran && includeSuratJalan ? (
          <div className="page-break">
            <div className="header">
              <div className="company">
                <h1>STARCOMP SOLO</h1>
                <p>Computer Store</p>
                <p>Dokumen Pengiriman Barang</p>
                <p className="address">Jl. Garuda Mas, Gonilan, Kec. Kartasura, Kabupaten Sukoharjo, Jawa Tengah 57169</p>
                <p>No. Telp/WA: 08112642352</p>
              </div>
              <div className="logo-wrap">
                <img src="/starcomp-logo.png" alt="Logo Starcomp" className="logo" />
              </div>
            </div>

            <h2 className="title">SURAT JALAN</h2>

            <div className="meta">
              <div className="box">
                <p><strong>No Surat Jalan:</strong> {suratJalanNo}</p>
                <p><strong>Referensi Faktur:</strong> {data.document_no}</p>
                <p><strong>Tanggal:</strong> {formatDate(data.invoice_date)}</p>
                {courierValue ? <p><strong>Kurir:</strong> {courierValue}</p> : null}
              </div>
              <div className="box">
                <p><strong>Dikirim Kepada:</strong> {buyerValue || "-"}</p>
                {phoneValue ? <p><strong>Telepon:</strong> {phoneValue}</p> : null}
                <p><strong>Alamat:</strong> {addressValue || "-"}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>No</th>
                    <th>Nama Barang</th>
                    <th className="right" style={{ width: 70 }}>Qty</th>
                    <th style={{ width: 160 }}>Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length ? (
                    items.map((item, index) => (
                      <tr key={`surat-jalan-${item.nama}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{item.nama}</td>
                        <td className="right">{item.qty}</td>
                        <td>&nbsp;</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="text-center text-slate-500">
                        Tidak ada item.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="notes">
              <strong>Catatan Pengiriman:</strong> {data.notes || "-"}
            </div>

            <div className="delivery-sign">
              <div className="delivery-sign-box">
                <div>Pengirim,</div>
                <div className={`delivery-sign-space ${includeSignAndStamp ? "" : "no-visual"}`}>
                  {includeSignAndStamp ? <img src="/starcomp-logo.png" alt="Cap Starcomp" className="delivery-stamp" /> : null}
                  {includeSignAndStamp ? <img src="/signature-starcomp.png" alt="Tanda tangan" className="delivery-signature" /> : null}
                </div>
                <div><strong>STARCOMP SOLO</strong></div>
              </div>
              <div className="delivery-sign-box">
                <div>Penerima,</div>
                <div className="delivery-sign-space" />
                <div><strong>(________________)</strong></div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
