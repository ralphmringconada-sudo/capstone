/**
 * EcoBantay Backend Entry Module
 *
 * Purpose:
 * Builds and starts the HTTP API that connects EcoBantay clients to administrator,
 * report-image, and user-account backend services.
 *
 * How it works:
 * 1. Loads environment-based server configuration.
 * 2. Creates the Express application and selects its listening port.
 * 3. Enables cross-origin requests and JSON request-body parsing.
 * 4. Registers health, administrator, report, and user routes.
 * 5. Starts the Node.js HTTP server.
 *
 * Technologies Used:
 * Node.js, Express, cors, and dotenv.
 *
 * Why this implementation:
 * A small composition entry point keeps infrastructure setup separate from feature
 * routers and provides one predictable startup path for local and deployed environments.
 */
import dotenv from 'dotenv';
import cors from 'cors';
import express from 'express';
import adminRoutes from './routes/admins.js';
import userRoutes from './routes/users.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Allows configured web/mobile clients to call the API from a different origin.
app.use(cors());
// Parses JSON payloads before registered route handlers access request bodies.
app.use(express.json());

/**
 * GET /health
 *
 * Purpose:
 * Confirms that the EcoBantay Express process is running and able to answer HTTP requests.
 *
 * How it works:
 * 1. Accepts an unauthenticated health-check request.
 * 2. Returns a small JSON success indicator without querying external services.
 *
 * Technologies Used:
 * Express.
 *
 * Why this implementation:
 * A dependency-free response is fast and suitable for deployment probes that need to
 * distinguish process availability from separate Firebase or Supabase service health.
 */
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Mounts each feature router under a stable API namespace.
app.use('/api/admins', adminRoutes);
app.use('/api/users', userRoutes);

/**
 * Server startup callback
 *
 * Purpose:
 * Opens the configured network port and records that the EcoBantay API is ready.
 *
 * How it works:
 * 1. Instructs Express to listen on the environment-selected port.
 * 2. Runs the callback after the server starts accepting connections.
 * 3. Prints the local API address for operators and developers.
 *
 * Technologies Used:
 * Express and Node.js HTTP server APIs.
 *
 * Why this implementation:
 * Environment-based ports support local and hosted deployments, and the startup message
 * provides immediate operational confirmation without adding another dependency.
 */
app.listen(port, () => {
  console.log(`EcoBantay backend running on http://localhost:${port}`);
});
