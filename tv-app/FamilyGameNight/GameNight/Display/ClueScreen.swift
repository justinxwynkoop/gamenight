import SwiftUI

/// A clue on the TV: the text, a banner for what is happening (buzz in, who is
/// answering, who got it), a countdown, and the scores.
struct ClueScreen: View {
    let state: ServerState
    let clue: ClueState
    let receivedAt: Date

    var body: some View {
        if clue.step == .wager {
            DailyDoubleScreen(state: state, clue: clue)
        } else {
            HStack(spacing: 48) {
                VStack(spacing: 28) {
                    header
                    cluePanel
                    banner
                    footerRow
                }
                ScoreSidebar(units: state.room.units, marks: marks, width: 380) {
                    if !hint.isEmpty { HintCard(text: hint) }
                }
            }
            .padding(.horizontal, 80)
            .padding(.vertical, 60)
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(clue.category)
                .font(JP.label(56))
                .tracking(4.5)
                .textCase(.uppercase)
                .foregroundStyle(JP.softWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Spacer()
            Text(Money.format(clue.value))
                .font(JP.display(76))
                .foregroundStyle(JP.gold)
                .shadow(color: .black.opacity(0.35), radius: 0, y: 3)
        }
        .frame(height: 80)
    }

    private var cluePanel: some View {
        VStack(spacing: 30) {
            if clue.step == .revealed {
                Text(clue.text ?? "")
                    .font(JP.text(52, .medium))
                    .foregroundStyle(JP.softWhite)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.5)
                Capsule()
                    .fill(Color.white.opacity(0.25))
                    .frame(width: 140, height: 3)
                Text("The answer")
                    .font(JP.label(34))
                    .tracking(10)
                    .textCase(.uppercase)
                    .foregroundStyle(JP.muted)
                Text(clue.answer ?? "")
                    .font(JP.display(210))
                    .textCase(.uppercase)
                    .foregroundStyle(JP.gold)
                    .shadow(color: .black.opacity(0.35), radius: 0, y: 6)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.3)
            } else {
                Text(clue.text ?? "")
                    .font(JP.text(90, .medium))
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.4)
            }
        }
        .padding(.horizontal, 96)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(JP.panelSoft))
    }

    private var timedOut: Bool { clue.timer?.timedOut ?? false }

    private func title(_ text: String) -> some View {
        Text(text)
            .font(JP.display(104))
            .tracking(3)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
    }

    private func caption(_ text: String) -> some View {
        Text(text)
            .font(JP.label(40))
            .tracking(6)
            .textCase(.uppercase)
    }

    @ViewBuilder
    private var timerNumber: some View {
        if let timer = clue.timer, !timer.timedOut {
            CountdownNumber(timer: timer, receivedAt: receivedAt, size: 112)
        }
    }

    @ViewBuilder
    private var banner: some View {
        switch clue.step {
        case .open:
            if timedOut {
                BannerBar(fill: JP.red, ink: JP.ink) {
                    title("TIME’S UP")
                } trailing: {
                    EmptyView()
                }
            } else {
                BannerBar(fill: JP.green, ink: JP.ink) {
                    title("BUZZ IN!")
                } trailing: {
                    timerNumber
                }
            }
        case .answering:
            answeringBanner
        case .revealed:
            revealedBanner
        default:
            BannerBar(fill: Color.white.opacity(0.14), ink: Color.white) {
                title("Listen to the clue")
            } trailing: {
                EmptyView()
            }
        }
    }

    @ViewBuilder
    private var answeringBanner: some View {
        let unit = state.room.unit(clue.buzzedBy)
        let hex = unit?.color ?? "#888888"
        let name = (unit?.name ?? "Someone").uppercased()
        if timedOut {
            BannerBar(fill: JP.red, ink: JP.ink) {
                HStack(alignment: .firstTextBaseline, spacing: 28) {
                    title(name)
                    caption("ran out of time")
                }
            } trailing: {
                EmptyView()
            }
        } else {
            BannerBar(fill: Color(playerHex: hex), ink: JP.inkColor(on: hex)) {
                HStack(alignment: .firstTextBaseline, spacing: 28) {
                    title(name)
                    caption(clue.dd ? "wager \(Money.format(clue.wager ?? 0))" : "is answering")
                }
            } trailing: {
                timerNumber
            }
        }
    }

    @ViewBuilder
    private var revealedBanner: some View {
        if let unit = state.room.unit(clue.correct) {
            let gain = clue.dd ? (clue.wager ?? clue.value) : clue.value
            BannerBar(fill: JP.green, ink: JP.ink) {
                HStack(spacing: 28) {
                    Circle()
                        .fill(Color(playerHex: unit.color))
                        .frame(width: 52, height: 52)
                        .overlay(Circle().stroke(JP.ink, lineWidth: 5))
                    title(unit.name.uppercased())
                    caption("got it")
                }
            } trailing: {
                Text("+" + Money.format(gain))
                    .font(JP.display(112))
                    .monospacedDigit()
            }
        } else {
            BannerBar(fill: Color.white.opacity(0.14), ink: Color.white) {
                title("Nobody got it")
            } trailing: {
                EmptyView()
            }
        }
    }

    /// Under the banner: the draining bar while a timer runs, or who picks next.
    @ViewBuilder
    private var footerRow: some View {
        Group {
            if let timer = clue.timer, !timer.timedOut, clue.step == .open || clue.step == .answering {
                let hex = state.room.unit(clue.buzzedBy)?.color
                CountdownBar(
                    timer: timer,
                    receivedAt: receivedAt,
                    tint: clue.step == .answering && hex != nil ? Color(playerHex: hex ?? "") : JP.green
                )
            } else if clue.step == .revealed, let picker = state.jeopardy?.control, let unit = state.room.unit(picker) {
                Text("\(unit.name) picks the next clue.")
                    .font(JP.text(30, .medium))
                    .foregroundStyle(JP.softWhite)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Color.clear
            }
        }
        .frame(height: 40)
    }

    // MARK: Score panel

    private var marks: [String: SidebarMark] {
        var result: [String: SidebarMark] = [:]
        for id in clue.lockedOut { result[id] = .lockedOut }
        if clue.step == .answering, let id = clue.buzzedBy { result[id] = .answering }
        if clue.step == .revealed, let id = clue.correct { result[id] = .correct }
        return result
    }

    private var hint: String {
        switch clue.step {
        case .open:
            return "Tap BUZZ on your phone. First one in answers."
        case .answering:
            let names = clue.lockedOut.compactMap { state.room.unit($0)?.name }
            return names.isEmpty ? "" : "\(names.joined(separator: ", ")) can't buzz on this clue."
        default:
            return ""
        }
    }
}

