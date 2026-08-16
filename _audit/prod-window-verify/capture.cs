using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;

class CapWin {
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    static void Main() {
        IntPtr hwnd = (IntPtr)1311862;
        GetWindowRect(hwnd, out RECT r);
        int w = r.Right - r.Left;
        int h = r.Bottom - r.Top;
        Console.WriteLine($"Window rect: {r.Left},{r.Top}->{r.Right},{r.Bottom} ({w}x{h})");
        if (w <= 0 || h <= 0) { Console.WriteLine("Invalid rect"); return; }
        SetForegroundWindow(hwnd);
        Thread.Sleep(500);
        using (Bitmap bmp = new Bitmap(w, h)) {
            using (Graphics g = Graphics.FromImage(bmp)) {
                g.CopyFromScreen(r.Left, r.Top, 0, 0, new System.Drawing.Size(w, h));
            }
            string path = @"D:\codex\novel-workshop-vue3\_audit\prod-window-verify\prod-main.png";
            bmp.Save(path, ImageFormat.Png);
            Console.WriteLine($"Saved to {path}");
        }
    }
}
