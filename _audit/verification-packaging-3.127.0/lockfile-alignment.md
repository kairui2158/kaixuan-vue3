Verification evidence for the lockfile version alignment follow-up.

Command: `npm run verify:packaging`

Expected and observed failure after editing only `package-lock.json`:

```text
AssertionError [ERR_ASSERTION]: asar is newer than every source and build config file
```

This negative control proves the packaging freshness gate detects source/config changes after the NSIS build. The fix is a required rebuild and repack, not an evidence-only update.

Post-rebuild verification:

Command: `npm run verify:packaging`

```text
===== PACKAGING 3.127.0 VERIFICATION PASSED =====
installer=dist\神意助手-Setup-3.127.0.exe; sha256=d3a1f939fc4d104140ff35569ebc5e98f97eecfb5f78cc0e0132305b01972aea; rendererFiles=87; electronAPI methods=94; evidence=_audit\verification-packaging-3.127.0\packaging-evidence.json
```

Installer size: 231,668,979 bytes.
