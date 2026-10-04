const { getConnection } = require("./lib/db");
const { getAuthUser } = require("./lib/auth");

exports.handler = async (event) => {
  const authUser = getAuthUser(event);
  if (!authUser) return { statusCode: 401, body: JSON.stringify({ message: "Please log in." }) };

  let conn;
  try {
    conn = await getConnection();

    if (event.httpMethod === "GET") {
      const [rows] = await conn.execute(
        "SELECT amount, UNIX_TIMESTAMP(donated_at) * 1000 AS at FROM donations WHERE user_id = ? ORDER BY donated_at DESC",
        [authUser.sub]
      );
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const amount = Number(body.amount);
      if (!amount || amount < 100) {
        return { statusCode: 400, body: JSON.stringify({ message: "Enter a donation amount of at least 100." }) };
      }
      await conn.execute("INSERT INTO donations (user_id, amount) VALUES (?, ?)", [authUser.sub, amount]);
      return { statusCode: 201, body: JSON.stringify({ ok: true, amount }) };
    }

    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  } finally {
    if (conn) await conn.end();
  }
};
