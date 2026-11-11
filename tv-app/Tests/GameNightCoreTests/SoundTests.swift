import XCTest
@testable import GameNightCore

final class SoundSynthTests: XCTestCase {
    func testEveryCueRendersAudibleSoundThatStaysInRange() {
        for cue in SoundCue.allCases {
            let samples = SoundSynth.render(cue)
            XCTAssertFalse(samples.isEmpty, "\(cue)")
            let peak = samples.map { abs($0) }.max() ?? 0
            XCTAssertGreaterThan(peak, 0.05, "\(cue) should be audible")
            XCTAssertLessThanOrEqual(peak, 0.65, "\(cue) should leave headroom (no clipping)")
            XCTAssertTrue(samples.allSatisfy { $0.isFinite }, "\(cue)")
            XCTAssertLessThan(abs(samples[0]), 0.01, "\(cue) should start from silence")
            XCTAssertEqual(samples.last, 0, "\(cue) should end in silence")
        }
    }

    func testLengthsMatchTheWebRecipes() {
        func seconds(_ cue: SoundCue) -> Double {
            Double(SoundSynth.render(cue).count) / Double(SoundSynth.sampleRate)
        }
        XCTAssertEqual(seconds(.tick), 0.035 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.open), 0.09 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.buzz), 0.09 + 0.3 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.fanfare), 6 * 0.12 + 0.8 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.finalSting), 0.05 + 0.9 + 0.05, accuracy: 0.001)
    }

    func testRecipes() {
        XCTAssertEqual(SoundSynth.tones(for: .correct).map(\.frequency), [523, 659, 784, 1047])
        XCTAssertEqual(SoundSynth.tones(for: .dd).count, 5)
        XCTAssertEqual(SoundSynth.tones(for: .fanfare).count, 7)
        XCTAssertEqual(SoundSynth.tones(for: .wrong), [ToneSpec(frequency: 160, start: 0, duration: 0.55, wave: .square, gain: 0.35, slideTo: 95)])
        XCTAssertEqual(SoundSynth.tones(for: .tick).first?.wave, .square)
    }

    func testEnvelopeShape() {
        XCTAssertEqual(SoundSynth.envelope(0, duration: 0.5, gain: 0.6), 0.0001, accuracy: 1e-9)
        XCTAssertEqual(SoundSynth.envelope(0.012, duration: 0.5, gain: 0.6), 0.6, accuracy: 1e-9)
        XCTAssertLessThan(SoundSynth.envelope(0.4, duration: 0.5, gain: 0.6), 0.6)
        XCTAssertEqual(SoundSynth.envelope(0.5, duration: 0.5, gain: 0.6), 0)
    }

    func testFileNamesTheServerMayProvide() {
        XCTAssertEqual(SoundCue.finalSting.rawValue, "final")
        XCTAssertTrue(SoundCue.customNames.isSuperset(of: ["open", "buzz", "correct", "wrong", "timeup", "tick", "reveal", "dd", "final", "fanfare", "ding", "strike", "strikeout", "faceoff", "roundstart", "winner", "zero", "think", "lobby"]))
        XCTAssertEqual(SoundCue.customNames.count, 19)
    }

    func testWavContainer() {
        let samples: [Float] = [0, 0.5, -0.5, 1, -1, 2]   // 2 is clipped to full scale
        let data = SoundSynth.wav(from: samples, sampleRate: 44100)
        let bytes = [UInt8](data)
        XCTAssertEqual(bytes.count, 44 + samples.count * 2)
        XCTAssertEqual(String(decoding: bytes[0..<4], as: UTF8.self), "RIFF")
        XCTAssertEqual(String(decoding: bytes[8..<12], as: UTF8.self), "WAVE")
        XCTAssertEqual(String(decoding: bytes[12..<16], as: UTF8.self), "fmt ")
        XCTAssertEqual(String(decoding: bytes[36..<40], as: UTF8.self), "data")
        func u32(_ at: Int) -> UInt32 { (0..<4).reduce(0) { $0 | UInt32(bytes[at + $1]) << UInt32(8 * $1) } }
        func u16(_ at: Int) -> UInt16 { UInt16(bytes[at]) | UInt16(bytes[at + 1]) << 8 }
        XCTAssertEqual(u32(4), UInt32(36 + samples.count * 2))
        XCTAssertEqual(u16(20), 1)       // PCM
        XCTAssertEqual(u16(22), 1)       // mono
        XCTAssertEqual(u32(24), 44100)
        XCTAssertEqual(u32(28), 88200)
        XCTAssertEqual(u16(34), 16)
        XCTAssertEqual(u32(40), UInt32(samples.count * 2))
        let decoded = (0..<samples.count).map { Int16(bitPattern: u16(44 + $0 * 2)) }
        XCTAssertEqual(decoded, [0, 16383, -16383, 32767, -32767, 32767])
    }
}

