!macro customUnInstall
  ; Do NOT delete user data in Documents folder
  ; User data is stored at: $DOCUMENTS\神意助手数据
  ; This directory must survive uninstall for data persistence across versions
  MessageBox MB_YESNO|MB_ICONINFORMATION "卸载将仅删除程序文件。$\n$\n您的项目数据、API配置和SKILL技能保存在: $DOCUMENTS\神意助手数据$\n这些数据不会被删除，安装新版本后可直接读取。$\n$\n是否继续卸载?" IDYES +2
    Abort
!macroend
