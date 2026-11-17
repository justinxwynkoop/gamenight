import Foundation

/// Where the Game Night server is: a host name or IPv4 address and a port.
/// Typed once on the Apple TV and remembered.
struct ServerAddress: Equatable {
    var host: String
    var port: Int

    /// A bare host (no port) means the web default, as in a browser.
    static let defaultPort = 80

    /// What to show and save: the port is left off when it is the default.
    var text: String {
        port == Self.defaultPort ? host : "\(host):\(port)"
    }

    var webSocketURL: URL { URL(string: "ws://\(host):\(port)/ws")! }
    var infoURL: URL { URL(string: "http://\(host):\(port)/api/info")! }

    /// Accepts "192.168.1.50:3000", "gamenight.local", "http://gamenight.local:3000/tv"
    /// and similar. Returns nil for anything that cannot be a host and port.
    static func parse(_ input: String) -> ServerAddress? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for scheme in ["https://", "http://", "wss://", "ws://"] where text.hasPrefix(scheme) {
            text.removeFirst(scheme.count)
            break
        }
        if let end = text.firstIndex(where: { $0 == "/" || $0 == "?" || $0 == "#" }) {
            text = String(text[text.startIndex..<end])
        }
        guard !text.isEmpty else { return nil }

        let parts = text.split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        guard parts.count <= 2 else { return nil } // IPv6 is not supported
        let host = parts[0]
        guard isValidHost(host) else { return nil }

        var port = defaultPort
        if parts.count == 2 {
            guard let value = Int(parts[1]), parts[1].allSatisfy(\.isNumber), (1...65535).contains(value) else { return nil }
            port = value
        }
        return ServerAddress(host: host, port: port)
    }

    private static func isValidHost(_ host: String) -> Bool {
        guard !host.isEmpty, host.count <= 253 else { return false }
        let labels = host.split(separator: ".", omittingEmptySubsequences: false)
        return labels.allSatisfy { label in
            !label.isEmpty
                && label.count <= 63
                && !label.hasPrefix("-")
                && !label.hasSuffix("-")
                && label.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }
        }
    }
}
