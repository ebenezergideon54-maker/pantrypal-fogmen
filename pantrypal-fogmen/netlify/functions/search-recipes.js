// Proxies recipe search to Spoonacular so the API key never reaches the browser.
exports.handler = async (event) => {
  const apiKey = process.env.SPOONACULAR_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "missing_api_key",
        message:
          "SPOONACULAR_API_KEY is not set. Add it in Netlify: Site settings > Environment variables, then redeploy.",
      }),
    };
  }

  const {
    ingredients = "",
    diet = "",
    cuisine = "",
    maxReadyTime = "",
    number = "12",
  } = event.queryStringParameters || {};

  const params = new URLSearchParams({
    apiKey,
    number,
    addRecipeInformation: "true",
    fillIngredients: "true",
    instructionsRequired: "true",
    sort: ingredients ? "max-used-ingredients" : "popularity",
  });

  if (ingredients) params.set("includeIngredients", ingredients);
  if (diet) params.set("diet", diet);
  if (cuisine) params.set("cuisine", cuisine);
  if (maxReadyTime) params.set("maxReadyTime", maxReadyTime);

  try {
    const res = await fetch(`https://api.spoonacular.com/recipes/complexSearch?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: "spoonacular_error", message: data.message || "Search failed." }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "network_error", message: err.message }) };
  }
};
