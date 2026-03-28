require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const connectDB = require("./config/db");
const apiRoutes = require("./routes/api");
const registerSocketHandlers = require("./sockets/gameSocket");

const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

// ─── Express ───
const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());
app.use("/api", apiRoutes);

// ─── HTTP + Socket.io ───
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

// Register all game socket events
registerSocketHandlers(io);

// ─── Start ───
async function start() {
  await connectDB();
  server.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`🌐 Accepting clients from ${CLIENT_URL}`);
    console.log(`📡 Socket.io ready\n`);
  });
}

start();
