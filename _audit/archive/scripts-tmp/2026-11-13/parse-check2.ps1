$tokens=$null; $errors=$null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts/tmp/build-v2-plan.ps1'), [ref]$tokens, [ref]$errors) | Out-Null
$errors | ForEach-Object { '{0}: {1} :: {2}' -f $_.Extent.StartLineNumber,$_.Message,$_.Extent.Text }
