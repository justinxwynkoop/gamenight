import XCTest
@testable import GameNightCore

final class DisplayScreenTests: XCTestCase {
    private func screen(_ fixture: String) throws -> DisplayScreen {
        DisplayScreen.screen(for: try Fixture.state(fixture))
    }

    func testLobbyUntilTheGameStarts() throws {
        XCTAssertEqual(try screen("no-game-chosen"), .lobby)
        XCTAssertEqual(try screen("lobby-empty"), .lobby)
        XCTAssertEqual(try screen("lobby-players"), .lobby)
        XCTAssertEqual(try screen("lobby-teams"), .lobby)
    }

    func testTeamStatesUseTheSameScreens() throws {
        XCTAssertEqual(try screen("teams-lobby"), .lobby)
        XCTAssertEqual(try screen("teams-lobby-four"), .lobby)
        XCTAssertEqual(try screen("teams-board"), .board)
        XCTAssertEqual(try screen("teams-clue-answering"), .clue)
        XCTAssertEqual(try screen("teams-clue-revealed"), .clue)
        XCTAssertEqual(try screen("teams-final-wager"), .finalRound)
    }

    func testBoard() throws {
        XCTAssertEqual(try screen("board"), .board)
        XCTAssertEqual(try screen("board-after-clue"), .board)
    }

    func testEveryClueStepShowsTheClueScreen() throws {
        for name in ["clue-reading", "clue-open", "clue-answering", "clue-open-after-wrong",
                     "clue-revealed-correct", "clue-revealed-nobody", "dd-pick-player", "dd-wager",
                     "dd-answering", "dd-revealed"] {
            XCTAssertEqual(try screen(name), .clue, name)
        }
    }

    func testLeaderboard() throws {
        XCTAssertEqual(try screen("leaderboard"), .leaderboard)
    }

    func testFinalJeopardy() throws {
        for name in ["final-wager", "final-wager-locked", "final-clue", "final-clue-answered",
                     "final-judge", "final-judged", "final-results"] {
            XCTAssertEqual(try screen(name), .finalRound, name)
        }
    }

    func testWinnerWhenDone() throws {
        XCTAssertEqual(try screen("done"), .winner)
    }

    func testUnsupportedGame() throws {
        XCTAssertEqual(try screen("other-game"), .unsupported(id: "bingo"))
    }
}

final class StandingsTests: XCTestCase {
    private func unit(_ name: String, _ score: Int) -> ScoreUnit {
        ScoreUnit(id: name, name: name, color: "#ffffff", score: score, connected: true, members: 1)
    }

    func testRankedByScoreThenName() {
        let order = Standings.ranked([unit("Maya", 1000), unit("Nora", -200), unit("Dad", 1000), unit("Leo", 1200)])
        XCTAssertEqual(order.map(\.name), ["Leo", "Dad", "Maya", "Nora"])
    }

    func testWinnersAndTies() {
        XCTAssertEqual(Standings.winners([unit("A", 5), unit("B", 9), unit("C", 9)]).map(\.name), ["B", "C"])
        XCTAssertEqual(Standings.winners([unit("A", 5)]).map(\.name), ["A"])
        XCTAssertTrue(Standings.winners([]).isEmpty)
    }

    func testPlacesShareOnTies() {
        let placed = Standings.placed([unit("Leo", 1800), unit("Maya", 1500), unit("Dad", 0), unit("Grandma", 0), unit("Nora", -200)])
        XCTAssertEqual(placed.map(\.place), [1, 2, 3, 3, 5])
        XCTAssertEqual(placed.map(\.unit.name), ["Leo", "Maya", "Dad", "Grandma", "Nora"])
    }

    func testOrdinals() {
        XCTAssertEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(Standings.ordinal),
                       ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"])
    }
}

