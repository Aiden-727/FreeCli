using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace WindowsMonitorHelper;

internal sealed class TaskbarEmbeddingHost
{
    private const int WidgetSpacing = 2;
    private const int MinTaskListWidth = 80;
    private const int Win11LeftInset = 2;
    private const int Win11RightInset = 2;
    private const uint EmbeddedWindowPositionFlags =
        NativeMethods.SwpNoActivate | NativeMethods.SwpFrameChanged;
    private const uint OverlayWindowPositionFlags =
        NativeMethods.SwpNoActivate | NativeMethods.SwpFrameChanged;

    private bool originalWindowStyleCaptured;
    private nint originalWindowStyle;
    private nint originalWindowExStyle;
    private IntPtr attachedParentHandle = IntPtr.Zero;
    private IntPtr reservedHandle = IntPtr.Zero;
    private Rectangle originalReservedBounds = Rectangle.Empty;
    private Rectangle? lastAppliedBounds;
    private string lastStage = "idle";
    private string? lastParentWindowClass;
    private Rectangle? lastEmbeddedBounds;
    private Rectangle? lastAnchorRect;
    private Rectangle? lastNotifyRect;
    private Rectangle? lastTaskbarRect;
    public bool IsOverlayMode { get; private set; }

    public TaskbarEmbeddingResult AttachOrUpdate(Form form, Size widgetSize)
    {
        ArgumentNullException.ThrowIfNull(form);
        lastStage = "validate_handle";
        if (!form.IsHandleCreated)
        {
            return Fail("任务栏监控窗口句柄尚未创建。");
        }

        lastStage = "resolve_context";
        TaskbarHostContext context = ResolveContext();
        if (context.Error is not null)
        {
            Detach(form);
            return Fail(context.Error);
        }

        try
        {
            lastTaskbarRect = context.TaskbarRect;
            lastNotifyRect = context.NotifyRect;
            lastAnchorRect = context.AnchorRect;
            if (context.IsWindows11)
            {
                IsOverlayMode = true;
                lastStage = "ensure_overlay_style";
                EnsureOverlayWindowStyle(form.Handle);
                lastParentWindowClass = GetClassName(context.ParentHandle);
            }
            else
            {
                IsOverlayMode = false;
                lastStage = "ensure_child_style";
                EnsureChildWindowStyle(form.Handle);
                lastStage = "ensure_parent";
                EnsureParent(form.Handle, context.ParentHandle);
                if (context.ResizeTargetHandle != IntPtr.Zero)
                {
                    lastStage = "reserve_tasklist_space";
                    ReserveTaskListSpace(context, widgetSize.Width);
                }
                else
                {
                    RestoreReservedSpace();
                }
            }

            lastStage = "calculate_bounds";
            Rectangle bounds = CalculateEmbeddedBounds(context, widgetSize);
            bool invalidBounds = context.IsWindows11
                ? bounds.Width <= 0 || bounds.Height <= 0
                : bounds.X < 0 || bounds.Width <= 0 || bounds.Right > context.ParentRect.Width;
            if (invalidBounds)
            {
                throw new InvalidOperationException("当前任务栏可用空间不足，无法嵌入监控窗口。");
            }

            bool boundsChanged = !lastAppliedBounds.HasValue || lastAppliedBounds.Value != bounds;

            if (boundsChanged && context.IsWindows11)
            {
                lastStage = "move_overlay_window";
                MoveOverlayWindowOrThrow(form.Handle, bounds);
            }
            else if (boundsChanged)
            {
                lastStage = "move_embedded_window";
                MoveEmbeddedWindowOrThrow(form.Handle, bounds);
            }

            if (!NativeMethods.IsWindowVisible(form.Handle))
            {
                lastStage = "show_window";
                NativeMethods.ShowWindow(form.Handle, ShowWindowCommand.ShowNoActivate);
            }
            lastStage = "embedded";
            lastAppliedBounds = bounds;
            lastEmbeddedBounds = bounds;
            return TaskbarEmbeddingResult.Success(bounds, lastStage, lastParentWindowClass);
        }
        catch (Exception exception)
        {
            Detach(form);
            return Fail(exception.Message);
        }
    }

