; MediScribe Windows Installer Custom Script

; Request administrator privileges
RequestExecutionLevel admin

; Custom installer pages
!define MUI_WELCOMEPAGE_TITLE "Welcome to MediScribe Setup"
!define MUI_WELCOMEPAGE_TEXT "MediScribe is an AI-powered medical transcription tool designed for healthcare professionals.$\r$\n$\r$\nThis installer will guide you through the installation process.$\r$\n$\r$\nClick Next to continue."

; Installation directory info
!define MUI_DIRECTORYPAGE_TEXT_TOP "MediScribe will be installed in the following folder. To install in a different folder, click Browse and select another folder.$\r$\n$\r$\nNote: MediScribe requires approximately 2GB of disk space for the AI models."

; Finish page customization
!define MUI_FINISHPAGE_TITLE "MediScribe Installation Complete"
!define MUI_FINISHPAGE_TEXT "MediScribe has been successfully installed on your computer.$\r$\n$\r$\nKey Features:$\r$\n• Offline AI transcription using Whisper$\r$\n• Direct typing into Word and other applications$\r$\n• Global keyboard shortcuts (Ctrl+Shift+M to show/hide)$\r$\n• System tray integration$\r$\n$\r$\nClick Finish to complete the installation."

; !define MUI_FINISHPAGE_RUN "$INSTDIR\MediScribe.exe"
; !define MUI_FINISHPAGE_RUN_TEXT "Launch MediScribe now"

; Custom functions
Function .onInstSuccess
    ; Create desktop shortcut with medical icon
    CreateShortCut "$DESKTOP\MediScribe.lnk" "$INSTDIR\MediScribe.exe" "" "$INSTDIR\MediScribe.exe" 0
    
    ; Create start menu shortcuts
    CreateDirectory "$SMPROGRAMS\MediScribe"
    CreateShortCut "$SMPROGRAMS\MediScribe\MediScribe.lnk" "$INSTDIR\MediScribe.exe" "" "$INSTDIR\MediScribe.exe" 0
    CreateShortCut "$SMPROGRAMS\MediScribe\Uninstall MediScribe.lnk" "$INSTDIR\Uninstall MediScribe.exe"
FunctionEnd
