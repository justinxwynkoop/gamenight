import Foundation

/// Where the online relay lives. Phones open the web page on Vercel; the page and this app talk through
/// Supabase Realtime (broadcast only, no database). The publishable key is meant to be public.
enum RelayConfig {
    static let supabaseURL = "https://ipmdmdaroyyafzgxnzrt.supabase.co"
    static let supabaseKey = "sb_publishable__m7Q6bD9OG-ElaUFnLGDnA_PeEndrOr"
    /// The address of the phone pages (the `web` folder of the gamenight repo, deployed on Vercel).
    static let webBase = "https://gamenight-one.vercel.app"

    /// What phones open to join room `code`.
    static func joinURL(code: String) -> URL? {
        URL(string: "\(webBase)/?r=\(code)")
    }
}
