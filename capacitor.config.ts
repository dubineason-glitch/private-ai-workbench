import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: process.env.APP_BUNDLE_ID || "com.private.aiworkbench",
  appName: "私人 AI 工作台",
  webDir: "dist",
};

export default config;
