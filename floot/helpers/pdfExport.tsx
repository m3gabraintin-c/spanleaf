/**
 * A PDF made from JPEG pictures, one picture a page, with nothing else in it. LinkedIn and others take a carousel as
 * a PDF. Written by hand because a PDF of pictures is small and simple; the JPEG bytes go in unchanged.
 */

export type PdfPage = { jpeg: Uint8Array; width: number; height: number };

const ascii = (s: string) => new TextEncoder().encode(s);

export const makePdf = (pages: PdfPage[]): Uint8Array => {
  if (pages.length === 0) throw new Error("A PDF needs at least one page.");
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (p: Uint8Array) => {
    parts.push(p);
    length += p.length;
  };
  const object = (n: number, body: Uint8Array[]) => {
    offsets[n] = length;
    push(ascii(`${n} 0 obj\n`));
    body.forEach(push);
    push(ascii("\nendobj\n"));
  };

  push(ascii("%PDF-1.4\n"));
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  object(1, [ascii("<< /Type /Catalog /Pages 2 0 R >>")]);
  object(2, [ascii(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)]);
  pages.forEach((p, i) => {
    const page = 3 + i * 3;
    const w = Math.round(p.width);
    const h = Math.round(p.height);
    const content = ascii(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`);
    object(page, [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${page + 2} 0 R >> >> /Contents ${page + 1} 0 R >>`)]);
    object(page + 1, [ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii("\nendstream")]);
    object(page + 2, [
      ascii(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`),
      p.jpeg,
      ascii("\nendstream"),
    ]);
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(ascii(`${table}trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};