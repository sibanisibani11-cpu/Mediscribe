import CoreGraphics
import Foundation

let source = CGEventSource(stateID: .hidSystemState)
let eventDown = CGEvent(keyboardEventSource: source, virtualKey: 51, keyDown: true)
eventDown?.post(tap: .cghidEventTap)
let eventUp = CGEvent(keyboardEventSource: source, virtualKey: 51, keyDown: false)
eventUp?.post(tap: .cghidEventTap)
print("Success")
