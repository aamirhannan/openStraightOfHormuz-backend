const express = require("express");
const Room = require("../models/Room");
const { generateRoomCode } = require("../utils/gameLogic");

const router = express.Router();

const COLS = 20;
const ROWS = 20;
const TOTAL = COLS * ROWS;
const MAX_ANTIDOTES = 5;

// ──────────── HEALTH ────────────
router.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ──────────── CREATE ROOM ────────────
// Creator sends their userId, name, and waterMask
router.post("/rooms", async (req, res) => {
  try {
    const { userId, playerName, waterMask } = req.body;
    if (!userId || !waterMask || waterMask.length !== TOTAL) {
      return res.status(400).json({ error: "Missing userId or invalid waterMask" });
    }

    const roomCode = generateRoomCode();
    const waterCount = waterMask.filter(Boolean).length;
    const maxMines = Math.floor(waterCount * 0.10);

    // Generate random cell values (0-9 for water, 0 for land)
    const cellValues = waterMask.map((isWater) =>
      isWater ? Math.floor(Math.random() * 10) : 0
    );

    const room = await Room.create({
      roomCode,
      status: "placing_mines",
      creator: { userId, name: playerName || "Mine Layer" },
      waterMask,
      cellValues,
      minePositions: [],
      maxMines,
      antidotes: MAX_ANTIDOTES,
    });

    res.json({
      ok: true,
      roomCode,
      maxMines,
      waterCount,
    });
  } catch (err) {
    console.error("create room error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────── PLACE MINES (Creator) ────────────
// Creator submits the array of mine positions and locks the board
router.post("/rooms/:code/mines", async (req, res) => {
  try {
    const { userId, minePositions } = req.body;
    const room = await Room.findOne({ roomCode: req.params.code });

    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.creator.userId !== userId) {
      return res.status(403).json({ error: "Only the creator can place mines" });
    }
    if (room.status !== "placing_mines") {
      return res.status(400).json({ error: "Mines already placed" });
    }

    // Validate: all positions must be water cells
    const invalid = minePositions.filter((idx) => !room.waterMask[idx]);
    if (invalid.length > 0) {
      return res.status(400).json({ error: "Some mines are on land" });
    }
    if (minePositions.length > room.maxMines) {
      return res.status(400).json({ error: `Max ${room.maxMines} mines allowed` });
    }
    if (minePositions.length === 0) {
      return res.status(400).json({ error: "Place at least 1 mine" });
    }

    room.minePositions = minePositions;
    room.status = "ready";
    await room.save();

    res.json({ ok: true, mineCount: minePositions.length });
  } catch (err) {
    console.error("place mines error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────── JOIN ROOM (Flipper) ────────────
router.post("/rooms/:code/join", async (req, res) => {
  try {
    const { userId, playerName } = req.body;
    const room = await Room.findOne({ roomCode: req.params.code });

    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.status === "placing_mines") {
      return res.status(400).json({ error: "Creator is still placing mines" });
    }
    if (room.creator.userId === userId) {
      return res.status(400).json({ error: "You can't join your own room" });
    }

    // Allow re-joining (same flipper resumes)
    if (room.flipper.userId && room.flipper.userId !== userId) {
      // If a different flipper already started...
      if (room.status === "flipping") {
        return res.status(400).json({ error: "Another player is already flipping" });
      }
    }

    // Set flipper if not set, or if game is "ready" allow new flipper
    if (!room.flipper.userId || room.status === "ready") {
      room.flipper = { userId, name: playerName || "Flipper" };
      room.status = "flipping";
      room.revealedCells = [];
      room.antidotes = MAX_ANTIDOTES;
      room.score = 0;
      room.minesHit = 0;
    }

    await room.save();

    // Return game state for flipper (without mine positions!)
    const waterCount = room.waterMask.filter(Boolean).length;
    const safeCells = waterCount - room.minePositions.length;

    res.json({
      ok: true,
      roomCode: room.roomCode,
      status: room.status,
      creatorName: room.creator.name,
      waterMask: room.waterMask,
      revealedCells: room.revealedCells,
      // Send revealed cell values only
      revealedValues: room.revealedCells.map((idx) => ({
        idx,
        value: room.minePositions.includes(idx) ? -1 : room.cellValues[idx],
        isMine: room.minePositions.includes(idx),
      })),
      antidotes: room.antidotes,
      score: room.score,
      minesHit: room.minesHit,
      safeCells,
      totalMines: room.minePositions.length,
    });
  } catch (err) {
    console.error("join room error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────── GET ROOM STATE ────────────
// Used by flipper to resume or by creator to spectate
router.get("/rooms/:code", async (req, res) => {
  try {
    const { userId } = req.query;
    const room = await Room.findOne({ roomCode: req.params.code });
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isCreator = room.creator.userId === userId;
    const isFlipper = room.flipper.userId === userId;
    const waterCount = room.waterMask.filter(Boolean).length;
    const safeCells = waterCount - room.minePositions.length;

    const base = {
      ok: true,
      roomCode: room.roomCode,
      status: room.status,
      creatorName: room.creator.name,
      flipperName: room.flipper.name,
      waterMask: room.waterMask,
      antidotes: room.antidotes,
      score: room.score,
      minesHit: room.minesHit,
      safeCells,
      totalMines: room.minePositions.length,
      maxMines: room.maxMines,
      revealedCells: room.revealedCells,
      revealedValues: room.revealedCells.map((idx) => ({
        idx,
        value: room.minePositions.includes(idx) ? -1 : room.cellValues[idx],
        isMine: room.minePositions.includes(idx),
      })),
      isCreator,
      isFlipper,
    };

    // Creator can see mine positions (their own mines)
    if (isCreator) {
      base.minePositions = room.minePositions;
    }

    res.json(base);
  } catch (err) {
    console.error("get room error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────── FLIP CELL (Flipper) ────────────
router.post("/rooms/:code/flip", async (req, res) => {
  try {
    const { userId, cellIndex } = req.body;
    const room = await Room.findOne({ roomCode: req.params.code });

    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.status !== "flipping") {
      return res.status(400).json({ error: "Game is not in flipping phase" });
    }
    if (room.flipper.userId !== userId) {
      return res.status(403).json({ error: "You are not the flipper" });
    }
    if (room.revealedCells.includes(cellIndex)) {
      return res.status(400).json({ error: "Already flipped" });
    }
    if (!room.waterMask[cellIndex]) {
      return res.status(400).json({ error: "Can't flip land" });
    }

    const isMine = room.minePositions.includes(cellIndex);
    const cellValue = isMine ? -1 : room.cellValues[cellIndex];

    room.revealedCells.push(cellIndex);

    let outcome = null;

    if (isMine) {
      room.minesHit += 1;
      room.antidotes -= 1;

      if (room.antidotes <= 0) {
        room.status = "lost";
        outcome = "lost";
      }
    } else {
      room.score += cellValue;

      // Check win: contiguous safe path from west edge to east edge
      const safeRevealedSet = new Set(room.revealedCells.filter(idx => !room.minePositions.includes(idx)));
      
      let minWaterCol = COLS;
      let maxWaterCol = -1;
      for (let i = 0; i < TOTAL; i++) {
        if (room.waterMask[i]) {
          const c = i % COLS;
          if (c < minWaterCol) minWaterCol = c;
          if (c > maxWaterCol) maxWaterCol = c;
        }
      }

      const visited = new Set();
      const queue = [];

      // Start BFS only from cells strictly on the western-most playable wall
      for (const idx of safeRevealedSet) {
        if (idx % COLS === minWaterCol) {
          queue.push(idx);
          visited.add(idx);
        }
      }

      let won = false;
      while (queue.length > 0) {
        const curr = queue.shift();
        const c = curr % COLS;
        const r = Math.floor(curr / COLS);

        // Path must reach the absolute eastern-most playable wall
        if (c === maxWaterCol) {
          won = true;
          break;
        }

        // Check 8-way neighbors (horizontal, vertical, diagonal contiguous cells)
        for (const dr of [-1, 0, 1]) {
          for (const dc of [-1, 0, 1]) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              const nIdx = nr * COLS + nc;
              if (safeRevealedSet.has(nIdx) && !visited.has(nIdx)) {
                visited.add(nIdx);
                queue.push(nIdx);
              }
            }
          }
        }
      }

      if (won) {
        room.status = "won";
        outcome = "won";
      }
    }

    await room.save();

    res.json({
      ok: true,
      cellIndex,
      value: cellValue,
      isMine,
      antidotes: room.antidotes,
      score: room.score,
      minesHit: room.minesHit,
      outcome,
      safeRevealed: room.revealedCells.filter(
        (idx) => !room.minePositions.includes(idx)
      ).length,
    });
  } catch (err) {
    console.error("flip cell error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