    public void Detach(Form form)
    {
        ArgumentNullException.ThrowIfNull(form);
        lastStage = "detaching";
        RestoreReservedSpace();

        if (!form.IsHandleCreated)
        {
            IsOverlayMode = false;
            attachedParentHandle = IntPtr.Zero;
            lastAppliedBounds = null;
            lastEmbeddedBounds = null;
            lastParentWindowClass = null;
            lastAnchorRect = null;
            lastNotifyRect = null;
            lastTaskbarRect = null;
            return;
        }

        if (NativeMethods.GetParent(form.Handle) != IntPtr.Zero)
        {
            NativeMethods.SetParent(form.Handle, IntPtr.Zero);
        }

        RestoreOriginalWindowStyle(form.Handle);
        NativeMethods.ShowWindow(form.Handle, ShowWindowCommand.Hide);
        IsOverlayMode = false;
        attachedParentHandle = IntPtr.Zero;
        lastAppliedBounds = null;
        lastEmbeddedBounds = null;
        lastParentWindowClass = null;
        lastAnchorRect = null;
        lastNotifyRect = null;
        lastTaskbarRect = null;
        lastStage = "detached";
    }

    public TaskbarWidgetDebugInfo BuildDebugInfo()
    {
        return new TaskbarWidgetDebugInfo(
            null,
            null,
            null,
            null,
            lastStage,
            lastParentWindowClass,
            FormatBounds(lastEmbeddedBounds),
            null,
            null,
            FormatBounds(lastAnchorRect),
            FormatBounds(lastNotifyRect),
            FormatBounds(lastTaskbarRect));
    }

    private static TaskbarHostContext ResolveContext()
    {
        IntPtr taskbarHandle = NativeMethods.FindWindow("Shell_TrayWnd", null);
        if (taskbarHandle == IntPtr.Zero)
        {
            return TaskbarHostContext.Fail("未找到 Windows 主任务栏窗口。");
        }

        Rectangle taskbarRect = GetWindowRectangleOrThrow(taskbarHandle, "读取任务栏位置失败。");
        Screen screen = Screen.FromHandle(taskbarHandle);
        bool isHorizontal = taskbarRect.Width >= taskbarRect.Height;
        bool isBottomTaskbar =
            isHorizontal &&
            Math.Abs(taskbarRect.Bottom - screen.Bounds.Bottom) <= 8 &&
            taskbarRect.Top >= screen.Bounds.Top;

        if (!isBottomTaskbar)
        {
            return TaskbarHostContext.Fail("当前仅支持主屏底部任务栏嵌入。");
        }

        IntPtr bridgeHandle = NativeMethods.FindWindowEx(
            taskbarHandle,
            IntPtr.Zero,
            "Windows.UI.Composition.DesktopWindowContentBridge",
            null);
        bool isWindows11 =
            bridgeHandle != IntPtr.Zero ||
            Environment.OSVersion.Version.Build >= 22000;

        if (isWindows11)
        {
            IntPtr notifyHandle = NativeMethods.FindWindowEx(taskbarHandle, IntPtr.Zero, "TrayNotifyWnd", null);
            if (notifyHandle == IntPtr.Zero)
            {
                return TaskbarHostContext.Fail("未找到 Windows 11 任务栏通知区窗口。");
            }

            Rectangle notifyRect = GetWindowRectangleOrThrow(notifyHandle, "读取 Windows 11 通知区位置失败。");
            Rectangle? anchorRect = FindWindows11AnchorRect(notifyHandle, notifyRect);
            return new TaskbarHostContext(
                taskbarHandle,
                notifyHandle,
                IntPtr.Zero,
                true,
                taskbarRect,
                notifyRect,
                notifyRect,
                null,
                null,
                anchorRect);
        }

        IntPtr parentHandle = NativeMethods.FindWindowEx(taskbarHandle, IntPtr.Zero, "ReBarWindow32", null);
        if (parentHandle == IntPtr.Zero)
        {
            parentHandle = NativeMethods.FindWindowEx(taskbarHandle, IntPtr.Zero, "WorkerW", null);
        }

        if (parentHandle == IntPtr.Zero)
        {
            return TaskbarHostContext.Fail("未找到经典任务栏容器窗口。");
        }

        IntPtr resizeTargetHandle = NativeMethods.FindWindowEx(parentHandle, IntPtr.Zero, "MSTaskSwWClass", null);
        if (resizeTargetHandle == IntPtr.Zero)
        {
            resizeTargetHandle = NativeMethods.FindWindowEx(parentHandle, IntPtr.Zero, "MSTaskListWClass", null);
        }

        if (resizeTargetHandle == IntPtr.Zero)
        {
            return TaskbarHostContext.Fail("未找到经典任务栏按钮区域。");
        }

        return new TaskbarHostContext(
            taskbarHandle,
            parentHandle,
            resizeTargetHandle,
            false,
            taskbarRect,
            GetWindowRectangleOrThrow(parentHandle, "读取经典任务栏容器位置失败。"),
            null,
            GetWindowRectangleOrThrow(resizeTargetHandle, "读取经典任务栏按钮区域失败。"),
            null);
    }