final class CountdownTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 1000)

    private func countdown(left: Int = 10000, total: Int = 10000, timedOut: Bool = false) -> Countdown {
        Countdown(timer: TimerState(kind: "buzz", totalMs: total, leftMs: left, timedOut: timedOut), receivedAt: start)
    }

    func testCountsDownFromWhenTheUpdateArrived() {
        let c = countdown()
        XCTAssertEqual(c.remainingMs(at: start), 10000, accuracy: 0.001)
        XCTAssertEqual(c.remainingMs(at: start.addingTimeInterval(2.5)), 7500, accuracy: 0.001)
        XCTAssertEqual(c.fraction(at: start.addingTimeInterval(5)), 0.5, accuracy: 0.001)
    }

    func testStartsFromTheServersRemainingTime() {
        let c = countdown(left: 4000)
        XCTAssertEqual(c.remainingMs(at: start.addingTimeInterval(1)), 3000, accuracy: 0.001)
        XCTAssertEqual(c.fraction(at: start), 0.4, accuracy: 0.001)
    }

    func testNeverGoesBelowZeroOrAboveFull() {
        let c = countdown()
        XCTAssertEqual(c.remainingMs(at: start.addingTimeInterval(60)), 0)
        XCTAssertEqual(c.fraction(at: start.addingTimeInterval(60)), 0)
        XCTAssertEqual(c.remainingMs(at: start.addingTimeInterval(-5)), 10000, accuracy: 0.001, "a clock that ran backwards must not add time")
        XCTAssertEqual(c.fraction(at: start.addingTimeInterval(-5)), 1, accuracy: 0.001)
    }

    func testSecondsRoundUp() {
        let c = countdown()
        XCTAssertEqual(c.secondsShown(at: start), 10)
        XCTAssertEqual(c.secondsShown(at: start.addingTimeInterval(0.2)), 10)
        XCTAssertEqual(c.secondsShown(at: start.addingTimeInterval(1.0)), 9)
        XCTAssertEqual(c.secondsShown(at: start.addingTimeInterval(9.5)), 1)
        XCTAssertEqual(c.secondsShown(at: start.addingTimeInterval(10)), 0)
    }

    func testLowInTheLastThreeSeconds() {
        let c = countdown()
        XCTAssertFalse(c.isLow(at: start.addingTimeInterval(6.9)))
        XCTAssertTrue(c.isLow(at: start.addingTimeInterval(7.0)))
    }

    func testTimedOutIsZeroAndNotLow() {
        let c = countdown(left: 0, timedOut: true)
        XCTAssertEqual(c.remainingMs(at: start), 0)
        XCTAssertEqual(c.secondsShown(at: start), 0)
        XCTAssertFalse(c.isLow(at: start))
    }

    func testZeroTotalDoesNotDivideByZero() {
        XCTAssertEqual(countdown(left: 0, total: 0).fraction(at: start), 0)
    }
}

final class ServerAddressTests: XCTestCase {
    func testHostAndPort() {
        XCTAssertEqual(ServerAddress.parse("192.168.1.50:3000"), ServerAddress(host: "192.168.1.50", port: 3000))
    }

    func testBareHostUsesThePortABrowserWould() {
        XCTAssertEqual(ServerAddress.parse("gamenight.local"), ServerAddress(host: "gamenight.local", port: 80))
    }

    func testCleansUpWhatPeoplePaste() {
        let expected = ServerAddress(host: "gamenight.local", port: 3000)
        XCTAssertEqual(ServerAddress.parse("  GameNight.local:3000 \n"), expected)
        XCTAssertEqual(ServerAddress.parse("http://gamenight.local:3000/tv"), expected)
        XCTAssertEqual(ServerAddress.parse("https://gamenight.local:3000/"), expected)
        XCTAssertEqual(ServerAddress.parse("ws://gamenight.local:3000/ws"), expected)
        XCTAssertEqual(ServerAddress.parse("gamenight.local:3000/host?x=1"), expected)
    }

    func testRejectsNonsense() {
        for bad in ["", "   ", "http://", "bad host", "host:", "host:abc", "host:0", "host:70000", "host:-1",
                    "a:b:c", "::1", ".local", "game..night", "-bad.local", "bad-.local", "über.local", "host:80:80"] {
            XCTAssertNil(ServerAddress.parse(bad), "\(bad) should not parse")
        }
    }

    func testTextAndURLs() {
        let custom = ServerAddress(host: "192.168.1.50", port: 3000)
        XCTAssertEqual(custom.text, "192.168.1.50:3000")
        XCTAssertEqual(custom.webSocketURL.absoluteString, "ws://192.168.1.50:3000/ws")
        XCTAssertEqual(custom.infoURL.absoluteString, "http://192.168.1.50:3000/api/info")

        let standard = ServerAddress(host: "gamenight.local", port: 80)
        XCTAssertEqual(standard.text, "gamenight.local")
        XCTAssertEqual(standard.webSocketURL.absoluteString, "ws://gamenight.local:80/ws")
    }

    func testTextRoundTrips() {
        for text in ["gamenight.local", "192.168.1.50:3000", "pi.lan:8080"] {
            XCTAssertEqual(ServerAddress.parse(text)?.text, text)
        }
    }
}

final class FormattingTests: XCTestCase {
    func testMoney() {
        XCTAssertEqual(Money.format(0), "$0")
        XCTAssertEqual(Money.format(200), "$200")
        XCTAssertEqual(Money.format(1000), "$1,000")
        XCTAssertEqual(Money.format(1234567), "$1,234,567")
        XCTAssertEqual(Money.format(-200), "−$200")
        XCTAssertEqual(Money.format(-12500), "−$12,500")
    }

