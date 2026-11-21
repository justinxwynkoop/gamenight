import Foundation

/// Keeps the family's own sound files on this Apple TV. The host page sends a file in pieces (see engine/sounds.js in the
/// gamenight repo); this puts the pieces together and keeps the finished file as `<game>__<name>.<ext>`, the same names
/// `Tools/install-sounds.sh` uses, in the app's own storage. That storage survives app updates, so a sound added once stays,
/// whatever build is installed. Nothing here is ever uploaded anywhere.
public final class CustomSoundStore {
    public struct Piece: Decodable, Equatable {
        public var game: String
        public var name: String
        public var ext: String
        public var index: Int
        public var total: Int
        /// This piece of the file, base64.
        public var data: String
    }

    public struct Entry: Codable, Equatable {
        public var game: String
        public var name: String
        public var ext: String
        public var bytes: Int
    }

    public static let games = ["shared", "jeopardy", "feud"]
    public static let extensions = ["mp3", "m4a", "wav"]
    /// A file may be at most this big (about 7 MB), and at most this many pieces.
    public static let maxBytes = 8 * 1024 * 1024
    public static let maxPieces = 64

    /// Where the app keeps them: Application Support/CustomSounds.
    public static let standard: CustomSoundStore = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return CustomSoundStore(directory: base.appendingPathComponent("CustomSounds", isDirectory: true))
    }()

    private let directory: URL
    private let fileManager = FileManager.default

    public init(directory: URL) {
        self.directory = directory
    }

    private var partsDirectory: URL { directory.appendingPathComponent(".parts", isDirectory: true) }

    private func fileName(_ game: String, _ name: String, _ ext: String) -> String { "\(game)__\(name).\(ext)" }

    private func valid(game: String, name: String, ext: String) -> Bool {
        Self.games.contains(game)
            && Self.extensions.contains(ext)
            && !name.isEmpty
            && name.allSatisfy { $0.isLetter || $0.isNumber }
            && SoundCue.customNames.contains(name)
    }

    /// Takes one piece, as the JSON text the engine passes. Returns true when it was the last piece and the file is now
    /// kept. A bad piece is ignored (false).
    public func save(pieceJSON: String) -> Bool {
        guard let piece = try? JSONDecoder().decode(Piece.self, from: Data(pieceJSON.utf8)) else { return false }
        return save(piece)
    }

    public func save(_ piece: Piece) -> Bool {
        let ext = piece.ext.lowercased()
        guard valid(game: piece.game, name: piece.name, ext: ext),
              piece.total >= 1, piece.total <= Self.maxPieces, piece.index >= 0, piece.index < piece.total,
              let bytes = Data(base64Encoded: piece.data), !bytes.isEmpty else { return false }
        let key = fileName(piece.game, piece.name, ext)
        let parts = partsDirectory.appendingPathComponent(key, isDirectory: true)
        do {
            try fileManager.createDirectory(at: parts, withIntermediateDirectories: true)
            try bytes.write(to: parts.appendingPathComponent(String(piece.index)), options: .atomic)
            // Have all the pieces arrived?
            var whole = Data()
            for index in 0..<piece.total {
                guard let part = try? Data(contentsOf: parts.appendingPathComponent(String(index))) else { return false }
                whole.append(part)
            }
            guard whole.count <= Self.maxBytes else {
                try? fileManager.removeItem(at: parts)
                return false
            }
            // Another version of the same sound (a different file type) is replaced.
            for other in Self.extensions where other != ext {
                try? fileManager.removeItem(at: directory.appendingPathComponent(fileName(piece.game, piece.name, other)))
            }
            try whole.write(to: directory.appendingPathComponent(key), options: .atomic)
            try? fileManager.removeItem(at: parts)
            return true
        } catch {
            return false
        }
    }

    /// The finished files, by game and name.
    public func list() -> [Entry] {
        guard let names = try? fileManager.contentsOfDirectory(atPath: directory.path) else { return [] }
        var entries: [Entry] = []
        for file in names.sorted() {
            let url = directory.appendingPathComponent(file)
            let stem = url.deletingPathExtension().lastPathComponent
            let ext = url.pathExtension.lowercased()
            guard Self.extensions.contains(ext), let parsed = BundledSounds.parse(stem: stem),
                  SoundCue.customNames.contains(parsed.name),
                  let size = (try? fileManager.attributesOfItem(atPath: url.path))?[.size] as? Int else { continue }
            entries.append(Entry(game: parsed.game ?? "shared", name: parsed.name, ext: ext, bytes: size))
        }
        return entries
    }

    /// The list as JSON text, for the engine.
    public func listJSON() -> String {
        guard let data = try? JSONEncoder().encode(list()), let text = String(data: data, encoding: .utf8) else { return "[]" }
        return text
    }

    public func remove(game: String, name: String) {
        for ext in Self.extensions {
            try? fileManager.removeItem(at: directory.appendingPathComponent(fileName(game, name, ext)))
        }
    }

    /// Every kept file's contents, keyed like `BundledSounds.load` ("name" or "game/name").
    public func loadAll() -> [String: Data] {
        var found: [String: Data] = [:]
        for entry in list() {
            let url = directory.appendingPathComponent(fileName(entry.game, entry.name, entry.ext))
            guard let data = try? Data(contentsOf: url) else { continue }
            found[BundledSounds.key(game: entry.game == "shared" ? nil : entry.game, name: entry.name)] = data
        }
        return found
    }
}
