import Cocoa

final class AppDelegate: NSObject, NSApplicationDelegate {
    var server: Process?
    var statusItem: NSStatusItem!
    let address = URL(string: "http://127.0.0.1:8788/")!
    var attempts = 0
    var starting = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "SB"
        statusItem.button?.toolTip = "Sportsboard"
        let menu = NSMenu()
        let open = menu.addItem(withTitle: "Open Sportsboard in Safari", action: #selector(openBoard), keyEquivalent: "o")
        open.target = self
        menu.addItem(.separator())
        let quit = menu.addItem(withTitle: "Quit Sportsboard", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        statusItem.menu = menu
        startServer()
    }

    func startServer() {
        guard let resources = Bundle.main.resourceURL else { return }
        let process = Process()
        process.executableURL = resources.appendingPathComponent("node")
        process.arguments = [resources.appendingPathComponent("sportsboard/server.mjs").path]
        var environment = ProcessInfo.processInfo.environment
        environment["PORT"] = "8788"
        process.environment = environment
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        server = process
        starting = true
        do {
            try process.run()
            checkReady()
        } catch {
            showError("The local scoreboard server could not start.\n\(error.localizedDescription)")
        }
    }

    func checkReady() {
        guard server?.isRunning == true else {
            showError("The scoreboard server stopped. Port 8788 may already be in use. Quit any other Sportsboard launcher and try again.")
            return
        }
        var request = URLRequest(url: address)
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                if error == nil, let response = response as? HTTPURLResponse, response.statusCode == 200,
                   let data = data, String(data: data, encoding: .utf8)?.contains("Sportsboard") == true {
                    self.starting = false
                    self.openBoard()
                } else {
                    self.attempts += 1
                    if self.attempts >= 30 {
                        self.showError("The local scoreboard did not become ready. Please quit and reopen Sportsboard.")
                    } else {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.checkReady() }
                    }
                }
            }
        }.resume()
    }

    @objc func openBoard() {
        guard !starting else { return }
        guard let safari = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Safari") else {
            showError("Safari could not be found on this Mac.")
            return
        }
        let configuration = NSWorkspace.OpenConfiguration()
        NSWorkspace.shared.open([address], withApplicationAt: safari, configuration: configuration) { _, error in
            if let error = error {
                DispatchQueue.main.async { self.showError("Could not open Safari.\n\(error.localizedDescription)") }
            }
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openBoard()
        return false
    }

    func showError(_ message: String) {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "Sportsboard"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }

    @objc func quitApp() { NSApp.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) {
        if server?.isRunning == true { server?.terminate() }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
