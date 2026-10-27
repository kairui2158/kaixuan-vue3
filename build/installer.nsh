!macro customUnInstall
  ; Do NOT delete user data in Documents folder
  ; User data defaults to D:\神意助手数据, with a Documents fallback
  ; This directory must survive uninstall for data persistence across versions
  MessageBox MB_YESNO|MB_ICONINFORMATION "卸载将仅删除程序文件。$\n$\n您的项目数据、API配置和SKILL技能默认保存在: D:\神意助手数据（若 D 盘不可用，则保存在“文档\神意助手数据”）。$\n这些数据不会被删除，安装新版本后可直接读取。$\n$\n是否继续卸载?" IDYES +2
    Abort
!macroend
