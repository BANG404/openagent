Unicode true
RequestExecutionLevel user
Name "OpenAgent installer wait fixture"
OutFile "${FIXTURE_OUTPUT}"
InstallDir "${FIXTURE_INSTALL_DIR}"
!include LogicLib.nsh
!include MUI2.nsh
; Model the upstream template's destructive check: the hook must replace it.
!macro CheckIfAppIsRunning executablePath productName
  SetErrorLevel 9
  Quit
!macroend
!include "${OPENAGENT_HOOKS}"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "SimpChinese"

Function .onInit
  StrCpy $LANGUAGE ${FIXTURE_LANGUAGE}
FunctionEnd
Function un.onInit
  StrCpy $LANGUAGE ${FIXTURE_LANGUAGE}
FunctionEnd

Section Install
  SetOutPath "$INSTDIR"
  !insertmacro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "openagent.exe" "OpenAgent"
  FileOpen $0 "$INSTDIR\installed.txt" w
  FileWrite $0 "installed"
  FileClose $0
  WriteUninstaller "$INSTDIR\uninstall.exe"
  SetAutoClose true
SectionEnd
Section Uninstall
  !insertmacro NSIS_HOOK_PREUNINSTALL
  !insertmacro CheckIfAppIsRunning "openagent.exe" "OpenAgent"
  Delete "$INSTDIR\installed.txt"
  Delete "$INSTDIR\uninstall.exe"
SectionEnd
