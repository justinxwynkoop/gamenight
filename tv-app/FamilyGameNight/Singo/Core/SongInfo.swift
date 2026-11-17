import Foundation

/// The parts of a song the game needs. Built from a MusicKit track in the app,
/// or by hand in tests.
public struct SongInfo: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let title: String
    public let artistName: String
    public let albumTitle: String?
    public let genreNames: [String]
    public let releaseYear: Int?
    /// Song length in seconds, if known.
    public let duration: TimeInterval?

    public init(
        id: String,
        title: String,
        artistName: String,
        albumTitle: String? = nil,
        genreNames: [String] = [],
        releaseYear: Int? = nil,
        duration: TimeInterval? = nil
    ) {
        self.id = id
        self.title = title
        self.artistName = artistName
        self.albumTitle = albumTitle
        self.genreNames = genreNames
        self.releaseYear = releaseYear
        self.duration = duration
    }

    /// Most specific genre, skipping Apple Music's catch-all "Music".
    public var genre: String? {
        genreNames.first { $0.caseInsensitiveCompare("Music") != .orderedSame }
    }

    /// "Rock · 1985", "Rock", "1985", or nil when neither is known.
    public var genreAndYear: String? { details(genre: true, year: true) }

    /// Genre and/or year joined with " · ", or nil if none of the asked-for
    /// details are known.
    public func details(genre showGenre: Bool, year showYear: Bool) -> String? {
        let parts = [showGenre ? genre : nil, showYear ? releaseYear.map(String.init) : nil].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// A song that has been revealed during the round.
public struct CalledSong: Identifiable, Hashable, Codable, Sendable {
    /// 1-based order in which it was called.
    public let number: Int
    public let song: SongInfo

    public var id: String { song.id }

    public init(number: Int, song: SongInfo) {
        self.number = number
        self.song = song
    }
}
