const test = require("node:test");
const assert = require("node:assert/strict");

const { extractZone } = require("../lib/services/zoneExtractor");

test("extracts the zone from a real address (the zona 10 case that was mislabeled)", () => {
  const address =
    "6 Avenida 3-22 Zona 10, 5to Nivel, Oficina 510. Clínicas del Centro Médico II Guatemala, Cdad. de Guatemala 01010, Guatemala";
  assert.equal(extractZone(address), "zona 10");
});

test("extracts the zone regardless of case", () => {
  const address = "Calzada Roosvelt 35-98 zona 7 Hospital de dia Itzamna, Cdad. de Guatemala 01011, Guatemala";
  assert.equal(extractZone(address), "zona 7");
});

test("returns null for an address with no zone (the Escuintla case)", () => {
  const address = "3 Av A 3-33, Escuintla 05001, Guatemala";
  assert.equal(extractZone(address), null);
});

test("returns null for an out-of-range zone number", () => {
  assert.equal(extractZone("Some place, zona 99, Guatemala"), null);
});
