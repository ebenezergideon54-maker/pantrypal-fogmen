#!/usr/bin/env node
/**
 * Creates the PantryPal schema against whatever database the DB_* env vars
 * point to. Works with any MySQL-compatible host (Aiven, TiDB Cloud, local
 * MySQL, etc.) — no GUI tool or web console needed.
 *
 * Usage:
 *   1. npm install
 *   2. Create a .env file next to package.json (copy .env.example) with your
 *      DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_SSL values.
 *   3. node scripts/init-db.js
 */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Create a .env file next to package.json (see .env.example) or export them in your shell.");
  process.exit(1);
}

const statements = [
  [
    "users",
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
  ],
  [
    "saved_recipes",
    `CREATE TABLE IF NOT EXISTS saved_recipes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      recipe_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      image VARCHAR(500),
      ready_in_minutes INT,
      servings INT,
      ingredient_count INT,
      saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_recipe (user_id, recipe_id),
      KEY idx_saved_user (user_id)
    )`,
  ],
  [
    "search_history",
    `CREATE TABLE IF NOT EXISTS search_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      ingredients VARCHAR(500) NOT NULL,
      searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_hist_user (user_id)
    )`,
  ],
  [
    "donations",
    `CREATE TABLE IF NOT EXISTS donations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      amount INT NOT NULL,
      donated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_don_user (user_id)
    )`,
  ],
];

async function main() {
  let ssl;
  if (process.env.DB_SSL === "false") ssl = undefined;
  else if (process.env.DB_CA_CERT) ssl = { ca: process.env.DB_CA_CERT, rejectUnauthorized: true };
  else ssl = { rejectUnauthorized: false };

  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;
  console.log(`Connecting to ${process.env.DB_HOST}:${port}/${process.env.DB_NAME} ...`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
  });

  for (const [name, sql] of statements) {
    process.stdout.write(`Creating table "${name}"... `);
    await conn.query(sql);
    console.log("done");
  }

  const [rows] = await conn.query("SHOW TABLES");
  console.log("\nTables now in database:", rows.map((r) => Object.values(r)[0]).join(", "));

  await conn.end();
  console.log("\nSchema setup complete — you can now sign up on the deployed site.");
}

main().catch((err) => {
  console.error("\nFailed:", err.message);
  process.exit(1);
});
