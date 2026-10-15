/**
 * Google Apps Script (GAS) 24/7 Free Keep-Alive for Render.
 * -----------------------------------------------------------
 * Google Apps Script runs entirely on Google's cloud servers for free.
 * It sends real, external inbound traffic to your Render server edge router
 * every 5 to 10 minutes, completely preventing Render from idling or sleeping.
 *
 * HOW TO SET THIS UP (Takes 60 seconds):
 * 1. Open your browser and go to: https://script.google.com/
 * 2. Click "+ New project".
 * 3. Delete any default code in the editor, and paste this entire code snippet.
 * 4. Click the Save icon (💾).
 * 5. Click the "Triggers" clock icon (⏰) on the left sidebar.
 * 6. Click "+ Add Trigger" at the bottom right:
 *    - Choose which function to run: pingRenderServer
 *    - Select event source: Time-driven
 *    - Select type of time based trigger: Minutes timer
 *    - Select minute interval: Every 5 minutes (or Every 10 minutes)
 * 7. Click "Save". You're all done! Google will ping your Render app 24/7 for free.
 */

const RENDER_HEALTH_URL = "https://moneycouncil-7zcr.onrender.com/health";

function pingRenderServer() {
  const options = {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      "User-Agent": "GoogleAppsScript-RenderKeepAlive/1.0"
    }
  };

  try {
    const startTime = new Date().getTime();
    const response = UrlFetchApp.fetch(RENDER_HEALTH_URL, options);
    const duration = new Date().getTime() - startTime;
    const statusCode = response.getResponseCode();

    if (statusCode === 200) {
      Logger.log("✅ Keep-alive SUCCESS (HTTP 200) in " + duration + "ms. Server is awake.");
    } else {
      Logger.log("⚠️ Keep-alive HTTP " + statusCode + " in " + duration + "ms. Edge router awakened.");
    }
  } catch (err) {
    Logger.log("❌ Keep-alive error: " + err.toString());
  }
}
