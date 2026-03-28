const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["placing_mines", "ready", "flipping", "won", "lost"],
      default: "placing_mines",
    },

    // ── Players (identified by localStorage UUID) ──
    creator: {
      userId: { type: String, required: true },
      name: { type: String, default: "Mine Layer" },
    },
    flipper: {
      userId: { type: String, default: null },
      name: { type: String, default: null },
    },

    // ── Map data ──
    waterMask: [Boolean],       // 400-length, true = water cell
    cellValues: [Number],       // 400-length, random 0–9 for water, 0 for land
    minePositions: [Number],    // indices where creator placed mines
    maxMines: { type: Number, default: 0 },

    // ── Flipper state ──
    revealedCells: [Number],    // indices flipped by the flipper
    antidotes: { type: Number, default: 5 },
    score: { type: Number, default: 0 },
    minesHit: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
