import SwiftUI

// Spy Night on the TV: the five missions, who leads, who is on the team, who has voted (and how, once everyone has),
// the mission result, and at the end everyone's role. These follow the web TV (public/games/spynight/tv.js).
// Roles and cards are never on the TV while the game is running: the server does not send them.

private enum Spy {
    static let spy = Color(hex: 0xFF4D5E)
    static let resistance = Color(hex: 0x38D6C4)
    static let gold = Color(hex: 0xFFD24A)
    static let panel = Color(hex: 0x141B2E)
    static let line = Color(hex: 0x2A3556)
    static let dim = Color(hex: 0x93A0C4)
    static let teamFill = Color(hex: 0x3A3210)
}

/// The Spy Night screen for the current state (the lobby is the shared lobby screen).
struct SpyNightContent: View {
    let state: ServerState

    var body: some View {
        if let game = state.spyNight {
            SpyNightScreen(game: game)
        }
    }
}

struct SpyNightScreen: View {
    let game: SpyNightState

    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(hex: 0x1A2550), Color(hex: 0x0B0F1A)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            if game.phase == .gameover {
                CelebrationBurst(colors: game.spiesWon ? [Spy.spy, Spy.gold, .white] : [Spy.resistance, Spy.gold, .white])
                    .transition(.opacity)
            }
            VStack(spacing: 28) {
                header
                SpyTrack(game: game)
                Spacer(minLength: 0)
                stage
                Spacer(minLength: 0)
                footer
            }
            .padding(.horizontal, 90)
            .padding(.vertical, 50)
        }
        .animation(.easeInOut(duration: 0.25), value: game)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("Spy Night")
                .font(JP.display(72))
                .foregroundStyle(.white)
            Spacer()
            if game.phase != .gameover {
                HStack(spacing: 14) {
                    Text("Rejected teams in a row")
                        .font(JP.text(26, .medium))
                        .foregroundStyle(Spy.dim)
                    ForEach(0..<game.maxRejects, id: \.self) { i in
                        Circle()
                            .fill(i < game.rejects ? Spy.spy : Color.clear)
                            .overlay(Circle().strokeBorder(i < game.rejects ? Spy.spy : Spy.line, lineWidth: 3))
                            .frame(width: 26, height: 26)
                    }
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            Text(game.phase == .gameover ? "The host starts another game." : "\(game.spyCount ?? 0) Spies among \(game.players.count) players")
            Spacer()
        }
        .font(JP.text(26, .medium))
        .foregroundStyle(Spy.dim)
    }

    @ViewBuilder
    private var stage: some View {
        switch game.phase {
        case .roles:
            say("Look at your phone", next: "You have a secret role. Tap it, read it, then press “Got it”.")
            SpySeats(players: game.players) { p in
                (game.readyIds ?? []).contains(p.id) ? .done("✓") : .plain
            }
        case .team:
            say("\(game.name(game.leaderId)) is picking \(game.teamSize ?? 0) players",
                next: "Mission \(game.mission + 1)" + (neededFails > 1 ? " · needs two Fail cards to fail" : ""))
            SpySeats(players: game.players) { p in
                if p.id == game.leaderId { return .leader(game.team.contains(p.id) ? "👑 ✓" : "👑") }
                return game.team.contains(p.id) ? .team("✓") : .plain
            }
        case .vote:
            say("Approve or reject this team?", next: "Everyone votes on their phone. Votes show together.")
            SpySeats(players: game.players.filter { game.team.contains($0.id) }) { _ in .team("") }
            SpySeats(players: game.players) { p in
                (game.votedIds ?? []).contains(p.id) ? .done("✓") : .plain
            }
        case .voteResult:
            SpyBanner(text: game.approved == true ? "TEAM APPROVED" : "TEAM REJECTED", good: game.approved == true)
            SpySeats(players: game.players) { p in
                (game.votes?[p.id] ?? false) ? .yes("👍") : .no("👎")
            }
            Text(game.line.next).font(JP.text(34, .medium)).foregroundStyle(Spy.dim)
        case .mission:
            say("The team is on the mission", next: "Each member plays Success or Fail in secret.")
            SpySeats(players: game.players.filter { game.team.contains($0.id) }) { p in
                (game.playedIds ?? []).contains(p.id) ? .done("✓") : .team("…")
            }
        case .missionResult:
            let r = game.result
            SpyBanner(text: (r?.success ?? false) ? "MISSION SUCCEEDED" : "MISSION FAILED", good: r?.success ?? false)
            Text((r?.fails ?? 0) == 0 ? "No Fail cards" : "\(r?.fails ?? 0) Fail \((r?.fails ?? 0) == 1 ? "card" : "cards")")
                .font(JP.display(80)).foregroundStyle(.white)
        case .gameover:
            SpyBanner(text: game.spiesWon ? "THE SPIES WIN" : "THE RESISTANCE WINS", good: !game.spiesWon)
            if let why = game.why { Text(why).font(JP.text(34, .medium)).foregroundStyle(Spy.dim) }
            SpySeats(players: game.players) { p in
                (game.roles?[p.id] == "spy") ? .spy("🕶️ Spy") : .resistance("🛡️ Resistance")
            }
        case .lobby, .unknown:
            say(game.line.text, next: game.line.next)
        }
    }

    private var neededFails: Int { game.track.indices.contains(game.mission) ? game.track[game.mission].needed : 1 }

    private func say(_ text: String, next: String) -> some View {
        VStack(spacing: 14) {
            Text(text)
                .font(JP.display(92))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
            Text(next).font(JP.text(34, .medium)).foregroundStyle(Spy.dim)
        }
    }
}

