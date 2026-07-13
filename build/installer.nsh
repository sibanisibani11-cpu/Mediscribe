; MediScribe Windows Installer Custom Script

; Request administrator privileges
RequestExecutionLevel admin

; Custom installer pages
!define MUI_WELCOMEPAGE_TITLE "Welcome to MediScribe Setup"
!define MUI_WELCOMEPAGE_TEXT "MediScribe is an AI-powered medical transcription tool designed for healthcare professionals.$\r$\nThis installer will guide you through the installation process.$\r$\n$\r$\nClick Next to continue."

; Installation directory info
!define MUI_DIRECTORYPAGE_TEXT_TOP "MediScribe will be installed in the following folder. To install in a different folder, click Browse and select another folder.$\r$\n$\r$\nNote: MediScribe requires approximately 2GB of disk space for the AI models."

; Finish page customization
!define MUI_FINISHPAGE_TITLE "MediScribe Installation Complete"
!define MUI_FINISHPAGE_TEXT "MediScribe has been successfully installed on your computer.$\r$\n$\r$\nKey Features:$\r$\n• Offline AI transcription using Whisper$\r$\n• Direct typing into Word and other applications$\r$\n• Global keyboard shortcuts (Ctrl+Shift+M to show/hide)$\r$\n• System tray integration$\r$\n$\r$\nClick Finish to complete the installation."

; !define MUI_FINISHPAGE_RUN "$INSTDIR\MediScribe.exe"
; !define MUI_FINISHPAGE_RUN_TEXT "Launch MediScribe now"

; ─── Install Visual C++ 2015-2022 Redistributable (required for whisper-server.exe) ───
!macro customInstall
    DetailPrint "Installing Visual C++ 2015-2022 Redistributable (required for AI engine)..."
    SetDetailsPrint both
    
    ; Check if VC++ Redist is already installed by looking for VCRUNTIME140.dll in system32
    IfFileExists "$SYSDIR\VCRUNTIME140.dll" vcredist_done vcredist_install
    
    vcredist_install:
        ; Copy the bundled VC++ installer from the build resources
        File /oname=$TEMP\vc_redist.x64.exe "${BUILD_RESOURCES_DIR}\vc_redist.x64.exe"
        
        ; Run silently (/install /quiet /norestart)
        ExecWait '"$TEMP\vc_redist.x64.exe" /install /quiet /norestart' $0
        
        ; Clean up
        Delete "$TEMP\vc_redist.x64.exe"
        
        StrCmp $0 "0" vcredist_done
        StrCmp $0 "3010" vcredist_done  ; 3010 = success, reboot required (safe to ignore)
        DetailPrint "VC++ Redistributable installation returned code: $0 (may already be installed)"
    
    vcredist_done:
        DetailPrint "Visual C++ Runtime: OK"
!macroend

; Custom functions
Function .onInstSuccess
    ; Create desktop shortcut with medical icon
    CreateShortCut "$DESKTOP\MediScribe.lnk" "$INSTDIR\MediScribe.exe" "" "$INSTDIR\MediScribe.exe" 0
    
    ; Create start menu shortcuts
    CreateDirectory "$SMPROGRAMS\MediScribe"
    CreateShortCut "$SMPROGRAMS\MediScribe\MediScribe.lnk" "$INSTDIR\MediScribe.exe" "" "$INSTDIR\MediScribe.exe" 0
    CreateShortCut "$SMPROGRAMS\MediScribe\Uninstall MediScribe.lnk" "$INSTDIR\Uninstall MediScribe.exe"
FunctionEnd
