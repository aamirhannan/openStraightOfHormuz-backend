const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    roomCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // The seed used to deterministically generate the grid
    seed: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["waiting", "playing", "finished"],
      default: "waiting",
    },
    players: [
      {
        socketId: String,
        name: { type: String, default: "Anonymous" },
        score: { type: Number, default: 0 },
        slot: { type: Number, enum: [1, 2] },
      },
    ],
    // Track which cells have been revealed (index → player slot)
    revealedCells: {
      type: Map,
      of: Number, // cell index → player slot (1 or 2)
      default: {},
    },
    currentTurn: {
      type: Number,
      enum: [1, 2],
      default: 1,
    },
    winner: {
      type: Number, // 1, 2, or 0 for tie
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", roomSchema);
