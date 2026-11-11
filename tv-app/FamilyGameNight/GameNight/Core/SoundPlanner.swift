import Foundation

/// What to play because the game state changed.
struct SoundPlan: Equatable {
    var cues: [SoundCue] = []
    /// A Final Jeopardy countdown just began (or was restarted): start the "think" music.
    var startFinalMusic = false
    /// There is no Final Jeopardy countdown running: stop that music if it is playing.
    var stopFinalMusic = false
}

/// Decides which sound goes with which change in the game. This is a direct port of
/// the web TV's `effects()` (public/tv.js) and the Jeopardy `onChange()`
/// (public/games/jeopardy/tv.js), so the two displays react the same way.
enum SoundPlanner {
    static func plan(from previous: ServerState?, to next: ServerState) -> SoundPlan {
        var plan = SoundPlan()
        // The first state after connecting is not a change, so nothing plays.
        guard let previous else { return plan }

        // The host's "test sound" button bumps this counter.
        if previous.room.settings.ping != next.room.settings.ping {
            plan.cues.append(.correct)
        }
        if let before = previous.feud, let after = next.feud {
            planFeud(from: before, to: after, into: &plan)
            return plan
        }
        guard let before = previous.jeopardy, let after = next.jeopardy else { return plan }

        if let clue = after.clue {
            let was = before.clue
            let changed = was == nil || was?.c != clue.c || was?.r != clue.r
            if clue.dd && clue.step == .wager && changed {
                plan.cues.append(.dd)
            } else if clue.step == .open && was?.step != .open {
                plan.cues.append(.open)
            } else if clue.step == .answering && was?.step != .answering {
                plan.cues.append(.buzz)
            } else if clue.lockedOut.count > (changed ? 0 : (was?.lockedOut.count ?? 0)) {
                plan.cues.append(.wrong)
            } else if clue.step == .revealed, let was, was.step != .revealed {
                if clue.correct != nil {
                    plan.cues.append(.correct)
                } else if was.step == .answering {
                    plan.cues.append(.wrong)   // a wrong Daily Double answer
                } else {
                    plan.cues.append(.reveal)
                }
            }
            if (clue.timer?.timedOut ?? false) && !(was?.timer?.timedOut ?? false) {
                plan.cues.append(.timeup)
            }
        }

        // Final Jeopardy's "think" music runs with the countdown and stops with it.
        let running = runningCountdown(in: after.finalRound)
        let wasRunning = runningCountdown(in: before.finalRound)
        if let running {
            if wasRunning == nil || running.leftMs > (wasRunning?.leftMs ?? 0) + 1500 {
                plan.startFinalMusic = true   // it just started, or the host restarted it
            }
        } else {
            plan.stopFinalMusic = true
        }

        if let round = after.finalRound {
            if let earlier = before.finalRound {
                if (round.timer?.timedOut ?? false) && !(earlier.timer?.timedOut ?? false) {
                    plan.cues.append(.timeup)
                }
                for (index, finalist) in round.finalists.enumerated() {
                    guard let result = finalist.result,
                          index < earlier.finalists.count,
                          earlier.finalists[index].result == nil else { continue }
                    plan.cues.append(result ? .correct : .wrong)
                }
            } else {
                plan.cues.append(.finalSting)
            }
        }

        if after.status == .done && before.status != .done {
            plan.cues.append(.fanfare)
        }
        return plan
    }

