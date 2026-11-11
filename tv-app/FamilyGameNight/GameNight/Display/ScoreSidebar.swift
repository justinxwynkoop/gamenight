import SwiftUI

/// How a row in the score panel is marked.
enum SidebarMark: Equatable {
    /// Picks the next clue.
    case picks
    /// Is answering right now.
    case answering
    /// Got the clue right.
    case correct
    /// Can't buzz in on this clue.
    case lockedOut
}

/// The scores, highest first, down the right of the board and clue screens.
struct ScoreSidebar<Footer: View>: View {
    let units: [ScoreUnit]
    let title: String
    let marks: [String: SidebarMark]
    let width: CGFloat
    let footer: () -> Footer

    init(
        units: [ScoreUnit],
        title: String = "Scores",
        marks: [String: SidebarMark] = [:],
        width: CGFloat = 400,
        @ViewBuilder footer: @escaping () -> Footer
    ) {
        self.units = units
        self.title = title
        self.marks = marks
        self.width = width
        self.footer = footer
    }

    var body: some View {
        let maxRows = 8
        let ranked = Array(Standings.ranked(units).prefix(maxRows))
        let hidden = units.count - ranked.count
        let compact = ranked.count > 6

        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: compact ? 4 : 8) {
                Text(title)
                    .font(JP.label(26))
                    .tracking(3.6)
                    .textCase(.uppercase)
                    .foregroundStyle(JP.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 10)
                ForEach(ranked) { unit in
                    ScoreRow(unit: unit, mark: marks[unit.id], compact: compact)
                }
                if hidden > 0 {
                    Text("+ \(hidden) more")
                        .font(JP.text(28, .medium))
                        .foregroundStyle(JP.muted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                }
            }
            Spacer(minLength: 16)
            footer()
        }
        .padding(28)
        .frame(width: width)
        .frame(maxHeight: .infinity)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(JP.panel))
    }
}

extension ScoreSidebar where Footer == EmptyView {
    init(units: [ScoreUnit], title: String = "Scores", marks: [String: SidebarMark] = [:], width: CGFloat = 400) {
        self.init(units: units, title: title, marks: marks, width: width) { EmptyView() }
    }
}

struct ScoreRow: View {
    let unit: ScoreUnit
    let mark: SidebarMark?
    let compact: Bool

    private var unitColor: Color { Color(playerHex: unit.color) }

    private var tag: (text: String, color: Color)? {
        switch mark {
        case .picks: return ("PICKS NEXT", JP.gold)
        case .lockedOut: return ("LOCKED OUT", JP.pink)
        default: return nil
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            Circle()
                .fill(unitColor)
                .frame(width: 26, height: 26)
            VStack(alignment: .leading, spacing: 0) {
                Text(unit.name)
                    .font(JP.text(compact ? 32 : 38))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let tag {
                    Text(tag.text)
                        .font(JP.label(20))
                        .tracking(2.8)
                        .foregroundStyle(tag.color)
                }
            }
            Spacer(minLength: 8)
            Text(Money.format(unit.score))
                .font(JP.display(compact ? 34 : 42))
                .monospacedDigit()
                .foregroundStyle(unit.score < 0 ? JP.pink : Color.white)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.horizontal, 16)
        .frame(height: compact ? 64 : 84)
        .background(background)
        .opacity(mark == .lockedOut ? 0.7 : 1)
    }

    @ViewBuilder
    private var background: some View {
        switch mark {
        case .picks:
            ring(fill: JP.gold.opacity(0.16), stroke: JP.gold)
        case .answering:
            ring(fill: unitColor.opacity(0.2), stroke: unitColor)
        case .correct:
            ring(fill: JP.green.opacity(0.18), stroke: JP.green)
        default:
            Color.clear
        }
    }

    private func ring(fill: Color, stroke: Color) -> some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(fill)
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(stroke, lineWidth: 2))
    }
}

/// A short note in a rounded box, at the foot of the score panel.
struct HintCard: View {
    let text: String

    var body: some View {
        Text(text)
            .font(JP.text(28, .medium))
            .foregroundStyle(JP.softWhite)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 18)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.07)))
    }
}
