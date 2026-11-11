import SwiftUI

/// A bar that drains as a server timer runs down. It counts down locally from
/// the moment the update arrived (see `Countdown`), ten times a second.
struct CountdownBar: View {
    let timer: TimerState
    let receivedAt: Date
    var tint: Color = JP.green

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let countdown = Countdown(timer: timer, receivedAt: receivedAt)
            let fraction = countdown.fraction(at: context.date)
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.14))
                    Capsule()
                        .fill(countdown.isLow(at: context.date) ? JP.red : tint)
                        .frame(width: proxy.size.width * fraction)
                }
            }
            .frame(height: 16)
        }
    }
}

/// The seconds left, in the display face.
struct CountdownNumber: View {
    let timer: TimerState
    let receivedAt: Date
    var size: CGFloat = 112

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.1)) { context in
            let countdown = Countdown(timer: timer, receivedAt: receivedAt)
            Text("\(countdown.secondsShown(at: context.date))")
                .font(JP.display(size))
                .monospacedDigit()
        }
    }
}

/// The big rounded strip across the foot of a clue screen.
struct BannerBar<Leading: View, Trailing: View>: View {
    let fill: Color
    let ink: Color
    let leading: () -> Leading
    let trailing: () -> Trailing

    init(
        fill: Color,
        ink: Color,
        @ViewBuilder leading: @escaping () -> Leading,
        @ViewBuilder trailing: @escaping () -> Trailing
    ) {
        self.fill = fill
        self.ink = ink
        self.leading = leading
        self.trailing = trailing
    }

    var body: some View {
        HStack {
            leading()
            Spacer(minLength: 24)
            trailing()
        }
        .foregroundStyle(ink)
        .padding(.horizontal, 60)
        .frame(height: 150)
        .background(RoundedRectangle(cornerRadius: 22, style: .continuous).fill(fill))
        .shadow(color: .black.opacity(0.35), radius: 20, y: 10)
    }
}
