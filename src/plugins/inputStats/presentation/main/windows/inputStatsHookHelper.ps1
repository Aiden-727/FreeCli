[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Web.Extensions

$source = @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace FreeCli.InputStats {
  public sealed class InputStatsDelta {
    public int key_presses;
    public int left_clicks;
    public int right_clicks;
    public double mouse_distance_px;
    public double scroll_steps;
    public Dictionary<string, int> key_counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
  }

  internal sealed class InputStatsMonitor {
    private const int WH_KEYBOARD_LL = 13;
    private const int WH_MOUSE_LL = 14;
    private const int WM_KEYDOWN = 0x0100;
    private const int WM_KEYUP = 0x0101;
    private const int WM_SYSKEYDOWN = 0x0104;
    private const int WM_SYSKEYUP = 0x0105;
    private const int WM_LBUTTONDOWN = 0x0201;
    private const int WM_RBUTTONDOWN = 0x0204;
    private const int WM_MOUSEMOVE = 0x0200;
    private const int WM_MOUSEWHEEL = 0x020A;
    private const int WM_MOUSEHWHEEL = 0x020E;
    private const int LLKHF_EXTENDED = 0x01;
    private const int KF_EXTENDED = 0x0100;
    private const int MAPVK_VK_TO_VSC = 0;
    private const int WHEEL_DELTA = 120;

    private const double MouseSampleIntervalMs = 1000.0 / 30.0;
    private const double MaxSegmentDistance = 100.0;
    private const double SmallDistanceThreshold = 10.0;
    private const double MaxReportedDistance = 500.0;
    private const double MaxMouseSpeed = 3000.0;

    private readonly object _sync = new object();
    private readonly HashSet<int> _pressedKeys = new HashSet<int>();
    private readonly LowLevelProc _keyboardProc;
    private readonly LowLevelProc _mouseProc;

    private IntPtr _keyboardHook = IntPtr.Zero;
    private IntPtr _mouseHook = IntPtr.Zero;
    private bool _running;
    private bool _hasLastMousePos;
    private POINT _lastMousePos;
    private POINT _lastSamplePos;
    private double _accumulatedDistance;
    private ulong _lastMouseSampleTick;
    private int _keyPresses;
    private int _leftClicks;
    private int _rightClicks;
    private double _mouseDistancePx;
    private double _scrollSteps;
    private readonly Dictionary<string, int> _keyCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

    public InputStatsMonitor() {
      _keyboardProc = KeyboardHookCallback;
      _mouseProc = MouseHookCallback;
    }

    public bool Start(out string errorMessage) {
      lock (_sync) {
        if (_running) {
          errorMessage = string.Empty;
          return true;
        }

        var process = Process.GetCurrentProcess();
        var module = process.MainModule;
        var moduleHandle = module == null ? IntPtr.Zero : GetModuleHandle(module.ModuleName);

        _keyboardHook = SetWindowsHookEx(WH_KEYBOARD_LL, _keyboardProc, moduleHandle, 0);
        if (_keyboardHook == IntPtr.Zero) {
          errorMessage = "SetWindowsHookEx(WH_KEYBOARD_LL) failed: " + Marshal.GetLastWin32Error();
          return false;
        }

        _mouseHook = SetWindowsHookEx(WH_MOUSE_LL, _mouseProc, moduleHandle, 0);
        if (_mouseHook == IntPtr.Zero) {
          var code = Marshal.GetLastWin32Error();
          UnhookWindowsHookEx(_keyboardHook);
          _keyboardHook = IntPtr.Zero;
          errorMessage = "SetWindowsHookEx(WH_MOUSE_LL) failed: " + code;
          return false;
        }

        _running = true;
        _hasLastMousePos = false;
        _accumulatedDistance = 0;
        _lastMouseSampleTick = GetTickCount64();
        errorMessage = string.Empty;
        return true;
      }
    }

    public void Stop() {
      lock (_sync) {
        if (_keyboardHook != IntPtr.Zero) {
          UnhookWindowsHookEx(_keyboardHook);
          _keyboardHook = IntPtr.Zero;
        }
        if (_mouseHook != IntPtr.Zero) {
          UnhookWindowsHookEx(_mouseHook);
          _mouseHook = IntPtr.Zero;
        }
        _running = false;
        _pressedKeys.Clear();
      }
    }

    public bool IsRunning() {
      lock (_sync) {
        return _running;
      }
    }

    public Dictionary<string, object> FetchAndResetDelta() {
      lock (_sync) {
        var keyCounts = new Dictionary<string, int>(_keyCounts, StringComparer.OrdinalIgnoreCase);
        _keyCounts.Clear();
        var response = new Dictionary<string, object>();
        response["key_presses"] = _keyPresses;
        response["left_clicks"] = _leftClicks;
        response["right_clicks"] = _rightClicks;
        response["mouse_distance_px"] = _mouseDistancePx;
        response["scroll_steps"] = _scrollSteps;
        response["key_counts"] = keyCounts;
        _keyPresses = 0;
        _leftClicks = 0;
        _rightClicks = 0;
        _mouseDistancePx = 0;
        _scrollSteps = 0;
        return response;
      }
    }

    private IntPtr KeyboardHookCallback(int code, IntPtr wParam, IntPtr lParam) {
      if (code >= 0 && lParam != IntPtr.Zero) {
        var data = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
        HandleKeyboardEvent(wParam.ToInt32(), data);
      }
      return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    private IntPtr MouseHookCallback(int code, IntPtr wParam, IntPtr lParam) {
      if (code >= 0 && lParam != IntPtr.Zero) {
        var data = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
        HandleMouseEvent(wParam.ToInt32(), data);
      }
      return CallNextHookEx(IntPtr.Zero, code, wParam, lParam);
    }

    private void HandleKeyboardEvent(int message, KBDLLHOOKSTRUCT data) {
      lock (_sync) {
        if (!_running) {
          return;
        }

        var vkCode = unchecked((int)data.vkCode);
        if (message == WM_KEYDOWN || message == WM_SYSKEYDOWN) {
          if (_pressedKeys.Add(vkCode)) {
            _keyPresses += 1;
            var keyName = ToDisplayName(vkCode, data.scanCode, data.flags);
            if (!string.IsNullOrWhiteSpace(keyName)) {
              var current = 0;
              _keyCounts.TryGetValue(keyName, out current);
              _keyCounts[keyName] = current + 1;
            }
          }
        } else if (message == WM_KEYUP || message == WM_SYSKEYUP) {
          _pressedKeys.Remove(vkCode);
        }
      }
    }

    private void HandleMouseEvent(int message, MSLLHOOKSTRUCT data) {
      lock (_sync) {
        if (!_running) {
          return;
        }

        if (message == WM_LBUTTONDOWN) {
          _leftClicks += 1;
        } else if (message == WM_RBUTTONDOWN) {
          _rightClicks += 1;
        } else if (message == WM_MOUSEMOVE) {
          HandleMouseMove(data.pt);
        } else if (message == WM_MOUSEWHEEL || message == WM_MOUSEHWHEEL) {
          var delta = (short)((data.mouseData >> 16) & 0xFFFF);
          var steps = Math.Abs((double)delta) / WHEEL_DELTA;
          if (steps > 0) {
            _scrollSteps += steps;
          }
        }
      }
    }

    private void HandleMouseMove(POINT point) {
      var now = GetTickCount64();
      if (!_hasLastMousePos) {
        _lastMousePos = point;
        _lastSamplePos = point;
        _hasLastMousePos = true;
        _lastMouseSampleTick = now;
        return;
      }

      var dx = point.x - _lastMousePos.x;
      var dy = point.y - _lastMousePos.y;
      var segmentDistance = Math.Sqrt(dx * dx + dy * dy);
      if (segmentDistance > MaxSegmentDistance) {
        _accumulatedDistance = 0;
        _lastMousePos = point;
        _lastSamplePos = point;
        _lastMouseSampleTick = now;
        return;
      }

      _accumulatedDistance += segmentDistance;
      _lastMousePos = point;
      var elapsedMs = (double)(now - _lastMouseSampleTick);
      if (elapsedMs < MouseSampleIntervalMs) {
        return;
      }

      var sampleDx = point.x - _lastSamplePos.x;
      var sampleDy = point.y - _lastSamplePos.y;
      var sampledDistance = Math.Sqrt(sampleDx * sampleDx + sampleDy * sampleDy);
      var reportedDistance = sampledDistance;

      if (_accumulatedDistance > 0 && sampledDistance > 0) {
        if (sampledDistance < SmallDistanceThreshold && _accumulatedDistance > SmallDistanceThreshold) {
          reportedDistance = _accumulatedDistance;
        } else if (_accumulatedDistance > sampledDistance * 1.3) {
          reportedDistance = sampledDistance;
        } else {
          reportedDistance = Math.Min(_accumulatedDistance, sampledDistance * 1.1);
        }
      } else if (_accumulatedDistance > 0) {
        reportedDistance = _accumulatedDistance;
      }

      var elapsedSeconds = Math.Max(elapsedMs / 1000.0, 0.001);
      var speed = reportedDistance / elapsedSeconds;
      if (reportedDistance > 0 && reportedDistance <= MaxReportedDistance && speed <= MaxMouseSpeed) {
        _mouseDistancePx += reportedDistance;
      }

      _accumulatedDistance = 0;
      _lastSamplePos = point;
      _lastMouseSampleTick = now;
    }

    private string ToDisplayName(int vkCode, uint scanCode, uint flags) {
      switch (vkCode) {
        case 0x20: return "Space";
        case 0x0D: return "Enter";
        case 0x08: return "Backspace";
        case 0x09: return "Tab";
        case 0x1B: return "Esc";
        case 0x10:
        case 0xA0:
        case 0xA1: return "Shift";
        case 0x11:
        case 0xA2:
        case 0xA3: return "Ctrl";
        case 0x12:
        case 0xA4:
        case 0xA5: return "Alt";
        case 0x14: return "Caps";
        case 0x2E: return "Del";
        case 0x2D: return "Ins";
        case 0x24: return "Home";
        case 0x23: return "End";
        case 0x21: return "PgUp";
        case 0x22: return "PgDn";
        case 0x25: return "Left";
        case 0x27: return "Right";
        case 0x26: return "Up";
        case 0x28: return "Down";
        case 0x5B:
        case 0x5C: return "Win";
      }

      if (vkCode >= 0x41 && vkCode <= 0x5A) {
        return ((char)vkCode).ToString();
      }
      if (vkCode >= 0x30 && vkCode <= 0x39) {
        return ((char)vkCode).ToString();
      }
      if (vkCode >= 0x70 && vkCode <= 0x7B) {
        return "F" + (vkCode - 0x6F);
      }

      var keyScanCode = scanCode;
      if ((flags & LLKHF_EXTENDED) != 0) {
        keyScanCode |= KF_EXTENDED;
      }
      var lParam = unchecked((int)(keyScanCode << 16));
      var buffer = new StringBuilder(64);
      var length = GetKeyNameText(lParam, buffer, buffer.Capacity);
      if (length <= 0) {
        var fallbackScanCode = MapVirtualKey((uint)vkCode, MAPVK_VK_TO_VSC);
        var fallbackLParam = unchecked((int)(fallbackScanCode << 16));
        length = GetKeyNameText(fallbackLParam, buffer, buffer.Capacity);
      }
      return length > 0 ? buffer.ToString() : "Key" + vkCode;
    }

    private delegate IntPtr LowLevelProc(int code, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc callback, IntPtr hMod, uint threadId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hook);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string moduleName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetKeyNameText(int lParam, StringBuilder buffer, int size);

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKey(uint code, uint mapType);

    [DllImport("kernel32.dll")]
    private static extern ulong GetTickCount64();

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int x; public int y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT {
      public uint vkCode;
      public uint scanCode;
      public uint flags;
      public uint time;
      public UIntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MSLLHOOKSTRUCT {
      public POINT pt;
      public uint mouseData;
      public uint flags;
      public uint time;
      public UIntPtr dwExtraInfo;
    }
  }

  public static class Program {
    private static readonly object OutputSync = new object();
    private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();
    private static InputStatsMonitor _monitor;
    private static ApplicationContext _context;
    private static bool _stopping;

    public static int Run() {
      _monitor = new InputStatsMonitor();
      string errorMessage;
      if (!_monitor.Start(out errorMessage)) {
        WriteEnvelope(false, null, "hook_start_failed", errorMessage);
        return 1;
      }

      _context = new ApplicationContext();
      var stdinThread = new Thread(ReadCommands);
      stdinThread.IsBackground = true;
      stdinThread.Start();
      Application.Run(_context);
      _stopping = true;
      _monitor.Stop();
      return 0;
    }

    private static void ReadCommands() {
      string line;
      while ((line = Console.ReadLine()) != null) {
        var command = line.Trim();
        if (command.Length == 0) {
          continue;
        }
        if (command == "status") {
          var result = new Dictionary<string, object>();
          result["running"] = _monitor.IsRunning();
          WriteEnvelope(true, result, null, null);
          continue;
        }
        if (command == "fetch-and-reset") {
          WriteEnvelope(true, _monitor.FetchAndResetDelta(), null, null);
          continue;
        }
        if (command == "stop") {
          _stopping = true;
          var result = new Dictionary<string, object>();
          result["stopping"] = true;
          WriteEnvelope(true, result, null, null);
          if (_context != null) {
            _context.ExitThread();
          }
          return;
        }
        WriteEnvelope(false, null, "unknown_command", command);
      }

      if (!_stopping && _context != null) {
        _context.ExitThread();
      }
    }

    private static void WriteEnvelope(bool ok, object result, string error, string detail) {
      var payload = new Dictionary<string, object>();
      payload["ok"] = ok;
      if (result != null) payload["result"] = result;
      if (!string.IsNullOrEmpty(error)) payload["error"] = error;
      if (!string.IsNullOrEmpty(detail)) payload["detail"] = detail;
      lock (OutputSync) {
        Console.WriteLine(Serializer.Serialize(payload));
      }
    }
  }
}
'@

Add-Type -TypeDefinition $source -ReferencedAssemblies @('System.Windows.Forms', 'System.Web.Extensions')
$exitCode = [FreeCli.InputStats.Program]::Run()
exit $exitCode
