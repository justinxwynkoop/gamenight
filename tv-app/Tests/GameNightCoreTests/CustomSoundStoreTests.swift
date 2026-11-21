import XCTest
@testable import GameNightCore

final class CustomSoundStoreTests: XCTestCase {
    private var directory: URL!

    override func setUp() {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("sounds-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
    }

    private func piece(game: String = "jeopardy", name: String = "lobby", ext: String = "mp3", index: Int, total: Int, bytes: [UInt8]) -> CustomSoundStore.Piece {
        CustomSoundStore.Piece(game: game, name: name, ext: ext, index: index, total: total, data: Data(bytes).base64EncodedString())
    }

    func testAFileIsKeptOnceTheLastPieceArrives() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertFalse(store.save(piece(index: 1, total: 3, bytes: [4, 5])))
        XCTAssertFalse(store.save(piece(index: 0, total: 3, bytes: [1, 2, 3])))
        XCTAssertEqual(store.list(), [], "not finished: nothing is listed")
        XCTAssertTrue(store.save(piece(index: 2, total: 3, bytes: [6])))
        XCTAssertEqual(store.list(), [CustomSoundStore.Entry(game: "jeopardy", name: "lobby", ext: "mp3", bytes: 6)])
        XCTAssertEqual(store.loadAll()["jeopardy/lobby"], Data([1, 2, 3, 4, 5, 6]), "the pieces are put together in order")
    }

    func testSharedFilesHaveNoGameInTheirKey() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertTrue(store.save(piece(game: "shared", name: "lobby", index: 0, total: 1, bytes: [9])))
        XCTAssertEqual(Set(store.loadAll().keys), ["lobby"])
        XCTAssertEqual(store.list().first?.game, "shared")
    }

    func testTheNameMatchesTheFilesTheMacInstallerWrites() throws {
        let store = CustomSoundStore(directory: directory)
        XCTAssertTrue(store.save(piece(game: "feud", name: "ding", index: 0, total: 1, bytes: [1])))
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("feud__ding.mp3").path))
        let parsed = try XCTUnwrap(BundledSounds.parse(stem: "feud__ding"))
        XCTAssertEqual(parsed.game, "feud")
        XCTAssertEqual(parsed.name, "ding")
    }

    func testAddingTheSameSoundAgainReplacesIt() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertTrue(store.save(piece(ext: "mp3", index: 0, total: 1, bytes: [1, 1])))
        XCTAssertTrue(store.save(piece(ext: "wav", index: 0, total: 1, bytes: [2, 2, 2])))
        XCTAssertEqual(store.list(), [CustomSoundStore.Entry(game: "jeopardy", name: "lobby", ext: "wav", bytes: 3)], "the old .mp3 is gone")
        XCTAssertTrue(store.save(piece(ext: "wav", index: 0, total: 1, bytes: [7])))
        XCTAssertEqual(store.loadAll()["jeopardy/lobby"], Data([7]))
    }

    func testRemoving() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertTrue(store.save(piece(index: 0, total: 1, bytes: [1])))
        XCTAssertTrue(store.save(piece(game: "feud", name: "strike", index: 0, total: 1, bytes: [2])))
        store.remove(game: "jeopardy", name: "lobby")
        XCTAssertEqual(store.list().map(\.name), ["strike"])
        store.remove(game: "jeopardy", name: "nothing")   // nothing there: fine
    }

    func testBadPiecesAreIgnored() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertFalse(store.save(piece(game: "bingo", index: 0, total: 1, bytes: [1])))                 // not a game
        XCTAssertFalse(store.save(piece(name: "../evil", index: 0, total: 1, bytes: [1])))         // not a sound name
        XCTAssertFalse(store.save(piece(name: "nonsense", index: 0, total: 1, bytes: [1])))
        XCTAssertFalse(store.save(piece(ext: "ogg", index: 0, total: 1, bytes: [1])))              // the Apple TV cannot play it
        XCTAssertFalse(store.save(piece(index: 1, total: 1, bytes: [1])))                          // piece number out of range
        XCTAssertFalse(store.save(piece(index: 0, total: 65, bytes: [1])))                         // too many pieces
        XCTAssertFalse(store.save(CustomSoundStore.Piece(game: "jeopardy", name: "lobby", ext: "mp3", index: 0, total: 1, data: "not base64!!")))
        XCTAssertFalse(store.save(pieceJSON: "{ nonsense"))
        XCTAssertEqual(store.list(), [])
    }

    func testThePiecesCanComeAsTheEnginesJSON() {
        let store = CustomSoundStore(directory: directory)
        let json = #"{"game":"jeopardy","name":"timeup","ext":"m4a","index":0,"total":1,"data":"AQID"}"#
        XCTAssertTrue(store.save(pieceJSON: json))
        XCTAssertEqual(store.loadAll()["jeopardy/timeup"], Data([1, 2, 3]))
        XCTAssertTrue(store.listJSON().contains(#""name":"timeup""#))
    }

    func testEveryNameTheHostPageOffersIsOneTheAppKnows() {
        for name in ["lobby", "think", "open", "buzz", "correct", "wrong", "timeup", "tick", "reveal", "dd", "final", "fanfare", "pick", "board", "lock", "bet", "join",
                     "applause", "roundstart", "ding", "strike", "strikeout", "faceoff", "winner", "zero", "fmpoints", "fastmoney"] {
            XCTAssertTrue(SoundCue.customNames.contains(name), name)
        }
    }
}
