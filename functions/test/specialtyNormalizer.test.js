const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeSpecialty } = require("../lib/services/specialtyNormalizer");

test("matches a specialty synonym in the business name, accent-insensitive", () => {
  const result = normalizeSpecialty("Dr. Juan Perez - Cardiologia y Medicina Interna");
  assert.equal(result.especialidad_normalizada, "cardiología");
  assert.ok(result.confidence > 0);
});

test("matches even when the name uses accents", () => {
  const result = normalizeSpecialty("Clínica Pediátrica del Valle");
  assert.equal(result.especialidad_normalizada, "pediatría");
});

test("returns null and zero confidence when nothing matches", () => {
  const result = normalizeSpecialty("Centro Médico Especializado");
  assert.equal(result.especialidad_normalizada, null);
  assert.equal(result.confidence, 0);
});

test("does not confuse ortopedia with traumatología", () => {
  const result = normalizeSpecialty("Dr. Ortopedista de la Zona 10");
  assert.equal(result.especialidad_normalizada, "ortopedia");
});
