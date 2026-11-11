import SwiftUI

/// Final Jeopardy: wagers, the clue with its countdown, then each finalist's
/// answer and wager as the host judges them.
struct FinalScreen: View {
    let state: ServerState
    let round: FinalState
    let receivedAt: Date

    var body: some View {
        VStack(spacing: 24) {
            HStack(alignment: .firstTextBaseline) {
                Text("Final Jeopardy")
                    .font(JP.display(72))
                    .tracking(4)
                    .textCase(.uppercase)
                    .foregroundStyle(JP.gold)
                    .shadow(color: .black.opacity(0.35), radius: 0, y: 3)
                Spacer()
                Text(round.category)
                    .font(JP.label(56))
                    .tracking(4.5)
                    .textCase(.uppercase)
                    .foregroundStyle(JP.softWhite)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .frame(height: 76)

            switch round.step {
            case .wager:
                wagerBody
            case .clue:
                clueBody
            default:
                reviewBody
            }
        }
        .padding(.horizontal, 80)
        .padding(.vertical, 60)
    }

    // MARK: Steps

    private var wagerBody: some View {
        VStack(spacing: 40) {
            Spacer(minLength: 0)
            Text("Place your wagers on your phone")
                .font(JP.text(64, .medium))
                .multilineTextAlignment(.center)
            FinalistTable(state: state, round: round)
            Spacer(minLength: 0)
        }
    }

    private var clueBody: some View {
        VStack(spacing: 32) {
            Text(round.text ?? "")
                .font(JP.text(70, .medium))
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.5)
                .padding(.horizontal, 96)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(JP.panelSoft))

            if let timer = round.timer {
                if timer.timedOut {
                    Text("TIME’S UP")
                        .font(JP.display(150))
                        .tracking(6)
                        .foregroundStyle(JP.red)
                } else {
                    CountdownNumber(timer: timer, receivedAt: receivedAt, size: 170)
                        .foregroundStyle(JP.gold)
                    CountdownBar(timer: timer, receivedAt: receivedAt, tint: JP.gold)
                }
            }
            Text("Type your answer on your phone")
                .font(JP.text(38, .medium))
                .foregroundStyle(JP.softWhite)
        }
    }

    private var reviewBody: some View {
        VStack(spacing: 24) {
            VStack(spacing: 14) {
                Text(round.text ?? "")
                    .font(JP.text(50, .medium))
                    .foregroundStyle(JP.softWhite)
                    .multilineTextAlignment(.center)
                    .minimumScaleFactor(0.5)
                if round.step == .results, let answer = round.answer {
                    Text(answer)
                        .font(JP.display(130))
                        .textCase(.uppercase)
                        .foregroundStyle(JP.gold)
                        .shadow(color: .black.opacity(0.35), radius: 0, y: 5)
                        .lineLimit(1)
                        .minimumScaleFactor(0.4)
                }
            }
            .padding(.horizontal, 80)
            .padding(.vertical, 30)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 26, style: .continuous).fill(JP.panelSoft))

            FinalistTable(state: state, round: round)
            Spacer(minLength: 0)
        }
    }
}

/// The Final Jeopardy table. While wagers are made it lists EVERYONE with their score, so each
/// player or team can judge their wager against the rest, and marks anyone who is not playing
/// the final round as "sitting out". After that it shows one row per finalist, and wagers and
/// answers stay hidden until the host judges that finalist.
struct FinalistTable: View {
    let state: ServerState
    let round: FinalState

    private let playerWidth: CGFloat = 330
    private let wagerWidth: CGFloat = 230
    private let totalWidth: CGFloat = 250
    private let iconWidth: CGFloat = 72
    private let maxRows = 10

    private struct Entry: Identifiable {
        let id: String
        let unit: ScoreUnit?
        /// Nil for someone who is not playing the final round.
        let finalist: Finalist?
    }

    private var entries: [Entry] {
        if round.step == .wager {
            return Standings.ranked(state.room.units).map { unit in
                Entry(id: unit.id, unit: unit, finalist: round.finalists.first { $0.id == unit.id })
            }
        }
        return round.finalists.map { finalist in
            Entry(id: finalist.id, unit: state.room.unit(finalist.id), finalist: finalist)
        }
    }