    private void EnsureChildWindowStyle(IntPtr handle)
    {
        if (!originalWindowStyleCaptured)
        {
            originalWindowStyle = NativeMethods.GetWindowLongPtr(handle, NativeMethods.GwlStyle);
            originalWindowExStyle = NativeMethods.GetWindowLongPtr(handle, NativeMethods.GwlExStyle);
            originalWindowStyleCaptured = true;
        }

        nint childStyle = (originalWindowStyle | NativeMethods.WsChild) & ~NativeMethods.WsPopup;
        nint childExStyle = (originalWindowExStyle | NativeMethods.WsExToolWindow) & ~NativeMethods.WsExAppWindow;

        NativeMethods.SetWindowLongPtr(handle, NativeMethods.GwlStyle, childStyle);
        NativeMethods.SetWindowLongPtr(handle, NativeMethods.GwlExStyle, childExStyle);
        NativeMethods.SetWindowPos(
            handle,
            IntPtr.Zero,
            0,
            0,
            0,
            0,
            NativeMethods.SwpNoMove |
            NativeMethods.SwpNoSize |
            NativeMethods.SwpNoZOrder |
            NativeMethods.SwpNoActivate |
            NativeMethods.SwpFrameChanged);
    }

    private void EnsureOverlayWindowStyle(IntPtr handle)
    {
        if (!originalWindowStyleCaptured)
        {
            originalWindowStyle = NativeMethods.GetWindowLongPtr(handle, NativeMethods.GwlStyle);
            originalWindowExStyle = NativeMethods.GetWindowLongPtr(handle, NativeMethods.GwlExStyle);
            originalWindowStyleCaptured = true;
        }

        nint overlayStyle = (originalWindowStyle | NativeMethods.WsPopup) & ~NativeMethods.WsChild;
        nint overlayExStyle =
            (originalWindowExStyle |
             NativeMethods.WsExToolWindow |
             NativeMethods.WsExNoActivate |
             NativeMethods.WsExLayered) &
            ~NativeMethods.WsExAppWindow;

        NativeMethods.SetWindowLongPtr(handle, NativeMethods.GwlStyle, overlayStyle);
        NativeMethods.SetWindowLongPtr(handle, NativeMethods.GwlExStyle, overlayExStyle);
        NativeMethods.SetWindowPos(
            handle,
            IntPtr.Zero,
            0,
            0,
            0,
            0,
            NativeMethods.SwpNoMove |
            NativeMethods.SwpNoSize |
            NativeMethods.SwpNoZOrder |
            NativeMethods.SwpNoActivate |
            NativeMethods.SwpFrameChanged);
    }

    private void RestoreOriginalWindowStyle(IntPtr handle)
    {
        if (!originalWindowStyleCaptured)
        {
            return;
        }

        NativeMethods.SetWindowLongPtr(handle, NativeMethods.GwlStyle, originalWindowStyle);
        NativeMethods.SetWindowLongPtr(handle, NativeMethods.GwlExStyle, originalWindowExStyle);
        NativeMethods.SetWindowPos(
            handle,
            IntPtr.Zero,
            0,
            0,
            0,
            0,
            NativeMethods.SwpNoMove |
            NativeMethods.SwpNoSize |
            NativeMethods.SwpNoZOrder |
            NativeMethods.SwpNoActivate |
            NativeMethods.SwpFrameChanged);
    }

    private void EnsureParent(IntPtr handle, IntPtr parentHandle)
    {
        if (attachedParentHandle == parentHandle && NativeMethods.GetParent(handle) == parentHandle)
        {
            lastParentWindowClass = GetClassName(parentHandle);
            return;
        }

        if (reservedHandle != IntPtr.Zero && attachedParentHandle != parentHandle)
        {
            RestoreReservedSpace();
        }

        if (NativeMethods.SetParent(handle, parentHandle) == IntPtr.Zero)
        {
            int errorCode = Marshal.GetLastWin32Error();
            if (errorCode != 0)
            {
                throw new Win32Exception(errorCode, "将监控窗口嵌入任务栏失败。");
            }
        }

        attachedParentHandle = parentHandle;
        lastParentWindowClass = GetClassName(parentHandle);
    }

