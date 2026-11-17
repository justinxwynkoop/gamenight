import Foundation

/// A server timer counted down locally. The server only sends `leftMs` when
/// something changes; between updates the TV counts down on its own clock from
/// the moment the update arrived, so the bar stays smooth.
struct Countdown: Equatable {
    var totalMs: Int
    var leftMsAtReceipt: Int
    var timedOut: Bool
    var receivedAt: Date

    init(timer: TimerState, receivedAt: Date) {
        totalMs = timer.totalMs
        leftMsAtReceipt = timer.leftMs
        timedOut = timer.timedOut
        self.receivedAt = receivedAt
    }

    func remainingMs(at now: Date) -> Double {
        if timedOut { return 0 }
        let elapsed = max(0, now.timeIntervalSince(receivedAt) * 1000)
        return max(0, Double(leftMsAtReceipt) - elapsed)
    }

    /// 1 when full, 0 when empty.
    func fraction(at now: Date) -> Double {
        guard totalMs > 0 else { return 0 }
        return min(1, remainingMs(at: now) / Double(totalMs))
    }

    /// The whole seconds to show: 10 down to 1, rounding up like the web TV.
    func secondsShown(at now: Date) -> Int {
        Int((remainingMs(at: now) / 1000).rounded(.up))
    }

    /// The last three seconds, when the bar turns urgent.
    func isLow(at now: Date) -> Bool {
        !timedOut && remainingMs(at: now) <= 3000
    }
}
