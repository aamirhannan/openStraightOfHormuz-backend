const { generateRoomCode } = require("../utils/gameLogic");

const COLS = 20;
const ROWS = 20;
const TOTAL = COLS * ROWS;
const MAX_ANTIDOTES = 5;

/**
 * Register all Socket.io event handlers.
 * Sockets are used for: live stats, real-time notifications.
 * Game state is persisted in MongoDB — players can resume.
 */
module.exports = function registerSocketHandlers(io) {
  // ── Live stats ──
  let activeFlippers = 0; // players currently flipping

  function broadcastStats() {
    const onlinePlayers = io.engine.clientsCount;
    io.emit("live_stats", { onlinePlayers, activeFlippers });
  }

  io.on("connection", (socket) => {
    console.log(`🔌 connected: ${socket.id}`);
    broadcastStats();

    // Join a socket room for real-time game updates
    socket.on("watch_room", ({ roomCode }) => {
      socket.join(roomCode);
    });

    // Creator finished placing mines → notify anyone watching
    socket.on("mines_placed", ({ roomCode }) => {
      io.to(roomCode).emit("mines_confirmed", { roomCode });
      broadcastStats();
    });

    // Flipper flipped a cell → broadcast to watchers (creator can spectate)
    socket.on("cell_flipped", ({ roomCode, cellIndex, result }) => {
      io.to(roomCode).emit("flip_update", { cellIndex, ...result });
    });

    // Game ended
    socket.on("game_ended", ({ roomCode, outcome }) => {
      io.to(roomCode).emit("game_result", { outcome });
      activeFlippers = Math.max(0, activeFlippers - 1);
      broadcastStats();
    });

    socket.on("start_flipping", () => {
      activeFlippers++;
      broadcastStats();
    });

    socket.on("disconnect", () => {
      console.log(`🔌 disconnected: ${socket.id}`);
      broadcastStats();
    });
  });
};
