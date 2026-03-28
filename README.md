# Strait of Hormuz - Backend

This backend application powers the async and real-time multiplayer orchestration for the puzzle-strategy game "Strait of Hormuz"

## 🎯 Architecture
While most multiplayer web games rely on long-lived connections where state gets wiped if your WebSocket drops, this app was engineered to be **Persistent and Stateless:**
* **REST First:** Every game action (room creation, board rendering, mine layouts, flipping tiles) modifies MongoDB through traditional HTTP requests. The game never forgets where a player left off!
* **Socket Second:** The `socket.io` server exists purely to broadcast lightweight flash UI events (`flipper_joined`, `sync_room`, `mine_exploded`) to tell observing browsers that a change happened, prompting them to quietly fetch the freshest data from the DB. 

### Game Rules (Server Enforced)
* **8-Way Mine Spacing:** The backend actively blocks Mine Layers from putting overlapping or touching explosives together, ensuring bridges through the strait are mathematically possible for the Flipper.
* **Topological BFS Engine:** An 8-way Breadth-First Search (BFS) continuously traces contiguous footprints the Flipper traces into the map from the absolute West Wall (Persian Gulf) checking if it gracefully reaches either the absolute East Wall or South ocean.
* **Solo AI Configuration:** If a Flipper asks for a Bot, the server calculates an automatic 10% water density layout that automatically respects the 8-way isolation spacing.

## 🛠 Backend Stack
* **Environment:** Node.js + Express
* **Database:** MongoDB (using Mongoose for schemas and persistent multiroom scaling)
* **Events:** `socket.io` for bi-directional live stats 

## ⚙️ Local Setup Instructions

1. **Install Modules:**
   Ensure you are in the `backend` directory.
   ```bash
   npm install
   ```

2. **MongoDB Database:**
   Ensure you have a live or local MongoDB connection URI available. Create a `.env` file in the `backend` root.
   ```env
   PORT=4000
   MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/hormuzGame?retryWrites=true&w=majority
   FRONTEND_URL=http://localhost:3000
   ```

3. **Start the API:**
   For hot-reloading (development):
   ```bash
   npm run dev
   ```
   Or for production:
   ```bash
   node index.js
   ```

4. **Verify Boot:**
   The logs will flash `MongoDB connected` and `Socket.io ready`. At that point, spin up your Next.js frontend!