final class SoundPlannerTests: XCTestCase {
    private func plan(_ from: String, _ to: String) throws -> SoundPlan {
        SoundPlanner.plan(from: try Fixture.state(from), to: try Fixture.state(to))
    }

    func testNothingPlaysOnTheFirstState() throws {
        XCTAssertEqual(SoundPlanner.plan(from: nil, to: try Fixture.state("clue-open")), SoundPlan())
    }

    func testNothingPlaysWhenNothingChanged() throws {
        XCTAssertEqual(try plan("board", "board"), SoundPlan(stopFinalMusic: true))
    }

    func testBuzzersOpen() throws {
        XCTAssertEqual(try plan("clue-reading", "clue-open").cues, [.open])
    }

    func testSomeoneBuzzesIn() throws {
        XCTAssertEqual(try plan("clue-open", "clue-answering").cues, [.buzz])
    }

    func testReopeningAfterAWrongAnswerSoundsLikeOpening() throws {
        // The web TV checks "open" before "wrong", so a re-opened clue plays the open sound.
        XCTAssertEqual(try plan("clue-answering", "clue-open-after-wrong").cues, [.open])
    }

    func testCorrectAnswer() throws {
        XCTAssertEqual(try plan("clue-open-after-wrong", "clue-revealed-correct").cues, [.correct])
    }

    func testRevealWithNobodyRight() throws {
        XCTAssertEqual(try plan("clue-open", "clue-revealed-nobody").cues, [.reveal])
    }

    func testRevealAfterSomeoneWasAnsweringIsWrong() throws {
        XCTAssertEqual(try plan("clue-answering", "clue-revealed-nobody").cues, [.wrong])
    }

    func testBackToTheBoardIsSilent() throws {
        XCTAssertEqual(try plan("clue-revealed-correct", "board-after-clue").cues, [])
        XCTAssertEqual(try plan("board", "clue-reading").cues, [])
    }

    func testDailyDouble() throws {
        XCTAssertEqual(try plan("board-after-clue", "dd-pick-player").cues, [.dd])
        XCTAssertEqual(try plan("dd-pick-player", "dd-wager").cues, [], "the same Daily Double does not sound twice")
        XCTAssertEqual(try plan("dd-wager", "dd-answering").cues, [.buzz])
        XCTAssertEqual(try plan("dd-answering", "dd-revealed").cues, [.correct])
    }

    func testFinalJeopardyBegins() throws {
        let result = try plan("board-after-clue", "final-wager")
        XCTAssertEqual(result.cues, [.finalSting])
        XCTAssertFalse(result.startFinalMusic)
        XCTAssertTrue(result.stopFinalMusic)
    }

    func testFinalMusicStartsWithTheCountdownAndOnlyOnce() throws {
        let started = try plan("final-wager-locked", "final-clue")
        XCTAssertEqual(started.cues, [])
        XCTAssertTrue(started.startFinalMusic)
        XCTAssertFalse(started.stopFinalMusic)

        let carryingOn = try plan("final-clue", "final-clue-answered")
        XCTAssertFalse(carryingOn.startFinalMusic)
        XCTAssertFalse(carryingOn.stopFinalMusic)
    }

    func testFinalMusicRestartsWhenTheHostRestartsTheTimer() throws {
        var earlier = try Fixture.state("final-clue")
        var later = try Fixture.state("final-clue")
        guard case .jeopardy(var before) = earlier.game, case .jeopardy(var after) = later.game else {
            return XCTFail("expected Jeopardy states")
        }
        before.finalRound?.timer?.leftMs = 12000
        after.finalRound?.timer?.leftMs = 30000
        earlier.game = .jeopardy(before)
        later.game = .jeopardy(after)
        XCTAssertTrue(SoundPlanner.plan(from: earlier, to: later).startFinalMusic)
        XCTAssertFalse(SoundPlanner.plan(from: later, to: earlier).startFinalMusic, "a timer running down is not a restart")
    }

    func testFinalMusicStopsWhenTheCountdownEnds() throws {
        let result = try plan("final-clue-answered", "final-judge")
        XCTAssertTrue(result.stopFinalMusic)
        XCTAssertFalse(result.startFinalMusic)
    }

    func testFinalAnswersJudged() throws {
        XCTAssertEqual(try plan("final-judge", "final-judged").cues, [.correct, .wrong])
    }

    func testWinner() throws {
        XCTAssertEqual(try plan("final-results", "done").cues, [.fanfare])
    }

    func testTimeUp() throws {
        var open = try Fixture.state("clue-open")
        var late = open
        guard case .jeopardy(var game) = late.game else { return XCTFail("expected a Jeopardy state") }
        game.clue?.timer?.timedOut = true
        game.clue?.timer?.leftMs = 0
        late.game = .jeopardy(game)
        XCTAssertEqual(SoundPlanner.plan(from: open, to: late).cues, [.timeup])
        open = late
        XCTAssertEqual(SoundPlanner.plan(from: open, to: late).cues, [], "only the moment it runs out")
    }

