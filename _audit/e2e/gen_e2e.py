const http = require("http");
const fs = require("fs");
const path = require("path");
const CDP_PORT = 9223;
const HOST = "127.0.0.1";
const E2E_DIR = __dirname;
const SCREENSHOT_DIR = path.join(E2E_DIR, "screenshots");
const LOG_DIR = path.join(E2E_DIR, "logs");
const REPORT_FILE = path.join(E2E_DIR, "E2E_RESULTS.md");
if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, {recursive: true});
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, {recursive: true});
console.log("E2E script loaded");