import CoreGraphics
import Foundation

func pressKey(keyCode: CGKeyCode, useCommand: Bool = false) {
    let src = CGEventSource(stateID: .hidSystemState)
    let down = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: true)
    let up = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: false)
    
    if useCommand {
        down?.flags = .maskCommand
        up?.flags = .maskCommand
    }
    
    down?.post(tap: .cghidEventTap)
    up?.post(tap: .cghidEventTap)
}

let args = CommandLine.arguments
if args.count < 2 { exit(1) }

let action = args[1]
if action == "delete" {
    let count = Int(args[2]) ?? 1
    for _ in 0..<count {
        pressKey(keyCode: 51) // 51 is delete
        Thread.sleep(forTimeInterval: 0.01)
    }
} else if action == "paste" {
    pressKey(keyCode: 9, useCommand: true) // 9 is 'v'
}
