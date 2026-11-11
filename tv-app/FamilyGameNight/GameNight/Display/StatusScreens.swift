import SwiftUI

/// Shown until the first update arrives, or when the server can't be reached.
struct ConnectingScreen: View {
    let client: GameNightClient
    let onChangeServer: () -> Void
    let onExit: () -> Void

    private var addressText: String { client.address?.text ?? "the server" }

    var body: some View {
        VStack(spacing: 40) {
            Text("Jeopardy")
                .font(JP.display(120))
                .foregroundStyle(JP.gold)

            if case .failed(let reason) = client.connection {
                Text("Can't reach \(addressText)")
                    .font(JP.text(54))
                Text(reason)
                    .font(JP.text(36, .medium))
                    .foregroundStyle(JP.softWhite)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 1100)
                Text("Check that the server is running and on the same network as this Apple TV. If it asked to find devices on your network, choose Allow. It keeps trying by itself.")
                    .font(JP.text(30, .medium))
                    .foregroundStyle(JP.muted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 1100)
            } else {
                ProgressView()
                    .scaleEffect(1.6)
                    .padding(.vertical, 16)
                Text("Connecting to \(addressText)…")
                    .font(JP.text(46, .medium))
                    .foregroundStyle(JP.softWhite)
            }

            if let readError = client.readError {
                Text(readError)
                    .font(JP.text(30, .medium))
                    .foregroundStyle(JP.pink)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 1100)
            }

            HStack(spacing: 40) {
                Button("Change server", action: onChangeServer)
                Button("Back to games", action: onExit)
            }
            .padding(.top, 16)
        }
        .padding(80)
    }
}

/// The server is running a game this version of the app can't draw yet.
struct UnsupportedGameScreen: View {
    let id: String

    var body: some View {
        VStack(spacing: 28) {
            Text("This game isn't on the Apple TV yet")
                .font(JP.display(90))
                .foregroundStyle(JP.gold)
                .multilineTextAlignment(.center)
            Text("The server is running “\(id)”, which this version of Family Game Night can't show. Ask the host to pick Jeopardy, or update the app.")
                .font(JP.text(38, .medium))
                .foregroundStyle(JP.softWhite)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 1200)
        }
        .padding(80)
    }
}

/// Typing the server's address, once. It is remembered after that.
struct ServerAddressView: View {
    @State private var text: String
    @State private var message: String?
    /// Called with what was typed. Returns an error message, or nil if it worked.
    let onConnect: (String) -> String?
    let onBack: () -> Void

    init(initialText: String, onConnect: @escaping (String) -> String?, onBack: @escaping () -> Void) {
        _text = State(initialValue: initialText)
        self.onConnect = onConnect
        self.onBack = onBack
    }

    var body: some View {
        ZStack {
            JeopardyBackground()
            VStack(spacing: 34) {
                Text("Connect to your Game Night server")
                    .font(JP.display(90))
                    .foregroundStyle(JP.gold)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.6)
                Text("Type the address the server shows when it starts, for example 192.168.1.50:3000 or gamenight.local. You only need to do this once.")
                    .font(JP.text(36, .medium))
                    .foregroundStyle(JP.softWhite)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 1200)

                TextField("gamenight.local", text: $text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled(true)
                    .frame(maxWidth: 900)
                    .onSubmit(connect)

                if let message {
                    Text(message)
                        .font(JP.text(32, .medium))
                        .foregroundStyle(JP.pink)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 1100)
                }

                HStack(spacing: 36) {
                    Button("Connect", action: connect)
                    Button("Use gamenight.local") { text = "gamenight.local" }
                    Button("Back", action: onBack)
                }
                .padding(.top, 8)
            }
            .padding(80)
        }
        .onExitCommand(perform: onBack)
    }

    private func connect() {
        message = onConnect(text)
    }
}