    private var answerHeading: String { round.step == .wager ? "Status" : "Answer" }

    var body: some View {
        let all = entries
        let shown = Array(all.prefix(maxRows))
        let compact = shown.count > 6
        VStack(spacing: compact ? 6 : 10) {
            HStack(spacing: 24) {
                heading("Player").frame(width: playerWidth, alignment: .leading)
                heading(answerHeading).frame(maxWidth: .infinity, alignment: .leading)
                heading("Wager").frame(width: wagerWidth, alignment: .trailing)
                heading("Score").frame(width: totalWidth, alignment: .trailing)
                Color.clear.frame(width: iconWidth, height: 1)
            }
            .padding(.horizontal, 28)

            ForEach(shown) { entry in
                row(entry, compact: compact)
            }
            if all.count > shown.count {
                Text("+ \(all.count - shown.count) more")
                    .font(JP.text(28, .medium))
                    .foregroundStyle(JP.muted)
            }
        }
    }

    private func heading(_ text: String) -> some View {
        Text(text)
            .font(JP.label(26))
            .tracking(4)
            .textCase(.uppercase)
            .foregroundStyle(JP.muted)
    }

    private func answerText(_ finalist: Finalist?) -> String {
        guard let finalist else { return "Sitting out" }
        if finalist.judged { return "“\(finalist.answer ?? "")”" }
        if round.step == .wager { return finalist.wagered ? "Wager locked in" : "Wagering…" }
        return finalist.answered ? "Answer is in" : "…"
    }

    private func row(_ entry: Entry, compact: Bool) -> some View {
        let unit = entry.unit
        let finalist = entry.finalist
        let sittingOut = finalist == nil
        let nameSize: CGFloat = compact ? 38 : 48
        return HStack(spacing: 24) {
            HStack(spacing: 16) {
                Circle()
                    .fill(Color(playerHex: unit?.color ?? "#888888"))
                    .frame(width: 30, height: 30)
                Text(unit?.name ?? "")
                    .font(JP.text(nameSize))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            .frame(width: playerWidth, alignment: .leading)

            Text(answerText(finalist))
                .font(JP.text(nameSize))
                .foregroundStyle(finalist?.judged == true ? Color.white : JP.softWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(finalist?.judged == true ? Money.format(finalist?.wager ?? 0) : "")
                .font(JP.text(compact ? 36 : 44))
                .monospacedDigit()
                .frame(width: wagerWidth, alignment: .trailing)

            Text(Money.format(unit?.score ?? 0))
                .font(JP.display(compact ? 44 : 54))
                .monospacedDigit()
                .foregroundStyle((unit?.score ?? 0) < 0 ? JP.pink : Color.white)
                .frame(width: totalWidth, alignment: .trailing)

            icon(finalist)
                .frame(width: iconWidth)
        }
        .padding(.horizontal, 28)
        .frame(height: compact ? 78 : 104)
        .background(rowBackground(finalist))
        .opacity(sittingOut ? 0.6 : 1)
    }

    @ViewBuilder
    private func icon(_ finalist: Finalist?) -> some View {
        if let finalist, finalist.judged, let result = finalist.result {
            Image(systemName: result ? "checkmark.circle.fill" : "xmark.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(result ? JP.green : JP.red)
                .accessibilityLabel(result ? "Correct" : "Wrong")
        } else if let finalist, round.step == .wager, finalist.wagered {
            Image(systemName: "lock.circle.fill")
                .font(.system(size: 56))
                .foregroundStyle(JP.softWhite)
                .accessibilityLabel("Wager locked in")
        } else {
            Color.clear
        }
    }

    @ViewBuilder
    private func rowBackground(_ finalist: Finalist?) -> some View {
        if let finalist, finalist.judged, let result = finalist.result {
            let tint = result ? JP.green : JP.red
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(tint.opacity(0.15))
                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(tint, lineWidth: 2))
        } else {
            RoundedRectangle(cornerRadius: 18, style: .continuous).fill(JP.panel)
        }
    }
}
