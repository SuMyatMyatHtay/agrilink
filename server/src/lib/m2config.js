export const m2Base = () => process.env.M2_API_URL ||
  `${(process.env.ML_URL || "http://127.0.0.1:8000").replace(/\/$/, "")}/farm-operations/api/m2`;
export const m2Headers = () => process.env.M2_GATEWAY_SECRET ? { "x-m2-gateway-secret": process.env.M2_GATEWAY_SECRET } : {};