/// A Daily Double: the clue stays hidden until the host sets the wager.
struct DailyDoubleScreen: View {
    let state: ServerState
    let clue: ClueState

    var body: some View {
        ZStack {
            rays
            VStack {
                HStack(alignment: .firstTextBaseline) {
                    Text(clue.category)
                        .font(JP.label(56))
                        .tracking(4.5)
                        .textCase(.uppercase)
                        .foregroundStyle(JP.softWhite)
                    Spacer()
                    Text(Money.format(clue.value))
                        .font(JP.display(76))
                        .foregroundStyle(JP.gold)
                }
                Spacer()
            }
            VStack(spacing: 0) {
                Text("DAILY")
                Text("DOUBLE!")
            }
            .font(JP.display(300))
            .tracking(8)
            .foregroundStyle(JP.gold)
            .shadow(color: .black.opacity(0.4), radius: 0, y: 12)
            .shadow(color: JP.gold.opacity(0.35), radius: 60)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
            .offset(y: -50)

            VStack(spacing: 22) {
                Spacer()
                wagerPill
                Text("Tell the host your wager.")
                    .font(JP.text(40, .medium))
                    .foregroundStyle(JP.softWhite)
            }
        }
        .padding(.horizontal, 80)
        .padding(.vertical, 60)
    }

    private var wagerPill: some View {
        HStack(spacing: 26) {
            if let unit = state.room.unit(clue.ddUnit) {
                Circle()
                    .fill(Color(playerHex: unit.color))
                    .frame(width: 44, height: 44)
                Text("\(unit.name), make your wager")
            } else {
                Text("Who has control?")
            }
        }
        .font(JP.text(68))
        .padding(.leading, 36)
        .padding(.trailing, 48)
        .padding(.vertical, 20)
        .background(Capsule().fill(JP.panel))
    }

    /// Light rays fanning out behind the title.
    private var rays: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height * 0.44)
            let radius = hypot(size.width, size.height)
            for index in 0..<30 {
                var path = Path()
                path.move(to: center)
                path.addArc(
                    center: center,
                    radius: radius,
                    startAngle: .degrees(Double(index) * 12),
                    endAngle: .degrees(Double(index) * 12 + 5),
                    clockwise: false
                )
                path.closeSubpath()
                context.fill(path, with: .color(JP.gold.opacity(0.10)))
            }
        }
        .ignoresSafeArea()
    }
}
