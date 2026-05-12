# 系统监控任务栏小窗退役说明

## 当前结论

`system-monitor` 的 Windows 原生任务栏小窗链路已经从主代码中删除，不再保留设置入口、运行时协议、诊断状态或 WinForms 嵌入实现。

当前保留的系统监控展示入口只有：

- 应用顶栏右上角的 header widget
- 控制中心卡片
- 插件页总览与设置页

## 本次删除范围

本轮已删除以下内容：

- Renderer / Main DTO 中的 taskbar widget 设置与诊断字段
- Main 与 helper 之间的 taskbar status / debug 协议
- 设置页中的任务栏小窗配置入口
- Windows helper 中的 WinForms 任务栏宿主与嵌入窗口代码
- 插件页里仅服务任务栏诊断的样式和说明

## 保留内容

`WindowsMonitorHelper` 仍然保留，但职责已经收口为纯采样 sidecar：

- 继续负责 CPU / 内存 / 网络 / 可选 GPU 采样
- 继续参与 `dev / build / package` 构建链
- 不再承担任何任务栏 UI 展示职责

## 为什么直接删除

当前产品已经不再需要 Windows 原生任务栏小窗。继续保留旧设置、旧协议和旧 WinForms 宿主，只会带来三类问题：

- 把“采样事实”和“任务栏投影”混成同一个 owner
- 让 DTO、样式和测试长期背着失效字段
- 让 helper 持续保留没有业务价值的 Windows UI 维护成本

因此这次不再采用“暂时下线”策略，而是把整条链路从主实现里摘除，只保留系统监控采样主链。
