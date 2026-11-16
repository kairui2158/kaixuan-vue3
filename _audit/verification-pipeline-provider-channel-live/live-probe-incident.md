# Live provider probe incident

Date: 2026-11-16

The first observational probe launched from the local provider profile selected `deepseek-v4-flash`, and the supplier returned HTTP 503 for `分组 default 下模型 deepseek-v4-flash 无可用渠道（distributor）`. Evidence remains in `_audit/verification-deai-stage-guidance-live/run-20261116-064321/summary.json`.

This was a stale probe configuration failure, not a regression in P1 (`N1`, `N2`, `N4`). The final pipeline provider-channel verification used the authorized external endpoint and `glm-5.3`; its report and traces are in this directory. The live report records only `credentialSource: environment` and the key length, never the credential value.
