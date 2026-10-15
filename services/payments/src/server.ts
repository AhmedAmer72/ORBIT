import { startPaymentsApp } from "./app";
import { loadPayEnvFile, payConfigFromEnv } from "./config";

loadPayEnvFile();
let config;
try {
  config = payConfigFromEnv();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
const app = await startPaymentsApp({ config });
console.log(`ArcBond payments listening on ${config.host}:${config.port}`);
console.log("The provider delivers a record only after it reads a matching vault payment. The relay status is not delivery.");
