import { startPaymentsApp } from "./app";
import { loadPayEnvFile, payConfigFromEnv } from "./config";

loadPayEnvFile();
const config = payConfigFromEnv();
const app = await startPaymentsApp({ config });
console.log(`ArcBond payments listening on ${app.baseUrl}`);
console.log("The provider delivers a record only after it reads a matching vault payment. The relay status is not delivery.");
