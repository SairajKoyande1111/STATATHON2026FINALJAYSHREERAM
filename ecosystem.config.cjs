module.exports = {
  apps: [{
    name: "airavata-app",
    script: "./dist/index.cjs",
    env: {
      NODE_ENV: "production",
      PORT: 3009,
      MONGODB_URI: "PASTE_YOUR_MONGODB_URI_HERE",
      SESSION_SECRET: "PASTE_YOUR_SESSION_SECRET_HERE"
    }
  }]
};
