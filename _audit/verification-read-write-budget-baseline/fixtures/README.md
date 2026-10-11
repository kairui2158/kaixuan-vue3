# Regression Fixtures

The canonical adversarial trace remains in the replay profile:

`_data/outline-lock-override-live-replay-profile/documents-data/run-trace/outline/run-trace-outline-20261010-003831/run-trace.json`

Do not copy the multi-megabyte trace into `_audit`. Tests should read it directly if present and skip with an explicit fixture-missing marker when the replay profile is unavailable.
