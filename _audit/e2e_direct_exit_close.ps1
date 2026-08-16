$sig = @'
using System;
using System.Runtime.InteropServices;
public class WinClose {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
'@
Add-Type -TypeDefinition $sig

$hwnd = [IntPtr]::Zero
foreach ($proc in Get-Process electron -ErrorAction SilentlyContinue) {
  if ($proc.MainWindowHandle -ne 0 -and $proc.MainWindowTitle -match '神意|Shenyi|novel') {
    $hwnd = $proc.MainWindowHandle
    break
  }
}

if ($hwnd -eq [IntPtr]::Zero) {
  # Fall back to first electron window that has a non-zero handle.
  foreach ($proc in Get-Process electron -ErrorAction SilentlyContinue) {
    if ($proc.MainWindowHandle -ne 0) { $hwnd = $proc.MainWindowHandle; break }
  }
}

if ($hwnd -eq [IntPtr]::Zero) {
  Write-Error 'No application window found to close'
}

$WM_CLOSE = 0x0010
$ok = [WinClose]::PostMessage($hwnd, $WM_CLOSE, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Output ("WM_CLOSE hwnd={0} posted={1}" -f $hwnd, $ok)
