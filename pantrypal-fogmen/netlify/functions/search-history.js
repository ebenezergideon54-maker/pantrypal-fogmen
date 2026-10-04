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
        `SELECT ingredients, UNIX_TIMESTAMP(searched_at) * 1000 AS searchedAt
         FROM search_history WHERE user_id = ? ORDER BY searched_at DESC LIMIT 8`,
        [authUser.sub]
      );
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const ingredients = (body.ingredients || "").trim();
      if (!ingredients) return { statusCode: 400, body: JSON.stringify({ message: "Ingredients are required." }) };
      await conn.execute("INSERT INTO search_history (user_id, ingredients) VALUES (?, ?)", [authUser.sub, ingredients]);
      return { statusCode: 201, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === "DELETE") {
      await conn.execute("DELETE FROM search_history WHERE user_id = ?", [authUser.sub]);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  } finally {
    if (conn) await conn.end();
  }
};