    /// Family Feud: a port of `onChange()` in the gamenight repo's public/games/feud/tv.js.
    private static func planFeud(from before: FeudState, to after: FeudState, into plan: inout SoundPlan) {
        if let round = after.round {
            if let was = before.round, was.number == round.number {
                let up = round.answers.filter(\.revealed).count
                let wasUp = was.answers.filter(\.revealed).count
                if up > wasUp {
                    plan.cues.append(.ding)
                } else if round.strikes > was.strikes {
                    plan.cues.append(round.strikes >= round.maxStrikes ? .strikeout : .strike)
                } else if was.step == .steal && round.step == .roundEnd && round.result?.winner == was.stealFrom {
                    plan.cues.append(.strike)   // the steal failed
                } else if round.faceoff.attempts.count > was.faceoff.attempts.count
                            && round.faceoff.attempts.last?.rank == nil {
                    plan.cues.append(.strike)
                } else if round.faceoff.open && !was.faceoff.open {
                    plan.cues.append(.open)
                } else if round.faceoff.turn != nil && was.faceoff.turn == nil && round.faceoff.attempts.isEmpty {
                    plan.cues.append(.faceoff)
                }
                if round.step == .roundEnd && was.step != .roundEnd {
                    plan.cues.append(.correct)
                }
            } else if before.round != nil || before.status != .round {
                plan.cues.append(.roundstart)   // a new round begins
            }
        }

        if let fm = after.fm {
            if let was = before.fm {
                if (fm.timer?.timedOut ?? false) && !(was.timer?.timedOut ?? false) {
                    plan.cues.append(.timeup)
                }
                if judgedCount(fm) > judgedCount(was) {
                    plan.cues.append(pointsTotal(fm) > pointsTotal(was) ? .fmpoints : .zero)
                }
                if fm.step == .results && was.step != .results {
                    plan.cues.append((fm.won ?? false) ? .winner : .zero)
                }
            } else {
                plan.cues.append(.fastmoney)
            }
        }

        if after.status == .done && before.status != .done {
            plan.cues.append(.winner)
        }
    }

    private static func judgedCount(_ fm: FastMoneyState) -> Int {
        fm.rows.reduce(0) { $0 + ($1.p1.judged ? 1 : 0) + ($1.p2.judged ? 1 : 0) }
    }

    private static func pointsTotal(_ fm: FastMoneyState) -> Int {
        fm.rows.reduce(0) { $0 + ($1.p1.points ?? 0) + ($1.p2.points ?? 0) }
    }

    private static func runningCountdown(in round: FinalState?) -> TimerState? {
        guard let round, round.step == .clue, let timer = round.timer, !timer.timedOut else { return nil }
        return timer
    }

    /// Music loops in the lobby, while players are joining. It only plays if the
    /// server has a "lobby" file (or a "think" file, which is used when there is no lobby one).
    static func wantsLobbyMusic(_ state: ServerState) -> Bool {
        if case .noGame = state.game { return true }
        return !state.room.inProgress
    }

    /// The countdown on screen right now, if any: a clue's buzz-in or answer timer, or
    /// the Final Jeopardy timer. Its last five seconds tick.
    static func activeTimer(in state: ServerState) -> TimerState? {
        if let feud = state.feud {
            guard DisplayScreen.screen(for: state) == .feudFastMoney, let fm = feud.fm,
                  fm.step == .p1 || fm.step == .p2, let timer = fm.timer, !timer.timedOut else { return nil }
            return timer
        }
        guard let game = state.jeopardy else { return nil }
        switch DisplayScreen.screen(for: state) {
        case .clue:
            guard let clue = game.clue, clue.step == .open || clue.step == .answering,
                  let timer = clue.timer, !timer.timedOut else { return nil }
            return timer
        case .finalRound:
            return runningCountdown(in: game.finalRound)
        default:
            return nil
        }
    }
}

/// Works out when the countdown tick should sound: once for each whole second
/// that appears, for the last five, and not while music is playing over it.
struct TickTracker {
    private var timerKey: Date?
    private var shown: Int?

    /// Call about ten times a second with the countdown on screen (nil when there is none).
    mutating func shouldTick(countdown: Countdown?, now: Date, musicPlaying: Bool) -> Bool {
        guard let countdown else {
            timerKey = nil
            shown = nil
            return false
        }
        let seconds = countdown.secondsShown(at: now)
        // A new timer: note where it starts. No tick for the number it opens on.
        if timerKey != countdown.receivedAt || shown == nil {
            timerKey = countdown.receivedAt
            shown = seconds
            return false
        }
        guard seconds != shown else { return false }
        shown = seconds
        return seconds > 0
            && seconds <= 5
            && countdown.remainingMs(at: now) < Double(countdown.totalMs)
            && !musicPlaying
    }
}
