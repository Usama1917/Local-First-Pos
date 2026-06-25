' ============================================================
'  نظام المحل - تشغيل صامت (بدون نافذة سوداء)
'  يشغّل "Start POS.bat" بشكل مخفي. ده الملف المناسب لاختصار سطح المكتب.
'  السجلّ بيتكتب في logs\pos-server.log لو احتجت تتابع أي مشكلة.
' ============================================================
Option Explicit
Dim sh, fso, batPath
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

batPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "Start POS.bat")

' 0 = نافذة مخفية ، False = ما ننتظرش انتهاء التشغيل
sh.Run """" & batPath & """", 0, False
