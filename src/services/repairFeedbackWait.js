/**
 * Timeout policy shared by the repair-feedback Electron verifier and its unit tests.
 * Kept as JavaScript so the verifier can import it directly without a build step.
 *
 * @typedef {object} BodyWaitTimeoutInput
 * @property {number} baseTimeoutMs
 * @property {number} observedPhysicalCalls
 * @property {number} perPhysicalCallBudgetMs
 * @property {number} maxTimeoutMs
 * @property {number} [explicitTimeoutMs]
 */

/**
 * @param {BodyWaitTimeoutInput} input
 * @returns {number}
 */
export function bodyWaitTimeoutMs(input) {
  if (input.explicitTimeoutMs !== undefined) {
    return input.explicitTimeoutMs
  }

  const dynamicTimeoutMs =
    input.baseTimeoutMs +
    input.observedPhysicalCalls * input.perPhysicalCallBudgetMs
  return Math.min(input.maxTimeoutMs, dynamicTimeoutMs)
}
