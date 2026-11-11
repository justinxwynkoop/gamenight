import SwiftUI

/// The Jeopardy tile: asks for the server's address the first time, then shows
/// the game on the TV. Everything else (buzzing, judging, picking clues) happens
/// on phones, against the Game Night server (github.com/justinxwynkoop/gamenight).
struct JeopardyRootView: View {
    let onExit: () -> Void

    @State private var client = GameNightClient()
    @State private var address: ServerAddress? = ServerSettings.load()
    @State private var editing = (ServerSettings.load() == nil)

    var body: some View {
        // A ZStack, not a Group: onAppear/onDisappear below must fire once for the
        // whole Jeopardy screen, not each time the form and display swap places.
        ZStack {
            if editing || address == nil {
                ServerAddressView(
                    initialText: address?.text ?? "",
                    onConnect: connect,
                    onBack: back
                )
            } else {
                JeopardyDisplayView(
                    client: client,
                    onChangeServer: { editing = true },
                    onExit: onExit
                )
            }
        }
        .onAppear {
            if let address, !editing { client.connect(to: address) }
        }
        .onDisappear { client.disconnect() }
        // Remember an address only once it has really connected, so a typo is not kept.
        .onChange(of: client.connection) { _, connection in
            if connection == .connected, let connected = client.address {
                ServerSettings.save(connected)
            }
        }
    }

    /// Returns an error message to show, or nil once connected.
    private func connect(_ text: String) -> String? {
        guard let parsed = ServerAddress.parse(text) else {
            return "That doesn't look like an address. Try something like 192.168.1.50:3000 or gamenight.local."
        }
        address = parsed
        client.connect(to: parsed)
        editing = false
        return nil
    }

    /// Back from the address page: return to the live display if we are connected
    /// (the page was opened from its menu), otherwise leave to the game picker.
    private func back() {
        if client.connection == .connected {
            editing = false
        } else {
            onExit()
        }
    }
}
