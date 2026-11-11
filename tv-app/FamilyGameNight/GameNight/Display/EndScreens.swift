import SwiftUI

/// Everyone's score, highest first. The host switches to this between clues.
struct LeaderboardScreen: View {
    let state: ServerState

    var body: some View {
        let placed = Standings.placed(state.room.units)
        let twoColumns = placed.count > 10

        VStack(spacing: 40) {
            Text("Leaderboard")
                .font(JP.display(110))
                .tracking(4)
                .textCase(.uppercase)
                .foregroundStyle(JP.gold)
                .shadow(color: .black.opacity(0.35), radius: 0, y: 5)
            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 24), count: twoColumns ? 2 : 1),
                spacing: 12
            ) {
                ForEach(placed, id: \.unit.id) { entry in
                    row(entry, compact: placed.count > 7)
                }
            }
            .frame(maxWidth: twoColumns ? .infinity : 1000)
        }
        .padding(.horizontal, 100)
        .padding(.vertical, 60)
        .frame(maxHeight: .infinity)
    }

    private func row(_ entry: Standings.Placed, compact: Bool) -> some View {
        HStack(spacing: 20) {
            Text(Standings.ordinal(entry.place).uppercased())
                .font(JP.label(30))
                .tracking(2)
                .foregroundStyle(JP.muted)
                .frame(width: 90, alignment: .leading)
            Circle()
                .fill(Color(playerHex: entry.unit.color))
                .frame(width: 30, height: 30)
            Text(entry.unit.name)
                .font(JP.text(compact ? 42 : 52))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Spacer(minLength: 12)
            Text(Money.format(entry.unit.score))
                .font(JP.display(compact ? 48 : 60))
                .monospacedDigit()
                .foregroundStyle(entry.unit.score < 0 ? JP.pink : Color.white)
        }
        .padding(.horizontal, 28)
        .frame(height: compact ? 82 : 100)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(JP.panel))
    }
}

/// The end of the game: the winner (or winners, in a tie) and everyone else.
struct WinnerScreen: View {
    let state: ServerState

    var body: some View {
        let winners = Standings.winners(state.room.units)
        let rest = Standings.placed(state.room.units).filter { entry in !winners.contains(entry.unit) }
        let isTie = winners.count > 1

        ZStack {
            Confetti()
            VStack(spacing: 0) {
                Text(isTie ? "IT’S A TIE" : "WINNER")
                    .font(JP.label(68))
                    .tracking(26)
                    .foregroundStyle(JP.gold)
                HStack(spacing: 44) {
                    if !isTie, let winner = winners.first {
                        Circle()
                            .fill(Color(playerHex: winner.color))
                            .frame(width: 104, height: 104)
                            .overlay(Circle().stroke(Color.white.opacity(0.9), lineWidth: 8))
                    }
                    Text(winners.map(\.name).joined(separator: " & "))
                        .font(JP.display(330))
                        .tracking(6)
                        .textCase(.uppercase)
                        .shadow(color: .black.opacity(0.35), radius: 0, y: 12)
                        .lineLimit(1)
                        .minimumScaleFactor(0.3)
                }
                if let top = winners.first {
                    Text(Money.format(top.score))
                        .font(JP.display(136))
                        .monospacedDigit()
                        .foregroundStyle(JP.gold)
                        .shadow(color: .black.opacity(0.35), radius: 0, y: 6)
                }
                HStack(spacing: 18) {
                    ForEach(Array(rest.prefix(5)), id: \.unit.id) { entry in
                        pill(entry)
                    }
                }
                .padding(.top, 70)
            }
            .padding(.horizontal, 80)
        }
    }

    private func pill(_ entry: Standings.Placed) -> some View {
        HStack(spacing: 16) {
            Text(Standings.ordinal(entry.place).uppercased())
                .font(JP.label(30))
                .tracking(2)
                .foregroundStyle(JP.muted)
            Circle()
                .fill(Color(playerHex: entry.unit.color))
                .frame(width: 26, height: 26)
            Text(entry.unit.name)
                .font(JP.text(40))
                .lineLimit(1)
            Text(Money.format(entry.unit.score))
                .font(JP.display(40))
                .monospacedDigit()
                .foregroundStyle(entry.unit.score < 0 ? JP.pink : Color.white)
        }
        .padding(.horizontal, 30)
        .padding(.vertical, 18)
        .background(Capsule().fill(JP.panel))
    }
}

/// Paper confetti scattered round the edges of the screen. The positions come
/// from a fixed seed so it looks the same every time.
struct Confetti: View {
    private static let colors: [Color] = [
        Color(hex: 0xF97316), Color(hex: 0xEAB308), Color(hex: 0x3B82F6),
        Color(hex: 0xD946EF), Color(hex: 0x14B8A6), JP.gold,
    ]

    var body: some View {
        Canvas { context, size in
            var generator = SeededGenerator(seed: 42)
            for index in 0..<46 {
                let x = Double.random(in: 0...Double(size.width), using: &generator)
                let y = Double.random(in: 0...Double(size.height), using: &generator)
                let angle = Double.random(in: -60...60, using: &generator)
                // Keep the middle clear for the names.
                if abs(x - size.width / 2) < 760 && y > 170 && y < 900 { continue }
                let color = Self.colors[index % Self.colors.count]
                let isDot = index % 6 == 5
                context.drawLayer { layer in
                    layer.translateBy(x: x, y: y)
                    layer.rotate(by: .degrees(angle))
                    let shape = isDot
                        ? Path(ellipseIn: CGRect(x: -11, y: -11, width: 22, height: 22))
                        : Path(roundedRect: CGRect(x: -10, y: -19, width: 20, height: 38), cornerRadius: 3)
                    layer.fill(shape, with: .color(color))
                }
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}

/// A small repeatable random number generator (so the confetti doesn't move between redraws).
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        state = seed
    }

    mutating func next() -> UInt64 {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return state
    }
}