    private void ReserveTaskListSpace(TaskbarHostContext context, int widgetWidth)
    {
        Rectangle parentRect = GetWindowRectangleOrThrow(context.ParentHandle, "读取经典任务栏容器位置失败。");
        Rectangle currentReservedRect = GetWindowRectangleOrThrow(
            context.ResizeTargetHandle,
            "读取经典任务栏按钮区域失败。");
        Rectangle localReservedRect = ToLocalRectangle(parentRect, currentReservedRect);

        if (reservedHandle != context.ResizeTargetHandle)
        {
            RestoreReservedSpace();
            reservedHandle = context.ResizeTargetHandle;
            originalReservedBounds = localReservedRect;
        }

        int nextWidth = originalReservedBounds.Width - widgetWidth - WidgetSpacing;
        if (nextWidth < MinTaskListWidth)
        {
            throw new InvalidOperationException("当前任务栏按钮过多，可用空间不足以嵌入监控窗口。");
        }

        MoveOrThrow(
            context.ResizeTargetHandle,
            new Rectangle(
                originalReservedBounds.X,
                originalReservedBounds.Y,
                nextWidth,
                originalReservedBounds.Height));
    }

    private void RestoreReservedSpace()
    {
        if (reservedHandle == IntPtr.Zero || originalReservedBounds.IsEmpty || !NativeMethods.IsWindow(reservedHandle))
        {
            reservedHandle = IntPtr.Zero;
            originalReservedBounds = Rectangle.Empty;
            return;
        }

        try
        {
            MoveOrThrow(reservedHandle, originalReservedBounds);
        }
        catch
        {
            // Explorer 重建时恢复可能已经来不及，允许静默失败，后续重新探测句柄即可。
        }
        finally
        {
            reservedHandle = IntPtr.Zero;
            originalReservedBounds = Rectangle.Empty;
        }
    }

    private static Rectangle CalculateEmbeddedBounds(TaskbarHostContext context, Size widgetSize)
    {
        if (context.IsWindows11)
        {
            if (context.NotifyRect is null)
            {
                throw new InvalidOperationException("Windows 11 通知区信息缺失。");
            }

            Rectangle anchorRect = context.AnchorRect ?? context.NotifyRect.Value;
            Rectangle taskbarRect = context.TaskbarRect;
            int widgetX = Math.Max(0, anchorRect.Left - widgetSize.Width - WidgetSpacing - Win11RightInset);
            int widgetY = taskbarRect.Top + Math.Max(0, (taskbarRect.Height - widgetSize.Height) / 2);
            return new Rectangle(widgetX, widgetY, widgetSize.Width, widgetSize.Height);
        }

        if (context.ResizeTargetHandle == IntPtr.Zero)
        {
            throw new InvalidOperationException("经典任务栏按钮区域信息缺失。");
        }

        Rectangle parentRect = GetWindowRectangleOrThrow(context.ParentHandle, "读取经典任务栏容器位置失败。");
        Rectangle resizeRect = GetWindowRectangleOrThrow(context.ResizeTargetHandle, "读取经典任务栏按钮区域失败。");
        Rectangle localResizeRect = ToLocalRectangle(parentRect, resizeRect);
        int widgetXInParent = localResizeRect.Right + WidgetSpacing + Win11LeftInset;
        int widgetYInParent = Math.Max(0, (parentRect.Height - widgetSize.Height) / 2);
        return new Rectangle(widgetXInParent, widgetYInParent, widgetSize.Width, widgetSize.Height);
    }

