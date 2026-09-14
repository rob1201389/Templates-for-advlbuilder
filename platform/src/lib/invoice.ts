import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "./prisma";
import { tenantDb } from "./tenant-db";

/**
 * Compliance-ready tax invoice PDFs (Prompt 4).
 *
 * ATO tax invoice requirements covered: the words "Tax Invoice", seller
 * identity and ABN, invoice number and date, buyer identity, description of
 * the supply, and the GST amount (deposits are treated as GST-inclusive;
 * GST component = total ÷ 11). Amounts come from integer AUD cents.
 */

interface InvoiceInput {
  tenantId: string;
  depositId: string;
  invoiceNumber: string;
}

const aud = (cents: number) =>
  (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });

export async function generateTaxInvoicePdf(input: InvoiceInput): Promise<Uint8Array> {
  const tenant = await prisma.tenant.findFirst({
    where: { id: input.tenantId },
    select: { name: true, abn: true },
  });
  const db = tenantDb(input.tenantId);
  const deposit = await db.deposit.findFirst({
    where: { id: input.depositId },
    include: { customer: true, vehicle: true },
  });
  if (!tenant || !deposit) throw new Error("Invoice source records not found");

  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait, points
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.13, 0.15, 0.18);
  const blue = rgb(0.18, 0.44, 0.84);

  let y = 780;
  const draw = (text: string, opts: { x?: number; size?: number; font?: typeof font; color?: typeof ink } = {}) => {
    page.drawText(text, {
      x: opts.x ?? 56,
      y,
      size: opts.size ?? 11,
      font: opts.font ?? font,
      color: opts.color ?? ink,
    });
  };

  draw("TAX INVOICE", { size: 22, font: bold, color: blue });
  y -= 30;
  draw(tenant.name, { size: 14, font: bold });
  y -= 16;
  if (tenant.abn) { draw(`ABN: ${tenant.abn}`); y -= 14; }
  draw(`Invoice #: ${input.invoiceNumber}`);
  y -= 14;
  draw(`Date: ${new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "long", year: "numeric" })}`);
  y -= 30;

  draw("Billed to:", { font: bold });
  y -= 14;
  draw(`${deposit.customer.firstName} ${deposit.customer.lastName}`);
  y -= 14;
  if (deposit.customer.email) { draw(deposit.customer.email); y -= 14; }
  y -= 16;

  draw("Description", { font: bold });
  draw("Amount", { font: bold, x: 460 });
  y -= 6;
  page.drawLine({ start: { x: 56, y }, end: { x: 539, y }, thickness: 1, color: blue });
  y -= 18;

  const v = deposit.vehicle;
  draw(
    `Holding deposit — ${v.year} ${v.make} ${v.model} (stock #${v.stockNumber}${v.vin ? `, VIN ${v.vin}` : ""})`
  );
  draw(aud(deposit.amountAudCents), { x: 460 });
  y -= 24;

  const gstCents = Math.round(deposit.amountAudCents / 11);
  draw(`GST included (1/11th):`, { x: 330 });
  draw(aud(gstCents), { x: 460 });
  y -= 16;
  draw(`Total (GST inclusive):`, { x: 330, font: bold });
  draw(aud(deposit.amountAudCents), { x: 460, font: bold });
  y -= 40;

  draw(
    "This deposit holds the vehicle described above and is applied to the purchase price on settlement.",
    { size: 9 }
  );
  y -= 12;
  draw("Refunds are governed by the dealership's reservation terms.", { size: 9 });

  return doc.save();
}

const s3 = new S3Client({}); // region + credentials from environment

export async function storeInvoicePdf(
  tenantId: string,
  invoiceNumber: string,
  pdf: Uint8Array
): Promise<string> {
  const bucket = process.env.INVOICE_BUCKET;
  if (!bucket) throw new Error("INVOICE_BUCKET is not set");
  // Keyed under the tenant so bucket policies can partition per dealership.
  const key = `invoices/${tenantId}/${invoiceNumber}.pdf`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: pdf,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256", // at-rest encryption (APP 11)
    })
  );
  return key;
}
