const { getConnection } = require("./lib/db");
const { hashPassword, signToken } = require("./lib/auth");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ message: "Invalid request body." }) };
  }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!name || !email || password.length < 6) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Name, a valid email, and a password of at least 6 characters are required." }),
    };
  }

  let conn;
  try {
    conn = await getConnection();

    const [existing] = await conn.execute("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) {
      return { statusCode: 409, body: JSON.stringify({ message: "An account with that email already exists." }) };
    }

    const passwordHash = await hashPassword(password);
    const [result] = await conn.execute(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name, email, passwordHash]
    );

    const user = { id: result.insertId, name, email };
    const token = signToken(user);

    return {
      statusCode: 201,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, user }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  } finally {
    if (conn) await conn.end();
  }
};
