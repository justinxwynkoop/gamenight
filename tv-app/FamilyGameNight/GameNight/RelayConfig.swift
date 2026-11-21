import Foundation

/// Where the online relay lives. Phones open the web page on Vercel; the page and this app talk through
/// Supabase Realtime (broadcast only, no database). The publishable key is meant to be public.
enum RelayConfig {
    static let supabaseURL = "https://ipmdmdaroyyafzgxnzrt.supabase.co"
    static let supabaseKey = "sb_publishable__m7Q6bD9OG-ElaUFnLGDnA_PeEndrOr"
    /// The address of the phone pages (the `web` folder at the top of this repository, deployed on Vercel).
    static let webBase = "https://gamenight-one.vercel.app"

    /// What phones open to join room `code`.
    static func joinURL(code: String) -> URL? {
        URL(string: "\(webBase)/?r=\(code)")
    }

    /// The host code on the lobby: opens the host page already signed in (the PIN is in the address, and the page removes it
    /// from the address bar at once). Whoever scans it is a host, the same as typing the PIN.
    static func hostURL(code: String, pin: String) -> URL? {
        URL(string: "\(webBase)/host?r=\(code)&pin=\(pin)")
    }
}
