import SwiftUI

/// How to get a bingo card on a phone: the QR code, the room code and who has joined. On the setup screen it is a
/// card under Start Round; during a round a small version sits in the top-left corner.
struct SingoJoinCard: View {
    let phones: SingoPhones
    let compact: Bool

    var body: some View {
        HStack(alignment: .center, spacing: compact ? 16 : 24) {
            if let url = phones.joinURL {
                QRCodeView(text: url.absoluteString)
                    .frame(width: compact ? 120 : 170, height: compact ? 120 : 170)
            }
            VStack(alignment: .leading, spacing: compact ? 4 : 8) {
                Text(compact ? "Bingo cards" : "Bingo cards on your phones")
                    .font(.system(size: compact ? 22 : 28, weight: .bold))
                if let code = phones.roomCode {
                    Text(siteLine(code))
                        .font(.system(size: compact ? 20 : 24))
                        .foregroundStyle(.white.opacity(0.75))
                        .lineLimit(2)
                        .minimumScaleFactor(0.7)
                }
                Text(playersLine)
                    .font(.system(size: compact ? 20 : 24, weight: .semibold))
                    .foregroundStyle(phones.isConnected ? Color.green.opacity(0.9) : Color.yellow.opacity(0.85))
                    .lineLimit(2)
            }
        }
        .padding(compact ? 14 : 20)
        .background(RoundedRectangle(cornerRadius: 20, style: .continuous).fill(.black.opacity(0.45)))
        .foregroundStyle(.white)
    }

    private func siteLine(_ code: String) -> String {
        let host = phones.joinURL?.host() ?? "the Game Night site"
        return compact ? "\(host) · \(code)" : "Scan, or open \(host) and type \(code)"
    }

    private var playersLine: String {
        guard phones.isConnected else { return "Connecting phones…" }
        let names = phones.players.filter(\.connected).map(\.name)
        switch names.count {
        case 0: return compact ? "No phones yet" : "No phones yet. Paper cards work too!"
        case 1...4: return names.joined(separator: ", ")
        default: return "\(names.count) players"
        }
    }
}

/// The big "SINGO!" moment on the round screen: who called it and the line they made, or a note that it was too early.
struct SingoClaimBanner: View {
    let claim: SingoClaim

    var body: some View {
        let accent = claim.color.map { Color(playerHex: $0) } ?? Color.pink
        VStack(spacing: 22) {
            Text(claim.ok ? "SINGO!" : "Not yet!")
                .font(.system(size: claim.ok ? 150 : 90, weight: .heavy))
                .foregroundStyle(claim.ok ? Color.yellow : Color.white)
            Text(claim.ok ? "\(claim.name) has a line!" : "\(claim.name) called it too early")
                .font(.system(size: 54, weight: .bold))
                .foregroundStyle(accent)
            if claim.ok {
                VStack(spacing: 8) {
                    ForEach(Array(claim.line.enumerated()), id: \.offset) { _, title in
                        Text(title)
                            .font(.system(size: 34, weight: .semibold))
                            .lineLimit(1)
                    }
                }
                Text("Press Play to keep going")
                    .font(.system(size: 28))
                    .foregroundStyle(.white.opacity(0.6))
            } else if !claim.missing.isEmpty {
                Text("Still to play: " + claim.missing.prefix(3).joined(separator: ", "))
                    .font(.system(size: 30))
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(2)
            }
        }
        .multilineTextAlignment(.center)
        .padding(60)
        .frame(maxWidth: 1300)
        .background(RoundedRectangle(cornerRadius: 40, style: .continuous).fill(.black.opacity(0.85)))
        .overlay(RoundedRectangle(cornerRadius: 40, style: .continuous).stroke(accent, lineWidth: 6))
        .shadow(color: accent.opacity(0.5), radius: 40)
    }
}
