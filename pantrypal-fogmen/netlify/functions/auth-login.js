const { getConnection } = require("./lib/db");
const { comparePassword, signToken } = require("./lib/auth");

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

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) {
    return { statusCode: 400, body: JSON.stringify({ message: "Email and password are required." }) };
  }

  let conn;
  try {
    conn = await getConnection();
    const [rows] = await conn.execute(
      "SELECT id, name, email, password_hash FROM users WHERE email = ?",
      [email]
    );
    const user = rows[0];
    if (!user || !(await comparePassword(password, user.password_hash))) {
      return { statusCode: 401, body: JSON.stringify({ message: "That email and password don't match an account." }) };
    }

    const token = signToken(user);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, user: { id: user.id, name: user.name, email: user.email } }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  } finally {
    if (conn) await conn.end();
  }
};
