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

  const { tags = "" } = event.queryStringParameters || {};
  const params = new URLSearchParams({ apiKey, number: "1" });
  if (tags) params.set("tags", tags);

  try {
    const res = await fetch(`https://api.spoonacular.com/recipes/random?${params.toString()}`);
    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: "spoonacular_error", message: data.message || "Request failed." }),
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
