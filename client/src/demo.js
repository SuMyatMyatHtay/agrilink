// Explicit walkthrough mode: sample content never represents live provider data.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
export const DEMO_FARMS = {
  "9876543210": { name: "Ramesh Sawant", farm: { village: "Vijaydurg", district: "Sindhudurg", acres: 5, trees: 320, age: 15, irrigation: "drip", fpo: "Devgad Growers FPO" } },
  "9876543211": { name: "Suresh Desai", farm: { village: "Devgad", district: "Sindhudurg", acres: 8, trees: 520, age: 18, irrigation: "drip", fpo: "Devgad Growers FPO" } },
  "9876543212": { name: "Anita Naik", farm: { village: "Ratnagiri", district: "Ratnagiri", acres: 3, trees: 180, age: 12, irrigation: "well", fpo: "Ratnagiri Growers FPO" } },
};
export function demoReply(question) {
  const q = question.toLowerCase();
  if (/rain|weather|storm/.test(q)) return "Demo forecast: light rain is expected over the next two days. Check orchard drainage, keep harvested mangoes covered, and arrange a dry collection area with your FPO. This is sample weather for the walkthrough.";
  if (/price|offer|sell|profit/.test(q)) return "Demo trade advice: compare the buyer's price with your packing and transport costs before committing. Open Buyer offers to compare available deals, choose a quantity within your free supply, and create an agreement. You can review every term before signing.";
  if (/harvest|quality|mango/.test(q)) return "Demo farm advice: inspect a sample of fruit for size, colour and blemishes. Open Crop stages to record your observations and submit photos, then switch to Operations to review the report. A quality review is still needed before dispatch.";
  return "For this demo, start by checking Buyer offers, then create a commitment and review the agreement. You can also explore price and profit scenarios, record a crop stage, and switch to Operations to review submissions. Your changes are saved in this local walkthrough.";
}
