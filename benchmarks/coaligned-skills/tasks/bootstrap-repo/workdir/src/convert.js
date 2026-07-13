#!/usr/bin/env node
// unitconv: convert a value between two units of the same dimension.
// Uses only Node.js built-ins so it runs with no install step.

const TO_BASE = {
  km: 1000,
  m: 1,
  mi: 1609.344, // length -> metres
  g: 1,
  oz: 28.349523125, // mass -> grams
};

const DIMENSION = {
  km: "length",
  m: "length",
  mi: "length",
  g: "mass",
  oz: "mass",
};

export function convert(value, from, to) {
  if (!(from in TO_BASE) || !(to in TO_BASE)) {
    throw new Error(`unknown unit: ${from in TO_BASE ? to : from}`);
  }
  if (DIMENSION[from] !== DIMENSION[to]) {
    throw new Error(`cannot convert ${from} to ${to}: different dimensions`);
  }
  return (value * TO_BASE[from]) / TO_BASE[to];
}

function main(argv) {
  const [value, from, to] = argv;
  const result = convert(Number(value), from, to);
  process.stdout.write(`${Number(result.toFixed(4))}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
