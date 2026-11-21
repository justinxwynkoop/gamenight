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
        XCTAssertEqual(store.save(piece(index: 1, total: 3, bytes: [4, 5])), .partial)
        XCTAssertEqual(store.save(piece(index: 0, total: 3, bytes: [1, 2, 3])), .partial)
        XCTAssertEqual(store.list(), [], "not finished: nothing is listed")
        XCTAssertEqual(store.save(piece(index: 2, total: 3, bytes: [6])), .done)
        XCTAssertEqual(store.list(), [CustomSoundStore.Entry(game: "jeopardy", name: "lobby", ext: "mp3", bytes: 6)])
        XCTAssertEqual(store.loadAll()["jeopardy/lobby"], Data([1, 2, 3, 4, 5, 6]), "the pieces are put together in order")
    }

    func testSharedFilesHaveNoGameInTheirKey() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertEqual(store.save(piece(game: "shared", name: "lobby", index: 0, total: 1, bytes: [9])), .done)
        XCTAssertEqual(Set(store.loadAll().keys), ["lobby"])
        XCTAssertEqual(store.list().first?.game, "shared")
    }

    func testTheNameMatchesTheFilesTheMacInstallerWrites() throws {
        let store = CustomSoundStore(directory: directory)
        XCTAssertEqual(store.save(piece(game: "feud", name: "ding", index: 0, total: 1, bytes: [1])), .done)
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.appendingPathComponent("feud__ding.mp3").path))
        let parsed = try XCTUnwrap(BundledSounds.parse(stem: "feud__ding"))
        XCTAssertEqual(parsed.game, "feud")
        XCTAssertEqual(parsed.name, "ding")
    }

    func testAddingTheSameSoundAgainReplacesIt() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertEqual(store.save(piece(ext: "mp3", index: 0, total: 1, bytes: [1, 1])), .done)
        XCTAssertEqual(store.save(piece(ext: "wav", index: 0, total: 1, bytes: [2, 2, 2])), .done)
        XCTAssertEqual(store.list(), [CustomSoundStore.Entry(game: "jeopardy", name: "lobby", ext: "wav", bytes: 3)], "the old .mp3 is gone")
        XCTAssertEqual(store.save(piece(ext: "wav", index: 0, total: 1, bytes: [7])), .done)
        XCTAssertEqual(store.loadAll()["jeopardy/lobby"], Data([7]))
    }

    func testAFolderThatCannotBeWrittenToIsReportedAsFailedNotAsSaved() throws {
        // A regular file where the folder should be: nothing can be created under it (like a read-only Apple TV folder).
        try FileManager.default.createDirectory(at: directory.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data([0]).write(to: directory)
        let store = CustomSoundStore(directory: directory)
        XCTAssertEqual(store.save(piece(index: 0, total: 1, bytes: [1])), .failed)
        XCTAssertEqual(store.list(), [])
    }

    func testRemoving() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertEqual(store.save(piece(index: 0, total: 1, bytes: [1])), .done)
        XCTAssertEqual(store.save(piece(game: "feud", name: "strike", index: 0, total: 1, bytes: [2])), .done)
        store.remove(game: "jeopardy", name: "lobby")
        XCTAssertEqual(store.list().map(\.name), ["strike"])
        store.remove(game: "jeopardy", name: "nothing")   // nothing there: fine
    }

    func testBadPiecesAreIgnored() {
        let store = CustomSoundStore(directory: directory)
        XCTAssertEqual(store.save(piece(game: "bingo", index: 0, total: 1, bytes: [1])), .failed)                 // not a game
        XCTAssertEqual(store.save(piece(name: "../evil", index: 0, total: 1, bytes: [1])), .failed)         // not a sound name
        XCTAssertEqual(store.save(piece(name: "nonsense", index: 0, total: 1, bytes: [1])), .failed)
        XCTAssertEqual(store.save(piece(ext: "ogg", index: 0, total: 1, bytes: [1])), .failed)              // the Apple TV cannot play it
        XCTAssertEqual(store.save(piece(index: 1, total: 1, bytes: [1])), .failed)                          // piece number out of range
        XCTAssertEqual(store.save(piece(index: 0, total: 65, bytes: [1])), .failed)                         // too many pieces
        XCTAssertEqual(store.save(CustomSoundStore.Piece(game: "jeopardy", name: "lobby", ext: "mp3", index: 0, total: 1, data: "not base64!!")), .failed)
        XCTAssertEqual(store.save(pieceJSON: "{ nonsense"), .failed)
        XCTAssertEqual(store.list(), [])
    }

    func testThePiecesCanComeAsTheEnginesJSON() {
        let store = CustomSoundStore(directory: directory)
        let json = #"{"game":"jeopardy","name":"timeup","ext":"m4a","index":0,"total":1,"data":"AQID"}"#
        XCTAssertEqual(store.save(pieceJSON: json), .done)
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
