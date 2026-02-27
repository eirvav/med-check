import { createApp } from "./app.js";
import { loadEnvironment } from "./config.js";

const config = loadEnvironment();
process.env.PERPLEXITY_API_KEY = config.perplexityApiKey;
process.env.PERPLEXITY_MODEL = config.perplexityModel;

const app = createApp();
app.listen(config.port, config.host, () => {
  console.log(
    JSON.stringify({
      level: "info",
      code: "PROXY_READY",
      host: config.host,
      port: config.port,
      model: config.perplexityModel
    })
  );
});
