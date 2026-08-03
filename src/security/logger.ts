import pino from "pino";
import { getEnv } from "@/src/env";

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: {
    paths: [
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.secret",
      "*.authorization",
      "*.transcript",
      "*.body",
      "*.email",
      "*.recipient",
    ],
    censor: "[REDACTED]",
  },
  base: null,
});
