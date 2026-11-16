const num = (v, d) => (v === undefined || v === "" ? d : Number(v));
if (process.env.NODE_ENV === "production") {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required in production");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET === "dev-secret-change-me") {
    throw new Error("Set JWT_SECRET to a random secret of at least 32 characters");
  }
}

export const env = {
  port: num(process.env.PORT, 4000),
  mongo: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/agrilink",
  mlUrl: process.env.ML_URL || "http://127.0.0.1:8000",
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  usdInr: num(process.env.USD_INR, 88),
  devOtp: process.env.DEV_OTP || "1234",
  seedOnStart: process.env.SEED_ON_START !== "false",
};
