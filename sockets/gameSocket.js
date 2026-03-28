const Room = require("../models/Room");
const { buildGrid, generateRoomCode, TOTAL } = require("../utils/gameLogic");

/**
 * Register all Socket.io event handlers.
 * Each "socket" is one connected browser tab.
 */
module.exports = function registerSocketHandlers(io) {
  // In-memory cache of grids (roomCode → cells[])
  const gridCache = {};

  // ── Live stats helper ──
  function broadcastStats() {
    const onlinePlayers = io.engine.clientsCount;
    // Count rooms that are currently "playing"
    const activeGames = Object.keys(gridCache).length;
    io.emit("live_stats", { onlinePlayers, activeGames });
  }

  io.on("connection", (socket) => {
    console.log(`🔌 connected: ${socket.id}`);
    broadcastStats();

    // ─────────────── CREATE ROOM ───────────────
    socket.on("create_room", async ({ playerName, waterMask }, callback) => {
      try {
        const roomCode = generateRoomCode();
        const seed = Date.now();

        const grid = buildGrid(seed, waterMask);
        gridCache[roomCode] = grid;

        const room = await Room.create({
          roomCode,
          seed,
          status: "waiting",
          players: [
            { socketId: socket.id, name: playerName || "Player 1", score: 0, slot: 1 },
          ],
          currentTurn: 1,
        });

        socket.join(roomCode);
        callback({ ok: true, roomCode, slot: 1 });
        console.log(`🏠 room created: ${roomCode} by ${playerName}`);
      } catch (err) {
        console.error("create_room error:", err);
        callback({ ok: false, error: err.message });
      }
    });

    // ─────────────── JOIN ROOM ───────────────
    socket.on("join_room", async ({ roomCode, playerName, waterMask }, callback) => {
      try {
        const room = await Room.findOne({ roomCode });
        if (!room) return callback({ ok: false, error: "Room not found" });
        if (room.status !== "waiting") return callback({ ok: false, error: "Game already in progress" });
        if (room.players.length >= 2) return callback({ ok: false, error: "Room is full" });

        room.players.push({
          socketId: socket.id,
          name: playerName || "Player 2",
          score: 0,
          slot: 2,
        });
        room.status = "playing";
        await room.save();

        // Build grid from the room's seed (same board for both players)
        if (!gridCache[roomCode]) {
          gridCache[roomCode] = buildGrid(room.seed, waterMask);
        }

        socket.join(roomCode);
        callback({ ok: true, roomCode, slot: 2 });

        // Notify both players the game is starting
        io.to(roomCode).emit("game_start", {
          players: room.players.map((p) => ({ name: p.name, slot: p.slot, score: 0 })),
          currentTurn: 1,
        });

        console.log(`🎮 game started in ${roomCode}: ${room.players.map((p) => p.name).join(" vs ")}`);
      } catch (err) {
        console.error("join_room error:", err);
        callback({ ok: false, error: err.message });
      }
    });

    // ─────────────── CELL CLICK ───────────────
    socket.on("cell_click", async ({ roomCode, cellIndex }, callback) => {
      try {
        const room = await Room.findOne({ roomCode });
        if (!room || room.status !== "playing") return callback({ ok: false, error: "Invalid room" });

        // Which player clicked?
        const player = room.players.find((p) => p.socketId === socket.id);
        if (!player) return callback({ ok: false, error: "Not in this room" });
        if (player.slot !== room.currentTurn) return callback({ ok: false, error: "Not your turn" });

        // Already revealed?
        if (room.revealedCells.has(String(cellIndex))) {
          return callback({ ok: false, error: "Cell already revealed" });
        }

        const grid = gridCache[roomCode];
        if (!grid) return callback({ ok: false, error: "Grid not loaded" });

        const cell = grid[cellIndex];
        if (!cell || cell.kind === "land") return callback({ ok: false, error: "Can't click land" });

        // Mark as revealed
        room.revealedCells.set(String(cellIndex), player.slot);

        if (cell.kind === "danger") {
          // ⚠️ DANGER — reset the board
          const newSeed = Date.now();
          room.seed = newSeed;
          room.revealedCells = new Map();
          room.players.forEach((p) => (p.score = 0));
          room.currentTurn = 1;

          // Rebuild grid from new seed
          // We need the waterMask — since it depends on the image,
          // we'll reuse the same water positions from the existing grid.
          const waterMask = grid.map((c) => c.kind === "land" ? false : true);
          const newGrid = buildGrid(newSeed, waterMask);
          gridCache[roomCode] = newGrid;

          await room.save();

          io.to(roomCode).emit("danger_hit", {
            cellIndex,
            hitBy: player.slot,
            playerName: player.name,
          });

          // After a short pause the client will request the reset state
          setTimeout(() => {
            io.to(roomCode).emit("game_reset", {
              players: room.players.map((p) => ({ name: p.name, slot: p.slot, score: 0 })),
              currentTurn: 1,
              newSeed,
            });
          }, 1800);

          return callback({ ok: true, danger: true });
        }

        // Normal cell: award points
        player.score += cell.value;
        room.currentTurn = room.currentTurn === 1 ? 2 : 1;

        // Check if all safe cells are revealed
        const safeCount = grid.filter((c) => c.kind === "water").length;
        const revealedCount = Array.from(room.revealedCells.values()).length;
        // Don't count danger reveals toward completion
        const revealedSafe = [...room.revealedCells.entries()].filter(
          ([idx]) => grid[Number(idx)]?.kind === "water"
        ).length;

        let gameOver = false;
        if (revealedSafe >= safeCount) {
          room.status = "finished";
          const p1 = room.players.find((p) => p.slot === 1);
          const p2 = room.players.find((p) => p.slot === 2);
          room.winner = p1.score > p2.score ? 1 : p2.score > p1.score ? 2 : 0;
          gameOver = true;
        }

        await room.save();

        // Broadcast the reveal to both players
        io.to(roomCode).emit("cell_revealed", {
          cellIndex,
          value: cell.value,
          claimedBy: player.slot,
          scores: {
            1: room.players.find((p) => p.slot === 1)?.score || 0,
            2: room.players.find((p) => p.slot === 2)?.score || 0,
          },
          currentTurn: room.currentTurn,
        });

        if (gameOver) {
          const p1 = room.players.find((p) => p.slot === 1);
          const p2 = room.players.find((p) => p.slot === 2);

          io.to(roomCode).emit("game_over", {
            winner: room.winner,
            scores: { 1: p1.score, 2: p2.score },
            players: room.players.map((p) => ({ name: p.name, slot: p.slot, score: p.score })),
          });

          // Clean up cache
          delete gridCache[roomCode];
          broadcastStats();
        }

        callback({ ok: true, danger: false });
      } catch (err) {
        console.error("cell_click error:", err);
        callback({ ok: false, error: err.message });
      }
    });

    // ─────────────── DISCONNECT ───────────────
    socket.on("disconnect", async () => {
      console.log(`🔌 disconnected: ${socket.id}`);

      // Find any room this socket was in and notify the other player
      const room = await Room.findOne({ "players.socketId": socket.id });
      if (room && room.status === "playing") {
        room.status = "finished";
        const disconnected = room.players.find((p) => p.socketId === socket.id);
        const remaining = room.players.find((p) => p.socketId !== socket.id);
        if (remaining) {
          room.winner = remaining.slot;
        }
        await room.save();
        delete gridCache[room.roomCode];

        io.to(room.roomCode).emit("player_disconnected", {
          playerName: disconnected?.name || "Opponent",
          winner: remaining?.slot || null,
          scores: {
            1: room.players.find((p) => p.slot === 1)?.score || 0,
            2: room.players.find((p) => p.slot === 2)?.score || 0,
          },
          players: room.players.map((p) => ({ name: p.name, slot: p.slot, score: p.score })),
        });
      }

      broadcastStats();
    });
  });
};
