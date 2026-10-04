const { getConnection } = require("./lib/db");
const { getAuthUser } = require("./lib/auth");

exports.handler = async (event) => {
  const authUser = getAuthUser(event);
  if (!authUser) return { statusCode: 401, body: JSON.stringify({ message: "Please log in." }) };

  let conn;
  try {
    conn = await getConnection();

    const [[recipeStats]] = await conn.query(
      `SELECT COUNT(*) AS recipesSaved, COALESCE(SUM(ingredient_count), 0) AS ingredientsUsed
       FROM saved_recipes WHERE user_id = ?`,
      [authUser.sub]
    );
    const [[donationStats]] = await conn.query(
      `SELECT COALESCE(SUM(amount), 0) AS totalGiven, COUNT(*) AS donationCount
       FROM donations WHERE user_id = ?`,
      [authUser.sub]
    );

    const recipesSaved = Number(recipeStats.recipesSaved) || 0;
    const ingredientsUsed = Number(recipeStats.ingredientsUsed) || 0;
    const kgEstimate = Math.round((recipesSaved * 0.35 + ingredientsUsed * 0.05) * 10) / 10;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipesSaved,
        ingredientsUsed,
        kgEstimate,
        totalGiven: Number(donationStats.totalGiven) || 0,
        donationCount: Number(donationStats.donationCount) || 0,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ message: err.message }) };
  } finally {
    if (conn) await conn.end();
  }
};
