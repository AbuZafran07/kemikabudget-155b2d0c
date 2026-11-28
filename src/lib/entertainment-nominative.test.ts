/// <reference types="bun" />
import { expect, test } from "bun:test";
import {
  emptyNominativeEntry,
  formatLongDateId,
  formatNominativeDate,
  missingEntryFields,
  settlementNominativeRequirement,
  sumEntries,
} from "./entertainment-nominative";
import { buildNominativeReportXlsx } from "./exportEntertainmentNominativeXlsx";
import { columnLetter, excelDateSerial } from "./xlsxWriter";

const ENT = "ent-id";
const TRV = "trv-id";
const ent = new Set([ENT]);

test("requirement: CA tanpa pos Entertainment tidak wajib", () => {
  expect(settlementNominativeRequirement([TRV], ent, [{ category_id: null, amount: 100 }])).toEqual({
    required: false,
    requiredAmount: 0,
    missingCategory: false,
  });
});

test("requirement: CA satu pos Entertainment = seluruh realisasi", () => {
  const r = settlementNominativeRequirement([ENT, ENT], ent, [
    { category_id: null, amount: 300000 },
    { category_id: ENT, amount: 150000 },
  ]);
  expect(r).toEqual({ required: true, requiredAmount: 450000, missingCategory: false });
});

test("requirement: CA multi pos hanya baris Entertainment, baris tanpa pos ditandai", () => {
  expect(
    settlementNominativeRequirement([ENT, TRV], ent, [
      { category_id: TRV, amount: 400000 },
      { category_id: ENT, amount: 200000 },
    ]),
  ).toEqual({ required: true, requiredAmount: 200000, missingCategory: false });
  expect(
    settlementNominativeRequirement([ENT, TRV], ent, [
      { category_id: TRV, amount: 400000 },
      { category_id: "", amount: 200000 },
    ]).missingCategory,
  ).toBe(true);
});

test("validasi baris & format", () => {
  const e = emptyNominativeEntry("2026-11-27");
  expect(missingEntryFields(e)).toContain("place");
  expect(missingEntryFields(e)).toContain("amount");
  const full = {
    ...e,
    place: "Resto",
    address: "Jl A",
    entertainment_type: "Diskusi",
    amount: 1000,
    recipient_name: "X",
    recipient_position: "Mgr",
    recipient_company: "PT Y",
    recipient_business_type: "Dagang",
  };
  expect(missingEntryFields(full)).toEqual([]);
  expect(sumEntries([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  expect(formatNominativeDate("2026-07-08")).toBe("08/07/2026");
  expect(formatLongDateId("2026-11-27")).toBe("27 November 2026");
});

test("xlsx: kolom, tanggal Excel, dan file zip valid", () => {
  expect(columnLetter(0)).toBe("A");
  expect(columnLetter(25)).toBe("Z");
  expect(columnLetter(26)).toBe("AA");
  expect(excelDateSerial("2026-07-08")).toBe(46211);
  const bytes = buildNominativeReportXlsx(
    [
      {
        entry_date: "2026-07-08",
        place: "Resto <A> & B",
        address: "Jl X",
        entertainment_type: "=cmd()",
        amount: 524400,
        recipient_name: "Mr S",
        recipient_position: "RM",
        recipient_company: "Clarke USA",
        recipient_business_type: "Products",
        notes: null,
      },
    ],
    { companyName: "PT Kemika Karya Pratama", npwp: "71.608.326.6-416.000", taxYear: 2026, signerCity: "Jakarta", signedDate: "2026-12-31" },
  );
  // tanda tangan zip "PK\x03\x04"
  expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(bytes);
  expect(text).toContain("Resto &lt;A&gt; &amp; B");
  // teks yang diawali "=" disimpan sebagai teks, bukan rumus
  expect(text).toContain('t="inlineStr"><is><t xml:space="preserve">=cmd()</t>');
  expect(text).toContain("<f>SUM(F7:F7)</f><v>524400</v>");
});