    func testHostTestSoundButton() throws {
        let before = try Fixture.state("board")
        var after = before
        after.room.settings.ping += 1
        XCTAssertEqual(SoundPlanner.plan(from: before, to: after).cues, [.correct])
    }

    func testOtherGamesGetOnlyTheRoomSounds() throws {
        let before = try Fixture.state("board")
        var after = try Fixture.state("other-game")
        after.room.settings.ping += 1
        XCTAssertEqual(SoundPlanner.plan(from: before, to: after).cues, [.correct])
        XCTAssertEqual(SoundPlanner.plan(from: before, to: try Fixture.state("other-game")).cues, [])
    }

    // MARK: Music and ticks

    func testLobbyMusicWhileJoining() throws {
        for name in ["lobby-empty", "lobby-players", "lobby-teams", "no-game-chosen", "other-game"] {
            XCTAssertTrue(SoundPlanner.wantsLobbyMusic(try Fixture.state(name)), name)
        }
        for name in ["board", "clue-open", "final-clue", "done", "leaderboard"] {
            XCTAssertFalse(SoundPlanner.wantsLobbyMusic(try Fixture.state(name)), name)
        }
    }

    func testWhichCountdownIsOnScreen() throws {
        XCTAssertEqual(SoundPlanner.activeTimer(in: try Fixture.state("clue-open"))?.kind, "buzz")
        XCTAssertEqual(SoundPlanner.activeTimer(in: try Fixture.state("clue-answering"))?.kind, "answer")
        XCTAssertEqual(SoundPlanner.activeTimer(in: try Fixture.state("dd-answering"))?.kind, "answer")
        XCTAssertEqual(SoundPlanner.activeTimer(in: try Fixture.state("final-clue"))?.kind, "final")
        for name in ["board", "clue-reading", "clue-revealed-correct", "dd-wager", "final-wager", "final-judge", "leaderboard", "done", "lobby-players"] {
            XCTAssertNil(SoundPlanner.activeTimer(in: try Fixture.state(name)), name)
        }
    }
}

final class TickTrackerTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 5000)

    private func countdown(left: Int = 10000, total: Int = 10000, receivedAt: Date? = nil) -> Countdown {
        Countdown(timer: TimerState(kind: "buzz", totalMs: total, leftMs: left, timedOut: false), receivedAt: receivedAt ?? start)
    }

    private func ticks(_ countdown: Countdown, over seconds: Double, musicPlaying: Bool = false) -> [Int] {
        var tracker = TickTracker()
        var ticked: [Int] = []
        var time = 0.0
        while time <= seconds {
            let now = start.addingTimeInterval(time)
            if tracker.shouldTick(countdown: countdown, now: now, musicPlaying: musicPlaying) {
                ticked.append(countdown.secondsShown(at: now))
            }
            time += 0.1
        }
        return ticked
    }

    func testTicksOncePerSecondForTheLastFive() {
        XCTAssertEqual(ticks(countdown(), over: 10), [5, 4, 3, 2, 1])
    }

    func testNoTickWhenItStartsInsideTheLastFiveSeconds() {
        // A timer that opens on 4 does not tick for the 4, only for 3, 2, 1.
        XCTAssertEqual(ticks(countdown(left: 4000), over: 5), [3, 2, 1])
    }

    func testNoTicksOverMusic() {
        XCTAssertEqual(ticks(countdown(), over: 10, musicPlaying: true), [])
    }

    func testResetsWhenThereIsNoCountdownAndWhenANewOneStarts() {
        var tracker = TickTracker()
        let first = countdown()
        XCTAssertFalse(tracker.shouldTick(countdown: first, now: start, musicPlaying: false))
        XCTAssertTrue(tracker.shouldTick(countdown: first, now: start.addingTimeInterval(5.1), musicPlaying: false))
        XCTAssertFalse(tracker.shouldTick(countdown: nil, now: start.addingTimeInterval(6), musicPlaying: false))
        // The next timer begins fresh: no tick on its opening number.
        let second = countdown(left: 5000, receivedAt: start.addingTimeInterval(7))
        XCTAssertFalse(tracker.shouldTick(countdown: second, now: start.addingTimeInterval(7), musicPlaying: false))
        XCTAssertTrue(tracker.shouldTick(countdown: second, now: start.addingTimeInterval(8.05), musicPlaying: false))
    }
}

final class ServerSoundListTests: XCTestCase {
    func testDecodesTheServersSoundList() throws {
        let json = Data(#"[{"name":"buzz","url":"/sounds/buzz.mp3"},{"name":"think","url":"/sounds/think.m4a"}]"#.utf8)
        let sounds = try JSONDecoder().decode([ServerSound].self, from: json)
        XCTAssertEqual(sounds, [ServerSound(name: "buzz", url: "/sounds/buzz.mp3"), ServerSound(name: "think", url: "/sounds/think.m4a")])
        XCTAssertEqual(try JSONDecoder().decode([ServerSound].self, from: Data("[]".utf8)), [])
    }
}
