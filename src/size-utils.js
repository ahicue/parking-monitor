const FULLWIDTH_DIGIT_PATTERN = /[０-９]/g;
const FULLWIDTH_SYMBOLS = {
  "，": ",",
  "．": ".",
  "ー": "-",
};

function normalizeNumericText(input) {
  return String(input || "")
    .replace(FULLWIDTH_DIGIT_PATTERN, (digit) =>
      String.fromCharCode(digit.charCodeAt(0) - 0xfee0)
    )
    .replace(/[，．ー]/g, (symbol) => FULLWIDTH_SYMBOLS[symbol] || symbol)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDimensionMm(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  const text = normalizeNumericText(value);
  if (!text || /^(不明|なし|nan|null|undefined|-+)$/i.test(text)) {
    return null;
  }

  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?/i);
  if (!match) {
    return null;
  }

  const numeric = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  const unit = String(match[2] || "").toLowerCase();
  if (unit === "m") {
    return Math.round(numeric * 1000);
  }

  if (unit === "cm") {
    return Math.round(numeric * 10);
  }

  if (!unit && numeric > 0 && numeric < 20) {
    return Math.round(numeric * 1000);
  }

  return Math.round(numeric);
}

function findLabeledDimensionMm(text, labels) {
  const normalized = normalizeNumericText(text);
  if (!normalized) {
    return null;
  }

  for (const label of labels) {
    const pattern = new RegExp(
      `${label}[^0-9]{0,12}(\\d+(?:[.,]\\d+)?)\\s*(mm|cm|m)?`,
      "i"
    );
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }

    return normalizeDimensionMm(`${match[1]}${match[2] || ""}`);
  }

  return null;
}

function extractLabeledDimensionsMm(text) {
  return {
    lengthMm: findLabeledDimensionMm(text, ["全長", "長さ", "length"]),
    widthMm: findLabeledDimensionMm(text, ["全幅", "車幅", "幅", "width"]),
    heightMm: findLabeledDimensionMm(text, ["全高", "車高", "高さ", "height"]),
  };
}

function hasAnyKnownDimension(sizeOption) {
  return Boolean(
    sizeOption &&
      ["lengthMm", "widthMm", "heightMm"].some((key) =>
        Number.isFinite(sizeOption[key])
      )
  );
}

module.exports = {
  extractLabeledDimensionsMm,
  hasAnyKnownDimension,
  normalizeDimensionMm,
  normalizeNumericText,
};
