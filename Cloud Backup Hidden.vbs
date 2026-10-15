'============================================================
'  نسخة احتياطية على GitHub — تشغيل صامت (بيشغّله Task Scheduler يومياً)
'  السجلّ في logs\cloud-backup.log
' ============================================================
Option Explicit
Dim sh, fso, root
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root

' 0 = نافذة مخفية ، True = ننتظر لحد ما يخلص
sh.Run "node """ & fso.BuildPath(root, "scripts\cloud-backup.mjs") & """", 0, True
