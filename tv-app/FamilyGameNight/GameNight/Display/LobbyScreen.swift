import SwiftUI

/// Before the game starts: the QR code to join and who has joined so far.
struct LobbyScreen: View {
    let state: ServerState
    let joinURL: URL?

    private var title: String { state.jeopardy?.lobbyTitle ?? "Game Night" }

    private var prompt: String {
        if case .noGame = state.game { return "Waiting for the host to pick a game." }
        return state.room.isTeamMode
            ? "Pick a team and get ready to play."
            : "Enter a name, pick a colour and get ready to play."
    }

    var body: some View {
        HStack(spacing: 100) {
            VStack(alignment: .leading, spacing: 28) {
                Text(title)
                    .font(JP.display(120))
                    .foregroundStyle(JP.gold)
                    .lineLimit(2)
                    .minimumScaleFactor(0.5)
                VStack(alignment: .leading, spacing: 8) {
                    Text("Scan the code with your phone camera")
                        .font(JP.text(46, .medium))
                    if let joinURL {
                        Text("or open \(JoinAddress.display(joinURL.absoluteString))")
                            .font(JP.text(40, .medium))
                            .foregroundStyle(JP.softWhite)
                    }
                }
                Text(prompt)
                    .font(JP.text(36, .medium))
                    .foregroundStyle(JP.muted)

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 230), spacing: 16)], alignment: .leading, spacing: 16) {
                    ForEach(state.room.units) { unit in
                        chip(for: unit)
                    }
                }
                .padding(.top, 8)
            }
            Spacer(minLength: 0)
            Group {
                if let joinURL {
                    QRCodeView(text: joinURL.absoluteString)
                } else {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.12))
                }
            }
            .frame(width: 520, height: 520)
        }
        .padding(.horizontal, 100)
        .padding(.vertical, 80)
    }

    private func chip(for unit: ScoreUnit) -> some View {
        let color = Color(playerHex: unit.color)
        let label = state.room.isTeamMode
            ? "\(unit.name) · \(unit.members)"
            : unit.name
        return Text(label)
            .font(JP.text(34))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .foregroundStyle(JP.inkColor(on: unit.color))
            .padding(.horizontal, 26)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(Capsule().fill(color))
            .opacity(unit.connected ? 1 : 0.45)
    }
}
