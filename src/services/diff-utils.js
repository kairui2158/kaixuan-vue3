// diff-utils.js - Diff utilities ported from old architecture renderer_v2.js
// Functions: lcsDiff, buildDiffResult, acceptDiffLine, rejectDiffLine
// Used by DiffModal component for text comparison and acceptance/rejection

/**
 * LCS-based line diff algorithm
 * Compares two text strings line by line and returns change list
 * @param {string} a - Original text
 * @param {string} b - Modified text
 * @returns {Array<{type: string, text: string}>} Array of changes (unchanged/added/removed)
 */
export function lcsDiff(a, b) {
  var aLines = a.split("\n");
  var bLines = b.split("\n");
  var n = aLines.length, m = bLines.length;
  var dp = [];
  for (var i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      dp[i][j] = aLines[i] === bLines[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
    }
  }
  var changes = [];
  var i = 0, j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) { changes.push({type:"unchanged", text:aLines[i]}); i++; j++; }
    else if (dp[i+1][j] >= dp[i][j+1]) { changes.push({type:"removed", text:aLines[i]}); i++; }
    else { changes.push({type:"added", text:bLines[j]}); j++; }
  }
  while (i < n) { changes.push({type:"removed", text:aLines[i]}); i++; }
  while (j < m) { changes.push({type:"added", text:bLines[j]}); j++; }
  return changes;
}

/**
 * Build final text from diff changes and acceptance map
 * @param {Array} diffChanges - Array of change objects from lcsDiff
 * @param {Object} diffAccepted - Map of change index -> true/false
 * @returns {string} Merged text
 */
export function buildDiffResult(diffChanges, diffAccepted) {
  var result = [];
  var changeIdx = 0;
  for (var i = 0; i < diffChanges.length; i++) {
    var c = diffChanges[i];
    if (c.type === "unchanged") { result.push(c.text); }
    else if (c.type === "added") {
      if (diffAccepted[changeIdx] !== false) result.push(c.text);
      changeIdx++;
    } else if (c.type === "removed") {
      if (diffAccepted[changeIdx] === true) { /* skip removed line */ }
      else result.push(c.text);
      changeIdx++;
    }
  }
  return result.join("\n");
}

/**
 * Accept a diff line - marks it as accepted
 * @param {Object} diffAccepted - The acceptance map to mutate
 * @param {number} idx - Index of the line to accept
 * @returns {Object} The mutated acceptance map
 */
export function acceptDiffLine(diffAccepted, idx) {
  diffAccepted[idx] = true;
  return diffAccepted;
}

/**
 * Reject a diff line - marks it as rejected
 * @param {Object} diffAccepted - The acceptance map to mutate
 * @param {number} idx - Index of the line to reject
 * @returns {Object} The mutated acceptance map
 */
export function rejectDiffLine(diffAccepted, idx) {
  diffAccepted[idx] = false;
  return diffAccepted;
}
