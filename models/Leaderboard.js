const mongoose = require("mongoose");

const leaderboardSchema = new mongoose.Schema(
  {
    playerName: {
      type: String,
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
    result: {
      type: String,
      enum: ["win", "loss", "tie"],
      required: true,
    },
    roomCode: {
      type: String,
      required: true,
    },
    opponentName: {
      type: String,
      default: "Unknown",
    },
  },
  { timestamps: true }
);

// Index for fast "top scores" query
leaderboardSchema.index({ score: -1 });

module.exports = mongoose.model("Leaderboard", leaderboardSchema);