    func testCheckPageAddress() {
        XCTAssertEqual(JoinAddress.checkPage(from: "http://192.168.1.50:3000/"), "http://192.168.1.50:3000/check")
        XCTAssertEqual(JoinAddress.display(JoinAddress.checkPage(from: "http://192.168.1.115/")), "192.168.1.115/check")
    }

    func testHostPageAddress() {
        XCTAssertEqual(JoinAddress.hostPage(from: "http://192.168.1.50:3000/"), "http://192.168.1.50:3000/host")
        XCTAssertEqual(JoinAddress.hostPage(from: "http://gamenight.local"), "http://gamenight.local/host")
        XCTAssertEqual(JoinAddress.display(JoinAddress.hostPage(from: "http://192.168.1.50:3000/")), "192.168.1.50:3000/host")
    }

    func testOnlineAddressesKeepTheRoomCode() {
        XCTAssertEqual(JoinAddress.hostPage(from: "https://play.example.app/?r=ABCD"), "https://play.example.app/host?r=ABCD")
        XCTAssertEqual(JoinAddress.hostPage(from: "https://play.example.app?r=ABCD"), "https://play.example.app/host?r=ABCD")
        XCTAssertEqual(JoinAddress.display("https://play.example.app/?r=ABCD"), "play.example.app?r=ABCD")
    }

    func testJoinAddressForDisplay() {
        XCTAssertEqual(JoinAddress.display("http://192.168.1.50:3000/"), "192.168.1.50:3000")
        XCTAssertEqual(JoinAddress.display("http://gamenight.local/"), "gamenight.local")
        XCTAssertEqual(JoinAddress.display("https://example.com"), "example.com")
        XCTAssertEqual(JoinAddress.display("192.168.1.50:3000"), "192.168.1.50:3000")
    }

    func testHexColours() throws {
        let teal = try XCTUnwrap(RGB.parse(hex: "#14b8a6"))
        XCTAssertEqual(teal.r, 20.0 / 255, accuracy: 0.0001)
        XCTAssertEqual(teal.g, 184.0 / 255, accuracy: 0.0001)
        XCTAssertEqual(teal.b, 166.0 / 255, accuracy: 0.0001)
        XCTAssertEqual(RGB.parse(hex: "14B8A6"), teal)
        for bad in ["", "#fff", "#12345g", "#1234567", "teal"] {
            XCTAssertNil(RGB.parse(hex: bad), bad)
        }
    }

    func testTextColourOnPlayerColours() throws {
        // Bright colours from the server's palette get dark text, deep colours get white.
        let dark = ["#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#a3e635", "#f8fafc", "#f97316"]
        let light = ["#7c3aed", "#6d28d9", "#1e3a8a", "#000000"]
        for hex in dark { XCTAssertTrue(try XCTUnwrap(RGB.parse(hex: hex)).prefersDarkInk, hex) }
        for hex in light { XCTAssertFalse(try XCTUnwrap(RGB.parse(hex: hex)).prefersDarkInk, hex) }
        XCTAssertEqual(try XCTUnwrap(RGB.parse(hex: "#ffffff")).luminance, 1, accuracy: 0.0001)
        XCTAssertEqual(try XCTUnwrap(RGB.parse(hex: "#000000")).luminance, 0, accuracy: 0.0001)
    }
}

final class BundledSoundsTests: XCTestCase {
    func testFileNamesBecomeGamesAndSounds() {
        XCTAssertEqual(BundledSounds.parse(stem: "feud__ding")?.game, "feud")
        XCTAssertEqual(BundledSounds.parse(stem: "feud__ding")?.name, "ding")
        XCTAssertNil(BundledSounds.parse(stem: "shared__think")?.game)
        XCTAssertEqual(BundledSounds.parse(stem: "shared__think")?.name, "think")
        XCTAssertNil(BundledSounds.parse(stem: "think"))
        XCTAssertNil(BundledSounds.parse(stem: "other__think"))
        XCTAssertNil(BundledSounds.parse(stem: "a__b__c"))
        XCTAssertEqual(BundledSounds.key(game: "jeopardy", name: "think"), "jeopardy/think")
        XCTAssertEqual(BundledSounds.key(game: nil, name: "think"), "think")
    }

    func testAnEmptyBundleHasNoCustomSounds() {
        XCTAssertTrue(BundledSounds.load(from: Bundle(for: BundledSoundsTests.self)).isEmpty)
    }
}
