/**
 * Seeded pseudo-random number generator (mulberry32).
 * Given the same seed, it produces the exact same sequence —
 * so both players see the identical board.
 */
function seededRandom(seed) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

class SeededRNG {
  constructor(seed) {
    this.seed = seed;
    this.state = seed;
  }

  next() {
    const val = seededRandom(this.state);
    this.state++;
    return val;
  }

  nextInt(max) {
    return Math.floor(this.next() * max);
  }
}

const COLS = 20;
const ROWS = 20;
const TOTAL = COLS * ROWS;
const DANGER_RATIO = 0.12;

/**
 * Build the authoritative grid from a seed.
 * Returns an array of cells: { kind: "land"|"water"|"danger", value: 0-9 }
 *
 * @param {number} seed - deterministic seed
 * @param {boolean[]} waterMask - flat array of length 400, true = water
 */
function buildGrid(seed, waterMask) {
  const rng = new SeededRNG(seed);

  const cells = waterMask.map((isWater) => ({
    kind: isWater ? "water" : "land",
    value: isWater ? rng.nextInt(10) : 0,
  }));

  // Collect water indices and shuffle deterministically
  const waterIndices = [];
  for (let i = 0; i < TOTAL; i++) {
    if (cells[i].kind === "water") waterIndices.push(i);
  }

  // Fisher-Yates shuffle with seeded RNG
  for (let i = waterIndices.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    [waterIndices[i], waterIndices[j]] = [waterIndices[j], waterIndices[i]];
  }

  const dangerCount = Math.floor(waterIndices.length * DANGER_RATIO);
  for (let d = 0; d < dangerCount; d++) {
    cells[waterIndices[d]].kind = "danger";
    cells[waterIndices[d]].value = -1;
  }

  return cells;
}

/**
 * Generate a short room code like "HZ-A3X9"
 */
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `HZ-${code}`;
}

module.exports = { buildGrid, generateRoomCode, SeededRNG, COLS, ROWS, TOTAL };