/// The five missions in a row: how many go, and how each one ended, with the names of who went underneath. When the
/// game is over each name also shows whether they played Success or Fail.
struct SpyTrack: View {
    let game: SpyNightState

    var body: some View {
        HStack(alignment: .top, spacing: 20) {
            ForEach(game.track) { m in
                VStack(spacing: 10) {
                    VStack(spacing: 4) {
                        Text(m.succeeded ? "✓" : m.failed ? "✗" : "\(m.size ?? 0)")
                            .font(JP.display(78))
                        Text(m.needed > 1 ? "2 FAILS NEEDED" : "MISSION \(m.mission)")
                            .font(JP.label(22)).tracking(2)
                            .foregroundStyle(Spy.dim)
                    }
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .fill(m.succeeded ? Color(hex: 0x0F4B45) : m.failed ? Color(hex: 0x5A1620) : Color(hex: 0x10172A)))
                    .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous)
                        .strokeBorder(m.succeeded ? Spy.resistance : m.failed ? Spy.spy : m.current ? Spy.gold : Spy.line, lineWidth: 5))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Mission \(m.mission): \(m.succeeded ? "succeeded" : m.failed ? "failed" : "not played yet")")
                    who(m)
                }
            }
        }
    }

    @ViewBuilder
    private func who(_ m: SpyMission) -> some View {
        if let team = m.team, !team.isEmpty {
            VStack(spacing: 2) {
                ForEach(team, id: \.self) { id in
                    let card = game.phase == .gameover ? m.cards?[id] : nil
                    Text(game.name(id) + (card == nil ? "" : card == "fail" ? " ✗" : " ✓"))
                        .font(JP.text(28, .bold))
                        .foregroundStyle(card == "fail" ? Spy.spy : card == "success" ? Spy.resistance : Color.white.opacity(0.85))
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
    }
}

struct SpyBanner: View {
    let text: String
    let good: Bool

    var body: some View {
        Text(text)
            .font(JP.display(120))
            .foregroundStyle(good ? Spy.resistance : Spy.spy)
            .padding(.horizontal, 70)
            .padding(.vertical, 24)
            .background(RoundedRectangle(cornerRadius: 36, style: .continuous).fill(good ? Color(hex: 0x0F4B45) : Color(hex: 0x5A1620)))
    }
}

/// How a player's seat looks, and the little mark on it.
enum SpySeatStyle {
    case plain
    case leader(String)
    case team(String)
    case done(String)
    case yes(String)
    case no(String)
    case spy(String)
    case resistance(String)

    var fill: Color {
        switch self {
        case .plain: return Spy.panel
        case .leader: return Spy.panel
        case .team: return Spy.teamFill
        case .done, .yes: return Color(hex: 0x123A2A)
        case .no: return Color(hex: 0x3D1218)
        case .spy: return Color(hex: 0x3A0F17)
        case .resistance: return Color(hex: 0x0C3A37)
        }
    }

    var stroke: Color {
        switch self {
        case .plain: return Spy.line
        case .leader, .team: return Spy.gold
        case .done, .yes: return Color(hex: 0x22C55E)
        case .no: return Color(hex: 0xEF4444)
        case .spy: return Spy.spy
        case .resistance: return Spy.resistance
        }
    }

    var mark: String {
        switch self {
        case .plain: return ""
        case .leader(let m), .team(let m), .done(let m), .yes(let m), .no(let m), .spy(let m), .resistance(let m): return m
        }
    }
}

/// Everyone's seat: a coloured dot, the name and a mark.
struct SpySeats: View {
    let players: [SpyPlayer]
    let style: (SpyPlayer) -> SpySeatStyle

    var body: some View {
        // Up to ten seats: two rows of five fit the screen.
        let rows = players.count > 5 ? [Array(players.prefix(5)), Array(players.dropFirst(5))] : [players]
        VStack(spacing: 18) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 18) {
                    ForEach(row) { p in
                        let s = style(p)
                        HStack(spacing: 14) {
                            Circle().fill(Color(playerHex: p.color)).frame(width: 34, height: 34)
                            Text(p.name).font(JP.text(38, .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                            if !s.mark.isEmpty { Text(s.mark).font(JP.text(34, .bold)) }
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 28)
                        .padding(.vertical, 14)
                        .background(Capsule().fill(s.fill))
                        .overlay(Capsule().strokeBorder(s.stroke, lineWidth: 5))
                        .opacity(p.connected ? 1 : 0.45)
                    }
                }
            }
        }
    }
}
