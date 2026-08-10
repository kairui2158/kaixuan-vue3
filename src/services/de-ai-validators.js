// de-ai-validators.js - Validation functions ported from old architecture renderer_v2.js
// Functions: validateEventCores, validatePerspective, getDeAiTemperature

var NL = String.fromCharCode(10);

/**
 * Validate that output contains sufficient event cores relative to input segments
 * @param {string} output - AI generated output text
 * @param {string} inputSeg - Input segment text
 * @returns {boolean} True if validation passes
 */
export function validateEventCores(output, inputSeg) {
  if (!output || output.trim().length < 20) return false;
  var coreCount = (output.match(/段\d+/g) || []).length;
  var paraCount = inputSeg.split(NL).filter(function(p) { return p.trim().length > 10; }).length;
  return coreCount >= Math.max(1, Math.floor(paraCount * 0.7));
}

/**
 * Validate perspective variation in output text
 * Checks for repetitive perspective transformation methods
 * @param {string} output - AI generated output text
 * @returns {boolean} True if validation passes
 */
export function validatePerspective(output) {
  if (!output) return true;
  var methods = output.match(/(换主语|视点转移|因果倒置|存在句转换)/g) || [];
  if (methods.length < 3) return true;
  for (var i = 0; i < methods.length - 2; i++) {
    if (methods[i] === methods[i+1] && methods[i+1] === methods[i+2]) return false;
  }
  return true;
}

/**
 * Get temperature value based on de-AI processing level, version, and stage
 * @param {string} level - Processing level: light/medium/heavy
 * @param {string} version - Version: v1/v2
 * @param {string} stage - Processing stage: split/verify/rewrite/perspective
 * @returns {number} Temperature value
 */
export function getDeAiTemperature(level, version, stage) {
  var tempMap = { light: 0.4, medium: 0.7, heavy: 1.0 };
  var t = tempMap[level] || 0.7;
  if (version === 'v2') t = t * 0.7;
  if (stage === 'split' || stage === 'verify') t = Math.min(t, 0.3);
  if (stage === 'rewrite' || stage === 'perspective') t = Math.max(t, 0.6);
  return t;
}
