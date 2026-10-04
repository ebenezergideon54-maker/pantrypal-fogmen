const { getConnection } = require("./lib/db");
const { getAuthUser } = require("./lib/auth");

exports.handler = async (event) => {
  const authUser = getAuthUser(event);
  if (!authUser) {
    return { statusCode: 401, body: JSON.stringify({ message: "Please log in to manage saved recipes." }) };
  }

  let conn;
  try {
    conn = await getConnection();

    if (event.httpMethod === "GET") {
      const [rows] = await conn.execute(
        `SELECT recipe_id AS id, title, image, ready_in_minutes AS readyInMinutes,
                servings, ingredient_count AS ingredientCount,
                UNIX_TIMESTAMP(saved_at) * 1000 AS savedAt
         FROM saved_recipes WHERE user_id = ? ORDER BY saved_at DESC`,
        [authUser.sub]
      );
      return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(rows) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { id, title, image, readyInMinutes, servings, ingredientCount } = body;
      if (!id || !title) {
        return { statusCode: 400, body: JSON.stringify({ message: "Recipe id and title are required." }) };
      }
      await conn.execute(
        `INSERT INTO saved_recipes (user_id, recipe_id, title, image, ready_in_minutes, servings, ingredient_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE title = VALUES(title)`,
        [authUser.sub, id, title, image || null, readyInMinutes || null, servings || null, ingredientCount || null]
      );
      return { statusCode: 201, body: JSON.stringify({ ok: true }) };
    }

    if (event.httpMethod === "DELETE") {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return { statusCode: 400, body: JSON.stringify({ message: "Recipe id is required." }) };
      await conn.execute("DELETE FROM saved_recipes WHERE user_id = ? AND recipe_id = ?", [authUser.sub, id]);
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, body: JSON.stringify({ message: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  } finally {
    if (conn) await conn.end();
  }
};
