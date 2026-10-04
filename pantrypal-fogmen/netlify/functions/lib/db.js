const mysql = require("mysql2/promise");

/**
 * Opens a short-lived connection for one function invocation.
 * Serverless functions are ephemeral, so we don't keep a pool alive —
 * each call opens, runs its queries, and closes in `finally`.
 */
async function getConnection() {
  if (!process.env.DB_HOST) {
    throw new Error(
      "Database is not configured. Set DB_HOST, DB_USER, DB_PASSWORD and DB_NAME in Netlify environment variables."
    );
  }
  // Most managed MySQL providers (Aiven, TiDB Cloud, etc.) require TLS.
  // If DB_CA_CERT is provided (the provider's certificate, pasted as-is),
  // we verify against it. Otherwise we still encrypt the connection but
  // skip certificate verification — simpler to set up, and a reasonable
  // trade-off for a student/demo project. Set DB_SSL=false only for a
  // local MySQL instance with no TLS at all.
  let ssl;
  if (process.env.DB_SSL === "false") {
    ssl = undefined;
  } else if (process.env.DB_CA_CERT) {
    ssl = { ca: process.env.DB_CA_CERT, rejectUnauthorized: true };
  } else {
    ssl = { rejectUnauthorized: false };
  }

  return mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
  });
}

module.exports = { getConnection };
