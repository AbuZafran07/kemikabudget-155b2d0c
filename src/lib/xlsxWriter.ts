/**
 * Penulis file .xlsx kecil tanpa dependensi tambahan.
 * Mendukung: satu sheet, teks/angka/tanggal/rumus, gaya sel sederhana
 * (font tebal/ukuran, border tipis, rata kiri/tengah/kanan, wrap, warna isi),
 * sel gabungan (merge), lebar kolom, tinggi baris, dan orientasi landscape.
 */

export type XlsxAlign = "left" | "center" | "right";

export interface XlsxStyle {
  bold?: boolean;
  size?: number;
  border?: boolean;
  align?: XlsxAlign;
  vAlign?: "top" | "center";
  wrap?: boolean;
  fill?: string; // contoh "EBEBEB"
  numFmt?: "number" | "date";
}

export type XlsxValue = string | number | { formula: string; cached?: number } | { date: string } | null | undefined;

export interface XlsxCell {
  value: XlsxValue;
  style?: XlsxStyle;
}

export interface XlsxSheet {
  name: string;
  /** baris -> kolom (0-based). null/undefined = sel kosong tanpa gaya */
  rows: (XlsxCell | null | undefined)[][];
  /** contoh "B5:F5" */
  merges?: string[];
  /** lebar kolom dalam satuan karakter Excel */
  columnWidths?: number[];
  /** tinggi baris (points) per indeks baris */
  rowHeights?: Record<number, number>;
  landscape?: boolean;
  fontName?: string;
}

const xmlEscape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // buang karakter kontrol yang tidak sah di XML
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** YYYY-MM-DD -> nomor seri tanggal Excel */
export function excelDateSerial(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function buildStyles(sheet: XlsxSheet) {
  const fontName = sheet.fontName || "Tahoma";
  const fonts: string[] = [];
  const fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const xfs: string[] = [];
  const fontIndex = new Map<string, number>();
  const fillIndex = new Map<string, number>();
  const xfIndex = new Map<string, number>();

  const getFont = (bold: boolean, size: number) => {
    const key = `${bold}|${size}`;
    if (!fontIndex.has(key)) {
      fontIndex.set(key, fonts.length);
      fonts.push(`<font>${bold ? "<b/>" : ""}<sz val="${size}"/><name val="${xmlEscape(fontName)}"/><family val="2"/></font>`);
    }
    return fontIndex.get(key)!;
  };
  const getFill = (rgb?: string) => {
    if (!rgb) return 0;
    if (!fillIndex.has(rgb)) {
      fillIndex.set(rgb, fills.length);
      fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`);
    }
    return fillIndex.get(rgb)!;
  };
  getFont(false, 10); // font default index 0
  xfs.push('<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>');

  const styleId = (style?: XlsxStyle): number => {
    if (!style) return 0;
    const key = JSON.stringify(style);
    if (xfIndex.has(key)) return xfIndex.get(key)!;
    const fontId = getFont(!!style.bold, style.size || 10);
    const fillId = getFill(style.fill);
    const borderId = style.border ? 1 : 0;
    const numFmtId = style.numFmt === "number" ? 164 : style.numFmt === "date" ? 165 : 0;
    const align =
      style.align || style.vAlign || style.wrap
        ? `<alignment${style.align ? ` horizontal="${style.align}"` : ""} vertical="${style.vAlign || "center"}"${style.wrap ? ' wrapText="1"' : ""}/>`
        : "";
    const id = xfs.length;
    xfs.push(
      `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0"` +
        `${numFmtId ? ' applyNumberFormat="1"' : ""} applyFont="1"${fillId ? ' applyFill="1"' : ""}${borderId ? ' applyBorder="1"' : ""}` +
        `${align ? ' applyAlignment="1">' + align + "</xf>" : "/>"}`,
    );
    xfIndex.set(key, id);
    return id;
  };

  const render = () =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="${fonts.length}">${fonts.join("")}</fonts>
<fills count="${fills.length}">${fills.join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  return { styleId, render };
}

function buildSheetXml(sheet: XlsxSheet, styleId: (s?: XlsxStyle) => number): string {
  const cols = (sheet.columnWidths || [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const rowsXml = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (!cell) return "";
          const ref = `${columnLetter(c)}${r + 1}`;
          const s = styleId(cell.style);
          const v = cell.value;
          if (v === null || v === undefined || v === "") return `<c r="${ref}" s="${s}"/>`;
          if (typeof v === "number") return Number.isFinite(v) ? `<c r="${ref}" s="${s}"><v>${v}</v></c>` : `<c r="${ref}" s="${s}"/>`;
          if (typeof v === "object" && "formula" in v)
            return `<c r="${ref}" s="${s}"><f>${xmlEscape(v.formula)}</f>${typeof v.cached === "number" ? `<v>${v.cached}</v>` : ""}</c>`;
          if (typeof v === "object" && "date" in v) return `<c r="${ref}" s="${s}"><v>${excelDateSerial(v.date)}</v></c>`;
          return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
        })
        .join("");
      const h = sheet.rowHeights?.[r];
      return `<row r="${r + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>${cells}</row>`;
    })
    .join("");
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols ? `<cols>${cols}</cols>` : ""}
<sheetData>${rowsXml}</sheetData>
${merges}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${sheet.landscape ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

// ---- ZIP (metode "stored", tanpa kompresi) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const data = enc.encode(file.content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8
    local.setUint16(8, 0, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

/** Hasil: isi file .xlsx */
export function buildXlsx(sheet: XlsxSheet): Uint8Array {
  const { styleId, render } = buildStyles(sheet);
  const sheetXml = buildSheetXml(sheet, styleId); // harus sebelum render() agar semua gaya terdaftar
  const stylesXml = render();
  const sheetName = xmlEscape(sheet.name.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  return zipStore([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
    { name: "xl/styles.xml", content: stylesXml },
  ]);
}

export function downloadXlsx(sheet: XlsxSheet, fileName: string): void {
  const bytes = buildXlsx(sheet);
  const blob = new Blob([new Uint8Array(bytes).buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
