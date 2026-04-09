import { retrieveContext, retrieveWithSources } from "./ragEngine.js";

const query = "I have chest pain and shortness of breath";

console.log("🔍 Query:", query);

const context = retrieveContext(query);
console.log("\n📄 Context:\n", context);

const sources = retrieveWithSources(query);
console.log("\n📊 Sources:\n", sources);