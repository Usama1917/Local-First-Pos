' ============================================================
'  ينشئ اختصار على سطح المكتب باسم "نظام المحل"
'  الاختصار بيشغّل "Start POS Hidden.vbs" (تشغيل صامت بدون نافذة).
'  شغّله مرة واحدة بعد الإعداد.
' ============================================================
Option Explicit
Dim sh, fso, scriptDir, desktop, linkPath, lnk

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
desktop   = sh.SpecialFolders("Desktop")
linkPath  = fso.BuildPath(desktop, "نظام المحل.lnk")

Set lnk = sh.CreateShortcut(linkPath)
lnk.TargetPath       = fso.BuildPath(scriptDir, "Start POS Hidden.vbs")
lnk.WorkingDirectory = scriptDir
lnk.WindowStyle      = 7                       ' مصغّر
lnk.Description       = "نظام المحل - نقطة البيع والمخزون"
lnk.IconLocation     = "shell32.dll, 13"       ' أيقونة متجر/صندوق
lnk.Save

MsgBox "تم إنشاء اختصار ""نظام المحل"" على سطح المكتب." & vbCrLf & _
       "دوبل كليك عليه يفتح النظام في المتصفح.", 64, "تم"
