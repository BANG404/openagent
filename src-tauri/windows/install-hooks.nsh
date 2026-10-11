; The updater launches NSIS before the old host exits. Wait before changing any
; installed bytes, including when the manual installer invokes an uninstaller.
!include LogicLib.nsh
!define /ifndef OPENAGENT_INSTALL_WAIT_MS 30000
!define /ifndef OPENAGENT_INSTALL_POLL_MS 250

LangString OpenAgentWaiting 1033 "Waiting for OpenAgent to exit and release installed files..."
LangString OpenAgentWaiting 2052 "正在等待 OpenAgent 退出并释放安装文件…"
LangString OpenAgentWaitTimeout 1033 "OpenAgent is still using its installed files. Close all OpenAgent windows and try again. Installation has not changed any files."
LangString OpenAgentWaitTimeout 2052 "OpenAgent 仍在使用安装文件。请退出所有 OpenAgent 窗口后重试。安装文件尚未修改。"
LangString OpenAgentWaitError 1033 "Unable to check access to the installed files. Installation has stopped before changing any files."
LangString OpenAgentWaitError 2052 "无法检查安装文件的访问权限。安装已停止，安装文件尚未修改。"

Var OpenAgentProbeError
Var OpenAgentProbeFile
Var OpenAgentWaitStarted