    private static Rectangle GetWindowRectangleOrThrow(IntPtr handle, string message)
    {
        if (!NativeMethods.GetWindowRect(handle, out Rect rect))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), message);
        }

        return Rectangle.FromLTRB(rect.Left, rect.Top, rect.Right, rect.Bottom);
    }

    private static Rectangle ToLocalRectangle(Rectangle parent, Rectangle child)
    {
        return new Rectangle(
            child.Left - parent.Left,
            child.Top - parent.Top,
            child.Width,
            child.Height);
    }

    private static void MoveOrThrow(IntPtr handle, Rectangle bounds)
    {
        if (!NativeMethods.MoveWindow(handle, bounds.X, bounds.Y, bounds.Width, bounds.Height, true))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "调整任务栏监控窗口位置失败。");
        }
    }

    private static void MoveEmbeddedWindowOrThrow(IntPtr handle, Rectangle bounds)
    {
        if (!NativeMethods.SetWindowPos(
                handle,
                NativeMethods.HwndTop,
                bounds.X,
                bounds.Y,
                bounds.Width,
                bounds.Height,
                EmbeddedWindowPositionFlags))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "更新任务栏监控窗口层级失败。");
        }
    }

    private static void MoveOverlayWindowOrThrow(IntPtr handle, Rectangle bounds)
    {
        if (!NativeMethods.SetWindowPos(
                handle,
                NativeMethods.HwndTopMost,
                bounds.X,
                bounds.Y,
                bounds.Width,
                bounds.Height,
                OverlayWindowPositionFlags))
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "更新任务栏覆盖窗口层级失败。");
        }
    }

    private TaskbarEmbeddingResult Fail(string error)
    {
        return TaskbarEmbeddingResult.Fail(error, lastStage, lastParentWindowClass, lastEmbeddedBounds);
    }

    private static string? GetClassName(IntPtr handle)
    {
        if (handle == IntPtr.Zero)
        {
            return null;
        }

        StringBuilder buffer = new(256);
        int copied = NativeMethods.GetClassName(handle, buffer, buffer.Capacity);
        return copied > 0 ? buffer.ToString(0, copied) : null;
    }

    private static string? FormatBounds(Rectangle? bounds)
    {
        return bounds is { } rect ? $"{rect.X},{rect.Y},{rect.Width},{rect.Height}" : null;
    }

    private static Rectangle? FindWindows11AnchorRect(IntPtr notifyHandle, Rectangle notifyRect)
    {
        Rectangle? best = null;
        foreach (IntPtr child in EnumerateDescendantWindows(notifyHandle))
        {
            if (!NativeMethods.IsWindowVisible(child))
            {
                continue;
            }

            if (!NativeMethods.GetWindowRect(child, out Rect rawRect))
            {
                continue;
            }

            Rectangle rect = Rectangle.FromLTRB(rawRect.Left, rawRect.Top, rawRect.Right, rawRect.Bottom);
            if (rect.Width <= 0 || rect.Height <= 0)
            {
                continue;
            }

            if (!notifyRect.IntersectsWith(rect))
            {
                continue;
            }

            best = best is null || rect.Left < best.Value.Left ? rect : best;
        }

        return best;
    }

    private static IEnumerable<IntPtr> EnumerateDescendantWindows(IntPtr parentHandle)
    {
        IntPtr child = IntPtr.Zero;
        while ((child = NativeMethods.FindWindowEx(parentHandle, child, null, null)) != IntPtr.Zero)
        {
            yield return child;
            foreach (IntPtr descendant in EnumerateDescendantWindows(child))
            {
                yield return descendant;
            }
        }
    }
}

internal sealed record TaskbarEmbeddingResult(
    bool IsEmbedded,
    string? Error,
    Rectangle? Bounds,
    string? Stage,
    string? ParentWindowClass)
{
    public static TaskbarEmbeddingResult Success(
        Rectangle bounds,
        string? stage,
        string? parentWindowClass)
    {
        return new TaskbarEmbeddingResult(true, null, bounds, stage, parentWindowClass);
    }

    public static TaskbarEmbeddingResult Fail(
        string error,
        string? stage,
        string? parentWindowClass,
        Rectangle? bounds)
    {
        return new TaskbarEmbeddingResult(false, error, bounds, stage, parentWindowClass);
    }
}

internal sealed record TaskbarHostContext(
    IntPtr TaskbarHandle,
    IntPtr ParentHandle,
    IntPtr ResizeTargetHandle,
    bool IsWindows11,
    Rectangle TaskbarRect,
    Rectangle ParentRect,
    Rectangle? NotifyRect,
    Rectangle? ResizeTargetRect,
    string? Error,
    Rectangle? AnchorRect = null)
{
    public static TaskbarHostContext Fail(string error)
    {
        return new TaskbarHostContext(
            IntPtr.Zero,
            IntPtr.Zero,
            IntPtr.Zero,
            false,
            Rectangle.Empty,
            Rectangle.Empty,
            null,
            null,
            error,
            null);
    }
}
