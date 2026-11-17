import Foundation

// Family Feud's sounds: which cue goes with which change in the game (a port of `onChange()` in the
// gamenight repo's public/games/feud/tv.js), the built-in recipes for the Feud cues, and the one countdown
// that ticks. The cues themselves are cases of `SoundCue` (an enum can't be extended with new cases).

extension SoundPlanner {
    /// Family Feud: a port of `onChange()` in the gamenight repo's public/games/feud/tv.js.
    static func feudPlan(from before: FeudState, to after: FeudState, into plan: inout SoundPlan) {
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
                if feudJudgedCount(fm) > feudJudgedCount(was) {
                    plan.cues.append(feudPointsTotal(fm) > feudPointsTotal(was) ? .fmpoints : .zero)
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

    private static func feudJudgedCount(_ fm: FastMoneyState) -> Int {
        fm.rows.reduce(0) { $0 + ($1.p1.judged ? 1 : 0) + ($1.p2.judged ? 1 : 0) }
    }

    private static func feudPointsTotal(_ fm: FastMoneyState) -> Int {
        fm.rows.reduce(0) { $0 + ($1.p1.points ?? 0) + ($1.p2.points ?? 0) }
    }

    /// The Fast Money countdown on screen, if one is running. Its last five seconds tick.
    static func feudActiveTimer(in state: ServerState, game: FeudState) -> TimerState? {
        guard DisplayScreen.screen(for: state) == .feudFastMoney, let fm = game.fm,
              fm.step == .p1 || fm.step == .p2, let timer = fm.timer, !timer.timedOut else { return nil }
        return timer
    }
}

extension SoundSynth {
    /// Tones for the Family Feud cues; any other cue has none here.
    static func feudTones(for cue: SoundCue) -> [ToneSpec] {
        switch cue {
        case .ding:
            return [
                ToneSpec(frequency: 1318, start: 0, duration: 0.9, wave: .sine, gain: 0.42),
                ToneSpec(frequency: 1976, start: 0, duration: 0.9, wave: .sine, gain: 0.22),
                ToneSpec(frequency: 2637, start: 0, duration: 0.7, wave: .sine, gain: 0.12),
                ToneSpec(frequency: 660, start: 0, duration: 0.08, wave: .triangle, gain: 0.3),
            ]
        case .strike:
            return strikeTones
        case .strikeout:
            var tones = strikeTones
            tones.append(ToneSpec(frequency: 220, start: 0.85, duration: 0.2, wave: .sawtooth, gain: 0.3))
            tones.append(ToneSpec(frequency: 294, start: 1.05, duration: 0.2, wave: .sawtooth, gain: 0.3))
            tones.append(ToneSpec(frequency: 392, start: 1.25, duration: 0.5, wave: .sawtooth, gain: 0.35, slideTo: 440))
            return tones
        case .faceoff:
            return [
                ToneSpec(frequency: 784, start: 0, duration: 0.08, wave: .square, gain: 0.35),
                ToneSpec(frequency: 1568, start: 0.07, duration: 0.35, wave: .triangle, gain: 0.4),
            ]
        case .roundstart:
            var tones: [ToneSpec] = []
            let run: [(Double, Double)] = [(523, 0), (659, 0.11), (784, 0.22)]
            for (note, start) in run {
                tones.append(ToneSpec(frequency: note, start: start, duration: 0.12, wave: .triangle, gain: 0.45))
            }
            tones.append(ToneSpec(frequency: 1047, start: 0.33, duration: 0.6, wave: .triangle, gain: 0.45))
            tones.append(ToneSpec(frequency: 784, start: 0.33, duration: 0.6, wave: .triangle, gain: 0.3))
            tones.append(ToneSpec(frequency: 659, start: 0.33, duration: 0.6, wave: .triangle, gain: 0.25))
            return tones
        case .winner:
            var tones: [ToneSpec] = []
            let tune: [(Double, Double, Double)] = [(523, 0, 0.14), (659, 0.14, 0.14), (784, 0.28, 0.14), (1047, 0.42, 0.3), (784, 0.76, 0.14), (1047, 0.9, 0.14)]
            for (note, start, length) in tune {
                tones.append(ToneSpec(frequency: note, start: start, duration: length, wave: .triangle, gain: 0.45))
            }
            tones.append(ToneSpec(frequency: 1047, start: 1.06, duration: 0.9, wave: .triangle, gain: 0.4))
            tones.append(ToneSpec(frequency: 784, start: 1.06, duration: 0.9, wave: .triangle, gain: 0.3))
            tones.append(ToneSpec(frequency: 659, start: 1.06, duration: 0.9, wave: .triangle, gain: 0.25))
            return tones
        case .fmpoints:
            return [
                ToneSpec(frequency: 1568, start: 0, duration: 0.18, wave: .triangle, gain: 0.4),
                ToneSpec(frequency: 2093, start: 0.1, duration: 0.55, wave: .triangle, gain: 0.4),
                ToneSpec(frequency: 3136, start: 0.1, duration: 0.4, wave: .sine, gain: 0.12),
            ]
        case .fastmoney:
            var tones: [ToneSpec] = []
            let climb: [(Double, Double)] = [(392, 0), (523, 0.15), (659, 0.3), (784, 0.45)]
            for (note, start) in climb {
                tones.append(ToneSpec(frequency: note, start: start, duration: 0.14, wave: .triangle, gain: 0.45))
            }
            tones.append(ToneSpec(frequency: 1047, start: 0.62, duration: 0.8, wave: .triangle, gain: 0.4))
            tones.append(ToneSpec(frequency: 784, start: 0.62, duration: 0.8, wave: .triangle, gain: 0.3))
            tones.append(ToneSpec(frequency: 659, start: 0.62, duration: 0.8, wave: .triangle, gain: 0.25))
            return tones
        case .zero:
            var tones: [ToneSpec] = []
            let steps: [(Double, Double)] = [(392, 0), (370, 0.2), (349, 0.4)]
            for (note, start) in steps {
                tones.append(ToneSpec(frequency: note, start: start, duration: 0.22, wave: .triangle, gain: 0.4))
            }
            tones.append(ToneSpec(frequency: 294, start: 0.6, duration: 0.5, wave: .triangle, gain: 0.4, slideTo: 233))
            return tones
        default:
            return []
        }
    }

    /// The Family Feud buzzer: two sawtooth notes a hair apart (they beat against each other) over a low square.
    fileprivate static let strikeTones: [ToneSpec] = [
        ToneSpec(frequency: 110, start: 0, duration: 0.8, wave: .sawtooth, gain: 0.45),
        ToneSpec(frequency: 116, start: 0, duration: 0.8, wave: .sawtooth, gain: 0.35),
        ToneSpec(frequency: 55, start: 0, duration: 0.8, wave: .square, gain: 0.2),
    ]
}