; A running executable and temporary incompatible file handles prevent an
; exclusive read/write/delete open. Scan the exact target tree so workspace
; hosts and bundled resources are covered without killing same-name processes.
!macro OpenAgentProbeFunctions PREFIX
Function ${PREFIX}OpenAgentProbeTree
  Exch $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  StrCpy $2 0
  System::Call 'kernel32::GetFileAttributesW(w r0) i .r3 ?e'
  Pop $4
  ${If} $3 == -1
    ${If} $4 != 2
    ${AndIf} $4 != 3
      StrCpy $OpenAgentProbeError $4
      StrCpy $OpenAgentProbeFile $0
    ${EndIf}
    Goto done
  ${EndIf}
  IntOp $5 $3 & 0x400
  ${If} $5 != 0
    StrCpy $OpenAgentProbeError 4390
    StrCpy $OpenAgentProbeFile $0
    Goto done
  ${EndIf}
  ; WIN32_FIND_DATAW is 592 bytes. Capture LastError in the same System call;
  ; another plugin invocation can overwrite the thread's Win32 error value.
  System::Alloc 592
  Pop $2
  System::Call 'kernel32::FindFirstFileW(w "$0\*", p r2) p .r1 ?e'
  Pop $4
  ${If} $1 == -1
    ${If} $4 != 2
    ${AndIf} $4 != 3
    ${AndIf} $4 != 18
      StrCpy $OpenAgentProbeError $4
      StrCpy $OpenAgentProbeFile $0
    ${EndIf}
    Goto done
  ${EndIf}
  ${Do}
    IntOp $5 $2 + 44
    System::Call '*$5(&w260 .r3)'
    ${If} $3 != "."
    ${AndIf} $3 != ".."
      ; Never traverse directory reparse points. Legacy fastembed snapshots
      ; contain file symlinks: inspect those link objects without resolving
      ; their blob targets. Other installed paths still refuse reparse points.
      System::Call '*$2(i .r4)'
      IntOp $5 $4 & 0x400
      ${If} $5 != 0
        IntOp $5 $4 & 0x10
        ${If} $5 != 0
          Goto refuse_reparse
        ${EndIf}
        StrLen $6 "$INSTDIR\.fastembed_cache\"
        StrCpy $6 "$0\" $6
        ${If} $6 != "$INSTDIR\.fastembed_cache\"
          Goto refuse_reparse
        ${EndIf}
        ; WIN32_FIND_DATAW.dwReserved0 is the reparse tag at offset 36.
        IntOp $5 $2 + 36
        System::Call '*$5(i .r5)'
        ${If} $5 <> 0xA000000C
          Goto refuse_reparse
        ${EndIf}
      ${EndIf}
      IntOp $5 $4 & 0x10
      ${If} $5 != 0
        Push "$0\$3"
        Call ${PREFIX}OpenAgentProbeTree
      ${Else}
        ; A manually invoked uninstaller can be executing from this directory.
        StrCmp "$0\$3" $EXEPATH next
        ; OPEN_EXISTING and no truncation: this only checks access, never writes.
        ; OPEN_REPARSE_POINT also prevents a file swapped to a link from
        ; resolving to a target during this non-writing access probe.
        System::Call 'kernel32::CreateFileW(w "$0\$3", i 0xC0010000, i 0, p 0, i 3, i 0x00200000, p 0) p .r5 ?e'
        Pop $4
        ${If} $5 == -1
          ; Files disappearing during orderly shutdown are already released.
          ${If} $4 != 2
          ${AndIf} $4 != 3
            StrCpy $OpenAgentProbeError $4
            StrCpy $OpenAgentProbeFile "$0\$3"
          ${EndIf}
        ${Else}
          System::Call 'kernel32::CloseHandle(p r5)'
        ${EndIf}
      ${EndIf}
      Goto next
      refuse_reparse:
      StrCpy $OpenAgentProbeError 4390
      StrCpy $OpenAgentProbeFile "$0\$3"
    ${EndIf}
    next:
    ${If} $OpenAgentProbeError != 0
      ${ExitDo}
    ${EndIf}
    System::Call 'kernel32::FindNextFileW(p r1, p r2) i .r4 ?e'
    Pop $5
    ${If} $4 == 0
      ${If} $5 != 18
        StrCpy $OpenAgentProbeError $5
        StrCpy $OpenAgentProbeFile $0
      ${EndIf}
      ${ExitDo}
    ${EndIf}
  ${Loop}
  System::Call 'kernel32::FindClose(p r1)'
  done:
  System::Free $2
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function ${PREFIX}OpenAgentWaitForRelease
  Push $0
  DetailPrint "$(OpenAgentWaiting)"
  System::Call 'kernel32::GetTickCount() i .s'
  Pop $OpenAgentWaitStarted
  ${Do}
    StrCpy $OpenAgentProbeError 0
    StrCpy $OpenAgentProbeFile ""
    Push "$INSTDIR"
    Call ${PREFIX}OpenAgentProbeTree
    ${If} $OpenAgentProbeError == 0
      Pop $0
      Return
    ${EndIf}
    ; Only sharing/lock violations are transient. Permission and other failures
    ; fail immediately rather than retrying a broken installation indefinitely.
    ${If} $OpenAgentProbeError != 32
    ${AndIf} $OpenAgentProbeError != 33
      DetailPrint "$(OpenAgentWaitError) ($OpenAgentProbeError): $OpenAgentProbeFile"
      !ifdef OPENAGENT_INSTALL_TEST_LOG
        FileOpen $0 "${OPENAGENT_INSTALL_TEST_LOG}" w
        FileWriteUTF16LE $0 "$OpenAgentProbeError: $OpenAgentProbeFile"
        FileClose $0
      !endif
      SetErrorLevel 2
      MessageBox MB_ICONSTOP|MB_OK "$(OpenAgentWaitError) ($OpenAgentProbeError): $OpenAgentProbeFile" /SD IDOK
      Quit
    ${EndIf}
    System::Call 'kernel32::GetTickCount() i .s'
    Pop $0
    IntOp $0 $0 - $OpenAgentWaitStarted
    ${If} $0 >= ${OPENAGENT_INSTALL_WAIT_MS}
      DetailPrint "$(OpenAgentWaitTimeout): $OpenAgentProbeFile"
      !ifdef OPENAGENT_INSTALL_TEST_LOG
        FileOpen $0 "${OPENAGENT_INSTALL_TEST_LOG}" w
        FileWriteUTF16LE $0 "$OpenAgentProbeError: $OpenAgentProbeFile"
        FileClose $0
      !endif
      SetErrorLevel 2
      MessageBox MB_ICONSTOP|MB_OK "$(OpenAgentWaitTimeout)" /SD IDOK
      Quit
    ${EndIf}
    Sleep ${OPENAGENT_INSTALL_POLL_MS}
  ${Loop}
FunctionEnd
!macroend

!insertmacro OpenAgentProbeFunctions ""
!insertmacro OpenAgentProbeFunctions "un."

; This invisible page runs after .onInit restored the previous installation,
; before the maintenance page can launch a legacy uninstaller without hooks.
; /UPDATE skips that uninstall; silent installs still have the preinstall gate.
Page custom OpenAgentWaitBeforeMaintenance
Function OpenAgentWaitBeforeMaintenance
  Call OpenAgentWaitForRelease
  Abort
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  Call OpenAgentWaitForRelease
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Call un.OpenAgentWaitForRelease
!macroend

; Tauri's pinned template otherwise force-kills by executable name after the
; hook. Our target-scoped gate already checked all bytes; leave unrelated
; installations and development hosts alone.
!ifmacrodef CheckIfAppIsRunning
  !macroundef CheckIfAppIsRunning
!endif
!macro CheckIfAppIsRunning executablePath productName
!macroend
