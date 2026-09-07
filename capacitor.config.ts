import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.singhkapoortech.divit",
  appName: "Divit",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    hostname: "localhost",
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      // apple.com is required by App Store Review Guideline 4.8. It is wired up
      // for iOS only — web and Android would each need an Apple Services ID and
      // return URL, which are deliberately not configured.
      providers: ["google.com", "apple.com"],
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0D0D0D",
      showSpinner: false,
    },
  },
};

export default config;
